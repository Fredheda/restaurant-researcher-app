const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export function upstreamOrigin(variable: "API_URL" | "AGENT_URL"): URL | null {
  try {
    const base = new URL(process.env[variable] ?? "");
    return base.protocol === "http:" || base.protocol === "https:" ? base : null;
  } catch {
    return null;
  }
}

export function rejectUnlessSameOriginJson(request: Request): Response | null {
  // A cross-site form post carries the Easy Auth cookie and `origin` is not forwarded,
  // so the upstream could not tell. Browsers send `sec-fetch-site`; a form cannot send
  // JSON without a preflight, which these routes never grant.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return fail(403, "forbidden");
  const type = (request.headers.get("content-type") ?? "").trim().toLowerCase();
  if (!type.startsWith("application/json")) return fail(415, "unsupported media type");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail(413, "request too large");
  }
  return null;
}

/** The request body as bytes, or null once it passes the cap. Counted in
 * bytes as it arrives, so a multi-byte or chunked body cannot slip past and an
 * endless one is cancelled instead of buffered. */
export async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
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
