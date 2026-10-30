// Seed-time matchedCount (ticket 01): in-stock products of the category that carry every tag.
// Ticket 03's Matcher may replace it; a null category never matches.
import type { Product } from "@/contract";

export function countMatches(catalog: Product[], category: string | null, tags: string[]): number {
  if (category === null) return 0;
  return catalog.filter((p) => p.category === category && p.stock > 0 && tags.every((t) => p.tags.includes(t))).length;
}
