// Request helpers shared by middleware and route handlers. Edge-safe (no Node APIs).
import { PersonaIdSchema, type PersonaId } from "@/contract";

export const OWNER_COOKIE = "kitly_uid";
export const PERSONA_COOKIE = "kitly_persona";
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return value || null;
    }
  }
  return null;
}

/** Thread owner = the browser's kitly_uid cookie (set by src/middleware.ts). */
export function ownerFrom(request: Request): string | null {
  return readCookie(request, OWNER_COOKIE);
}

/** Buyer persona from kitly_persona; missing or invalid ⇒ "lan" (D43). */
export function personaFrom(request: Request): PersonaId {
  const parsed = PersonaIdSchema.safeParse(readCookie(request, PERSONA_COOKIE));
  return parsed.success ? parsed.data : "lan";
}
