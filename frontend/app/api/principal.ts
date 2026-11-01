/**
 * The Easy Auth sign-in headers the backend apps need. Easy Auth sets them
 * on every request it lets into the web app and overwrites any a browser
 * sent, so they are trusted here and forwarded unchanged. Nothing else from
 * the incoming request (cookies, tokens) is passed on.
 */
export const PRINCIPAL_HEADERS = [
  "x-ms-client-principal-id",
  "x-ms-client-principal-name",
  "x-ms-client-principal-idp",
] as const;

export function forwardPrincipalHeaders(from: Headers): Headers {
  const out = new Headers();
  for (const name of PRINCIPAL_HEADERS) {
    const value = from.get(name);
    if (value) out.set(name, value);
  }
  return out;
}
