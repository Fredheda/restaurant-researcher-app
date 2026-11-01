import { describe, expect, it } from "vitest";
import { activeToolLine, toChatItems, toolLine } from "./chat-model";
import type { AgentMessage } from "./chat-model";

const call = (id: string, name: string, args: unknown = {}) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});

const SEARCH_RESULT = JSON.stringify({
  search_id: "s1",
  places: [{ id: "a" }, { id: "b" }, { id: "c" }],
});

describe("toolLine", () => {
  it("counts the venues a search returned", () => {
    expect(toolLine("search_places", SEARCH_RESULT)).toBe("search_places · 3 venues");
    expect(
      toolLine("search_places", JSON.stringify({ search_id: "s", places: [{ id: "a" }] }))
    ).toBe("search_places · 1 venue");
  });

  it("names the place get_place returned", () => {
    expect(toolLine("get_place", JSON.stringify({ id: "a", name: "Koya Soho" }))).toBe(
      "get_place · Koya Soho"
    );
  });

  it("falls back to the bare tool name for text or unknown results", () => {
    expect(toolLine("search_places", "The search is unavailable right now.")).toBe(
      "search_places · unavailable"
    );
    expect(toolLine("other_tool", "ok")).toBe("other_tool");
    expect(toolLine("search_places", undefined)).toBe("search_places");
  });
});

describe("toChatItems", () => {
  it("maps user lines and answers, putting tool lines on the answer that follows", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", content: "best ramen" },
      { id: "a1", role: "assistant", content: "", toolCalls: [call("c1", "search_places")] },
      { id: "t1", role: "tool", toolCallId: "c1", content: SEARCH_RESULT },
      { id: "a2", role: "assistant", toolCalls: [call("c2", "show_places", { search_id: "s1" })] },
      { id: "t2", role: "tool", toolCallId: "c2", content: "Showing 3 places." },
      { id: "a3", role: "assistant", content: "Three places on the board." },
    ];
    expect(toChatItems(messages)).toEqual([
      { id: "u1", kind: "user", text: "best ramen" },
      {
        id: "a3",
        kind: "assistant",
        text: "Three places on the board.",
        tools: ["search_places · 3 venues"],
      },
    ]);
  });

  it("skips empty assistant messages and system or developer messages", () => {
    const messages: AgentMessage[] = [
      { id: "s", role: "system", content: "x" },
      { id: "u1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "" },
      { id: "a2", role: "assistant", content: "Hello." },
    ];
    expect(toChatItems(messages).map((m) => m.id)).toEqual(["u1", "a2"]);
  });

  it("reads text from content parts", () => {
    const messages: AgentMessage[] = [
      { id: "a1", role: "assistant", content: [{ type: "text", text: "Hi" }, { type: "text", text: " there" }] },
    ];
    expect(toChatItems(messages)).toEqual([
      { id: "a1", kind: "assistant", text: "Hi there", tools: [] },
    ]);
  });
});

describe("activeToolLine", () => {
  it("names a backend tool call that has no result yet", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", content: "ramen" },
      { id: "a1", role: "assistant", toolCalls: [call("c1", "search_places")] },
    ];
    expect(activeToolLine(messages)).toBe("search_places · working");
  });

  it("is null once every call has a result", () => {
    const messages: AgentMessage[] = [
      { id: "a1", role: "assistant", toolCalls: [call("c1", "search_places")] },
      { id: "t1", role: "tool", toolCallId: "c1", content: SEARCH_RESULT },
    ];
    expect(activeToolLine(messages)).toBeNull();
  });
});
