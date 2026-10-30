"use client";
// Buyer "Notify me when available" (T12 Full / T07) on a noMatch row: POST /api/demand/watch with the item's insights
// gap key, so Seller Centre shows the buyer under "N buyers waiting". Mock mode (no backend) only flips the label.
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { KITLY_MOCK } from "@/lib/client/kit-api";
import { sellerApi } from "@/lib/client/seller-api";

export function NotifyMe({ gapKey, needLabel }: { gapKey: string; needLabel: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  if (state === "done")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
        <BellRing aria-hidden className="h-3 w-3" />
        We&apos;ll notify you
      </span>
    );
  const watch = async () => {
    setState("busy");
    try {
      if (!KITLY_MOCK) await sellerApi.watch(gapKey);
      setState("done");
    } catch {
      setState("idle");
    }
  };
  return (
    <button
      type="button"
      aria-label={`Notify me: ${needLabel}`}
      disabled={state === "busy"}
      onClick={() => void watch()}
      className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50"
    >
      <Bell aria-hidden className="h-3 w-3" />
      Notify me
    </button>
  );
}
