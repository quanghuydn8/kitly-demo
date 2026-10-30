// Proposal token (CONTRACT §3): base64url(JSON{productId,before,after,createdAt}) + "." + HMAC-SHA256. No process memory.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROPOSAL_TTL_MS, proposalSecret, signProposal, verifyProposal } from "@/server/enrichment/token";

const listing = (title: string) => ({ title, description: "d", tags: ["kids"], attributes: { material: "polyester" } });
const payload = {
  productId: "prod-minhan-backpack",
  before: listing("Old"),
  after: listing("Old | New"),
  createdAt: "2026-10-30T10:00:00.000Z",
};
const T0 = Date.parse(payload.createdAt);

afterEach(() => vi.unstubAllEnvs());

describe("proposal token", () => {
  it("round-trips: verify returns the signed payload", () => {
    const token = signProposal(payload, "s3cret");
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const [body] = token.split(".");
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).toEqual(payload);
    expect(verifyProposal(token, "s3cret", T0 + 60_000)).toEqual(payload);
  });

  it("a tampered body or signature, another secret, or garbage → null", () => {
    const token = signProposal(payload, "s3cret");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, after: listing("Hacked") })).toString("base64url");
    expect(verifyProposal(`${forged}.${sig}`, "s3cret", T0)).toBeNull();
    expect(verifyProposal(`${body}.${sig.slice(0, -2)}xx`, "s3cret", T0)).toBeNull();
    expect(verifyProposal(token, "other", T0)).toBeNull();
    expect(verifyProposal("nope", "s3cret", T0)).toBeNull();
    expect(verifyProposal("", "s3cret", T0)).toBeNull();
  });

  it("expires after 30 minutes", () => {
    const token = signProposal(payload, "s3cret");
    expect(PROPOSAL_TTL_MS).toBe(30 * 60_000);
    expect(verifyProposal(token, "s3cret", T0 + PROPOSAL_TTL_MS)).not.toBeNull();
    expect(verifyProposal(token, "s3cret", T0 + PROPOSAL_TTL_MS + 1)).toBeNull();
  });

  it("secret = KITLY_PROPOSAL_SECRET, else SUPABASE_SERVICE_ROLE_KEY", () => {
    vi.stubEnv("KITLY_PROPOSAL_SECRET", "a");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "b");
    expect(proposalSecret()).toBe("a");
    vi.stubEnv("KITLY_PROPOSAL_SECRET", "");
    expect(proposalSecret()).toBe("b");
  });
});
