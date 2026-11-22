// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { sanitizeEventStream } from "./sanitize-stream";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function source(chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let next = 0;
  return new ReadableStream({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
      else controller.close();
    },
    cancel: onCancel,
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += decoder.decode(value, { stream: true });
  }
}

const event = (body: object) => `data: ${JSON.stringify(body)}\n\n`;
const fixed = (code: string) =>
  event({ type: "RUN_ERROR", message: "The assistant is unavailable.", code });
const leaky = event({
  type: "RUN_ERROR",
  message: "HTTP 500: MARKER-SECRET agent-host.internal",
  code: "INCOMPLETE_STREAM",
  rawEvent: { detail: "MARKER-SECRET" },
  timestamp: 1,
});

describe("sanitizeEventStream", () => {
  it("passes ordinary events, comments and multi-line data through byte for byte", async () => {
    const text = [
      event({ type: "RUN_STARTED", threadId: "t", runId: "r" }),
      ": keep-alive\n\n",
      'event: x\r\ndata: {"type":"TEXT_MESSAGE_CONTENT",\r\ndata: "delta":"hi"}\r\n\r\n',
      event({ type: "RUN_FINISHED", threadId: "t", runId: "r" }),
    ].join("");

    expect(await drain(sanitizeEventStream(source([text])))).toBe(text);
    expect(await drain(sanitizeEventStream(source([...text])))).toBe(text);
  });

  it("replaces a RUN_ERROR with the fixed event, whatever the chunking or line ends", async () => {
    expect(await drain(sanitizeEventStream(source([leaky])))).toBe(fixed("INCOMPLETE_STREAM"));
    expect(await drain(sanitizeEventStream(source([...leaky])))).toBe(fixed("INCOMPLETE_STREAM"));
    expect(await drain(sanitizeEventStream(source([leaky.replace(/\n/g, "\r\n")])))).toBe(
      fixed("INCOMPLETE_STREAM"),
    );
    const multiLine = 'data: {"type":"RUN_ERROR",\ndata: "message":"MARKER-SECRET","code":"X_Y"}\n\n';
    expect(await drain(sanitizeEventStream(source([multiLine])))).toBe(fixed("X_Y"));
  });

  it("rewrites an unterminated final RUN_ERROR when the stream ends", async () => {
    expect(await drain(sanitizeEventStream(source([leaky.trimEnd()])))).toBe(fixed("INCOMPLETE_STREAM"));
  });

  it.each([["bad code MARKER-SECRET"], ["a".repeat(10)], ["A".repeat(41)], [undefined], [42]])(
    "replaces the code %j with AGENT_ERROR",
    async (code) => {
      const text = event({ type: "RUN_ERROR", message: "MARKER-SECRET", code });

      expect(await drain(sanitizeEventStream(source([text])))).toBe(fixed("AGENT_ERROR"));
    },
  );

  it("fails closed on a data payload that is not JSON: fixed event, stream ends, upstream cancelled", async () => {
    const cancelled = vi.fn();
    const out = await drain(
      sanitizeEventStream(
        source(["data: not json MARKER-SECRET\n\n", event({ type: "RUN_STARTED" })], cancelled),
      ),
    );

    expect(out).toBe(fixed("AGENT_ERROR"));
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
  });

  it("fails closed on an event over 1 MB that never ends", async () => {
    const cancelled = vi.fn();
    const huge = `data: ${"x".repeat(1_100_000)}`;
    const out = await drain(
      sanitizeEventStream(
        source([huge.slice(0, 600_000), huge.slice(600_000), event({ type: "RUN_STARTED" })], cancelled),
      ),
    );

    expect(out).toBe(fixed("AGENT_ERROR"));
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
  });

  it("writes each complete event at once, before the upstream ends", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const live = new ReadableStream<Uint8Array>({ start: (controller) => void (upstream = controller) });
    const reader = sanitizeEventStream(live).getReader();

    upstream.enqueue(encoder.encode(event({ type: "RUN_STARTED" })));
    const first = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
    ]);

    expect(first).not.toBe("timeout");
    expect(decoder.decode((first as ReadableStreamReadResult<Uint8Array>).value)).toBe(
      event({ type: "RUN_STARTED" }),
    );
    upstream.close();
  });
});
