// Buyer persona client (T17, D39/D43): GET/POST /api/persona, the header chip text and the kit's "Deliver to" line.
// NEXT_PUBLIC_KITLY_MOCK=1 answers from the fixtures (personas.json + the persona's wallet vouchers) and keeps the
// choice in localStorage, like the mock kit API.
import personasJson from "@/contract/fixtures/personas.json";
import vouchersJson from "@/contract/fixtures/vouchers.json";
import {
  GUEST_PERSONA,
  PersonaResponseSchema,
  PersonaSchema,
  VoucherSchema,
  type Persona,
  type PersonaId,
  type PersonaResponse,
} from "@/contract";
import { KITLY_MOCK } from "./kit-api";

/** "👤 Lan · Cau Giay, Hanoi · 2 vouchers" / "👤 Guest". */
export function personaChipLabel(r: PersonaResponse): string {
  const parts = [`👤 ${r.persona.name}`];
  const where = deliverTo(r.persona);
  if (where) parts.push(where);
  const n = r.walletVouchers.length;
  if (n > 0) parts.push(`${n} ${n === 1 ? "voucher" : "vouchers"}`);
  return parts.join(" · ");
}

/** "Cau Giay, Hanoi", or null for a persona without an address (Guest). Display only (D44). */
export function deliverTo(persona: Persona | null | undefined): string | null {
  return persona?.address ? `${persona.address.district}, ${persona.address.city}` : null;
}

export interface PersonaApi {
  get(): Promise<PersonaResponse>;
  set(id: PersonaId): Promise<PersonaResponse>;
}

async function parse(res: Response): Promise<PersonaResponse> {
  if (!res.ok) throw new Error(`Persona request failed (${res.status})`);
  return PersonaResponseSchema.parse(await res.json());
}

const liveApi: PersonaApi = {
  async get() {
    return parse(await fetch("/api/persona", { cache: "no-store" }));
  },
  async set(id) {
    return parse(
      await fetch("/api/persona", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }),
    );
  },
};

const MOCK_KEY = "kitly_mock_persona";

function mockResponse(id: PersonaId): PersonaResponse {
  const persona = id === "guest" ? GUEST_PERSONA : PersonaSchema.parse(personasJson.find((p) => p.id === id));
  const walletVouchers = id === "guest" ? [] : VoucherSchema.array().parse(vouchersJson).filter((v) => v.ownerPersona === id);
  return { persona, walletVouchers };
}

const mockApi: PersonaApi = {
  async get() {
    let id: PersonaId = "lan";
    try {
      if (window.localStorage.getItem(MOCK_KEY) === "guest") id = "guest";
    } catch {
      // storage blocked: default persona
    }
    return mockResponse(id);
  },
  async set(id) {
    try {
      window.localStorage.setItem(MOCK_KEY, id);
    } catch {
      // storage blocked: the switch lasts for this page view
    }
    return mockResponse(id);
  },
};

export function personaApi(): PersonaApi {
  return KITLY_MOCK ? mockApi : liveApi;
}
