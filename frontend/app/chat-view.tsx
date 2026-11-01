"use client";

import { useState, type FormEvent, type RefObject } from "react";
import type { ChatItem } from "./chat-model";

export const SUGGESTIONS = [
  "best ramen near Soho",
  "negroni in Shoreditch",
  "cheap eats near Canary Wharf",
];

// Tools the agent can reach in this phase; routes (tfl) arrive in phase 4.
const CONNECTED = "● places · hygiene";

function Prompt() {
  return (
    <span aria-hidden="true" className="text-forest">
      ❯
    </span>
  );
}

/**
 * The assistant panel ("Ink and paper", option C): ink header with the
 * connected tools, a "What can I do?" card when empty, the person's lines
 * as monospace prompts, answers in a green-ruled block led by their tool
 * lines, and a pill input with a round send button.
 */
export function ChatView({
  items,
  running,
  activeTool,
  error,
  onSend,
  onClose,
  inputRef,
  ready = true,
}: {
  items: ChatItem[];
  /** False until the runtime has connected the agent; input waits for it. */
  ready?: boolean;
  running: boolean;
  activeTool: string | null;
  error: string | null;
  onSend: (text: string) => void;
  onClose?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [input, setInput] = useState("");
  const busy = running || !ready;
  const canSend = !busy && input.trim().length > 0;
  const status = !ready ? "● connecting" : running ? "● working" : CONNECTED;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 bg-ink px-4 py-3 text-paper max-md:rounded-t-2xl">
        <span className="font-display text-base font-semibold">Tonight</span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-ink-muted">{status}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-1.5 text-xs text-ink-muted md:hidden"
            >
              Close chat
            </button>
          )}
        </span>
      </div>

      <div
        data-testid="chat-messages"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm text-ink"
      >
        {items.length === 0 && (
          <div className="rounded-xl bg-paper px-3 py-2.5">
            <div className="mb-1 font-semibold">What can I do?</div>
            <p className="text-xs text-muted">
              Find London places by cuisine, area, dish or cocktail. Results land on the board.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Ask: ${s}`}
                  disabled={busy}
                  onClick={() => onSend(s)}
                  className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-xs text-ink disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item) =>
          item.kind === "user" ? (
            <div
              key={item.id}
              data-kind="user"
              className="font-mono text-xs break-words text-muted"
            >
              <Prompt /> <span>{item.text}</span>
            </div>
          ) : (
            <div
              key={item.id}
              data-kind="assistant"
              className="border-l-2 border-forest pl-2.5 break-words"
            >
              {item.tools.map((t, i) => (
                <div key={i} className="mb-1 font-mono text-[10.5px] text-forest">
                  {t}
                </div>
              ))}
              <p className="whitespace-pre-wrap">{item.text}</p>
            </div>
          )
        )}

        {error && (
          <div data-kind="assistant" className="border-l-2 border-warn pl-2.5 text-warn">
            {error}
          </div>
        )}

        {running && (
          <div role="status" className="animate-pulse font-mono text-[10.5px] text-forest">
            {activeTool ?? "thinking…"}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-hairline px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-full border border-hairline bg-surface py-1 pr-1 pl-3 font-mono text-xs">
          <Prompt />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a place…"
            aria-label="Message"
            disabled={!ready}
            maxLength={1000}
            className="min-w-0 flex-1 bg-transparent py-1 text-ink outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-forest text-sm text-surface disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}
