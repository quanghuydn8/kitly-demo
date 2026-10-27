// Buyer-facing wording for Kitly results (English chrome). Pure, so components stay presentational.
import type { BasketOption, KitPlan } from "@/contract/types";
import { formatShortDate, formatShortVnd, formatVnd } from "./format";

type NoMatch = BasketOption["noMatch"][number];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const isVi = (plan: KitPlan | null) => plan?.language === "vi";

/** "No suitable product yet" / "Chưa có sản phẩm phù hợp" — the leading words before the reason. */
export const noMatchPrefix = (plan: KitPlan | null) =>
  isVi(plan) ? "Chưa có sản phẩm phù hợp" : "No suitable product yet";

/** Vietnamese short date: "2026-08-25" → "25/08". */
const viDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function noMatchReasonVi(entry: NoMatch, plan: KitPlan | null): string {
  const item = plan?.items.find((i) => i.key === entry.itemKey);
  const label = lowerFirst(entry.needLabel);
  switch (entry.reason) {
    case "no_category":
      return `DemoMart chưa bán ${label}`;
    case "none_in_time":
      return plan?.deadline ? `chưa có ${label} giao kịp trước ${viDate(plan.deadline)}` : `chưa có ${label} giao kịp`;
    case "none_in_budget":
      return item?.maxUnitPrice
        ? `chưa có ${label} dưới ${formatVnd(item.maxUnitPrice)}`
        : `chưa có ${label} vừa ngân sách của bạn`;
    case "no_product_with_tags": {
      const flat = label.toLowerCase();
      const missing = (item?.mustHaveTags ?? []).filter(
        (t) => !flat.includes(t) && !flat.includes(t.replace(/-/g, " ")),
      );
      return missing.length ? `chưa có ${label} có ${missing.join(", ")}` : `chưa có ${label} đúng yêu cầu của bạn`;
    }
  }
}

/** "no anti-hunchback backpack under 400k" — the part after "No suitable product yet: " (follows plan.language). */
export function noMatchReason(entry: NoMatch, plan: KitPlan | null): string {
  if (isVi(plan)) return noMatchReasonVi(entry, plan);
  const item = plan?.items.find((i) => i.key === entry.itemKey);
  const label = lowerFirst(entry.needLabel);
  switch (entry.reason) {
    case "no_category":
      return `DemoMart does not sell ${label} yet`;
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

/** Why an over_budget kit cannot be bought (shown next to the disabled button). */
export const OVER_BUDGET_REASON = "Over budget — pick another kit or raise your budget";
