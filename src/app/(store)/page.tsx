// Placeholder store home from ticket 00 so the app renders; Lane 2 (ticket 10) replaces this file.
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { CATEGORIES } from "@/contract";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center gap-2 text-2xl font-semibold text-[var(--kitly-accent)]">
        <ShoppingBag aria-hidden /> DemoMart
      </header>
      <p className="mb-4 text-gray-600">Kitly scaffold is running. Categories from the contract:</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((c) => (
          <li key={c.id} className={`rounded-xl px-3 py-2 text-sm ${c.color}`}>
            {c.label}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-gray-500">
        API:{" "}
        <Link className="underline" href="/api/products">
          /api/products
        </Link>
      </p>
    </main>
  );
}
