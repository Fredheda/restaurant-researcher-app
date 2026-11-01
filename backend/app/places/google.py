"""Google Places API (New): Text Search and photo links.

The field mask is the smallest one that fills a card. `rating`,
`userRatingCount`, `priceLevel` and `currentOpeningHours` put Text Search in
the Enterprise SKU, so results are cached (see `app.store`).

The API key travels only in the `X-Goog-Api-Key` header, never in a URL, and
no error message carries a response body, so the key and upstream detail
cannot reach a log or a client.
"""

import re
from typing import Any, Protocol

import httpx

from app.places.models import GooglePlace, LatLng

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
MEDIA_URL = "https://places.googleapis.com/v1/{name}/media"

FIELD_MASK = ",".join(
    f"places.{field}"
    for field in (
        "id",
        "displayName",
        "formattedAddress",
        "addressComponents",
        "location",
        "rating",
        "userRatingCount",
        "priceLevel",
        "currentOpeningHours.openNow",
        "photos",
        "primaryTypeDisplayName",
        "types",
    )
)

# Central London; the default bias when the caller gives no origin.
LONDON = LatLng(51.5074, -0.1278)
BIAS_RADIUS_M = 15000.0
PAGE_SIZE = 10
# rr.places.photo_ref is NVARCHAR(1000); a longer ref is dropped, not truncated.
MAX_PHOTO_REF = 1000

PRICE_TIERS = {
    "PRICE_LEVEL_FREE": "£",
    "PRICE_LEVEL_INEXPENSIVE": "£",
    "PRICE_LEVEL_MODERATE": "££",
    "PRICE_LEVEL_EXPENSIVE": "£££",
    "PRICE_LEVEL_VERY_EXPENSIVE": "££££",
}

_PHOTO_REF = re.compile(r"^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$")
_NEIGHBOURHOOD_TYPES = ("neighborhood", "sublocality_level_1", "sublocality")


class PlacesError(Exception):
    """Google Places could not answer. The message is safe to log."""


class GooglePlacesClient(Protocol):
    async def search_text(
        self, query: str, origin: LatLng | None
    ) -> list[GooglePlace]: ...

    async def photo_url(self, photo_ref: str, max_width: int = 800) -> str | None: ...


def _component(components: list[dict[str, Any]], *types: str) -> str | None:
    for wanted in types:
        for component in components:
            if wanted in component.get("types", []):
                return component.get("longText") or None
    return None


def _photo_ref(photos: list[dict[str, Any]]) -> str | None:
    """The first photo's resource name, if it fits the cache column."""
    name = photos[0].get("name") if photos else None
    if isinstance(name, str) and len(name) <= MAX_PHOTO_REF:
        return name
    return None


def _to_place(raw: dict[str, Any]) -> GooglePlace:
    components = raw.get("addressComponents") or []
    location = raw.get("location") or {}
    photos = raw.get("photos") or []
    review_count = raw.get("userRatingCount")
    return GooglePlace(
        id=raw["id"],
        name=(raw.get("displayName") or {}).get("text") or raw["id"],
        address=raw.get("formattedAddress") or "",
        postcode=_component(components, "postal_code"),
        neighbourhood=_component(components, *_NEIGHBOURHOOD_TYPES),
        lat=location.get("latitude"),
        lng=location.get("longitude"),
        rating=raw.get("rating"),
        review_count=int(review_count) if review_count is not None else None,
        price_tier=PRICE_TIERS.get(raw.get("priceLevel", "")),
        open_now=(raw.get("currentOpeningHours") or {}).get("openNow"),
        photo_ref=_photo_ref(photos),
        type_label=(raw.get("primaryTypeDisplayName") or {}).get("text"),
        types=tuple(raw.get("types") or ()),
    )


class HttpGooglePlacesClient:
    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self._key = api_key
        self._client = client

    async def search_text(self, query: str, origin: LatLng | None) -> list[GooglePlace]:
        centre = origin or LONDON
        body = {
            "textQuery": query,
            "pageSize": PAGE_SIZE,
            "locationBias": {
                "circle": {
                    "center": {"latitude": centre.lat, "longitude": centre.lng},
                    "radius": BIAS_RADIUS_M,
                }
            },
        }
        headers = {"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": FIELD_MASK}
        try:
            response = await self._client.post(SEARCH_URL, json=body, headers=headers)
        except httpx.HTTPError as error:
            raise PlacesError(f"text search failed: {type(error).__name__}") from None
        if response.status_code != 200:
            raise PlacesError(f"text search returned HTTP {response.status_code}")
        try:
            raw_places = response.json().get("places", [])
            if not isinstance(raw_places, list):
                raise TypeError("places is not a list")
            return [_to_place(raw) for raw in raw_places if raw.get("id")]
        except (ValueError, KeyError, TypeError, AttributeError):
            raise PlacesError("text search returned a bad body") from None

    async def photo_url(self, photo_ref: str, max_width: int = 800) -> str | None:
        """A short-lived https link to the photo, or None. Never raises:
        a card without a photo still renders."""
        if not _PHOTO_REF.match(photo_ref):
            return None
        try:
            response = await self._client.get(
                MEDIA_URL.format(name=photo_ref),
                params={"maxWidthPx": max_width, "skipHttpRedirect": "true"},
                headers={"X-Goog-Api-Key": self._key},
            )
            if response.status_code != 200:
                return None
            uri = response.json().get("photoUri")
        except (httpx.HTTPError, ValueError):
            return None
        if isinstance(uri, str) and uri.startswith("https://"):
            return uri
        return None
