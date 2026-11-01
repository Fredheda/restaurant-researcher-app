"""Who is calling. Easy Auth on the web app sets the
`x-ms-client-principal-*` headers and overwrites any the browser sent; the
web app forwards them, and it is the only caller (both backend apps have
internal ingress). A request without the id header is refused.
"""

from fastapi import HTTPException
from starlette.datastructures import Headers

from app.store.users import Principal

ID_HEADER = "x-ms-client-principal-id"
NAME_HEADER = "x-ms-client-principal-name"
IDP_HEADER = "x-ms-client-principal-idp"
MAX_ID_LENGTH = 64

DEV_PRINCIPAL = Principal(id="local-dev", name="Local developer", idp="local")


def principal_from_headers(headers: Headers, local: bool) -> Principal:
    principal_id = (headers.get(ID_HEADER) or "").strip()
    if not principal_id:
        if local:
            return DEV_PRINCIPAL
        raise HTTPException(status_code=401, detail="sign-in required")
    if len(principal_id) > MAX_ID_LENGTH:
        raise HTTPException(status_code=401, detail="sign-in required")
    name = (headers.get(NAME_HEADER) or "").strip()[:300] or None
    idp = (headers.get(IDP_HEADER) or "").strip()[:64] or None
    return Principal(id=principal_id, name=name, idp=idp)
