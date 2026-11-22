// @vitest-environment node
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_ID } from "../../agent";
import { PRINCIPAL_HEADER_NAMES } from "../principal";
import { createRuntimeHandler } from "./runtime";

type Handler = (request: Request) => Promise<Response>;
type Seen = { headers: IncomingHttpHeaders; threadId: string };

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const seen: Seen[] = [];
let server: Server;
let origin: URL;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      const input = JSON.parse(body);
      seen.push({ headers: req.headers, threadId: input.threadId });
      if (input.messages.at(-1)?.content === "slow") await new Promise((r) => setTimeout(r, 300));
      res.writeHead(200, { "content-type": "text/event-stream" });
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "TEXT_MESSAGE_START", messageId: `${input.runId}-a`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `${input.runId}-a`, delta: "ok" },
        { type: "TEXT_MESSAGE_END", messageId: `${input.runId}-a` },
        { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
      ];
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  seen.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const runInput = (thread: string, text: string) => ({
  threadId: thread,
  runId: `run-${thread}`,
  messages: [{ id: `m-${thread}`, role: "user", content: text }],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
});

function call(
  handler: Handler,
  principal: string,
  method: string,
  params: Record<string, string>,
  body: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new Request("http://web.test/api/copilotkit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-ms-client-principal-id": principal,
        ...extra,
      },
      body: JSON.stringify({ method, params: { agentId: AGENT_ID, ...params }, body }),
    }),
  );
}

function run(
  handler: Handler,
  principal: string,
  thread: string,
  text: string,
  extra: Record<string, string> = {},
): Promise<Response> {
  return call(handler, principal, "agent/run", {}, runInput(thread, text), extra);
}

describe("CopilotKit runtime wrapper", () => {
  it("forwards only the principal headers to the agent, whatever the caller sends", async () => {
    const handler = createRuntimeHandler(origin);
    const response = await run(handler, "alice", "thread-alice", "hello", {
      "x-ms-client-principal-name": "Alice",
      "x-ms-client-principal-idp": "aad",
      "x-ms-client-principal": "e30=",
      authorization: "Bearer planted",
      cookie: "AppServiceAuthSession=planted",
      "x-foo": "planted",
      "x-forwarded-for": "203.0.113.9",
    });
    await response.text();

    expect(seen).toHaveLength(1);
    const sensitive = Object.keys(seen[0].headers)
      .filter((name) => name.startsWith("x-") || name === "authorization" || name === "cookie")
      .sort();
    expect(sensitive).toEqual([...PRINCIPAL_HEADER_NAMES].sort());
  });

  it("gives each of twenty runs started in the same tick its own principal", async () => {
    const handler = createRuntimeHandler(origin);
    const users = Array.from({ length: 20 }, (_, i) => `user-${i}`);

    await Promise.all(users.map((user) => run(handler, user, `thread-${user}`, "slow").then((r) => r.text())));

    const principalByThread = Object.fromEntries(
      seen.map((row) => [row.threadId, row.headers["x-ms-client-principal-id"]]),
    );
    expect(seen).toHaveLength(20);
    expect(principalByThread).toEqual(Object.fromEntries(users.map((user) => [`thread-${user}`, user])));
  });

  it("refuses a second principal on a thread the first one created", async () => {
    const handler = createRuntimeHandler(origin);
    const first = await run(handler, "erin", "thread-erin", "hello");
    expect(first.status).toBe(200);
    await first.text();

    const hijack = await run(handler, "frank", "thread-erin", "hijack");

    expect(hijack.status).toBe(404);
    expect(seen).toHaveLength(1);
  });

  it("does not let a second principal stop another principal's run", async () => {
    const handler = createRuntimeHandler(origin);
    const erinRun = run(handler, "erin", "thread-stop", "slow").then((r) => r.text());
    await new Promise((r) => setTimeout(r, 100));

    const stop = await call(handler, "frank", "agent/stop", { threadId: "thread-stop" }, {});

    expect(await stop.json()).toMatchObject({ stopped: false });
    const finished = await erinRun;
    expect(finished).toContain("RUN_FINISHED");
    expect(finished).not.toContain("STOPPED");
  });

  it("does not let a second principal read another principal's thread", async () => {
    const handler = createRuntimeHandler(origin);
    await (await run(handler, "gus", "thread-read", "hello")).text();

    const foreign = await call(handler, "hana", "agent/connect", {}, runInput("thread-read", ""));
    const own = await call(handler, "gus", "agent/connect", {}, runInput("thread-read", ""));

    expect(await foreign.text()).toBe("");
    expect(await own.text()).toContain("RUN_STARTED");
  });

  it("sends nothing to a non-loopback host during a turn", async () => {
    const hosts: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (LOOPBACK.has(url.hostname)) return realFetch(input, init);
      hosts.push(url.hostname);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const realConnect = net.Socket.prototype.connect;
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (
      this: net.Socket,
      ...args: unknown[]
    ) {
      const first = args[0];
      const host =
        typeof first === "object" && first !== null
          ? ((first as { host?: string }).host ?? "localhost")
          : typeof args[1] === "string"
            ? args[1]
            : "localhost";
      if (!LOOPBACK.has(host)) {
        hosts.push(host);
        return this.destroy(new Error("blocked"));
      }
      return realConnect.apply(this, args as Parameters<typeof realConnect>);
    });

    vi.resetModules();
    delete process.env.COPILOTKIT_TELEMETRY_DISABLED;
    const fresh = await import("./runtime");
    const response = await run(fresh.createRuntimeHandler(origin), "gina", "thread-gina", "hello");
    await response.text();
    await new Promise((r) => setTimeout(r, 200));

    expect(hosts).toEqual([]);
  });
});
