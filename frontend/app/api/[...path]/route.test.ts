// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const { GET, POST } = route;

const PRINCIPAL = {
  "x-ms-client-principal-id": "oid-1",
  "x-ms-client-principal-name": "someone@example.com",
  "x-ms-client-principal-idp": "aad",
};

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

function incoming(path: string, init: RequestInit = {}): Request {
  return new Request(`http://web.test/api/${path}`, init);
}

function signedIn(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PRINCIPAL)) headers.set(name, value);
  return incoming(path, { ...init, headers });
}

/** A same-origin JSON POST, the one shape the proxy accepts. */
function post(path: string, body: BodyInit | null = "{}", headers: Record<string, string> = {}): Request {
  return signedIn(path, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
  });
}

describe("API proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("API_URL", "http://api.internal:8000");
    vi.stubEnv("ALLOW_ANONYMOUS", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("headers", () => {
    it("sends on method, body, content-type, accept and the three principal headers, nothing else", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      await POST(
        post("searches", JSON.stringify({ query: "ramen" }), {
          accept: "application/json",
          cookie: "AppServiceAuthSession=secret",
          authorization: "Bearer secret",
          "x-ms-client-principal": "eyJjbGFpbXMiOltdfQ==",
          "x-ms-token-aad-access-token": "secret-token",
          "x-ms-token-aad-id-token": "secret-token",
          "x-forwarded-for": "203.0.113.9",
          "x-api-key": "secret",
        }),
        ctx("searches")
      );
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://api.internal:8000/api/searches");
      expect(init.method).toBe("POST");
      expect(new TextDecoder().decode(init.body)).toBe('{"query":"ramen"}');
      expect(Object.fromEntries(new Headers(init.headers))).toEqual({
        "content-type": "application/json",
        accept: "application/json",
        ...PRINCIPAL,
      });
    });

    it("sends back only the content type of the upstream answer, marked no-store and nosniff", async () => {
      fetchMock.mockResolvedValue(
        new Response('{"ok":true}', {
          status: 201,
          headers: {
            "content-type": "application/json",
            "set-cookie": "session=abc",
            server: "uvicorn",
            "x-internal-trace": "10.0.0.4",
          },
        })
      );
      const res = await POST(post("searches"), ctx("searches"));
      expect(res.status).toBe(201);
      expect(Object.fromEntries(res.headers)).toEqual({
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
    });
  });

  describe("sign-in", () => {
    it("refuses a request without a usable principal id and calls nothing", async () => {
      for (const id of [undefined, "", "a b", "x".repeat(65)]) {
        const headers: Record<string, string> = id === undefined ? {} : { "x-ms-client-principal-id": id };
        const res = await GET(incoming("searches/s1", { headers }), ctx("searches", "s1"));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "sign-in required" });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("lets an anonymous request through only for a local api with the flag set", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubEnv("ALLOW_ANONYMOUS", "true");
      vi.stubEnv("API_URL", "http://127.0.0.1:8000");
      const res = await GET(incoming("searches/s1"), ctx("searches", "s1"));
      expect(res.status).toBe(200);
      expect(Object.fromEntries(new Headers(fetchMock.mock.calls[0][1].headers))).toEqual({});
    });

    it("keeps refusing anonymous requests when the api is not local, flag or not", async () => {
      vi.stubEnv("ALLOW_ANONYMOUS", "true");
      for (const api of ["http://api.internal:8000", "https://ca-restaurant-api.internal.example.io", "http://localhost.evil.test"]) {
        vi.stubEnv("API_URL", api);
        const res = await GET(incoming("searches/s1"), ctx("searches", "s1"));
        expect(res.status).toBe(401);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps refusing anonymous requests on a local api without the exact flag", async () => {
      vi.stubEnv("API_URL", "http://127.0.0.1:8000");
      for (const flag of ["", "1", "TRUE", "yes"]) {
        vi.stubEnv("ALLOW_ANONYMOUS", flag);
        const res = await GET(incoming("searches/s1"), ctx("searches", "s1"));
        expect(res.status).toBe(401);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("target", () => {
    it.each([[".."], ["."], ["a/b"], [""], ["%2e%2e"], ["a%2fb"], ["a\\b"], ["@evil.test"], ["x y"], ["a:b"]])(
      "refuses the path segment %j",
      async (segment) => {
        const res = await GET(signedIn("x"), ctx("searches", segment));
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("refuses an empty path", async () => {
      const res = await GET(signedIn("x"), ctx());
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps every request on the api origin under /api/", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      await GET(signedIn("searches/s-1.v2_a~b/events?since=3"), ctx("searches", "s-1.v2_a~b", "events"));
      expect(fetchMock.mock.calls[0][0]).toBe("http://api.internal:8000/api/searches/s-1.v2_a~b/events?since=3");
    });

    it.each([[""], ["not a url"], ["file:///etc/passwd"], ["javascript:alert(1)"]])(
      "answers 503 and calls nothing when API_URL is %j",
      async (value) => {
        vi.stubEnv("API_URL", value);
        const res = await GET(signedIn("searches/s1"), ctx("searches", "s1"));
        expect(res.status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("exports GET and POST only", () => {
      const methods = Object.keys(route).filter((key) => /^[A-Z]+$/.test(key));
      expect(methods.sort()).toEqual(["GET", "POST"]);
    });

    it("never follows an upstream redirect", async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://evil.test/" } }));
      const res = await GET(signedIn("searches/s1"), ctx("searches", "s1"));
      expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
      expect(res.status).toBe(502);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("post checks", () => {
    it.each([["cross-site"], ["same-site"], ["none"]])(
      "refuses a POST whose sec-fetch-site is %j, before any upstream call",
      async (site) => {
        const res = await POST(post("searches", "{}", { "sec-fetch-site": site }), ctx("searches"));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "forbidden" });
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it("accepts a same-origin POST, and one that carries no sec-fetch-site at all", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      expect((await POST(post("searches"), ctx("searches"))).status).toBe(200);
      const bare = signedIn("searches", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });
      expect((await POST(bare, ctx("searches"))).status).toBe(200);
    });

    it.each([
      ["application/x-www-form-urlencoded"],
      ["text/plain"],
      ["multipart/form-data; boundary=x"],
      [""],
    ])("refuses a POST with content type %j, before any upstream call", async (type) => {
      const headers: Record<string, string> = { "sec-fetch-site": "same-origin" };
      if (type) headers["content-type"] = type;
      const res = await POST(signedIn("searches", { method: "POST", body: "a=b", headers }), ctx("searches"));
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "unsupported media type" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts application/json with a charset", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const res = await POST(post("searches", "{}", { "content-type": "Application/JSON; charset=utf-8" }), ctx("searches"));
      expect(res.status).toBe(200);
    });
  });

  describe("body", () => {
    it("refuses a request that declares a body over 1 MB, before reading it", async () => {
      const res = await POST(post("searches", "{}", { "content-length": "1000001" }), ctx("searches"));
      expect(res.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("counts bytes, not characters: 600,000 two-byte characters are over the cap", async () => {
      const res = await POST(post("searches", "é".repeat(600_000)), ctx("searches"));
      expect(res.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends a multi-byte body on unchanged when it is under the cap", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      await POST(post("searches", JSON.stringify({ query: "café ramen 🍜" })), ctx("searches"));
      expect(new TextDecoder().decode(fetchMock.mock.calls[0][1].body)).toBe('{"query":"café ramen 🍜"}');
    });

    it("stops reading a chunked body that never ends, once it passes the cap", async () => {
      let pulled = 0;
      let cancelled = false;
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(100_000));
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = signedIn("searches", {
        method: "POST",
        body: endless,
        duplex: "half",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      } as RequestInit);
      const res = await POST(request, ctx("searches"));
      expect(res.status).toBe(413);
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(50);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("streaming and errors", () => {
    it("streams an event stream without buffering", async () => {
      let push!: (s: string) => void;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (s) => controller.enqueue(new TextEncoder().encode(s));
        },
      });
      fetchMock.mockResolvedValue(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
      const res = await GET(signedIn("searches/s1/events"), ctx("searches", "s1", "events"));
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
      expect(res.headers.get("x-accel-buffering")).toBe("no");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const reader = res.body!.getReader();
      push(": keep-alive\n\n");
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(": keep-alive\n\n");
      await reader.cancel();
    });

    it("passes an upstream error status and body through", async () => {
      fetchMock.mockResolvedValue(
        new Response('{"detail":"not found"}', { status: 404, headers: { "content-type": "application/json" } })
      );
      const res = await GET(signedIn("searches/s1"), ctx("searches", "s1"));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "not found" });
    });

    it("answers 502 with fixed text when the api is unreachable, never the exception message", async () => {
      fetchMock.mockRejectedValue(new TypeError("connect ECONNREFUSED 10.0.0.4:8000 key sk-secret-123"));
      const res = await POST(post("searches"), ctx("searches"));
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const text = await res.text();
      expect(text).toBe('{"error":"service unavailable"}');
      expect(text).not.toContain("10.0.0.4");
      expect(text).not.toContain("sk-secret-123");
    });

    it("never repeats a POST", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await POST(post("searches"), ctx("searches"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("repeats a GET once, so a scaled-to-zero api that only woke up still answers", async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
      const res = await GET(signedIn("searches/s1"), ctx("searches", "s1"));
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up on a GET after the second failure", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      const res = await GET(signedIn("searches/s1"), ctx("searches", "s1"));
      expect(res.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not repeat a GET that already waited 60 s for the first answer", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        fetchMock.mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
            })
        );
        const pending = GET(signedIn("searches/s1"), ctx("searches", "s1"));
        await vi.advanceTimersByTimeAsync(120_000);
        const res = await pending;
        expect(res.status).toBe(502);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops the upstream call when the browser goes away, without a retry", async () => {
      const controller = new AbortController();
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        controller.abort();
        return Promise.reject(init.signal!.reason);
      });
      const res = await GET(
        signedIn("searches/s1/events", { signal: controller.signal }),
        ctx("searches", "s1", "events")
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
      expect(res.status).toBe(502);
    });
  });
});
