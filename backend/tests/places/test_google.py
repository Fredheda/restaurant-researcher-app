import json

import httpx
import pytest

from app.places.google import (
    FIELD_MASK,
    LONDON,
    HttpGooglePlacesClient,
    PlacesError,
)
from app.places.models import LatLng

KEY = "secret-key-123"

FULL_PLACE = {
    "id": "ChIJ-koya",
    "displayName": {"text": "Koya Soho", "languageCode": "en"},
    "formattedAddress": "50 Frith St, London W1D 4SQ, UK",
    "addressComponents": [
        {"longText": "50", "types": ["street_number"]},
        {"longText": "Soho", "types": ["neighborhood", "political"]},
        {"longText": "W1D 4SQ", "types": ["postal_code"]},
    ],
    "location": {"latitude": 51.5136, "longitude": -0.1318},
    "rating": 4.6,
    "userRatingCount": 3120,
    "priceLevel": "PRICE_LEVEL_MODERATE",
    "currentOpeningHours": {"openNow": True},
    "photos": [{"name": "places/ChIJ-koya/photos/abc"}],
    "primaryTypeDisplayName": {"text": "Japanese restaurant"},
    "types": ["japanese_restaurant", "restaurant"],
}


def _client(handler) -> HttpGooglePlacesClient:
    return HttpGooglePlacesClient(
        KEY, httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


async def test_search_request_shape_with_default_london_bias() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"places": []})

    assert await _client(handler).search_text("best ramen", None) == []
    request = seen[0]
    assert request.method == "POST"
    assert str(request.url) == "https://places.googleapis.com/v1/places:searchText"
    assert request.headers["X-Goog-Api-Key"] == KEY
    assert request.headers["X-Goog-FieldMask"] == FIELD_MASK
    body = json.loads(request.content)
    assert body["textQuery"] == "best ramen"
    assert body["pageSize"] == 10
    centre = body["locationBias"]["circle"]["center"]
    assert (centre["latitude"], centre["longitude"]) == (LONDON.lat, LONDON.lng)


async def test_search_uses_given_origin_for_bias() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={})

    await _client(handler).search_text("ramen", LatLng(51.5, -0.02))
    centre = json.loads(seen[0].content)["locationBias"]["circle"]["center"]
    assert (centre["latitude"], centre["longitude"]) == (51.5, -0.02)


def test_field_mask_is_the_small_card_mask() -> None:
    assert FIELD_MASK.split(",") == [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.addressComponents",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.currentOpeningHours.openNow",
        "places.photos",
        "places.primaryTypeDisplayName",
        "places.types",
    ]


async def test_full_place_maps_every_field() -> None:
    client = _client(lambda r: httpx.Response(200, json={"places": [FULL_PLACE]}))
    [place] = await client.search_text("koya", None)
    assert place.id == "ChIJ-koya"
    assert place.name == "Koya Soho"
    assert place.address == "50 Frith St, London W1D 4SQ, UK"
    assert place.postcode == "W1D 4SQ"
    assert place.neighbourhood == "Soho"
    assert (place.lat, place.lng) == (51.5136, -0.1318)
    assert place.rating == 4.6
    assert place.review_count == 3120
    assert place.price_tier == "££"
    assert place.open_now is True
    assert place.photo_ref == "places/ChIJ-koya/photos/abc"
    assert place.type_label == "Japanese restaurant"
    assert place.types == ("japanese_restaurant", "restaurant")


@pytest.mark.parametrize(
    ("level", "tier"),
    [
        ("PRICE_LEVEL_FREE", "£"),
        ("PRICE_LEVEL_INEXPENSIVE", "£"),
        ("PRICE_LEVEL_MODERATE", "££"),
        ("PRICE_LEVEL_EXPENSIVE", "£££"),
        ("PRICE_LEVEL_VERY_EXPENSIVE", "££££"),
        ("PRICE_LEVEL_UNSPECIFIED", None),
    ],
)
async def test_price_level_maps_to_tier(level: str, tier: str | None) -> None:
    raw = {"id": "x", "displayName": {"text": "X"}, "priceLevel": level}
    client = _client(lambda r: httpx.Response(200, json={"places": [raw]}))
    [place] = await client.search_text("x", None)
    assert place.price_tier == tier


async def test_minimal_place_maps_with_none_fields() -> None:
    raw = {"id": "p1", "displayName": {"text": "Bare"}}
    client = _client(lambda r: httpx.Response(200, json={"places": [raw]}))
    [place] = await client.search_text("bare", None)
    assert place.name == "Bare"
    assert place.address == ""
    assert place.postcode is None
    assert place.neighbourhood is None
    assert place.lat is None and place.lng is None
    assert place.rating is None
    assert place.review_count is None
    assert place.price_tier is None
    assert place.open_now is None
    assert place.photo_ref is None
    assert place.type_label is None
    assert place.types == ()


@pytest.mark.parametrize("status", [403, 429, 500])
async def test_http_error_raises_without_body_or_key(status: int) -> None:
    client = _client(lambda r: httpx.Response(status, text=f"upstream detail {KEY}"))
    with pytest.raises(PlacesError) as info:
        await client.search_text("x", None)
    assert str(status) in str(info.value)
    assert "upstream detail" not in str(info.value)
    assert KEY not in str(info.value)


async def test_network_error_raises_places_error_without_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"boom {request.url}")

    with pytest.raises(PlacesError) as info:
        await _client(handler).search_text("x", None)
    assert KEY not in str(info.value)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="<html>proxy page</html>"),
        httpx.Response(200, json=["not", "a", "dict"]),
        httpx.Response(200, json={"places": "nope"}),
        httpx.Response(200, json={"places": [{"id": "x", "location": "bad"}]}),
    ],
)
async def test_bad_200_body_raises_places_error(response: httpx.Response) -> None:
    with pytest.raises(PlacesError):
        await _client(lambda r: response).search_text("x", None)


async def test_place_without_id_is_skipped_others_kept() -> None:
    body = {"places": [{"displayName": {"text": "No id"}}, FULL_PLACE]}
    places = await _client(lambda r: httpx.Response(200, json=body)).search_text(
        "x", None
    )
    assert [p.id for p in places] == ["ChIJ-koya"]


async def test_overlong_photo_ref_is_dropped() -> None:
    raw = {**FULL_PLACE, "photos": [{"name": "places/x/photos/" + "a" * 1000}]}
    client = _client(lambda r: httpx.Response(200, json={"places": [raw]}))
    [place] = await client.search_text("x", None)
    assert place.photo_ref is None


async def test_photo_url_returns_photo_uri() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200, json={"photoUri": "https://lh3.googleusercontent.com/p/abc"}
        )

    url = await _client(handler).photo_url("places/ChIJ-koya/photos/abc", 640)
    assert url == "https://lh3.googleusercontent.com/p/abc"
    request = seen[0]
    assert request.url.path == "/v1/places/ChIJ-koya/photos/abc/media"
    assert request.url.params["maxWidthPx"] == "640"
    assert request.url.params["skipHttpRedirect"] == "true"
    assert request.headers["X-Goog-Api-Key"] == KEY
    assert "key" not in request.url.params


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(200, json={}),
        httpx.Response(200, json={"photoUri": "http://insecure.example/p"}),
    ],
)
async def test_photo_url_returns_none_on_error(response: httpx.Response) -> None:
    client = _client(lambda r: response)
    assert await client.photo_url("places/x/photos/y") is None


async def test_photo_url_rejects_foreign_ref() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={"photoUri": "https://x"})

    assert await _client(handler).photo_url("../../evil") is None
    assert called is False
