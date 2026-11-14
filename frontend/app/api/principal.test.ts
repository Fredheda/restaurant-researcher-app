// @vitest-environment node
import { describe, expect, it } from "vitest";
import { principalHeaders } from "./principal";

function incoming(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("principalHeaders", () => {
  it("passes the three Easy Auth headers and nothing else", () => {
    const out = principalHeaders(
      incoming({
        "x-ms-client-principal-id": "0b8e9a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
        "x-ms-client-principal-name": "someone@example.com",
        "x-ms-client-principal-idp": "aad",
        "x-ms-client-principal": "eyJjbGFpbXMiOltdfQ==",
        "x-ms-token-aad-access-token": "secret-token",
        authorization: "Bearer secret",
        cookie: "AppServiceAuthSession=secret",
      })
    );
    expect(Object.fromEntries(out!)).toEqual({
      "x-ms-client-principal-id": "0b8e9a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
      "x-ms-client-principal-name": "someone@example.com",
      "x-ms-client-principal-idp": "aad",
    });
  });

  it("returns null without a usable principal id", () => {
    expect(principalHeaders(incoming({}))).toBeNull();
    expect(principalHeaders(incoming({ "x-ms-client-principal-id": "   " }))).toBeNull();
    expect(principalHeaders(incoming({ "x-ms-client-principal-id": "a b" }))).toBeNull();
    expect(principalHeaders(incoming({ "x-ms-client-principal-id": "x".repeat(65) }))).toBeNull();
    expect(
      principalHeaders(incoming({ "x-ms-client-principal-name": "someone", "x-ms-client-principal-idp": "aad" }))
    ).toBeNull();
  });

  it("drops a name or provider that is malformed instead of refusing the request", () => {
    const out = principalHeaders(
      incoming({
        "x-ms-client-principal-id": "oid-1",
        "x-ms-client-principal-name": "José é",
        "x-ms-client-principal-idp": "not valid!",
      })
    );
    expect(Object.fromEntries(out!)).toEqual({ "x-ms-client-principal-id": "oid-1" });
  });

  it("drops a name that is too long", () => {
    const out = principalHeaders(
      incoming({ "x-ms-client-principal-id": "oid-1", "x-ms-client-principal-name": "n".repeat(301) })
    );
    expect(out!.has("x-ms-client-principal-name")).toBe(false);
  });
});
