import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { ownerFrom, personaFrom, OWNER_COOKIE } from "@/server/http/request";

const req = (headers: Record<string, string> = {}, url = "http://localhost/api/threads") =>
  new NextRequest(url, { headers });
const basic = (userPass: string) => "Basic " + Buffer.from(userPass).toString("base64");

afterEach(() => {
  process.env.KITLY_BASIC_AUTH = "";
});

describe("middleware: kitly_uid cookie", () => {
  it("sets kitly_uid (httpOnly, SameSite=Lax, 1 year) when missing", () => {
    const res = middleware(req());
    const setCookie = res.headers.get("set-cookie") ?? "";
    const uid = /kitly_uid=([^;]+)/.exec(setCookie)?.[1];
    expect(uid).toMatch(/^[0-9a-f-]{36}$/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/Path=\//);
  });

  it("does not set it again when the browser already has one", () => {
    const res = middleware(req({ cookie: `${OWNER_COOKIE}=abc-123` }));
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/kitly_uid/);
  });

  it("forwards the new uid to the route handler of the same first request", () => {
    const res = middleware(req());
    const uid = /kitly_uid=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`kitly_uid=${uid}`);
  });
});

describe("ownerFrom / personaFrom", () => {
  it("ownerFrom reads kitly_uid, null when missing", () => {
    expect(ownerFrom(req({ cookie: "kitly_uid=u-1; other=x" }))).toBe("u-1");
    expect(ownerFrom(req())).toBeNull();
    expect(ownerFrom(new Request("http://x/", { headers: { cookie: "kitly_uid=u-2" } }))).toBe("u-2");
  });

  it("personaFrom: lan | guest, missing or invalid ⇒ lan", () => {
    expect(personaFrom(req({ cookie: "kitly_persona=guest" }))).toBe("guest");
    expect(personaFrom(req({ cookie: "kitly_persona=lan" }))).toBe("lan");
    expect(personaFrom(req({ cookie: "kitly_persona=admin" }))).toBe("lan");
    expect(personaFrom(req())).toBe("lan");
  });
});

describe("middleware: optional Basic Auth (KITLY_BASIC_AUTH)", () => {
  it("unset ⇒ open", () => {
    process.env.KITLY_BASIC_AUTH = "";
    expect(middleware(req()).status).toBe(200);
  });

  it("missing or wrong credentials ⇒ 401 with WWW-Authenticate", () => {
    process.env.KITLY_BASIC_AUTH = "team:secret";
    for (const r of [req(), req({ authorization: basic("team:wrong") }), req({ authorization: "Bearer x" })]) {
      const res = middleware(r);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toMatch(/^Basic/);
    }
  });

  it("right credentials ⇒ pass (and the uid cookie is still set)", () => {
    process.env.KITLY_BASIC_AUTH = "team:secret";
    const res = middleware(req({ authorization: basic("team:secret") }, "http://localhost/kit"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/kitly_uid=/);
  });

  it("passwords may contain ':'", () => {
    process.env.KITLY_BASIC_AUTH = "team:se:cret";
    expect(middleware(req({ authorization: basic("team:se:cret") })).status).toBe(200);
  });
});
