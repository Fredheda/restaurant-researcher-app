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
 * - requests without a usable Easy Auth principal are refused, and only the
 *   principal headers, `content-type` and `accept` are sent on;
 * - a POST must be same-origin (when the browser says where it comes from)
 *   and JSON, and its body is counted in bytes while it is read;
 * - only `content-type` comes back, with `nosniff` and, for anything but an
 *   event stream, `no-store` (answers are per person);
 * - failures answer with fixed text, never an exception message.
 *
 * `app/api/copilotkit/route.ts` (a later change) is more specific and wins
 * over this catch-all.
 */
import { principalHeaders } from "../principal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const PASS_REQUEST = ["content-type", "accept"];
const MAX_BODY_BYTES = 1_000_000;
// Time to the first response header, not to the end of a stream. Covers a
// scale-to-zero cold start of the api app.
const HEADER_TIMEOUT_MS = 60_000;
const SEGMENT = /^[A-Za-z0-9._~-]+$/;
const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

class HeaderTimeout extends Error {}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

function upstreamBase(): URL | null {
  try {
    const base = new URL(process.env.API_URL ?? "");
    return base.protocol === "http:" || base.protocol === "https:" ? base : null;
  } catch {
    return null;
  }
}

/** Anonymous requests pass only for a local run: the flag is set and the
 * api is on this machine. A deployed api is never loopback, so the flag
 * cannot open the proxy there. */
function anonymousAllowed(base: URL): boolean {
  return process.env.ALLOW_ANONYMOUS === "true" && LOOPBACK.has(base.hostname);
}

function safeSegments(path: string[]): boolean {
  return path.length > 0 && path.every((s) => s !== "." && s !== ".." && SEGMENT.test(s));
}

/** The request body as bytes, or null once it passes the cap. Counted in
 * bytes as it arrives, so a multi-byte or chunked body cannot slip past and an
 * endless one is cancelled instead of buffered. */
async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
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
  const base = upstreamBase();
  if (!base) return fail(503, "service unavailable");

  const { path } = await params;
  if (!safeSegments(path)) return fail(404, "not found");
  const target = new URL(`/api/${path.join("/")}`, base);
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
    // A cross-site form post carries the Easy Auth cookie, and this route drops
    // `origin`, so the api could not tell. Browsers send `sec-fetch-site`;
    // a form cannot send JSON without a preflight, which this route never grants.
    const site = request.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return fail(403, "forbidden");
    const type = (request.headers.get("content-type") ?? "").trim().toLowerCase();
    if (!type.startsWith("application/json")) return fail(415, "unsupported media type");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return fail(413, "request too large");
    }
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
