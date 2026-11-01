"""The AG-UI endpoint of the `agent` role.

This is `ag_ui_langgraph.add_langgraph_fastapi_endpoint` plus the sign-in
check: a run without the Easy Auth principal header gets 401 before the
model is called, and the principal id is put into the run's config, where
the tools read it.

The agent id is one of three spellings that must match: this constant, the
agent registry of the web app's CopilotKit runtime route, and the
provider's `agent` prop.
"""

from ag_ui.core.types import RunAgentInput
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from langgraph.graph.state import CompiledStateGraph

from app.api.principal import principal_from_headers
from app.services import Services

AGENT_NAME = "restaurant_researcher"
AGENT_PATH = f"/agent/{AGENT_NAME}"


def mount_agent(app: FastAPI, graph: CompiledStateGraph, services: Services) -> None:
    base = LangGraphAGUIAgent(
        name=AGENT_NAME,
        description="Finds London restaurants and shows them on the board.",
        graph=graph,
    )

    @app.post(AGENT_PATH)
    async def run_agent(input_data: RunAgentInput, request: Request):
        principal = principal_from_headers(request.headers, services.local)
        services.touch(principal)
        # A fresh copy per request: the agent keeps per-run state.
        agent = base.clone()
        agent.config = {"configurable": {"principal_id": principal.id}}
        encoder = EventEncoder(accept=request.headers.get("accept") or "")

        async def stream():
            async for event in agent.run(input_data):
                yield encoder.encode(event)

        return StreamingResponse(stream(), media_type=encoder.get_content_type())
