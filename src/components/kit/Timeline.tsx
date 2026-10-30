// Live pipeline timeline inside the in-flight assistant message (T11): spinner → check, with the step detail.
import { CheckCircle2, Loader2 } from "lucide-react";
import type { StepId } from "@/contract";
import type { RunStep } from "@/lib/client/kit-run";

const LABEL: Record<StepId, string> = {
  understand: "Understanding your need",
  plan: "Planning the kit",
  search: "Searching products",
  optimize: "Optimizing baskets",
  explain: "Explaining",
};

export function Timeline({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="space-y-1.5 text-sm" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2">
          {s.status === "done" ? (
            <CheckCircle2 aria-label="done" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Loader2 aria-label="running" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--kitly-accent)]" />
          )}
          <span className="min-w-0">
            <span className="text-gray-700">{LABEL[s.id]}</span>
            {s.detail && <span className="block text-xs text-gray-500">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
