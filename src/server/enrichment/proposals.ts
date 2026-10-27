// Enrichment proposals (CONTRACT.md preview → apply) as SIGNED, SELF-CONTAINED tokens with a 30-minute TTL.
// Serverless (Vercel) runs preview and apply on different instances, so process memory cannot hold them
// (rehearsal 28/10: Apply always failed on Vercel). proposalId = base64url(payload) "." HMAC-SHA256(payload).
// "Already used" is detected by applyEnrichment (the listing no longer equals `before`).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Product } from "@/contract";

export const PROPOSAL_TTL_MS = 30 * 60 * 1000;

export interface StoredProposal {
  productId: string;
  before: Product;
  after: Product;
  createdAt: number;
}

const g = globalThis as { __kitlyEnrichClock?: (() => number) | null };
// Wall clock for the TTL only (not business dates, so not DEMO_TODAY).
const now = () => (g.__kitlyEnrichClock ?? Date.now)();

/** Server-only signing secret: an explicit one, else a server key that never reaches the browser. */
function secret(): string {
  return (
    process.env.KITLY_PROPOSAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.OPENAI_API_KEY ||
    "kitly-dev-proposal-secret"
  );
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function saveProposal(p: Omit<StoredProposal, "createdAt">): string {
  const payload = Buffer.from(JSON.stringify({ ...p, createdAt: now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The proposal or null (malformed / bad signature / expired). */
export function getProposal(id: string): StoredProposal | null {
  const [payload, sig] = id.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let p: StoredProposal;
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredProposal;
  } catch {
    return null;
  }
  return now() - p.createdAt >= PROPOSAL_TTL_MS ? null : p;
}

/** Tests only: kept for compatibility — there is no process state to clear any more. */
export function resetProposalsForTests(): void {}

/** Tests only: override the TTL clock (null = Date.now). */
export function setEnrichmentClockForTests(clock: (() => number) | null): void {
  g.__kitlyEnrichClock = clock;
}
