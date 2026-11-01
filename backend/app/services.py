"""The service objects an app instance is built from.

`create_app` takes a `Services`; production builds it from settings
(`app.main.build_services`), tests pass fakes. Nothing here imports a real
client.
"""

import asyncio
import logging
from collections.abc import Coroutine
from dataclasses import dataclass, field
from typing import Any

from app.places.service import SearchService
from app.store.users import Principal, UserStore

logger = logging.getLogger(__name__)


@dataclass
class Services:
    search: SearchService
    users: UserStore
    # Local dev without Easy Auth: a fixed dev principal when headers are
    # absent. `load_settings` refuses it next to a real database.
    local: bool = False
    keepalive_s: float = 15.0
    # An events stream is closed after this long; the browser reconnects.
    sse_max_s: float = 1800.0
    _pending: set[asyncio.Task[None]] = field(default_factory=set, repr=False)

    def touch(self, principal: Principal) -> None:
        """Record the user in the background; a slow database never delays
        the request, and a failure is logged without the user's details."""
        self._spawn(self._touch(principal))

    async def _touch(self, principal: Principal) -> None:
        try:
            await self.users.touch(principal)
        except Exception as error:  # noqa: BLE001
            logger.warning("user touch failed: %s", type(error).__name__)

    def _spawn(self, work: Coroutine[Any, Any, None]) -> None:
        task = asyncio.create_task(work)
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def drain(self) -> None:
        while self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)
        await self.search.drain()
