"use client";
// History sidebar (T11, D30/D31): "+ New kit" then the caller's threads (newest first), active one highlighted.
// Collapsible to an icon rail on desktop; KitScreen also renders it inside the mobile drawer.
import { useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { KitThreadSummary } from "@/contract";
import { relativeTime } from "@/lib/client/kit-text";

export function HistorySidebar({
  threads,
  activeId,
  nowIso,
  collapsible = false,
  onNavigate,
}: {
  threads: KitThreadSummary[];
  activeId: string | null;
  nowIso: string;
  collapsible?: boolean;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsible && collapsed) {
    return (
      <nav aria-label="Kit history" className="flex h-full w-12 flex-col items-center gap-2 border-r bg-white py-3">
        <button type="button" onClick={() => setCollapsed(false)} aria-label="Show history" className="rounded p-1.5 hover:bg-gray-100">
          <PanelLeftOpen aria-hidden className="h-5 w-5 text-gray-600" />
        </button>
        <Link href="/kit/new" aria-label="New kit" className="rounded p-1.5 text-[var(--kitly-accent)] hover:bg-orange-50">
          <Plus aria-hidden className="h-5 w-5" />
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Kit history" className="flex h-full w-60 flex-col border-r bg-white">
      <div className="flex items-center gap-2 p-3">
        <Link
          href="/kit/new"
          onClick={onNavigate}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--kitly-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus aria-hidden className="h-4 w-4" />
          New kit
        </Link>
        {collapsible && (
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Hide history" className="rounded p-1.5 hover:bg-gray-100">
            <PanelLeftClose aria-hidden className="h-5 w-5 text-gray-600" />
          </button>
        )}
      </div>
      <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Your kits</p>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 && <li className="px-2 py-1 text-sm text-gray-400">No kits yet</li>}
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <li key={t.id}>
              <Link
                href={`/kit/t/${t.id}`}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-2 py-2 text-sm ${active ? "bg-orange-50 text-[var(--kitly-accent)]" : "hover:bg-gray-50"}`}
              >
                <span className="line-clamp-2 font-medium leading-snug">{t.title}</span>
                <span className="mt-0.5 block text-xs text-gray-400">
                  {relativeTime(t.updatedAt, nowIso)} · {t.versionCount} {t.versionCount === 1 ? "version" : "versions"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
