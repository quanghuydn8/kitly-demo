import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { formatVnd } from "@/lib/client/format";

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; total?: string }>;
}) {
  const { orderId, total } = await searchParams;
  const grandTotal = Number(total);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
      <CircleCheck className="h-14 w-14 text-emerald-500" />
      <h1 className="text-xl font-semibold text-gray-800">Order placed</h1>
      {orderId && (
        <div className="text-sm text-gray-600">
          Order <b data-testid="order-id">{orderId}</b>
        </div>
      )}
      {Number.isFinite(grandTotal) && total && (
        <div className="text-2xl font-bold text-[var(--accent)]">{formatVnd(grandTotal)}</div>
      )}
      <p className="text-sm text-gray-500">
        This is a demo store: no payment was taken and nothing will ship.
      </p>
      <Link href="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
        Back to DemoMart
      </Link>
    </div>
  );
}
