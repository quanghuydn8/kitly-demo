// GET/POST /api/persona (ticket 16, CONTRACT §3, D43): the buyer persona from cookie kitly_persona (missing ⇒ lan).
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PersonaResponseSchema } from "@/contract";
import { GET, POST } from "@/app/api/persona/route";

const get = (cookie?: string) =>
  GET(new NextRequest("http://localhost/api/persona", { headers: cookie ? { cookie } : {} }));
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/persona", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

describe("GET /api/persona", () => {
  it("no cookie ⇒ Lan with her 2 wallet vouchers only", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = PersonaResponseSchema.parse(await res.json());
    expect(body.persona).toMatchObject({ id: "lan", name: "Lan", address: { district: "Cau Giay", city: "Hanoi" }, favoriteShopIds: ["shop-kidzone"] });
    expect(body.walletVouchers.map((v) => v.code).sort()).toEqual(["LAN-BTS10", "LAN-KZ80"]);
    expect(body.walletVouchers.every((v) => v.ownerPersona === "lan")).toBe(true);
  });

  it("cookie guest ⇒ Guest, no wallet vouchers; an invalid cookie ⇒ Lan", async () => {
    const guest = PersonaResponseSchema.parse(await (await get("kitly_persona=guest")).json());
    expect(guest).toEqual({ persona: { id: "guest", name: "Guest", address: null, favoriteShopIds: [], cart: [] }, walletVouchers: [] });
    const bad = PersonaResponseSchema.parse(await (await get("kitly_persona=admin")).json());
    expect(bad.persona.id).toBe("lan");
  });
});

describe("POST /api/persona", () => {
  it("{ id: guest } ⇒ Guest + sets kitly_persona (SameSite=Lax, 1 year)", async () => {
    const res = await post({ id: "guest" });
    expect(res.status).toBe(200);
    expect(PersonaResponseSchema.parse(await res.json()).persona.id).toBe("guest");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/kitly_persona=guest/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=31536000/);
    expect(cookie).toMatch(/Path=\//);
  });

  it("{ id: lan } ⇒ Lan + cookie lan", async () => {
    const res = await post({ id: "lan" });
    expect((await res.json()).persona.id).toBe("lan");
    expect(res.headers.get("set-cookie")).toMatch(/kitly_persona=lan/);
  });

  it("anything but lan|guest ⇒ 400, no cookie", async () => {
    for (const body of [{ id: "admin" }, {}, "not json"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
