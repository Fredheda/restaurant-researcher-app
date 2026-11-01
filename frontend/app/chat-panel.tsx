"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { runStubResearch } from "./stub-responder";
import type { PlaceResult } from "./types";

type Message = { id: string; role: "user" | "status"; text: string };

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

/**
 * Docked column from the md breakpoint; below it a bottom sheet that stays
 * invisible (not focusable, not in the accessibility tree) until opened.
 */
export function ChatPanel({
  onPlaceFound,
}: {
  onPlaceFound: (place: PlaceResult) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-30 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper md:hidden"
        >
          Open chat
        </button>
      )}
      <aside
        data-testid="chat-sheet"
        data-open={open ? "true" : "false"}
        className={`fixed inset-x-0 bottom-0 z-40 flex h-[60dvh] flex-col border-t border-hairline bg-chatbg p-3 transition-transform md:static md:z-auto md:h-auto md:w-80 md:flex-shrink-0 md:translate-y-0 md:border-t-0 md:border-l md:visible ${
          open ? "translate-y-0" : "max-md:invisible max-md:translate-y-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-lg text-ink">Restaurant Researcher</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-sm px-2 py-0.5 text-sm text-muted md:hidden"
          >
            Close chat
          </button>
        </div>
        <div data-testid="chat-messages" className="flex-1 space-y-2 overflow-y-auto text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto w-fit max-w-[85%] rounded-lg bg-surface px-2.5 py-1.5 text-ink"
                  : "w-fit max-w-[90%] rounded-lg bg-ink px-2.5 py-1.5 text-paper"
              }
            >
              {m.role === "status" ? `• ${m.text}` : m.text}
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="mt-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about a place…"
            className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
        </form>
      </aside>
    </>
  );
}
