# 10 — Storefront (DemoMart)

**Lane:** 2 · **Target:** 10:35–11:45 · **Blocked by:** 00

**What to build:** a believable mini marketplace on the store endpoints: home (event shelves + category
grid), keyword search, category page, product detail, cart (client state), fake checkout confirmation.

## Lean
- [ ] Header: "DemoMart" logo text, search bar with a toggle **Search products / Describe your need** (need mode routes to `/kit?q=`), cart icon with count.
- [ ] Product card: category icon on its colour tile (no images), title (2 lines), price ₫, rating ★, review count, sold count, shop tier badge (Mall/Preferred), voucher badge when the shop has one, "Updated for this need" badge when `updatedForDemandAt` is set.
- [ ] Product detail: description, tags as chips, attributes table, shop box, vouchers, ship time "Arrives by <date>" using DEMO_TODAY, Add to cart.
- [ ] Cart grouped by shop with shipping per shop; checkout → `POST /api/checkout` → confirmation page.
- [ ] Works on fixtures (memory adapter) and on the seeded DB without changes.
- [ ] Responsive down to 390 px.

## Full (in addition)
- [ ] Component tests (Vitest + Testing Library) for product card badges and cart totals by shop.
