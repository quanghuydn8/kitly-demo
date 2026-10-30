"use client";
// Chat column (T11, D30): one user bubble + one assistant message per kit version, a system line for adjust/restore
// versions, the live run (timeline → collapsed summary, explanation, assumption chips, clarify choices, error +
// Retry) and the composer. Presentational: KitScreen owns the data and the requests.
// T15: a "Removed: X" system line carries Undo (restore_item); the latest version's assumption chips are editable
// and send `"<old>" is wrong: <new>` through onSend (the composer path → LLM refine).
// T17 (D41/D42): every assistant message (new kit, refine, answer) ends with its follow-up question + suggestion pills;
// only the latest turn's pills are clickable. A swap pill → onFollowUpSwap (price, no AI, KitScreen adds a local
// "⚙ Switched … · Undo" turn); any other pill → onSend (refine). Answer messages interleave with versions by createdAt.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, RotateCcw, Send, Sparkles } from "lucide-react";
import type { FollowUp, KitMessage, KitPlan, KitVersion } from "@/contract";
import { runSummary, runUserText, type RunState } from "@/lib/client/kit-run";
import { assumptionCorrection, undoableRemoval } from "@/lib/client/kit-edits";
import { chatTurns, type LocalTurn } from "@/lib/client/kit-chat";
import { budgetChoiceLabel, clarifyQuestion, DEFAULT_BUDGET_CHOICES, diffChips } from "@/lib/client/kit-text";
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
  /** Undo on a "Removed: X" line → adjust restore_item. */
  onRestoreItem?(itemKey: string): void;
  /** Answer-only turns (D42), interleaved with versions by createdAt. */
  messages?: KitMessage[];
  /** Follow-up swaps made in this page view. */
  localTurns?: LocalTurn[];
  /** A follow-up pill with a swap action: re-price with the pick (no AI). */
  onFollowUpSwap?(text: string, action: NonNullable<FollowUp["suggestions"][number]["action"]>): void;
  /** Undo on a local "⚙ Switched …" line. */
  onUndoLocal?(id: string): void;
}

