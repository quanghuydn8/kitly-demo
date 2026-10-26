import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ApiErrorSchema,
  CategoriesResponseSchema,
  CheckoutResponseSchema,
  ProductDetailResponseSchema,
  ProductsResponseSchema,
  ShopsResponseSchema,
} from "@/contract";
import { resetAdapterForTests } from "@/server/adapter";
import { GET as listProducts } from "@/app/api/products/route";
import { GET as getProduct } from "@/app/api/products/[id]/route";
import { GET as listShops } from "@/app/api/shops/route";
import { GET as listCategories } from "@/app/api/categories/route";
import { POST as checkout } from "@/app/api/checkout/route";

const req = (path: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${path}`, {
    method: init?.method ?? "GET",
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => resetAdapterForTests());

describe("GET /api/products", () => {
  it("returns products joined with their shop, default limit 40", async () => {
    const res = await listProducts(req("/api/products"));
    expect(res.status).toBe(200);
    const body = ProductsResponseSchema.parse(await res.json());
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.length).toBeLessThanOrEqual(40);
    for (const p of body.products) expect(p.shop.id).toBe(p.shopId);
  });

  it("filters by q, category and limit", async () => {
    const byCat = ProductsResponseSchema.parse(
      await (await listProducts(req("/api/products?category=school-backpack"))).json(),
    );
    expect(byCat.products).toHaveLength(7);
    expect(byCat.products.every((p) => p.category === "school-backpack")).toBe(true);

    const byQ = ProductsResponseSchema.parse(
      await (await listProducts(req("/api/products?q=minh%20an%20backpack"))).json(),
    );
    expect(byQ.products.map((p) => p.id)).toContain("prod-minhan-backpack");

    const limited = ProductsResponseSchema.parse(
      await (await listProducts(req("/api/products?limit=2"))).json(),
    );
    expect(limited.products).toHaveLength(2);
  });

  it("rejects a non-numeric limit with 400", async () => {
    const res = await listProducts(req("/api/products?limit=abc"));
    expect(res.status).toBe(400);
    ApiErrorSchema.parse(await res.json());
  });
});

describe("GET /api/products/:id", () => {
  it("returns product, shop and the vouchers usable at that shop", async () => {
    const res = await getProduct(req("/api/products/prod-minhan-backpack"), params("prod-minhan-backpack"));
    expect(res.status).toBe(200);
    const body = ProductDetailResponseSchema.parse(await res.json());
    expect(body.product.price).toBe(349000);
    expect(body.shop.name).toBe("Minh An Stationery");
    const codes = body.vouchers.map((v) => v.code).sort();
    expect(codes).toEqual(["FREESHIP", "KITLY50", "MINHAN30", "SAVE5"]);
  });

  it("404s with an error body for an unknown id", async () => {
    const res = await getProduct(req("/api/products/nope"), params("nope"));
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe("not_found");
  });
});

describe("GET /api/shops and /api/categories", () => {
  it("lists shops", async () => {
    const res = await listShops();
    expect(res.status).toBe(200);
    expect(ShopsResponseSchema.parse(await res.json()).shops).toHaveLength(6);
  });

  it("lists the 60 taxonomy categories with icon and colour", async () => {
    const res = await listCategories();
    expect(res.status).toBe(200);
    const { categories } = CategoriesResponseSchema.parse(await res.json());
    expect(categories).toHaveLength(60);
    expect(categories.find((c) => c.id === "school-backpack")).toEqual({
      id: "school-backpack",
      label: "School backpack",
      event: "back_to_school",
      icon: "backpack",
      color: "amber",
    });
  });
});

describe("POST /api/checkout", () => {
  it("returns a fake order id and grand total = items + one ship fee per shop", async () => {
    const res = await checkout(
      req("/api/checkout", {
        method: "POST",
        body: {
          lines: [
            { productId: "prod-minhan-backpack", quantity: 1 }, // 349,000 @ Minh An (ship 25,000)
            { productId: "prod-minhan-notebooks", quantity: 2 }, // 170,000 @ Minh An
            { productId: "prod-kidzone-shoes", quantity: 1 }, // 320,000 @ KidZone (ship 30,000)
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = CheckoutResponseSchema.parse(await res.json());
    expect(body.orderId).toMatch(/^DM-/);
    expect(body.grandTotal).toBe(349000 + 170000 + 320000 + 25000 + 30000);
  });

  it("400s on an empty or malformed body", async () => {
    const empty = await checkout(req("/api/checkout", { method: "POST", body: { lines: [] } }));
    expect(empty.status).toBe(400);
    ApiErrorSchema.parse(await empty.json());
    const bad = await checkout(req("/api/checkout", { method: "POST", body: "nope" }));
    expect(bad.status).toBe(400);
  });

  it("404s when a line references an unknown product", async () => {
    const res = await checkout(
      req("/api/checkout", { method: "POST", body: { lines: [{ productId: "ghost", quantity: 1 }] } }),
    );
    expect(res.status).toBe(404);
    ApiErrorSchema.parse(await res.json());
  });
});
