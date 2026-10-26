// Placeholder for the Kitly result block while the basket is on its way: same two-column grid and roughly the
// same row heights as Basket + TotalsPanel, so nothing jumps when the options event lands.
const ROWS = 6;

export function KitResultSkeleton() {
  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
      data-testid="basket-skeleton"
      aria-busy="true"
      aria-label="Building your basket"
    >
      <div className="min-w-0 space-y-2">
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} data-skeleton-row className="flex animate-pulse gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-1/3 rounded bg-gray-100" />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
            <div className="h-4 w-16 shrink-0 rounded bg-gray-100" />
          </div>
        ))}
        <p className="pt-1 text-center text-xs text-gray-400">
          Your basket appears here as soon as Kitly has compared the shops…
        </p>
      </div>
      <div className="space-y-4">
        <div className="h-56 animate-pulse rounded-2xl bg-white shadow-sm" />
        <div className="h-12 rounded-xl bg-orange-100" />
      </div>
    </div>
  );
}
