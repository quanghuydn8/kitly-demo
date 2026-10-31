// Chat history (T17, D42): kit versions and answer-only messages interleaved by createdAt so a reload (F5) shows
// every turn, plus the code-written "⚙ Switched backpack to KidZone Lite" line of a no-AI swap. Pure.
import type { KitMessage, KitVersion } from "@/contract";

/**
 * A chat line made in this page view without a saved turn: a follow-up swap pill re-prices with /api/kit/price
 * (no AI, no version), so the pill text + "⚙ Switched …" live only in the page. `createdAt` (wall clock, like saved turns) places it
 * among saved turns; missing = at the end.
 */
export interface LocalTurn {
  id: string;
  createdAt?: string;
  userText: string;
  systemText: string;
  /** Its Undo still restores the selection from before the switch. */
  undoable: boolean;
}

export type ChatTurn =
  | { type: "version"; version: KitVersion }
  | { type: "message"; message: KitMessage }
  | { type: "local"; local: LocalTurn };

const RANK: Record<ChatTurn["type"], number> = { version: 0, message: 1, local: 2 };

function at(t: ChatTurn): string {
  return t.type === "version" ? t.version.createdAt : t.type === "message" ? t.message.createdAt : (t.local.createdAt ?? "");
}

/**
 * Versions, answer messages and local turns in time order; on equal timestamps a version comes before the message
 * asked after it. Turns without a timestamp keep their order at the end.
 */
export function chatTurns(versions: KitVersion[], messages: KitMessage[], locals: LocalTurn[] = []): ChatTurn[] {
  const turns: ChatTurn[] = [
    ...versions.map((version) => ({ type: "version" as const, version })),
    ...messages.map((message) => ({ type: "message" as const, message })),
    ...locals.map((local) => ({ type: "local" as const, local })),
  ];
  const timed = turns
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => at(t) !== "")
    .sort((a, b) => {
      const x = at(a.t);
      const y = at(b.t);
      if (x !== y) return x < y ? -1 : 1;
      return RANK[a.t.type] - RANK[b.t.type] || a.i - b.i;
    })
    .map(({ t }) => t);
  return [...timed, ...turns.filter((t) => at(t) === "")];
}

/**
 * "Switched backpack to KidZone Lite": the item key in words, and the product title cut before the word that names
 * the item ("KidZone Lite Backpack Grade 1–3" → "KidZone Lite"); the whole title when no word matches.
 */
export function switchedText(itemKey: string, productTitle: string): string {
  const item = itemKey.replace(/-/g, " ").toLowerCase();
  const itemWords = new Set(item.toLowerCase().split(" "));
  const words = productTitle.split(/\s+/);
  const cut = words.findIndex((w, i) => i > 0 && itemWords.has(w.toLowerCase()));
  const name = cut > 0 ? words.slice(0, cut).join(" ") : productTitle;
  return `Switched ${item} to ${name}`;
}
