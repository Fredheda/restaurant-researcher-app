import { expect, test } from "@playwright/test";

const agentPort = process.env.E2E_AGENT_PORT ?? "3919";
const endpoint = "/api/copilotkit";

const envelope = (method: string, body?: unknown) => ({
  method,
  params: { agentId: "restaurant_researcher" },
  body,
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

test("a signed-in run reaches the agent with the principal headers only", async ({ request }) => {
  const id = "e2e-run";
  const response = await request.post(endpoint, {
    headers: {
      "x-ms-client-principal-id": id,
      "x-ms-client-principal-name": "E2E User",
      accept: "text/event-stream",
      authorization: "Bearer planted",
      cookie: "AppServiceAuthSession=planted",
      "x-foo": "planted",
    },
    data: envelope("agent/run", runInput("t-run", "hello")),
  });

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("You asked: hello");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();

  const rows = await (await request.get(`http://127.0.0.1:${agentPort}/_seen?user=${id}`)).json();
  expect(rows).toHaveLength(1);
  const sensitive = Object.keys(rows[0])
    .filter((name) => name.startsWith("x-") || name === "authorization" || name === "cookie")
    .sort();
  expect(sensitive).toEqual(["x-ms-client-principal-id", "x-ms-client-principal-name"]);
});

test("a request without a principal is refused", async ({ request }) => {
  const response = await request.post(endpoint, {
    headers: { "x-ms-client-principal-id": "" },
    data: envelope("info"),
  });

  expect(response.status()).toBe(401);
});

test("a cross-site request is refused", async ({ request }) => {
  const response = await request.post(endpoint, {
    headers: { "sec-fetch-site": "cross-site" },
    data: envelope("info"),
  });

  expect(response.status()).toBe(403);
});

test("a runtime method the chat does not need is not reachable", async ({ request }) => {
  const response = await request.post(endpoint, { data: envelope("inspector/metadata") });

  expect(response.status()).toBe(404);
});

test("only POST is served and a preflight is not granted", async ({ request }) => {
  expect((await request.get(endpoint)).status()).toBe(405);

  const preflight = await request.fetch(endpoint, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
  });

  expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();
});

test("an agent failure shows fixed text, not the agent's answer", async ({ request }) => {
  const response = await request.post(endpoint, {
    headers: { "x-ms-client-principal-id": "e2e-fail", accept: "text/event-stream" },
    data: envelope("agent/run", runInput("t-fail", "please fail")),
  });

  const text = await response.text();
  expect(text).toContain("The assistant is unavailable.");
  expect(text).not.toContain("boom");
});
