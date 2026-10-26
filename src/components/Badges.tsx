// Small marketplace badges reused by product cards, product detail and Kitly basket rows.
import { BadgeCheck, Crown, Sparkles, Ticket } from "lucide-react";
import type { ShopTier, Voucher } from "@/contract/types";
import { voucherLabel } from "@/lib/client/format";

export function TierBadge({ tier }: { tier: ShopTier }) {
  if (tier === "regular") return null;
  const mall = tier === "mall";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        mall ? "bg-[var(--accent)] text-white" : "bg-orange-100 text-[var(--accent)]"
      }`}
    >
      {mall ? <Crown className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
      {mall ? "Mall" : "Preferred"}
    </span>
  );
}

export function VoucherBadge({ voucher }: { voucher: Voucher }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-[var(--accent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
      <Ticket className="h-3 w-3" />
      {voucherLabel(voucher)}
    </span>
  );
}

export function UpdatedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
      <Sparkles className="h-3 w-3" />
      Updated for this need
    </span>
  );
}
