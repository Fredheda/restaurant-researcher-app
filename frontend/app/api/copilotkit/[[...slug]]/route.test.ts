// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() => vi.fn());
vi.mock("../runtime", () => ({ createRuntimeHandler: () => handler }));

import * as route from "./route";

const { POST } = route;

const PRINCIPAL = {
  "x-ms-client-principal-id": "oid-1",
  "x-ms-client-principal-name": "someone@example.com",
  "x-ms-client-principal-idp": "aad",
};

const envelope = (method = "info") => JSON.stringify({ method, params: {}, body: {} });

function call(
  init: { headers?: Record<string, string>; body?: BodyInit } = {},
  slug: string[] = [],
): Promise<Response> {
  return POST(
    new Request("http://web.test/api/copilotkit", {
      method: "POST",
      body: init.body ?? envelope(),
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...PRINCIPAL,
        ...init.headers,
      },
    }),
    { params: Promise.resolve({ slug: slug.length ? slug : undefined }) },
  );
}

describe("CopilotKit route", () => {
  beforeEach(() => {
    vi.stubEnv("AGENT_URL", "http://agent.internal:8000");
    vi.stubEnv("ALLOW_ANONYMOUS", "");
    handler.mockReset();
    handler.mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["", "not a url", "ftp://agent.internal"])("answers 503 when AGENT_URL is %j", async (value) => {
    vi.stubEnv("AGENT_URL", value);

    const response = await call();

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 401 without a usable principal id", async () => {
    const response = await call({ headers: { "x-ms-client-principal-id": "" } });

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 401 when ALLOW_ANONYMOUS is set and AGENT_URL is loopback", async () => {
    vi.stubEnv("ALLOW_ANONYMOUS", "true");
    vi.stubEnv("AGENT_URL", "http://127.0.0.1:8000");

    const response = await call({ headers: { "x-ms-client-principal-id": "" } });

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a cross-site request with 403", async () => {
    const response = await call({ headers: { "sec-fetch-site": "cross-site" } });

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON with 415", async () => {
    const response = await call({ headers: { "content-type": "text/plain" } });

    expect(response.status).toBe(415);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a body over 1 MB with 413", async () => {
    const response = await call({ body: JSON.stringify({ method: "info", pad: "x".repeat(1_100_000) }) });

    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not an envelope", async () => {
    expect((await call({ body: "{nope" })).status).toBe(400);
    expect((await call({ body: JSON.stringify({ params: {} }) })).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["inspector/metadata", "inspector/learning", "resource/request", "transcribe", "agent/suggest", "threads/list"])(
    "answers 404 for the runtime method %s",
    async (method) => {
      const response = await call({ body: envelope(method) });

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(["info", "agent/run", "agent/connect", "agent/stop"])("lets %s through", async (method) => {
    const response = await call({ body: envelope(method) });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a sub-path", async () => {
    const response = await call({}, ["info"]);

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the runtime the body, the principal headers, content-type and its own accept only", async () => {
    await call({
      body: envelope("agent/run"),
      headers: {
        accept: "application/json",
        authorization: "Bearer planted",
        cookie: "AppServiceAuthSession=planted",
        "x-foo": "planted",
        "x-ms-client-principal": "e30=",
        "x-ms-token-aad-access-token": "planted",
        "x-forwarded-for": "203.0.113.9",
      },
    });

    const forwarded: Request = handler.mock.calls[0][0];
    expect([...forwarded.headers.keys()].sort()).toEqual(
      ["accept", "content-type", ...Object.keys(PRINCIPAL)].sort(),
    );
    expect(forwarded.headers.get("accept")).toBe("text/event-stream");
    expect(await forwarded.text()).toBe(envelope("agent/run"));
  });

  it("rebuilds the response headers and drops everything else the runtime sets", async () => {
    handler.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-allow-credentials": "true",
          "set-cookie": "a=b",
          "x-powered-by": "runtime",
        },
      }),
    );

    const response = await call();

    expect([...response.headers.keys()].sort()).toEqual([
      "cache-control",
      "content-type",
      "x-content-type-options",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps an event stream unbuffered", async () => {
    handler.mockResolvedValue(
      new Response("data: {}\n\n", { headers: { "content-type": "text/event-stream" } }),
    );

    const response = await call({ body: envelope("agent/run") });

    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it.each([
    [500, "text/plain", "MARKER-SECRET agent-host.internal"],
    [404, "application/json", '{"error":"MARKER-SECRET"}'],
    [400, "text/html", "<p>MARKER-SECRET</p>"],
  ])("sends fixed text for a %i answer of type %s", async (status, type, body) => {
    handler.mockResolvedValue(new Response(body, { status, headers: { "content-type": type } }));

    const response = await call();

    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("MARKER-SECRET");
  });

  it("answers 502 when a successful answer is neither JSON nor an event stream", async () => {
    handler.mockResolvedValue(
      new Response("<html>MARKER-SECRET</html>", { headers: { "content-type": "text/html" } }),
    );

    const response = await call();

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("MARKER-SECRET");
  });

  it("rewrites an error event inside the stream", async () => {
    const leaky = { type: "RUN_ERROR", message: "HTTP 500: MARKER-SECRET", code: "INCOMPLETE_STREAM" };
    handler.mockResolvedValue(
      new Response(`data: ${JSON.stringify(leaky)}\n\n`, { headers: { "content-type": "text/event-stream" } }),
    );

    const text = await (await call({ body: envelope("agent/run") })).text();

    expect(text).not.toContain("MARKER-SECRET");
    expect(text).toContain("The assistant is unavailable.");
  });

  it("answers 502 without the error text when the runtime throws", async () => {
    handler.mockRejectedValue(new Error("secret detail"));

    const response = await call();

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  });

  it("exports POST only", () => {
    const methods = ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"];

    expect(Object.keys(route).filter((name) => methods.includes(name))).toEqual([]);
  });
});
