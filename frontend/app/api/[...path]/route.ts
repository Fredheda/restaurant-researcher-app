/**
 * Proxies `/api/*` to the internal api app at `API_URL` (a runtime variable,
 * so one image works in every environment; `next.config` rewrites would be
 * baked in at build time). The response body is streamed through unchanged,
 * which keeps the events stream live. `app/api/copilotkit/route.ts` is more
 * specific and wins over this catch-all.
 */
import { forwardPrincipalHeaders } from "../principal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const PASS_REQUEST = ["content-type", "accept"];
const PASS_RESPONSE = ["content-type"];

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

async function proxy(request: Request, { params }: Context): Promise<Response> {
  const base = process.env.API_URL;
  if (!base) return json(503, { error: "search unavailable" });

  const { path } = await params;
  // Each segment is one decoded path part; refusing dots and slashes keeps
  // the target inside /api on the backend.
  if (path.some((s) => !s || s === "." || s === ".." || s.includes("/"))) {
    return json(404, { error: "not found" });
  }
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, base);
  target.search = new URL(request.url).search;

  const headers = forwardPrincipalHeaders(request.headers);
  for (const name of PASS_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return json(502, { error: "search unavailable" });
  }

  const out = new Headers();
  for (const name of PASS_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (out.get("content-type")?.startsWith("text/event-stream")) {
    out.set("cache-control", "no-cache, no-transform");
    out.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
