import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkBasicAuth } from "@/server/basic-auth";

const req = (auth?: string) =>
  new NextRequest("http://localhost/kit", auth ? { headers: { authorization: auth } } : undefined);
const b64 = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;

describe("checkBasicAuth (F19: password gate for shared demo links)", () => {
  it("lets everything through when KITLY_BASIC_AUTH is unset", () => {
    expect(checkBasicAuth(req(), undefined)).toBeNull();
  });
  it("asks for credentials when missing or wrong", () => {
    for (const r of [req(), req(b64("team:wrong")), req("Bearer x")]) {
      const res = checkBasicAuth(r, "team:secret")!;
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Basic");
    }
  });
  it("accepts the right user:pass", () => {
    expect(checkBasicAuth(req(b64("team:secret")), "team:secret")).toBeNull();
  });
});
