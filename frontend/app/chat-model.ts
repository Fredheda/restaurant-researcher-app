/**
 * Turns the agent's AG-UI message list into what the assistant panel shows:
 * the person's prompts, and answers each preceded by the backend tool lines
 * that led to them ("search_places · 6 venues"). Frontend tool calls
 * (show_places, open_place) are UI moves, not research, so they get no line.
 */

type ContentPart = { type: string; text?: string };

/** The parts of an AG-UI message this panel reads (structurally compatible). */
export type AgentMessage = {
  id: string;
  role: string;
  content?: string | ContentPart[] | null;
  toolCalls?: { id: string; function: { name: string; arguments: string } }[];
  toolCallId?: string;
};

export type ChatItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; tools: string[] };

const FRONTEND_TOOLS = new Set(["show_places", "open_place"]);

function text(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}

function parse(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return undefined;
  }
}

/** One tool line: the tool name plus what its result says, when readable. */
export function toolLine(name: string, result: string | undefined): string {
  if (result === undefined) return name;
  const data = parse(result) as Record<string, unknown> | undefined;
  if (name === "search_places") {
    if (data && Array.isArray(data.places)) {
      const n = data.places.length;
      return `${name} · ${n} ${n === 1 ? "venue" : "venues"}`;
    }
    return /unavailable/i.test(result) ? `${name} · unavailable` : name;
  }
  if (name === "get_place" && data && typeof data.name === "string") {
    return `${name} · ${data.name}`;
  }
  return name;
}

function results(messages: AgentMessage[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) out.set(m.toolCallId, text(m.content));
  }
  return out;
}

export function toChatItems(messages: AgentMessage[]): ChatItem[] {
  const byCall = results(messages);
  const items: ChatItem[] = [];
  let pending: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const t = text(m.content);
      if (t) items.push({ id: m.id, kind: "user", text: t });
      pending = [];
    } else if (m.role === "assistant") {
      for (const c of m.toolCalls ?? []) {
        if (!FRONTEND_TOOLS.has(c.function.name)) {
          pending.push(toolLine(c.function.name, byCall.get(c.id)));
        }
      }
      const t = text(m.content);
      if (t) {
        items.push({ id: m.id, kind: "assistant", text: t, tools: pending });
        pending = [];
      }
    }
  }
  return items;
}

/** The backend tool call still waiting for its result, as a loading line. */
export function activeToolLine(messages: AgentMessage[]): string | null {
  const byCall = results(messages);
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const c of messages[i].toolCalls ?? []) {
      if (!byCall.has(c.id) && !FRONTEND_TOOLS.has(c.function.name)) {
        return `${c.function.name} · working`;
      }
    }
  }
  return null;
}
