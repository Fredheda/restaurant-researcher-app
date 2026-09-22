"use client";

import { useState, type FormEvent } from "react";
import { runStubResearch } from "./stub-responder";
import type { PlaceResult } from "./types";

type Message = { id: string; role: "user" | "status"; text: string };

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

export function ChatPanel({
  onPlaceFound,
}: {
  onPlaceFound: (place: PlaceResult) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const query = input.trim();
    if (!query || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: nextId(), role: "user", text: query }]);

    const found = await runStubResearch(query, (line) => {
      setMessages((m) => [...m, { id: nextId(), role: "status", text: line }]);
    });

    if (found) {
      onPlaceFound(found);
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "status", text: `Added ${found.name} to the board.` },
      ]);
    } else {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "status", text: "Couldn't find that place in this demo's fixtures." },
      ]);
    }
    setBusy(false);
  }

  return (
    <aside className="flex w-72 flex-col border-l border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 font-semibold">Restaurant Researcher</div>
      <div data-testid="chat-messages" className="flex-1 space-y-2 overflow-y-auto text-sm">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-blue-100 px-2 py-1"
                : "text-gray-500"
            }
          >
            {m.role === "status" ? `• ${m.text}` : m.text}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Ask about a place…"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
      </form>
    </aside>
  );
}
