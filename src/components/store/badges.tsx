// Small badges shared by product card and product detail.
import { Sparkles, Ticket } from "lucide-react";
import type { ShopTier } from "@/contract";

export function TierBadge({ tier }: { tier: ShopTier }) {
  if (tier === "regular") return null;
  const mall = tier === "mall";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${mall ? "bg-[var(--kitly-accent)] text-white" : "bg-orange-100 text-[var(--kitly-accent)]"}`}
    >
      {mall ? "Mall" : "Preferred"}
    </span>
  );
}

export function VoucherBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-[var(--kitly-accent)] px-1 py-0.5 text-[10px] text-[var(--kitly-accent)]">
      <Ticket aria-hidden className="h-3 w-3" />
      <span>Voucher</span>
    </span>
  );
}

export function UpdatedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
      <Sparkles aria-hidden className="h-3 w-3" />
      <span>Updated for this need</span>
    </span>
  );
}
