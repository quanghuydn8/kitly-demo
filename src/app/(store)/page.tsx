// Placeholder from T00 so the app builds; Lane 2 replaces this in ticket 10 (storefront).
import { ShoppingBag } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--accent)]">
          <ShoppingBag className="h-6 w-6" /> DemoMart
        </h1>
        <p className="mt-2 text-gray-600">
          Kitly scaffold is up. Store API: /api/products, /api/shops, /api/categories.
        </p>
      </div>
    </main>
  );
}
