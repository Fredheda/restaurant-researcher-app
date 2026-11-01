"""The LangGraph agent: a prebuilt tool-calling agent over the search
service. `CopilotKitMiddleware` binds the frontend tools the browser
declares (`show_places`, `open_place`) next to the backend tools.
"""

from pathlib import Path

from copilotkit import CopilotKitMiddleware
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.state import CompiledStateGraph

from app.agent.tools import make_tools
from app.places.service import SearchService

# Coupled by hand to the frontend tools in the web app; a test guards the
# tool names.
SYSTEM_PROMPT = (Path(__file__).parent / "system_prompt.md").read_text()


def build_graph(model: BaseChatModel, service: SearchService) -> CompiledStateGraph:
    """Production passes `ChatOpenAI`; tests pass a scripted model, so
    everything else (tools, prompt, middleware, checkpointer) is what ships."""
    return create_agent(
        model=model,
        tools=make_tools(service),
        system_prompt=SYSTEM_PROMPT,
        middleware=[CopilotKitMiddleware()],
        checkpointer=MemorySaver(),
    )


def openai_model(api_key: str, model: str) -> BaseChatModel:
    """The production model, on the Responses API so a reasoning model can
    return tool calls and a reasoning summary in one turn."""
    from langchain_openai import ChatOpenAI
    from pydantic import SecretStr

    return ChatOpenAI(
        model=model,
        api_key=SecretStr(api_key),
        use_responses_api=True,
        output_version="responses/v1",
        reasoning={"effort": "low", "summary": "auto"},
    )
