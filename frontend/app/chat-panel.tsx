"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatItem } from "./chat-model";
import { ChatView } from "./chat-view";
import { runStubResearch } from "./stub-responder";
import type { PlaceResult } from "./types";

type Message = { id: string; role: "user" | "status"; text: string };

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

/** The stub's lines as panel items: the person's text as a prompt, every
 * progress or result line as an answer block. */
function toItems(messages: Message[]): ChatItem[] {
  return messages.map((m): ChatItem =>
    m.role === "user"
      ? { id: m.id, kind: "user", text: m.text }
      : { id: m.id, kind: "assistant", text: m.text, tools: [] }
  );
}

/**
 * Docked column from the md breakpoint; below it a bottom sheet with a drag
 * handle that stays invisible (not focusable, not in the accessibility
 * tree) until opened.
 */
export function ChatPanel({
  onPlaceFound,
}: {
  onPlaceFound: (place: PlaceResult) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(query: string) {
    if (busy) return;
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
        aria-label="Assistant"
        className={`fixed inset-x-0 bottom-0 z-40 flex h-[65dvh] flex-col rounded-t-2xl border-t border-hairline bg-surface shadow-lg transition-transform md:static md:z-auto md:h-auto md:w-80 md:flex-shrink-0 md:translate-y-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none md:visible ${
          open ? "translate-y-0" : "max-md:invisible max-md:translate-y-full"
        }`}
      >
        <div
          data-testid="chat-handle"
          aria-hidden="true"
          className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-muted/60 md:hidden"
        />
        <ChatView
          items={toItems(messages)}
          running={busy}
          // The stub reports no tool in flight and no run errors; the agent wiring fills both.
          activeTool={null}
          error={null}
          onSend={send}
          onClose={() => setOpen(false)}
          inputRef={inputRef}
        />
      </aside>
    </>
  );
}
