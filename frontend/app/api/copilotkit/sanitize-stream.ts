const FIXED_MESSAGE = "The assistant is unavailable.";
const FALLBACK_CODE = "AGENT_ERROR";
const CODE_PATTERN = /^[A-Z_]{1,40}$/;
const MAX_EVENT_CHARS = 1_000_000;
const BOUNDARY = /\r\n\r\n|\n\n|\r\r/;
const LINE_END = /\r\n|\r|\n/;

function runError(code: unknown): string {
  const safe = typeof code === "string" && CODE_PATTERN.test(code) ? code : FALLBACK_CODE;
  return `data: ${JSON.stringify({ type: "RUN_ERROR", message: FIXED_MESSAGE, code: safe })}\n\n`;
}

function dataOf(event: string): string | null {
  const parts: string[] = [];
  for (const line of event.split(LINE_END)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5);
    parts.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  return parts.length ? parts.join("\n") : null;
}

function render(event: string): { text: string; fatal: boolean } {
  if (event.length > MAX_EVENT_CHARS) return { text: runError(undefined), fatal: true };
  const data = dataOf(event);
  if (data === null) return { text: event, fatal: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { text: runError(undefined), fatal: true };
  }
  if ((parsed as { type?: unknown } | null)?.type === "RUN_ERROR") {
    return { text: runError((parsed as { code?: unknown }).code), fatal: false };
  }
  return { text: event, fatal: false };
}

export function sanitizeEventStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let failed = false;

  function emit(controller: TransformStreamDefaultController<Uint8Array>, event: string): boolean {
    const { text, fatal } = render(event);
    controller.enqueue(encoder.encode(text));
    if (fatal) {
      failed = true;
      controller.terminate();
    }
    return !fatal;
  }

  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (failed) return;
        buffer += decoder.decode(chunk, { stream: true });
        for (;;) {
          const match = BOUNDARY.exec(buffer);
          if (!match) break;
          const end = match.index + match[0].length;
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end);
          if (!emit(controller, event)) return;
        }
        if (buffer.length > MAX_EVENT_CHARS) emit(controller, buffer);
      },
      flush(controller) {
        if (failed) return;
        buffer += decoder.decode();
        if (buffer.length > 0) emit(controller, buffer);
      },
    }),
  );
}
