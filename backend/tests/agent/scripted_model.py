"""A scripted streaming chat model standing in for OpenAI.

`create_agent` calls `bind_tools`, which LangChain's fake models leave
unimplemented, so this one records the bound tool names and streams its
scripted replies in chunks (text, or one tool call), the way
`ag-ui-langgraph` sees a real model stream.
"""

import json
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import Field


@dataclass(frozen=True)
class Call:
    name: str
    args: dict[str, Any]


Reply = str | Call


class ScriptedChatModel(BaseChatModel):
    script: list[Reply] = Field(default_factory=list)
    bound_tools: list[str] = Field(default_factory=list)
    # Shared by the copies `bind_tools` makes, so a test can read them.
    log: dict[str, Any] = Field(default_factory=lambda: {"turn": 0, "tools": []})

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(  # type: ignore[override]
        self, tools: Sequence[Any], *, tool_choice: Any = None, **kwargs: Any
    ) -> "ScriptedChatModel":
        names = [convert_to_openai_tool(t)["function"]["name"] for t in tools]
        self.log["tools"] = names
        return self.model_copy(update={"bound_tools": names})

    def _next(self) -> Reply:
        turn = self.log["turn"]
        self.log["turn"] = turn + 1
        return self.script[turn] if turn < len(self.script) else "Done."

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        reply = self._next()
        if isinstance(reply, str):
            message = AIMessage(content=reply)
        else:
            message = AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": reply.name,
                        "args": reply.args,
                        "id": f"call_{self.log['turn']}",
                        "type": "tool_call",
                    }
                ],
            )
        return ChatResult(generations=[ChatGeneration(message=message)])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        reply = self._next()
        if isinstance(reply, str):
            for i in range(0, len(reply), 4):
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content=reply[i : i + 4])
                )
            return
        yield ChatGenerationChunk(
            message=AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {
                        "name": reply.name,
                        "args": json.dumps(reply.args),
                        "id": f"call_{self.log['turn']}",
                        "index": 0,
                        "type": "tool_call_chunk",
                    }
                ],
            )
        )
