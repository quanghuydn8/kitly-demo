// Pending enrichment proposals, in process memory with a 30-minute TTL (CONTRACT.md preview → apply).
// Kept on globalThis so Next dev module reloads do not drop them. A proposal is consumed by apply.
import { randomUUID } from "node:crypto";
import type { Product } from "@/contract";

export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export interface StoredProposal {
  productId: string;
  before: Product;
  after: Product;
  createdAt: number;
}

const g = globalThis as {
  __kitlyProposals?: Map<string, StoredProposal>;
  __kitlyEnrichClock?: (() => number) | null;
};
const store = () => (g.__kitlyProposals ??= new Map());
// Wall clock for the TTL only (not business dates, so not DEMO_TODAY).
const now = () => (g.__kitlyEnrichClock ?? Date.now)();

export function saveProposal(p: Omit<StoredProposal, "createdAt">): string {
  const id = randomUUID();
  const t = now();
  for (const [k, v] of store()) if (t - v.createdAt >= PROPOSAL_TTL_MS) store().delete(k);
  store().set(id, { ...p, createdAt: t });
  return id;
}

/** The live proposal or null (unknown / expired). */
export function getProposal(id: string): StoredProposal | null {
  const p = store().get(id);
  if (!p) return null;
  if (now() - p.createdAt >= PROPOSAL_TTL_MS) {
    store().delete(id);
    return null;
  }
  return p;
}

export function deleteProposal(id: string): void {
  store().delete(id);
}

/** Tests only. */
export function resetProposalsForTests(): void {
  store().clear();
}

/** Tests only: override the TTL clock (null = Date.now). */
export function setEnrichmentClockForTests(clock: (() => number) | null): void {
  g.__kitlyEnrichClock = clock;
}
