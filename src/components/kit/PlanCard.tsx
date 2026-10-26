// The plan Kitly understood: event, budget, deadline, assumptions, items with must-have / nice-to-have and tags.
import { CalendarDays, ClipboardList, Info, Wallet } from "lucide-react";
import type { KitPlan } from "@/contract/types";
import { EVENT_LABELS } from "@/lib/client/events";
import { formatShortDate, formatShortVnd, formatVnd } from "@/lib/client/format";

export function PlanCard({ plan }: { plan: KitPlan }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Plan" data-testid="plan-card">
      <h2 className="flex items-center gap-1.5 font-semibold text-gray-800">
        <ClipboardList className="h-4 w-4 text-[var(--accent)]" /> {EVENT_LABELS[plan.event]}
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-gray-50 px-2 py-1.5">
          <dt className="flex items-center gap-1 text-xs text-gray-500">
            <Wallet className="h-3 w-3" /> Budget
          </dt>
          <dd className="font-medium text-gray-800" data-testid="plan-budget">
            {plan.budget !== null ? formatVnd(plan.budget) : "No limit"}
          </dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5">
          <dt className="flex items-center gap-1 text-xs text-gray-500">
            <CalendarDays className="h-3 w-3" /> Needed by
          </dt>
          <dd className="font-medium text-gray-800" data-testid="plan-deadline">
            {plan.deadline ? formatShortDate(plan.deadline) : "No deadline"}
          </dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-2">
        {plan.items.map((i) => (
          <li key={i.key} className="text-sm" data-testid={`plan-item-${i.key}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-800">{i.needLabel}</span>
              {i.quantity > 1 && <span className="text-xs text-gray-500">×{i.quantity}</span>}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  i.required ? "bg-orange-100 text-[var(--accent)]" : "bg-gray-100 text-gray-500"
                }`}
              >
                {i.required ? "Must-have" : "Nice-to-have"}
              </span>
            </div>
            {(i.mustHaveTags.length > 0 || i.niceToHaveTags.length > 0 || i.maxUnitPrice !== null) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {i.mustHaveTags.map((t) => (
                  <span key={t} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-white">
                    {t}
                  </span>
                ))}
                {i.niceToHaveTags.map((t) => (
                  <span key={t} className="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {t}
                  </span>
                ))}
                {i.maxUnitPrice !== null && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                    max {formatShortVnd(i.maxUnitPrice)}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {plan.assumptions.length > 0 && (
        <div className="mt-3 rounded-lg bg-sky-50 p-2 text-xs text-sky-800">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <Info className="h-3 w-3" /> Assumptions
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
