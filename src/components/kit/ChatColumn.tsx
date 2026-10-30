"use client";
// Chat column (T11, D30): one user bubble + one assistant message per kit version, a system line for adjust/restore
// versions, the live run (timeline → collapsed summary, explanation, assumption chips, clarify choices, error +
// Retry) and the composer. Presentational: KitScreen owns the data and the requests.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, RotateCcw, Send, Sparkles } from "lucide-react";
import type { KitPlan, KitVersion } from "@/contract";
import { runSummary, runUserText, type RunState } from "@/lib/client/kit-run";
import { budgetChoiceLabel, clarifyQuestion, DEFAULT_BUDGET_CHOICES } from "@/lib/client/kit-text";
import { Timeline } from "./Timeline";

export const EXAMPLES: { event: string; text: string }[] = [
  { event: "Back to school", text: "My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k." },
  { event: "Newborn", text: "Our first baby arrives next month. Budget 3M for the newborn essentials." },
  { event: "First apartment", text: "Moving into my first apartment next week, need kitchen and cleaning basics under 2M." },
  { event: "Camping trip", text: "Camping trip for 2 this weekend, budget 1.5M." },
  { event: "Home office", text: "Setting up a home office corner, budget 2.5M, delivered by Friday." },
  { event: "Tet gifts", text: "Tet gift boxes for 5 colleagues, about 300k each." },
];

export interface ChatColumnProps {
  versions: KitVersion[];
  run: RunState | null;
  /** Collapsed timeline lines of runs made in this page view, by version. */
  summaries: Record<number, string>;
  busy: boolean;
  onSend(text: string): void;
  onChooseBudget(budget: number | null): void;
  onRetry(): void;
}

function UserBubble({ text }: { text: string }) {
  return (
    <li className="flex justify-end">
      <p data-testid="user-bubble" className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--kitly-accent)] px-3.5 py-2 text-sm text-white">
        {text}
      </p>
    </li>
  );
}

function Assistant({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[var(--kitly-accent)]">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2 rounded-2xl rounded-tl-sm border bg-white px-3.5 py-2.5 text-sm">{children}</div>
    </li>
  );
}

function Chips({ plan }: { plan: KitPlan }) {
  if (plan.assumptions.length === 0) return null;
  return (
    <ul aria-label="Assumptions" className="flex flex-wrap gap-1.5">
      {plan.assumptions.map((a) => (
        <li key={a} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-800">
          {a}
        </li>
      ))}
    </ul>
  );
}

