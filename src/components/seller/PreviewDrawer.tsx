// Enrichment preview drawer (T12): before/after title, added tags (green) vs kept tags (grey), added attributes,
// appended description, and the "Old keywords still match ✓/✗" check. Apply sends the signed proposalId.
import { X } from "lucide-react";
import type { EnrichmentPreviewResponse } from "@/contract";

export function PreviewDrawer({
  preview: p,
  busy,
  onApply,
  onClose,
}: {
  preview: EnrichmentPreviewResponse;
  busy: boolean;
  onApply(): void;
  onClose(): void;
}) {
  const attrs = Object.entries(p.added.attributes);
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview fix"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="flex-1 font-semibold text-gray-900">Preview fix</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Title</h3>
            <p className="text-gray-500 line-through decoration-gray-300">{p.before.title}</p>
            <p className="font-medium text-gray-900">{p.after.title}</p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</h3>
            <ul aria-label="Added tags" className="flex flex-wrap gap-1">
              {p.added.tags.map((t) => (
                <li key={t} className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  {t}
                </li>
              ))}
            </ul>
            <ul aria-label="Kept tags" className="flex flex-wrap gap-1">
              {p.kept.tags.map((t) => (
                <li key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {attrs.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Added attributes</h3>
              <ul className="space-y-0.5">
                {attrs.map(([k, v]) => (
                  <li key={k} className="text-green-800">
                    {k}: {v}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.added.descriptionAppend && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Appended to description</h3>
              <p className="rounded bg-green-50 px-2 py-1.5 text-green-900">{p.added.descriptionAppend}</p>
            </section>
          )}

          {p.evidence && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Evidence from your listing</h3>
              <blockquote className="border-l-2 border-blue-300 pl-2 text-xs italic text-gray-600">“{p.evidence}”</blockquote>
            </section>
          )}

          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Old keywords still match</h3>
            <ul aria-label="Old keywords still match" className="space-y-0.5">
              {p.keywordCheck.map((k) => (
                <li key={k.keyword} className={`flex items-center gap-1 ${k.stillMatches ? "text-gray-700" : "text-red-700"}`}>
                  {k.keyword} {k.stillMatches ? "✓" : "✗"}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onApply}
            className="flex-1 rounded-lg bg-[var(--kitly-accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
