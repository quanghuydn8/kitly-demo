// Gap key shared by Seller Intelligence (insights gaps[].key) and "Notify me" (POST /api/demand/watch).
// A buyer-side noMatch row maps to the key of its plan item: gapKeyFor(item.category, item.mustHaveTags).

export const gapKeyFor = (category: string | null, tags: string[]): string =>
  `${category ?? "none"}|${[...new Set(tags)].sort().join(",")}`;
