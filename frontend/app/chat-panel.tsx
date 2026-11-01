"use client";

import { useEffect, useRef, useState } from "react";
import { UseAgentUpdate, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { AGENT_ID } from "./agent-id";
import { activeToolLine, toChatItems, type AgentMessage } from "./chat-model";
import { ChatView } from "./chat-view";

const RUN_ERROR = "The assistant hit an error. Try again.";

/**
 * The assistant panel, driven by the CopilotKit agent. Docked column from
 * the md breakpoint; below it a bottom sheet with a drag handle that stays
 * invisible (not focusable, not in the accessibility tree) until opened.
 */
export function ChatPanel() {
  // Until the runtime connects, useAgent hands out a provisional agent that
  // is swapped for the real one; a message sent to it would vanish from the
  // panel, so input waits for isReady.
  const { agent, isReady } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open, and again once a disabled (connecting) input comes alive.
  useEffect(() => {
    if (open && isReady) inputRef.current?.focus();
  }, [open, isReady]);

  // A RUN_ERROR from the agent ends the run without throwing in every
  // client version, so listen for it as well as catching.
  useEffect(() => {
    const sub = agent.subscribe({ onRunErrorEvent: () => setError(RUN_ERROR) });
    return () => sub.unsubscribe();
  }, [agent]);

  async function send(text: string) {
    setError(null);
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    try {
      await copilotkit.runAgent({ agent });
    } catch {
      setError(RUN_ERROR);
    }
  }

  const messages = agent.messages as AgentMessage[];

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
          items={toChatItems(messages)}
          ready={isReady}
          running={agent.isRunning}
          activeTool={activeToolLine(messages)}
          error={error}
          onSend={send}
          onClose={() => setOpen(false)}
          inputRef={inputRef}
        />
      </aside>
    </>
  );
}
