"use client";
// "Back to buyer" from /seller: goes to /kit, re-running the buyer's last need when this browser remembers one
// (read after mount so server and first client render agree).
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { buyerHref, recallKitQuery } from "@/lib/client/last-query";

export function BackToBuyer() {
  const [href, setHref] = useState("/kit");
  useEffect(() => setHref(buyerHref(recallKitQuery())), []);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> Back to buyer
    </Link>
  );
}
