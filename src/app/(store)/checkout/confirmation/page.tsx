// Fake checkout confirmation (T10, PRD story 22): shows the order id and the server's grand total. No payment.
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { formatVnd } from "@/lib/client/format";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; total?: string }>;
}) {
  const { order, total } = await searchParams;
  const amount = Number(total);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
      <CircleCheck aria-hidden className="h-14 w-14 text-emerald-500" />
      <h1 className="text-xl font-semibold">Order placed</h1>
      {order ? (
        <>
          <p className="text-sm text-gray-600">
            Order <span className="font-mono font-medium text-gray-900">{order}</span>
          </p>
          {Number.isInteger(amount) && (
            <p className="text-lg">
              Total paid <span className="font-semibold text-[var(--kitly-accent)]">{formatVnd(amount)}</span>
            </p>
          )}
          <p className="text-xs text-gray-400">Demo store — no payment was taken.</p>
        </>
      ) : (
        <p className="text-sm text-gray-600">No order to show.</p>
      )}
      <Link href="/" className="mt-2 rounded-lg bg-[var(--kitly-accent)] px-4 py-2 text-sm font-medium text-white">
        Continue shopping
      </Link>
    </div>
  );
}
