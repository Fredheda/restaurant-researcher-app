// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

function incoming(path: string, init: RequestInit = {}): Request {
  return new Request(`http://web.test/api/${path}`, init);
}

describe("API proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api.internal");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards method, body, content-type and the Easy Auth headers, nothing else", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await POST(
      incoming("searches", {
        method: "POST",
        body: JSON.stringify({ query: "ramen" }),
        headers: {
          "content-type": "application/json",
          "x-ms-client-principal-id": "oid-1",
          "x-ms-client-principal-name": "someone",
          "x-ms-client-principal-idp": "aad",
          cookie: "AppServiceAuthSession=secret",
          authorization: "Bearer secret",
        },
      }),
      ctx("searches")
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.internal/api/searches");
    expect(init.method).toBe("POST");
    expect(await new Response(init.body).text()).toBe('{"query":"ramen"}');
    const sent = new Headers(init.headers);
    expect(Object.fromEntries(sent)).toEqual({
      "content-type": "application/json",
      "x-ms-client-principal-id": "oid-1",
      "x-ms-client-principal-name": "someone",
      "x-ms-client-principal-idp": "aad",
    });
  });

  it("keeps the query string and passes status and body through", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":"not found"}', {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
    const res = await GET(incoming("searches/s1?x=1"), ctx("searches", "s1"));
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.internal/api/searches/s1?x=1");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("streams an event stream without buffering", async () => {
    let push!: (s: string) => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (s) => controller.enqueue(new TextEncoder().encode(s));
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { headers: { "content-type": "text/event-stream" } })
    );
    const res = await GET(incoming("searches/s1/events"), ctx("searches", "s1", "events"));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    const reader = res.body!.getReader();
    push(": keep-alive\n\n");
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe(": keep-alive\n\n");
    await reader.cancel();
  });

  it("answers 502 when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: connect ECONNREFUSED"));
    const res = await GET(incoming("searches/s1"), ctx("searches", "s1"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "search unavailable" });
  });

  it.each([[".."], ["."], ["a/b"], [""]])("refuses the path segment %j", async (segment) => {
    const res = await GET(incoming("x"), ctx("searches", segment));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when API_URL is not set", async () => {
    vi.stubEnv("API_URL", "");
    const res = await GET(incoming("searches/s1"), ctx("searches", "s1"));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
