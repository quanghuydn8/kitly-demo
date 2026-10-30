// GET/POST /api/persona (CONTRACT §3, D43): the demo buyer persona from cookie kitly_persona (missing ⇒ lan).
// POST { id: "lan" | "guest" } switches it (cookie SameSite=Lax, 1 year). Response: { persona, walletVouchers }.
// New threads copy the cookie's persona; existing threads keep their own (refine / adjust / price use the thread's).
import type { NextRequest } from "next/server";
import { PersonaRequestSchema, type PersonaId, type PersonaResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, json } from "@/server/http/json";
import { ONE_YEAR_SECONDS, PERSONA_COOKIE, personaFrom } from "@/server/http/request";

export const dynamic = "force-dynamic";

async function personaResponse(id: PersonaId): Promise<PersonaResponse> {
  const adapter = getAdapter();
  const [persona, vouchers] = await Promise.all([adapter.getPersona(id), adapter.listVouchers(id)]);
  return { persona, walletVouchers: vouchers.filter((v) => v.ownerPersona === id) };
}

export async function GET(request: NextRequest): Promise<Response> {
  return json(await personaResponse(personaFrom(request)));
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = PersonaRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "bad_request", 'Body must be { id: "lan" | "guest" }');
  const res = json(await personaResponse(body.data.id));
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  res.headers.append(
    "set-cookie",
    `${PERSONA_COOKIE}=${body.data.id}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax; HttpOnly${secure}`,
  );
  return res;
}
