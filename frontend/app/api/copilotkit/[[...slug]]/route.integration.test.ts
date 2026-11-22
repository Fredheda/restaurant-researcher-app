// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

let agent: Server;
let agentOrigin: string;
let refusedOrigin: string;
let counter = 0;

beforeAll(async () => {
  agent = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const input = JSON.parse(body);
      const question: string = input.messages.at(-1).content;
      if (question === "http500") {
        res.writeHead(500, { "content-type": "text/plain" }).end("MARKER-SECRET agent-host.internal");
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const started = { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId };
      const events =
        question === "run-error"
          ? [started, { type: "RUN_ERROR", message: "MARKER-SECRET from the agent", code: "AGENT_FAILED" }]
          : [
              started,
              { type: "TEXT_MESSAGE_START", messageId: "a", role: "assistant" },
              { type: "TEXT_MESSAGE_CONTENT", messageId: "a", delta: "fine" },
              { type: "TEXT_MESSAGE_END", messageId: "a" },
              { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
            ];
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((resolve) => agent.listen(0, "127.0.0.1", resolve));
  agentOrigin = `http://127.0.0.1:${(agent.address() as AddressInfo).port}`;

  const unused = createServer();
  await new Promise<void>((resolve) => unused.listen(0, "127.0.0.1", resolve));
  refusedOrigin = `http://127.0.0.1:${(unused.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => unused.close(() => resolve()));
});

afterAll(() => new Promise<void>((resolve) => agent.close(() => resolve())));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function ask(origin: string, question: string): Promise<string> {
  vi.stubEnv("AGENT_URL", origin);
  counter += 1;
  const response = await POST(
    new Request("http://web.test/api/copilotkit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-ms-client-principal-id": "oid-int",
      },
      body: JSON.stringify({
        method: "agent/run",
        params: { agentId: "restaurant_researcher" },
        body: {
          threadId: `thread-int-${counter}`,
          runId: `run-int-${counter}`,
          messages: [{ id: `m-${counter}`, role: "user", content: question }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      }),
    }),
    { params: Promise.resolve({}) },
  );
  return response.text();
}

describe("CopilotKit route against a real runtime", () => {
  it("passes a normal answer through", async () => {
    expect(await ask(agentOrigin, "hello")).toContain("fine");
  });

  it("does not show the agent's error body when the agent answers 500", async () => {
    const text = await ask(agentOrigin, "http500");

    expect(text).toContain("The assistant is unavailable.");
    expect(text).not.toContain("MARKER-SECRET");
    expect(text).not.toContain("agent-host.internal");
  });

  it("does not show the agent's host or port when the connection is refused", async () => {
    const text = await ask(refusedOrigin, "hello");

    expect(text).toContain("The assistant is unavailable.");
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain(new URL(refusedOrigin).port);
  });

  it("does not show the text of an error event the agent sends itself", async () => {
    const text = await ask(agentOrigin, "run-error");

    expect(text).toContain("AGENT_FAILED");
    expect(text).not.toContain("MARKER-SECRET");
  });
});
