/**
 * Proxies `/api/*` to the internal api app at `API_URL`, a runtime variable
 * so one image works in every environment (a `next.config` rewrite would be
 * baked in at build time).
 *
 * This is a narrow forwarder, not an open proxy:
 * - the target is always `<API_URL origin>/api/<segments>`; each segment is
 *   checked against a small character set, so no dot segment, slash,
 *   backslash, `@` or percent escape can steer it elsewhere;
 * - only GET and POST are exported (everything else gets 405);
 * - upstream is never followed through a redirect;
 * - requests without a usable Easy Auth principal are refused (a local run
 *   with `ALLOW_ANONYMOUS` sends none), and only the principal headers,
 *   `content-type` and `accept` are sent on;
 * - a POST must be same-origin (when the browser says where it comes from)
 *   and JSON, and its body is counted in bytes while it is read;
 * - of the upstream headers only `content-type` comes back, with `nosniff`,
 *   `no-store` (answers are per person) or, for an event stream, the headers
 *   that keep it unbuffered;
 * - failures answer with fixed text, never an exception message.
 *
 * A more specific route under `app/api/` wins over this catch-all.
 */
import { fail, readBody, rejectUnlessSameOriginJson, upstreamOrigin } from "../guards";
import { principalHeaders } from "../principal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const PASS_REQUEST = ["content-type", "accept"];
// Time to the first response header, not to the end of a stream. Covers a
// scale-to-zero cold start of the api app.
const HEADER_TIMEOUT_MS = 60_000;
const SEGMENT = /^[A-Za-z0-9._~-]+$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

class HeaderTimeout extends Error {}

/** Anonymous requests pass only for a local run: the flag is set and the
 * api is on this machine. A deployed api is never loopback, so the flag
 * cannot open the proxy there. */
function anonymousAllowed(base: URL): boolean {
  return process.env.ALLOW_ANONYMOUS === "true" && LOOPBACK.has(base.hostname);
}

function safeSegments(path: string[]): boolean {
  return path.length > 0 && path.every((s) => s !== "." && s !== ".." && SEGMENT.test(s));
}

async function send(url: string, init: RequestInit, outer: AbortSignal): Promise<Response> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), HEADER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: AbortSignal.any([outer, timeout.signal]) });
  } catch (error) {
    throw timeout.signal.aborted ? new HeaderTimeout() : error;
  } finally {
    clearTimeout(timer);
  }
}

async function proxy(request: Request, { params }: Context): Promise<Response> {
  const base = upstreamOrigin("API_URL");
  if (!base) return fail(503, "service unavailable");

  const { path } = await params;
  if (!safeSegments(path)) return fail(404, "not found");
  // `API_URL` contributes its origin only; a path in it is ignored.
  const target = new URL(`/api/${path.join("/")}`, base);
  // Second guard behind the segment check; it cannot fail today.
  if (target.origin !== base.origin || !target.pathname.startsWith("/api/")) {
    return fail(404, "not found");
  }
  target.search = new URL(request.url).search;

  const principal = principalHeaders(request.headers);
  if (!principal && !anonymousAllowed(base)) return fail(401, "sign-in required");

  const headers = principal ?? new Headers();
  for (const name of PASS_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const isGet = request.method === "GET";
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (!isGet) {
    const rejected = rejectUnlessSameOriginJson(request);
    if (rejected) return rejected;
    const bytes = await readBody(request);
    if (!bytes) return fail(413, "request too large");
    body = bytes;
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  };

  // One retry for a GET: the first request may only have woken a scaled-to-zero
  // api app. A POST is never repeated (it could run twice).
  let upstream: Response | undefined;
  for (let attempt = 0; attempt < (isGet ? 2 : 1) && !upstream; attempt++) {
    try {
      upstream = await send(target.toString(), init, request.signal);
    } catch (error) {
      // No second try when the browser left or the api already took 60 s.
      if (request.signal.aborted || error instanceof HeaderTimeout) break;
    }
  }
  if (!upstream || (upstream.status >= 300 && upstream.status < 400)) {
    return fail(502, "service unavailable");
  }

  const out = new Headers({ "x-content-type-options": "nosniff" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) out.set("content-type", contentType);
  if (contentType?.startsWith("text/event-stream")) {
    out.set("cache-control", "no-cache, no-transform");
    out.set("x-accel-buffering", "no");
  } else {
    out.set("cache-control", "no-store");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
