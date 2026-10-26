// Kitly timeline: the five pipeline steps (spinner → check, detail text), plus the terminal error with Retry.
import { AlertTriangle, CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import type { TimelineStep } from "@/lib/client/kit-state";

export function Timeline({
  steps,
  error,
  onRetry,
}: {
  steps: TimelineStep[];
  error: { code: string; message: string } | null;
  onRetry?: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Kitly progress" data-testid="timeline">
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.id} className="flex gap-2.5" data-testid={`step-${s.id}`} data-status={s.status}>
            <StepIcon status={s.status} />
            <div className="min-w-0">
              <div className={`text-sm ${s.status === "pending" ? "text-gray-400" : "font-medium text-gray-800"}`}>
                {s.label}
              </div>
              {s.detail && <div className="text-xs break-words text-gray-500">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert" data-testid="kit-error">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{error.message}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function StepIcon({ status }: { status: TimelineStep["status"] }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (status === "running") return <Loader2 className={`${cls} animate-spin text-[var(--accent)]`} aria-label="running" />;
  if (status === "done") return <CheckCircle2 className={`${cls} text-emerald-600`} aria-label="done" />;
  if (status === "failed") return <XCircle className={`${cls} text-red-600`} aria-label="failed" />;
  return <Circle className={`${cls} text-gray-300`} aria-label="pending" />;
}
