/**
 * The Easy Auth sign-in headers the backend apps need. Easy Auth sets them on
 * every request it lets into the web app and does not let an external request
 * set them, so a request that reaches this code with an id header was signed
 * in. The values are still checked here (shape and length) so a bad value
 * never travels on, and a request without a usable id is refused. That is all
 * the check can do: if Easy Auth were ever off, a caller could send an id
 * header of its own and this code could not tell. The deploy docs and
 * `scripts/setup-easyauth.sh` keep Easy Auth on; never exclude `/api/*` from it.
 *
 * Nothing else from the incoming request is forwarded: not the cookie, not
 * `authorization`, not the `x-ms-token-*` provider tokens, and not the
 * base64 `x-ms-client-principal` claims blob.
 */
export const PRINCIPAL_ID = "x-ms-client-principal-id";
export const PRINCIPAL_NAME = "x-ms-client-principal-name";
export const PRINCIPAL_IDP = "x-ms-client-principal-idp";

// Entra object ids are GUIDs; the backend refuses ids over 64 characters.
const ID_PATTERN = /^[A-Za-z0-9._@:-]{1,64}$/;
const IDP_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_NAME_LENGTH = 300;

function printableAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 126) return false;
  }
  return true;
}

/**
 * The principal headers to send upstream, or `null` when the request carries
 * no usable principal id. A bad name or provider is dropped (the backend
 * treats both as optional); a bad id refuses the whole request.
 */
export function principalHeaders(from: Headers): Headers | null {
  const id = (from.get(PRINCIPAL_ID) ?? "").trim();
  if (!ID_PATTERN.test(id)) return null;

  const out = new Headers();
  out.set(PRINCIPAL_ID, id);

  const name = (from.get(PRINCIPAL_NAME) ?? "").trim();
  if (name && name.length <= MAX_NAME_LENGTH && printableAscii(name)) {
    out.set(PRINCIPAL_NAME, name);
  }
  const idp = (from.get(PRINCIPAL_IDP) ?? "").trim();
  if (IDP_PATTERN.test(idp)) out.set(PRINCIPAL_IDP, idp);
  return out;
}
