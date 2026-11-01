"""The place and search cache, in memory (tests, local dev) or in SQL.

Place rows and search result lists are shared across users; a search row
(its id) belongs to the user who ran it. `TimeoutCache` makes sure the
database never blocks the first paint: a slow or failing read counts as a
miss, and only the exception class is logged (a driver message can name the
server).
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, TypeVar

from app.places.models import GooglePlace
from app.store.database import Connect

logger = logging.getLogger(__name__)

T = TypeVar("T")


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class CachedPlace:
    place: GooglePlace
    hygiene_rating: int | None  # None with a check time = not rated
    fetched_at: datetime  # when the Google fields were fetched
    hygiene_checked_at: datetime | None  # None = lookup failed, retry


@dataclass(frozen=True)
class StoredSearch:
    id: str
    user_id: str
    query: str
    origin: str | None
    key: str
    created_at: datetime
    place_ids: tuple[str, ...]


class PlaceCache(Protocol):
    async def get_places(self, ids: Sequence[str]) -> dict[str, CachedPlace]: ...

    async def get_search(
        self, key: str, max_age: timedelta, now: datetime | None = None
    ) -> StoredSearch | None: ...

    async def get_search_by_id(
        self, search_id: str, user_id: str
    ) -> StoredSearch | None: ...

    async def save(
        self, search: StoredSearch, places: Sequence[CachedPlace]
    ) -> None: ...


class InMemoryPlaceCache:
    def __init__(self) -> None:
        self.places: dict[str, CachedPlace] = {}
        self.searches: dict[str, StoredSearch] = {}

    async def get_places(self, ids: Sequence[str]) -> dict[str, CachedPlace]:
        return {pid: self.places[pid] for pid in ids if pid in self.places}

    async def get_search(
        self, key: str, max_age: timedelta, now: datetime | None = None
    ) -> StoredSearch | None:
        cutoff = (now or utcnow()) - max_age
        matches = [
            s for s in self.searches.values() if s.key == key and s.created_at > cutoff
        ]
        return max(matches, key=lambda s: s.created_at, default=None)

    async def get_search_by_id(
        self, search_id: str, user_id: str
    ) -> StoredSearch | None:
        found = self.searches.get(search_id)
        return found if found is not None and found.user_id == user_id else None

    async def save(self, search: StoredSearch, places: Sequence[CachedPlace]) -> None:
        for cached in places:
            self.places[cached.place.id] = cached
        self.searches[search.id] = search


class TimeoutCache:
    """Reads that time out or fail are misses. `read_timeout_s` bounds the
    reads on the fast search path; `lookup_timeout_s` bounds fetching a
    search by id, which can wait for a paused database to resume."""

    def __init__(
        self, inner: PlaceCache, read_timeout_s: float, lookup_timeout_s: float
    ) -> None:
        self._inner = inner
        self._read = read_timeout_s
        self._lookup = lookup_timeout_s

    @property
    def inner(self) -> PlaceCache:
        return self._inner

    async def _guard(self, what: str, call: Awaitable[T], timeout: float, miss: T) -> T:
        try:
            return await asyncio.wait_for(call, timeout)
        except Exception as error:  # noqa: BLE001 - any failure is a miss
            logger.warning("cache %s missed: %s", what, type(error).__name__)
            return miss

    async def get_places(self, ids: Sequence[str]) -> dict[str, CachedPlace]:
        return await self._guard(
            "get_places", self._inner.get_places(ids), self._read, {}
        )

    async def get_search(
        self, key: str, max_age: timedelta, now: datetime | None = None
    ) -> StoredSearch | None:
        return await self._guard(
            "get_search", self._inner.get_search(key, max_age, now), self._read, None
        )

    async def get_search_by_id(
        self, search_id: str, user_id: str
    ) -> StoredSearch | None:
        return await self._guard(
            "get_search_by_id",
            self._inner.get_search_by_id(search_id, user_id),
            self._lookup,
            None,
        )

    async def save(self, search: StoredSearch, places: Sequence[CachedPlace]) -> None:
        await self._inner.save(search, places)


# --- SQL -----------------------------------------------------------------
# Not testable offline; the statements stay trivial and are checked by the
# live gate. The driver is synchronous, so every call runs in a thread.

_PLACE_COLUMNS = (
    "id, name, address, postcode, neighbourhood, lat, lng, rating, review_count,"
    " price_tier, open_now, photo_ref, type_label, types, hygiene_rating, fetched_at,"
    " hygiene_checked_at"
)


def _utc(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=UTC) if value is not None else None


def _naive(value: datetime | None) -> datetime | None:
    return value.replace(tzinfo=None) if value is not None else None


def _row_to_place(row: Sequence[Any]) -> CachedPlace:
    google = GooglePlace(
        id=row[0],
        name=row[1],
        address=row[2] or "",
        postcode=row[3],
        neighbourhood=row[4],
        lat=row[5],
        lng=row[6],
        rating=float(row[7]) if row[7] is not None else None,
        review_count=row[8],
        price_tier=row[9],
        open_now=bool(row[10]) if row[10] is not None else None,
        photo_ref=row[11],
        type_label=row[12],
        types=tuple(json.loads(row[13] or "[]")),
    )
    return CachedPlace(google, row[14], row[15].replace(tzinfo=UTC), _utc(row[16]))


class SqlPlaceCache:
    def __init__(self, connect: Connect) -> None:
        self._connect = connect

    async def _run(self, work: Callable[[Any], T]) -> T:
        def job() -> T:
            conn = self._connect()
            try:
                result = work(conn.cursor())
                conn.commit()
                return result
            finally:
                conn.close()

        return await asyncio.to_thread(job)

    async def get_places(self, ids: Sequence[str]) -> dict[str, CachedPlace]:
        if not ids:
            return {}
        marks = ",".join("?" for _ in ids)

        def work(cur: Any) -> dict[str, CachedPlace]:
            cur.execute(
                f"SELECT {_PLACE_COLUMNS} FROM rr.places WHERE id IN ({marks})",
                tuple(ids),
            )
            return {row[0]: _row_to_place(row) for row in cur.fetchall()}

        return await self._run(work)

    def _search(self, cur: Any, row: Sequence[Any] | None) -> StoredSearch | None:
        if row is None:
            return None
        cur.execute(
            "SELECT place_id FROM rr.search_results WHERE search_id = ? ORDER BY rank",
            (row[0],),
        )
        return StoredSearch(
            id=row[0],
            user_id=row[1],
            query=row[2],
            origin=row[3],
            key=row[4],
            created_at=row[5].replace(tzinfo=UTC),
            place_ids=tuple(r[0] for r in cur.fetchall()),
        )

    async def get_search(
        self, key: str, max_age: timedelta, now: datetime | None = None
    ) -> StoredSearch | None:
        cutoff = ((now or utcnow()) - max_age).replace(tzinfo=None)

        def work(cur: Any) -> StoredSearch | None:
            cur.execute(
                "SELECT TOP 1 id, user_id, query, origin, search_key, created_at"
                " FROM rr.searches WHERE search_key = ? AND created_at > ?"
                " ORDER BY created_at DESC",
                (key, cutoff),
            )
            return self._search(cur, cur.fetchone())

        return await self._run(work)

    async def get_search_by_id(
        self, search_id: str, user_id: str
    ) -> StoredSearch | None:
        def work(cur: Any) -> StoredSearch | None:
            cur.execute(
                "SELECT id, user_id, query, origin, search_key, created_at"
                " FROM rr.searches WHERE id = ? AND user_id = ?",
                (search_id, user_id),
            )
            return self._search(cur, cur.fetchone())

        return await self._run(work)

    async def save(self, search: StoredSearch, places: Sequence[CachedPlace]) -> None:
        def work(cur: Any) -> None:
            for cached in places:
                p = cached.place
                values = (
                    p.id,
                    p.name,
                    p.address,
                    p.postcode,
                    p.neighbourhood,
                    p.lat,
                    p.lng,
                    p.rating,
                    p.review_count,
                    p.price_tier,
                    p.open_now,
                    p.photo_ref,
                    p.type_label,
                    json.dumps(list(p.types)),
                    cached.hygiene_rating,
                    cached.fetched_at.replace(tzinfo=None),
                    _naive(cached.hygiene_checked_at),
                )
                # HOLDLOCK makes the upsert safe for two identical searches
                # saving the same place at once.
                cur.execute(
                    "MERGE rr.places WITH (HOLDLOCK) AS t USING (SELECT ? AS id) AS s"
                    " ON t.id = s.id"
                    " WHEN MATCHED THEN UPDATE SET name = ?, address = ?, postcode = ?,"
                    " neighbourhood = ?, lat = ?, lng = ?, rating = ?, review_count = ?,"
                    " price_tier = ?, open_now = ?, photo_ref = ?, type_label = ?,"
                    " types = ?, hygiene_rating = ?, fetched_at = ?,"
                    " hygiene_checked_at = ?"
                    f" WHEN NOT MATCHED THEN INSERT ({_PLACE_COLUMNS})"
                    f" VALUES ({', '.join('?' for _ in values)});",
                    (p.id, *values[1:], *values),
                )
            cur.execute(
                "INSERT INTO rr.searches (id, user_id, query, origin, search_key,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    search.id,
                    search.user_id,
                    search.query,
                    search.origin,
                    search.key,
                    search.created_at.replace(tzinfo=None),
                ),
            )
            for rank, place_id in enumerate(search.place_ids):
                cur.execute(
                    "INSERT INTO rr.search_results (search_id, place_id, rank)"
                    " VALUES (?, ?, ?)",
                    (search.id, place_id, rank),
                )

        await self._run(work)
