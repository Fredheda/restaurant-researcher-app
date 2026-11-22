import { fail, readBody, rejectUnlessSameOriginJson, upstreamOrigin } from "../../guards";
import { principalHeaders } from "../../principal";
import { createRuntimeHandler, type RuntimeHandler } from "../runtime";
import { sanitizeEventStream } from "../sanitize-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug?: string[] }> };

const ALLOWED_METHODS = new Set(["info", "agent/run", "agent/connect", "agent/stop"]);

let cached: { origin: string; handler: RuntimeHandler } | undefined;

function handlerFor(agent: URL): RuntimeHandler {
  if (cached?.origin !== agent.origin) {
    cached = { origin: agent.origin, handler: createRuntimeHandler(agent) };
  }
  return cached.handler;
}

function envelopeMethod(bytes: Uint8Array): string | null {
  try {
    const envelope: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const method = (envelope as { method?: unknown } | null)?.method;
    return typeof method === "string" ? method : null;
  } catch {
    return null;
  }
}

function clientResponse(upstream: Response): Response {
  const contentType = upstream.headers.get("content-type") ?? "";
  const stream = contentType.startsWith("text/event-stream");
  if (!stream && upstream.status >= 400) return fail(upstream.status, "request failed");
  if (!stream && !contentType.startsWith("application/json")) return fail(502, "service unavailable");

  const out = new Headers({ "x-content-type-options": "nosniff", "content-type": contentType });
  if (!stream) {
    out.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  out.set("cache-control", "no-cache, no-transform");
  out.set("x-accel-buffering", "no");
  const body = upstream.body ? sanitizeEventStream(upstream.body) : null;
  return new Response(body, { status: upstream.status, headers: out });
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { slug } = await params;
  if (slug?.length) return fail(404, "not found");

  const agent = upstreamOrigin("AGENT_URL");
  if (!agent) return fail(503, "service unavailable");

  const principal = principalHeaders(request.headers);
  if (!principal) return fail(401, "sign-in required");

  const rejected = rejectUnlessSameOriginJson(request);
  if (rejected) return rejected;

  const bytes = await readBody(request);
  if (!bytes) return fail(413, "request too large");
  const method = envelopeMethod(bytes);
  if (method === null) return fail(400, "bad request");
  if (!ALLOWED_METHODS.has(method)) return fail(404, "not found");

  const headers = new Headers(principal);
  headers.set("content-type", "application/json");
  headers.set("accept", "text/event-stream");

  try {
    const upstream = await handlerFor(agent)(
      new Request(request.url, { method: "POST", headers, body: bytes, signal: request.signal }),
    );
    return clientResponse(upstream);
  } catch {
    return fail(502, "service unavailable");
  }
}
