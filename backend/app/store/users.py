"""Signed-in users. Access control is Entra's; this only records who came.

`touch` upserts the user on the first request after process start and then
at most once a day, so a busy session costs one write a day, not one per
request.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from app.store.database import Connect

TOUCH_EVERY = timedelta(days=1)
Clock = Callable[[], datetime]


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class Principal:
    """The Easy Auth sign-in: object id, display name, identity provider."""

    id: str
    name: str | None
    idp: str | None


@dataclass(frozen=True)
class UserRow:
    id: str
    display_name: str | None
    is_admin: bool
    created_at: datetime
    last_seen_at: datetime


class UserStore(Protocol):
    async def touch(self, principal: Principal) -> None: ...


class _Throttled:
    def __init__(self, clock: Clock = utcnow) -> None:
        self._clock = clock
        self._last: dict[str, datetime] = {}

    async def touch(self, principal: Principal) -> None:
        now = self._clock()
        last = self._last.get(principal.id)
        if last is not None and now - last < TOUCH_EVERY:
            return
        self._last[principal.id] = now
        await self._upsert(principal, now)

    async def _upsert(self, principal: Principal, now: datetime) -> None:
        raise NotImplementedError


class InMemoryUserStore(_Throttled):
    def __init__(self, clock: Clock = utcnow) -> None:
        super().__init__(clock)
        self.rows: dict[str, UserRow] = {}
        self.writes = 0

    async def _upsert(self, principal: Principal, now: datetime) -> None:
        self.writes += 1
        row = self.rows.get(principal.id)
        if row is None:
            self.rows[principal.id] = UserRow(
                principal.id, principal.name, False, now, now
            )
        else:
            self.rows[principal.id] = replace(
                row, display_name=principal.name, last_seen_at=now
            )


class SqlUserStore(_Throttled):
    """Not testable offline; checked by the live gate."""

    def __init__(self, connect: Connect, clock: Clock = utcnow) -> None:
        super().__init__(clock)
        self._connect = connect

    async def _upsert(self, principal: Principal, now: datetime) -> None:
        stamp = now.replace(tzinfo=None)

        def job() -> None:
            conn: Any = self._connect()
            try:
                conn.cursor().execute(
                    "MERGE rr.users WITH (HOLDLOCK) AS t USING (SELECT ? AS id) AS s"
                    " ON t.id = s.id"
                    " WHEN MATCHED THEN UPDATE SET display_name = ?, last_seen_at = ?"
                    " WHEN NOT MATCHED THEN INSERT (id, display_name, created_at,"
                    " last_seen_at) VALUES (?, ?, ?, ?);",
                    (
                        principal.id,
                        principal.name,
                        stamp,
                        principal.id,
                        principal.name,
                        stamp,
                        stamp,
                    ),
                )
                conn.commit()
            finally:
                conn.close()

        await asyncio.to_thread(job)
