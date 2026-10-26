// Streamed explanation text (buyer's language), with a caret while it is still arriving.
import { MessageSquareText } from "lucide-react";

export function ExplanationPanel({ text, streaming }: { text: string; streaming: boolean }) {
  if (!text && !streaming) return null;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Why this kit" data-testid="explanation">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <MessageSquareText className="h-4 w-4 text-[var(--accent)]" /> Why this kit
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-gray-700" aria-live="polite">
        {text}
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gray-400 align-middle" />}
      </p>
    </section>
  );
}
