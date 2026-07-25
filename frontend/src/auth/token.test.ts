import { afterEach, describe, expect, it } from "vitest";
import { clearToken, decodeJwt, getToken, setToken } from "./token";

afterEach(() => sessionStorage.clear());

describe("token store", () => {
  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("persists and retrieves a token via sessionStorage", () => {
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    expect(sessionStorage.getItem("hr_access_token")).toBe("abc.def.ghi");
  });

  it("setToken(null) removes the stored token", () => {
    setToken("t");
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it("clearToken removes the stored token", () => {
    setToken("t");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("decodeJwt", () => {
  it("decodes a base64url JWT payload without verifying", () => {
    const payload = { sub: "user-1", role: "admin", exp: 1999999999 };
    const b64 = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const claims = decodeJwt(`header.${b64}.sig`);
    expect(claims).toMatchObject({ sub: "user-1", role: "admin" });
  });

  it("returns null for malformed tokens", () => {
    expect(decodeJwt("not-a-jwt")).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });
});
