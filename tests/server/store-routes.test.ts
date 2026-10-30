// Store endpoints (CONTRACT §3) through the real route handlers on the In-memory adapter.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ApiErrorSchema,
  CategoriesResponseSchema,
  CheckoutResponseSchema,
  ProductDetailResponseSchema,
  ProductsResponseSchema,
  ShopsResponseSchema,
} from "@/contract";
import { GET as getProducts } from "@/app/api/products/route";
import { GET as getProduct } from "@/app/api/products/[id]/route";
import { GET as getShops } from "@/app/api/shops/route";
import { GET as getCategories } from "@/app/api/categories/route";
import { POST as postCheckout } from "@/app/api/checkout/route";

const get = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/products", () => {
  it("returns products with their shop, default limit 40", async () => {
    const res = await getProducts(get("/api/products"));
    expect(res.status).toBe(200);
    const body = ProductsResponseSchema.parse(await res.json());
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.length).toBeLessThanOrEqual(40);
    const p = body.products.find((x) => x.id === "prod-minhan-backpack");
    expect(p?.shop).toMatchObject({ id: "shop-minhan", name: "Minh An Stationery" });
  });

  it("filters by q and category and honours limit", async () => {
    const byQ = ProductsResponseSchema.parse(await (await getProducts(get("/api/products?q=spine"))).json());
    expect(byQ.products.map((p) => p.id).sort()).toEqual(["prod-kidzone-ergo-backpack", "prod-minhan-backpack"]);
    const byCat = ProductsResponseSchema.parse(
      await (await getProducts(get("/api/products?category=water-bottle"))).json(),
    );
    expect(byCat.products.map((p) => p.category)).toEqual(["water-bottle", "water-bottle"]);
    const limited = ProductsResponseSchema.parse(await (await getProducts(get("/api/products?limit=2"))).json());
    expect(limited.products).toHaveLength(2);
  });

  it("400 on a bad limit", async () => {
    const res = await getProducts(get("/api/products?limit=abc"));
    expect(res.status).toBe(400);
    ApiErrorSchema.parse(await res.json());
  });
});

describe("GET /api/products/:id", () => {
  it("returns the product, its shop and the vouchers usable on it", async () => {
    const res = await getProduct(
      get("/api/products/prod-kidzone-lite-backpack", "kitly_persona=lan"),
      params("prod-kidzone-lite-backpack"),
    );
    expect(res.status).toBe(200);
    const body = ProductDetailResponseSchema.parse(await res.json());
    expect(body.product.title).toBe("KidZone Lite Backpack Grade 1–3");
    expect(body.shop.id).toBe("shop-kidzone");
    const codes = body.vouchers.map((v) => v.code).sort();
    // platform vouchers + this shop's, incl. Lan's wallet; never another shop's
    expect(codes).toEqual(["FREESHIP", "KIDZONE10", "KITLY50", "LAN-BTS10", "LAN-KZ80", "SAVE5"]);
  });

  it("guest sees no wallet vouchers", async () => {
    const res = await getProduct(
      get("/api/products/prod-kidzone-lite-backpack", "kitly_persona=guest"),
      params("prod-kidzone-lite-backpack"),
    );
    const body = ProductDetailResponseSchema.parse(await res.json());
    expect(body.vouchers.every((v) => v.ownerPersona === null)).toBe(true);
  });

  it("404 for an unknown product", async () => {
    const res = await getProduct(get("/api/products/nope"), params("nope"));
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("not_found");
  });
});

describe("GET /api/shops and /api/categories", () => {
  it("lists shops", async () => {
    const res = await getShops();
    expect(res.status).toBe(200);
    expect(ShopsResponseSchema.parse(await res.json()).shops).toHaveLength(6);
  });

  it("lists the 60 taxonomy categories with event, icon and colour", async () => {
    const res = await getCategories();
    expect(res.status).toBe(200);
    const { categories } = CategoriesResponseSchema.parse(await res.json());
    expect(categories).toHaveLength(60);
    expect(categories.find((c) => c.id === "school-backpack")).toEqual({
      id: "school-backpack",
      label: "School backpack",
      event: "back_to_school",
      icon: "backpack",
      color: "bg-amber-100 text-amber-600",
    });
  });
});

describe("POST /api/checkout", () => {
  it("returns a fake order id and items + one shipping fee per shop", async () => {
    const res = await postCheckout(
      post("/api/checkout", {
        lines: [
          { productId: "prod-minhan-backpack", quantity: 1 }, // 349,000 · Minh An ship 25,000
          { productId: "prod-minhan-notebooks", quantity: 2 }, // 90,000 · same shop
          { productId: "prod-kidzone-bottle", quantity: 1 }, // 189,000 · KidZone ship 30,000
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = CheckoutResponseSchema.parse(await res.json());
    expect(body.grandTotal).toBe(349000 + 90000 + 189000 + 25000 + 30000);
    expect(body.orderId).toMatch(/^ord-/);
  });

  it("400 on an invalid body, unknown product or out-of-stock product", async () => {
    for (const body of [
      "not json",
      { lines: [] },
      { lines: [{ productId: "nope", quantity: 1 }] },
      { lines: [{ productId: "prod-bago-backpack-trend", quantity: 1 }] },
    ]) {
      const res = await postCheckout(post("/api/checkout", body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      ApiErrorSchema.parse(await res.json());
    }
  });
});
