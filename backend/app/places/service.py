"""The search behind the header bar and the agent's `search_places` tool.

Order of work for `search`:
1. A result list for the same normalised query and origin from the last
   24 hours, whose place rows are all under 30 days old, is reused: no
   Google call.
2. Otherwise Google Text Search runs; hygiene ratings are looked up only for
   places with no fresh row.
3. Cards are ranked (Google rating, then review count; places with fewer
   than 10 reviews dropped unless fewer than 5 would remain).
4. A new search row owned by the caller is saved in the background, so the
   database never delays the answer. The agent passes `wait_for_save=True`,
   because the frontend then reads that search from the other app.

Cards are the JSON shape of the frontend `PlaceResult` card fields.
"""

import asyncio
import logging
import re
import uuid
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from app.places.fhrs import FhrsClient
from app.places.google import GooglePlacesClient, PlacesError
from app.places.models import GooglePlace, LatLng
from app.store.cache import CachedPlace, PlaceCache, StoredSearch, utcnow

logger = logging.getLogger(__name__)

SEARCH_MAX_AGE = timedelta(hours=24)
PLACE_MAX_AGE = timedelta(days=30)
OPEN_STATUS_MAX_AGE = timedelta(hours=1)
PHOTO_TTL = timedelta(hours=1)
MIN_REVIEWS = 10
MIN_RESULTS = 5
LOOKUP_TIMEOUT_S = 1.0
RECENT_SEARCHES = 200
# Column sizes of rr.searches; a longer value would abort the save.
MAX_QUERY = 300
MAX_ORIGIN = 200

_LAT_LNG = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")


class SearchError(Exception):
    """The search could not be answered. The message is safe to show."""


@dataclass(frozen=True)
class Search:
    id: str
    query: str
    places: list[dict[str, Any]]
    # With wait_for_save: whether the search row reached the store. None
    # when the save runs in the background.
    saved: bool | None = None

    def to_json(self) -> dict[str, Any]:
        return {"id": self.id, "query": self.query, "places": self.places}


