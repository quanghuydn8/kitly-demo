// Category browse grid (home): every taxonomy category as an icon tile linking to /c/<id>, grouped by event.
import Link from "next/link";
import { CATEGORIES, EVENTS } from "@/contract";
import { CategoryIcon } from "./CategoryIcon";

export function CategoryGrid() {
  const events = Object.keys(EVENTS) as (keyof typeof EVENTS)[];
  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
        <div key={event}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{EVENTS[event].label}</h3>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
            {CATEGORIES.filter((c) => c.event === event).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.id}`}
                  className="flex flex-col items-center gap-1 rounded-lg p-1 text-center hover:bg-gray-50"
                >
                  <CategoryIcon category={c.id} className="h-12 w-12 rounded-full" />
                  <span className="line-clamp-2 text-[11px] leading-tight text-gray-700">{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