/** The follow-up question + its suggestion pills; `active` = the latest turn's, the only clickable ones. */
function FollowUpBlock({
  followUp,
  active,
  busy,
  onSend,
  onSwap,
}: {
  followUp: FollowUp;
  active: boolean;
  busy: boolean;
  onSend(text: string): void;
  onSwap?: ChatColumnProps["onFollowUpSwap"];
}) {
  return (
    <div className="space-y-1.5 border-t pt-2">
      <p className="font-medium text-gray-900">{followUp.question}</p>
      <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-1.5">
        {followUp.suggestions.map((s) => (
          <button
            key={s.text}
            type="button"
            disabled={!active || busy}
            onClick={() => (s.action?.type === "swap" && onSwap ? onSwap(s.text, s.action) : onSend(s.text))}
            className="rounded-full border border-[var(--kitly-accent)] px-3 py-1 text-xs font-medium text-[var(--kitly-accent)] hover:bg-orange-50 disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
          >
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
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

const CHIP = "rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-800";

/** Assumption chips; with `onCorrect` a click opens a small input prefilled with the chip, Enter sends the correction. */
function Chips({ plan, busy, onCorrect }: { plan: KitPlan; busy?: boolean; onCorrect?(text: string): void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  if (plan.assumptions.length === 0) return null;
  const onKey = (e: KeyboardEvent<HTMLInputElement>, a: string) => {
    if (e.key === "Escape") setEditing(null);
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const t = text.trim();
    if (t && t !== a && onCorrect) onCorrect(assumptionCorrection(a, t));
    setEditing(null);
  };
  return (
    <ul aria-label="Assumptions" className="flex flex-wrap gap-1.5">
      {plan.assumptions.map((a) =>
        !onCorrect ? (
          <li key={a} className={CHIP}>
            {a}
          </li>
        ) : editing === a ? (
          <li key={a}>
            <input
              aria-label="Edit assumption"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => onKey(e, a)}
              onBlur={() => setEditing(null)}
              className="w-48 rounded-full border border-[var(--kitly-accent)] px-2.5 py-0.5 text-xs outline-none"
            />
          </li>
        ) : (
          <li key={a}>
            <button
              type="button"
              disabled={busy}
              title="Not right? Click to correct"
              onClick={() => (setEditing(a), setText(a))}
              className={`${CHIP} hover:border-[var(--kitly-accent)] disabled:opacity-60`}
            >
              {a}
            </button>
          </li>
        ),
      )}
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

/** T13: what a refine changed in the plan, as chips above its explanation. */
function DiffChips({ chips }: { chips: string[] }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="What changed" className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          {c}
        </li>
      ))}
    </ul>
  );
}

function SystemLine({ text, onUndo, busy }: { text: string; onUndo?(): void; busy?: boolean }) {
  return (
    <li className="text-center text-xs text-gray-500">
      ⚙ {text}
      {onUndo && (
        <>
          {" · "}
          <button type="button" disabled={busy} onClick={onUndo} className="font-medium text-[var(--kitly-accent)] hover:underline disabled:opacity-50">
            Undo
          </button>
        </>
      )}
    </li>
  );
}

export function ChatColumn({
  versions,
  run,
  summaries,
  busy,
  onSend,
  onChooseBudget,
  onRetry,
  onRestoreItem,
  messages = [],
  localTurns = [],
  onFollowUpSwap,
  onUndoLocal,
}: ChatColumnProps) {
  const endRef = useRef<HTMLLIElement>(null);
  const last = versions[versions.length - 1];
  // Chips are editable on the newest assistant message (adjust/restore versions are system lines without chips).
  const lastAssistant = [...versions].reverse().find((v) => v.kind === "new" || v.kind === "refine");
  // A finished run whose version is already loaded is shown from the saved version instead.
  // An answer run keeps its (unchanged) version number, so it stays shown until the reload brings its message.
  const liveRun = run && !(run.status === "done" && !run.answered && versions.some((v) => v.version === run.version)) ? run : null;
  const turns = chatTurns(versions, messages, localTurns);
  const lastTurn = turns[turns.length - 1];
  const followUpOf = (active: boolean, f: FollowUp | null) =>
    f && <FollowUpBlock followUp={f} active={active} busy={busy} onSend={onSend} onSwap={onFollowUpSwap} />;
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
        {turns.map((t) => {
          const isLast = t === lastTurn && !liveRun;
          if (t.type === "local") {
            const l = t.local;
            return [
              <UserBubble key={`lu${l.id}`} text={l.userText} />,
              <SystemLine
                key={`ls${l.id}`}
                text={l.systemText}
                busy={busy}
                onUndo={l.undoable && onUndoLocal ? () => onUndoLocal(l.id) : undefined}
              />,
            ];
          }
          if (t.type === "message") {
            const m = t.message;
            return [
              <UserBubble key={`mu${m.createdAt}`} text={m.userText} />,
              <Assistant key={`ma${m.createdAt}`}>
                <p className="whitespace-pre-wrap">{m.answer}</p>
                {followUpOf(isLast, m.followUp)}
              </Assistant>,
            ];
          }
          const v = t.version;
          if (v.kind === "adjust" || v.kind === "restore") {
            const undoKey = onRestoreItem ? undoableRemoval(v, last) : null;
            return (
              <SystemLine key={v.version} text={v.userText} busy={busy} onUndo={undoKey ? () => onRestoreItem!(undoKey) : undefined} />
            );
          }
          const awaiting = v.status === "awaiting_budget";
          return [
            <UserBubble key={`u${v.version}`} text={v.userText} />,
            <Assistant key={`a${v.version}`}>
              <p className="text-xs text-gray-500">{summaries[v.version] ?? `Planned ${v.plan.items.length} items`}</p>
              <DiffChips chips={diffChips(v, versions.find((x) => x.version === v.version - 1))} />
              {v.explanation && <p className="whitespace-pre-wrap">{v.explanation}</p>}
              <Chips plan={v.plan} busy={busy} onCorrect={v === lastAssistant && !liveRun ? onSend : undefined} />
              {awaiting && v === last && !liveRun && (
                <Clarify text={clarifyQuestion(v.plan.language)} choices={DEFAULT_BUDGET_CHOICES} busy={busy} onChoose={onChooseBudget} />
              )}
              {awaiting && v !== last && <p className="text-xs text-gray-500">Asked for your budget</p>}
              {followUpOf(isLast, v.followUp)}
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
                  <summary className="cursor-pointer">{liveRun.answered ? "Answered" : runSummary(liveRun) || "Steps"}</summary>
                  <div className="mt-2">
                    <Timeline steps={liveRun.steps} />
                  </div>
                </details>
              )}
              {liveRun.explanation && <p className="whitespace-pre-wrap">{liveRun.explanation}</p>}
              {liveRun.plan && liveRun.status !== "running" && <Chips plan={liveRun.plan} />}
              {liveRun.status === "done" && followUpOf(true, liveRun.followUp)}
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