def _normalise(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def search_key(query: str, origin: str | None) -> str:
    return f"{_normalise(query)}|{_normalise(origin)}"


def parse_origin(origin: str | None) -> LatLng | None:
    """A "lat,lng" origin biases the search; any other text is ignored until
    the routes phase adds a geocoder."""
    match = _LAT_LNG.match(origin or "")
    if not match:
        return None
    lat, lng = float(match.group(1)), float(match.group(2))
    if -90 <= lat <= 90 and -180 <= lng <= 180:
        return LatLng(lat, lng)
    return None


def rank(places: Sequence[CachedPlace]) -> list[CachedPlace]:
    enough = [c for c in places if (c.place.review_count or 0) >= MIN_REVIEWS]
    kept = enough if len(enough) >= MIN_RESULTS else list(places)
    return sorted(
        kept,
        key=lambda c: (
            c.place.rating is None,
            -(c.place.rating or 0.0),
            -(c.place.review_count or 0),
        ),
    )


class SearchService:
    def __init__(
        self,
        places: GooglePlacesClient,
        fhrs: FhrsClient,
        cache: PlaceCache,
        clock: Callable[[], datetime] = utcnow,
        new_id: Callable[[], str] = lambda: uuid.uuid4().hex,
    ) -> None:
        self._places = places
        self._fhrs = fhrs
        self._cache = cache
        self._clock = clock
        self._new_id = new_id
        self._photos: dict[str, tuple[str | None, datetime]] = {}
        # Recent searches of this process, so a search can be read back
        # before its background save has reached the database.
        self._recent: OrderedDict[str, tuple[StoredSearch, list[CachedPlace]]] = (
            OrderedDict()
        )
        self._pending: set[asyncio.Task[bool]] = set()

    async def search(
        self,
        query: str,
        origin: str | None,
        user_id: str,
        wait_for_save: bool = False,
    ) -> Search:
        now = self._clock()
        query = query[:MAX_QUERY]
        origin = origin[:MAX_ORIGIN] if origin else None
        key = search_key(query, origin)
        cached = await self._from_stored_search(key, now)
        if cached is None:
            cached = rank(await self._from_google(query, origin, now))
        stored = StoredSearch(
            id=self._new_id(),
            user_id=user_id,
            query=query,
            origin=origin,
            key=key,
            created_at=now,
            place_ids=tuple(c.place.id for c in cached),
        )
        self._remember(stored, cached)
        saved: bool | None = None
        if wait_for_save:
            saved = await self._save(stored, cached)
        else:
            task = asyncio.create_task(self._save(stored, cached))
            self._pending.add(task)
            task.add_done_callback(self._pending.discard)
        return Search(stored.id, query, await self._cards(cached, now), saved)

    async def get(self, search_id: str, user_id: str) -> Search | None:
        now = self._clock()
        recent = self._recent.get(search_id)
        if recent is not None:
            stored, cached = recent
            if stored.user_id != user_id:
                return None
        else:
            found = await self._cache.get_search_by_id(search_id, user_id)
            if found is None:
                return None
            stored = found
            rows = await self._cache.get_places(stored.place_ids)
            cached = [rows[pid] for pid in stored.place_ids if pid in rows]
        return Search(stored.id, stored.query, await self._cards(cached, now))

    @property
    def cache(self) -> PlaceCache:
        return self._cache

    async def place(self, place_id: str) -> dict[str, Any] | None:
        """One card by place id, from this process's recent searches or the
        shared place cache; None when unknown. Place rows are not personal."""
        now = self._clock()
        for _, cached in reversed(self._recent.values()):
            for c in cached:
                if c.place.id == place_id:
                    return (await self._cards([c], now))[0]
        rows = await self._cache.get_places([place_id])
        if place_id not in rows:
            return None
        return (await self._cards([rows[place_id]], now))[0]

    async def drain(self) -> None:
        """Wait for background saves (tests and shutdown)."""
        while self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)

    # --- steps -------------------------------------------------------------

    async def _from_stored_search(
        self, key: str, now: datetime
    ) -> list[CachedPlace] | None:
        stored = await self._cache.get_search(key, SEARCH_MAX_AGE, now)
        if stored is None:
            return None
        rows = await self._cache.get_places(stored.place_ids)
        if any(
            pid not in rows or now - rows[pid].fetched_at > PLACE_MAX_AGE
            for pid in stored.place_ids
        ):
            return None
        return [rows[pid] for pid in stored.place_ids]

    async def _from_google(
        self, query: str, origin: str | None, now: datetime
    ) -> list[CachedPlace]:
        try:
            found = await self._places.search_text(query, parse_origin(origin))
        except PlacesError as error:
            logger.warning("places search failed: %s", error)
            raise SearchError("search unavailable") from None
        rows = await self._cache.get_places([p.id for p in found])
        return list(
            await asyncio.gather(
                *(self._with_hygiene(p, rows.get(p.id), now) for p in found)
            )
        )

    async def _with_hygiene(
        self, place: GooglePlace, row: CachedPlace | None, now: datetime
    ) -> CachedPlace:
        """Fresh Google data plus a hygiene rating checked in the last 30
        days; a failed lookup leaves `hygiene_checked_at` empty, so the card
        hides the badge and the next search tries again."""
        checked = row.hygiene_checked_at if row is not None else None
        if checked is not None and row is not None and now - checked <= PLACE_MAX_AGE:
            return CachedPlace(place, row.hygiene_rating, now, checked)
        try:
            rating = await asyncio.wait_for(
                self._fhrs.rating_for(place.name, place.postcode), LOOKUP_TIMEOUT_S
            )
        except Exception as error:  # noqa: BLE001 - hygiene is decoration
            logger.warning("hygiene lookup failed: %s", type(error).__name__)
            return CachedPlace(place, None, now, None)
        return CachedPlace(place, rating, now, now)

    async def _save(self, stored: StoredSearch, cached: list[CachedPlace]) -> bool:
        try:
            await self._cache.save(stored, cached)
        except Exception as error:  # noqa: BLE001 - the answer is already out
            logger.warning("cache save failed: %s", type(error).__name__)
            return False
        return True

    def _remember(self, stored: StoredSearch, cached: list[CachedPlace]) -> None:
        self._recent[stored.id] = (stored, cached)
        while len(self._recent) > RECENT_SEARCHES:
            self._recent.popitem(last=False)

    async def _photo(self, ref: str | None, now: datetime) -> str | None:
        if not ref:
            return None
        hit = self._photos.get(ref)
        if hit is not None and now - hit[1] < PHOTO_TTL:
            return hit[0]
        try:
            url = await asyncio.wait_for(self._places.photo_url(ref), LOOKUP_TIMEOUT_S)
        except Exception as error:  # noqa: BLE001 - a card renders without a photo
            logger.warning("photo lookup failed: %s", type(error).__name__)
            url = None
        self._photos[ref] = (url, now)
        return url

    async def _cards(
        self, cached: Sequence[CachedPlace], now: datetime
    ) -> list[dict[str, Any]]:
        photos = await asyncio.gather(
            *(self._photo(c.place.photo_ref, now) for c in cached)
        )
        return [_card(c, photo, now) for c, photo in zip(cached, photos)]


def _open_status(cached: CachedPlace, now: datetime) -> str:
    open_now = cached.place.open_now
    if open_now is None or now - cached.fetched_at > OPEN_STATUS_MAX_AGE:
        return ""
    return "Open now" if open_now else "Closed now"


def _card(cached: CachedPlace, photo: str | None, now: datetime) -> dict[str, Any]:
    p = cached.place
    card: dict[str, Any] = {
        "id": p.id,
        "name": p.name,
        "type": p.type_label or "Restaurant",
        "neighbourhood": p.neighbourhood or "",
        "priceTier": p.price_tier,
        "overview": {
            "rating": p.rating,
            "reviewCount": p.review_count,
            "address": p.address,
            "openStatus": _open_status(cached, now),
            "reviewQuotes": [],
        },
    }
    if photo:
        card["photo"] = photo
    if cached.hygiene_checked_at is not None:
        card["hygieneRating"] = cached.hygiene_rating
    return card
