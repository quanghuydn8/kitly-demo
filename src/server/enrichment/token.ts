// Serverless-safe enrichment proposals (CONTRACT §3): the proposalId IS the proposal —
// base64url(JSON{productId,before,after,createdAt}) + "." + base64url(HMAC-SHA256(body, secret)).
// Nothing is kept in process memory, so preview and apply may land on different instances. Expiry (30 min) is
// wall-clock time (a token lifetime, not business logic, so not DEMO_TODAY).
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PROPOSAL_TTL_MS = 30 * 60_000;
const DEV_SECRET = "kitly-dev-proposal-secret"; // only for KITLY_ADAPTER=memory without any secret (tests, local)

const ListingSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
});
const PayloadSchema = z.object({
  productId: z.string(),
  before: ListingSchema,
  after: ListingSchema,
  createdAt: z.string(),
});
export type ProposalPayload = z.infer<typeof PayloadSchema>;

export function proposalSecret(): string {
  const secret = process.env.KITLY_PROPOSAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  if (process.env.KITLY_ADAPTER === "memory") return DEV_SECRET;
  throw new Error("KITLY_PROPOSAL_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set");
}

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

export function signProposal(payload: ProposalPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

/** The payload when the signature is valid and the token is ≤ 30 min old at `nowMs`, else null. */
export function verifyProposal(token: string, secret: string, nowMs: number): ProposalPayload | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(body, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const payload = PayloadSchema.safeParse(parsed);
  if (!payload.success) return null;
  const age = nowMs - Date.parse(payload.data.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > PROPOSAL_TTL_MS) return null;
  return payload.data;
}
