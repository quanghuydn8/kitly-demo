import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm">
      <div className="font-medium text-gray-800">We couldn’t find that page.</div>
      <Link href="/" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
        Back to DemoMart
      </Link>
    </div>
  );
}
