"""The AG-UI endpoint of the `agent` role.

This is `ag_ui_langgraph.add_langgraph_fastapi_endpoint` plus the sign-in
check: a run without the Easy Auth principal header gets 401 before the
model is called, and the principal id is put into the run's config, where
the tools read it.

The agent id is one of three spellings that must match: this constant, the
agent registry of the web app's CopilotKit runtime route, and the
provider's `agent` prop.
"""

import logging
from collections import OrderedDict
from collections.abc import Callable

from ag_ui.core import EventType, RunErrorEvent
from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph

from app.api.principal import principal_from_headers
from app.services import Services

logger = logging.getLogger(__name__)

AGENT_NAME = "restaurant_researcher"
AGENT_PATH = f"/agent/{AGENT_NAME}"


MAX_THREADS = 2000


class ThreadOwners:
    """Who owns each conversation thread in this process.

    The checkpointer keys conversations by the browser's thread id only, so
    the first user to send a thread id owns it; another user sending the
    same id is refused instead of reading that history. The map holds at
    most `limit` threads. The least recently used one is dropped together
    with its history (`on_evict`), so a dropped id holds nothing to read.
    Ownership and history both live in process memory and end together on
    a restart (one replica).
    """

    def __init__(
        self, limit: int = MAX_THREADS, on_evict: Callable[[str], None] | None = None
    ) -> None:
        self._limit = limit
        self._on_evict = on_evict
        self._owners: OrderedDict[str, str] = OrderedDict()

    def __len__(self) -> int:
        return len(self._owners)

    def claim(self, thread_id: str, user_id: str) -> bool:
        owner = self._owners.get(thread_id)
        if owner is not None:
            self._owners.move_to_end(thread_id)
            return owner == user_id
        self._owners[thread_id] = user_id
        while len(self._owners) > self._limit:
            dropped, _ = self._owners.popitem(last=False)
            if self._on_evict is not None:
                self._on_evict(dropped)
        return True


def mount_agent(app: FastAPI, graph: CompiledStateGraph, services: Services) -> None:
    base = LangGraphAGUIAgent(
        name=AGENT_NAME,
        description="Finds London restaurants and shows them on the board.",
        graph=graph,
    )
    saver = graph.checkpointer
    owners = ThreadOwners(
        limit=MAX_THREADS,
        on_evict=saver.delete_thread
        if isinstance(saver, BaseCheckpointSaver)
        else None,
    )

    @app.post(AGENT_PATH)
    async def run_agent(input_data: RunAgentInput, request: Request):
        principal = principal_from_headers(request.headers, services.local)
        if not owners.claim(input_data.thread_id, principal.id):
            raise HTTPException(status_code=403, detail="not your conversation")
        services.touch(principal)
        # A fresh copy per request: the agent keeps per-run state.
        agent = base.clone()
        agent.config = {"configurable": {"principal_id": principal.id}}
        encoder = EventEncoder(accept=request.headers.get("accept") or "")

        async def stream():
            try:
                async for event in agent.run(input_data):
                    yield encoder.encode(event)
            except Exception as error:  # noqa: BLE001
                # A model or tool failure ends the run with an AG-UI error
                # event instead of a dropped connection. Only the class is
                # logged: provider errors can echo the API key.
                logger.warning("agent run failed: %s", type(error).__name__)
                yield encoder.encode(
                    RunErrorEvent(
                        type=EventType.RUN_ERROR,
                        message="The assistant hit an error. Try again.",
                        code="agent_error",
                    )
                )

        return StreamingResponse(stream(), media_type=encoder.get_content_type())
