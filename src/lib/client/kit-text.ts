// Buyer-facing wording for Kitly results (English chrome). Pure, so components stay presentational.
import type { BasketOption, KitPlan } from "@/contract/types";
import { formatShortDate, formatShortVnd } from "./format";

type NoMatch = BasketOption["noMatch"][number];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "no anti-hunchback backpack under 400k" — the part after "No suitable product yet: ". */
export function noMatchReason(entry: NoMatch, plan: KitPlan | null): string {
  const item = plan?.items.find((i) => i.key === entry.itemKey);
  const label = lowerFirst(entry.needLabel);
  switch (entry.reason) {
    case "no_category":
      return `${label} is not sold on DemoMart yet`;
    case "none_in_time":
      return plan?.deadline
        ? `no ${label} arrive by ${formatShortDate(plan.deadline)}`
        : `no ${label} arrive in time`;
    case "none_in_budget":
      return item?.maxUnitPrice
        ? `no ${label} under ${formatShortVnd(item.maxUnitPrice)}`
        : `no ${label} fits your budget`;
    case "no_product_with_tags": {
      const flat = label.toLowerCase();
      const missing = (item?.mustHaveTags ?? []).filter(
        (t) => !flat.includes(t) && !flat.includes(t.replace(/-/g, " ")),
      );
      return missing.length
        ? `no ${label} with ${missing.join(", ")}`
        : `no ${label} matching your must-haves`;
    }
  }
}