function Clarify({
  text,
  choices,
  busy,
  onChoose,
}: {
  text: string;
  choices: (number | null)[];
  busy: boolean;
  onChoose(b: number | null): void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{text}</p>
      <div role="group" aria-label="Budget choices" className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <button
            key={String(c)}
            type="button"
            disabled={busy}
            onClick={() => onChoose(c)}
            className="rounded-full border border-[var(--kitly-accent)] px-3 py-1 text-xs font-medium text-[var(--kitly-accent)] hover:bg-orange-50 disabled:opacity-50"
          >
            {budgetChoiceLabel(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SystemLine({ text }: { text: string }) {
  return <li className="text-center text-xs text-gray-500">⚙ {text}</li>;
}

export function ChatColumn({ versions, run, summaries, busy, onSend, onChooseBudget, onRetry }: ChatColumnProps) {
  const endRef = useRef<HTMLLIElement>(null);
  const last = versions[versions.length - 1];
  // A finished run whose version is already loaded is shown from the saved version instead.
  const liveRun = run && !(run.status === "done" && versions.some((v) => v.version === run.version)) ? run : null;
  const empty = versions.length === 0 && !liveRun;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [versions.length, liveRun?.steps.length, liveRun?.explanation, liveRun?.status]);

  if (empty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto p-4">
        <div className="text-center">
          <Sparkles aria-hidden className="mx-auto h-8 w-8 text-[var(--kitly-accent)]" />
          <h1 className="mt-2 text-xl font-semibold">What do you need?</h1>
          <p className="mt-1 text-sm text-gray-500">Describe the occasion, budget and deadline. Kitly builds the whole kit.</p>
        </div>
        <Composer big busy={busy} onSend={onSend} placeholder="e.g. My son starts grade 1 on Sep 5, budget 1.5M" />
        <div role="group" aria-label="Examples" className="flex max-w-xl flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.event}
              type="button"
              disabled={busy}
              onClick={() => onSend(ex.text)}
              title={ex.text}
              className="rounded-full border bg-white px-3 py-1 text-xs text-gray-700 hover:border-[var(--kitly-accent)] hover:text-[var(--kitly-accent)] disabled:opacity-50"
            >
              {ex.event}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ol aria-label="Conversation" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {versions.map((v) => {
          if (v.kind === "adjust" || v.kind === "restore") return <SystemLine key={v.version} text={v.userText} />;
          const awaiting = v.status === "awaiting_budget";
          return [
            <UserBubble key={`u${v.version}`} text={v.userText} />,
            <Assistant key={`a${v.version}`}>
              <p className="text-xs text-gray-500">{summaries[v.version] ?? `Planned ${v.plan.items.length} items`}</p>
              {v.explanation && <p className="whitespace-pre-wrap">{v.explanation}</p>}
              <Chips plan={v.plan} />
              {awaiting && v === last && !liveRun && (
                <Clarify text={clarifyQuestion(v.plan.language)} choices={DEFAULT_BUDGET_CHOICES} busy={busy} onChoose={onChooseBudget} />
              )}
              {awaiting && v !== last && <p className="text-xs text-gray-500">Asked for your budget</p>}
            </Assistant>,
          ];
        })}
        {liveRun && (
          <>
            <UserBubble text={runUserText(liveRun.request)} />
            <Assistant>
              {liveRun.status === "running" ? (
                <Timeline steps={liveRun.steps} />
              ) : (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer">{runSummary(liveRun) || "Steps"}</summary>
                  <div className="mt-2">
                    <Timeline steps={liveRun.steps} />
                  </div>
                </details>
              )}
              {liveRun.explanation && <p className="whitespace-pre-wrap">{liveRun.explanation}</p>}
              {liveRun.plan && liveRun.status !== "running" && <Chips plan={liveRun.plan} />}
              {liveRun.clarify && (
                <Clarify text={liveRun.clarify.text} choices={liveRun.clarify.choices} busy={busy} onChoose={onChooseBudget} />
              )}
              {liveRun.error && (
                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">
                  <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">Something went wrong: {liveRun.error.message}</span>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-red-100"
                  >
                    <RotateCcw aria-hidden className="h-3 w-3" />
                    Retry
                  </button>
                </div>
              )}
            </Assistant>
          </>
        )}
        <li ref={endRef} aria-hidden />
      </ol>
      <div className="border-t bg-white p-3">
        <Composer busy={busy} onSend={onSend} placeholder="Change anything: budget, items, deadline…" />
      </div>
    </div>
  );
}

function Composer({
  busy,
  onSend,
  placeholder,
  big = false,
}: {
  busy: boolean;
  onSend(text: string): void;
  placeholder: string;
  big?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };
  return (
    <form onSubmit={submit} className={`flex items-end gap-2 rounded-xl border bg-white p-2 focus-within:border-[var(--kitly-accent)] ${big ? "w-full max-w-xl shadow-sm" : ""}`}>
      <textarea
        aria-label="Message Kitly"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        rows={big ? 3 : 1}
        placeholder={placeholder}
        className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={busy || !text.trim()}
        className="rounded-lg bg-[var(--kitly-accent)] p-2 text-white disabled:opacity-40"
      >
        <Send aria-hidden className="h-4 w-4" />
      </button>
    </form>
  );
}
