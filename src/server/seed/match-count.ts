// Simple Matcher for seeded demand (ticket 01): products in the category that carry every requested tag.
// Ticket 03's Matcher may replace this; null category (not in taxonomy) never matches.
import type { Product } from "@/contract/types";

export function countMatches(products: Product[], category: string | null, tags: string[]): number {
  if (category === null) return 0;
  return products.filter((p) => p.category === category && tags.every((t) => p.tags.includes(t))).length;
}
