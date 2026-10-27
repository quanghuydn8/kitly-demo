// Listing-fix preview drawer: before/after title, added tags (green) vs kept tags (grey), added attributes,
// appended description, evidence, and "Old keywords still match ✓/✗". Apply → parent calls the apply endpoint.
import { Quote, X } from "lucide-react";
import type { EnrichmentPreviewResponse } from "@/contract/types";

export function FixDrawer({
  preview,
  applying = false,
  error = null,
  onApply,
  onClose,
}: {
  preview: EnrichmentPreviewResponse;
  applying?: boolean;
  error?: string | null;
  onApply: () => void;
  onClose: () => void;
}) {
  const { before, after, added, kept, keywordCheck, evidence } = preview;
  const attrs = Object.entries(added.attributes);
  const allMatch = keywordCheck.every((k) => k.stillMatches);
  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-black/30"
      role="dialog"
      aria-label="Preview listing fix"
    >
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl" data-testid="fix-drawer">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="font-semibold text-gray-800">Preview listing fix</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded p-1 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Title</h3>
            <div className="mt-1 rounded-lg bg-gray-50 p-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase">Before</div>
              <div className="text-gray-700" data-testid="title-before">
                {before.title}
              </div>
            </div>
            <div className="mt-1.5 rounded-lg bg-emerald-50 p-2">
              <div className="text-[10px] font-semibold text-emerald-600 uppercase">After</div>
              <div className="text-gray-800" data-testid="title-after">
                {kept.title}
                {after.title.length > kept.title.length && (
                  <span className="font-medium text-emerald-700">{after.title.slice(kept.title.length)}</span>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Tags</h3>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {added.tags.map((t) => (
                <li
                  key={t}
                  data-testid="added-tag"
                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                >
                  {`+ ${t}`}
                </li>
              ))}
              {kept.tags.map((t) => (
                <li
                  key={t}
                  data-testid="kept-tag"
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                >
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-gray-400">Green = added, grey = kept. Nothing is removed.</p>
          </section>

          {attrs.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Added attributes
              </h3>
              <ul className="mt-1 space-y-0.5">
                {attrs.map(([k, v]) => (
                  <li key={k} className="text-emerald-700">{`${k}: ${v}`}</li>
                ))}
              </ul>
            </section>
          )}

          {added.descriptionAppend && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Appended to description
              </h3>
              <p className="mt-1 rounded-lg border-l-4 border-emerald-300 bg-emerald-50 p-2 text-gray-700">
                {added.descriptionAppend}
              </p>
            </section>
          )}

          {evidence && (
            <section className="flex gap-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-800">
              <Quote className="h-4 w-4 shrink-0" />
              <span>{`Evidence from your listing: “${evidence}”`}</span>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {`Old keywords still match ${allMatch ? "✓" : "✗"}`}
            </h3>
            <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {keywordCheck.map((k) =>
                k.stillMatches ? (
                  <li
                    key={k.keyword}
                    data-testid="keyword-ok"
                    className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                  >
                    {`✓ ${k.keyword}`}
                  </li>
                ) : (
                  <li
                    key={k.keyword}
                    data-testid="keyword-lost"
                    className="rounded bg-red-50 px-1.5 py-0.5 text-red-700"
                  >
                    {`✗ ${k.keyword}`}
                  </li>
                ),
              )}
            </ul>
          </section>
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applying}
              className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {applying ? "Applying…" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
