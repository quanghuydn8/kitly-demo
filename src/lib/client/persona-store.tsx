"use client";
// Persona state for the header chip and the kit screen (T17, D43): loads GET /api/persona once, switches with
// POST /api/persona, and remembers every persona seen in this page view so a thread made as Lan can still show
// "Deliver to Cau Giay, Hanoi" after the buyer switched to Guest (refine / adjust / price use the THREAD's persona).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Persona, PersonaId, PersonaResponse } from "@/contract";
import { personaApi } from "./persona";

interface PersonaState {
  current: PersonaResponse | null;
  known: Partial<Record<PersonaId, Persona>>;
  switchTo(id: PersonaId): Promise<void>;
}

const Ctx = createContext<PersonaState | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo(personaApi, []);
  const [current, setCurrent] = useState<PersonaResponse | null>(null);
  const [known, setKnown] = useState<Partial<Record<PersonaId, Persona>>>({});

  const take = useCallback((r: PersonaResponse) => {
    setCurrent(r);
    setKnown((k) => ({ ...k, [r.persona.id]: r.persona }));
  }, []);

  useEffect(() => {
    api.get().then(take, () => {});
  }, [api, take]);

  const switchTo = useCallback(async (id: PersonaId) => take(await api.set(id)), [api, take]);
  const value = useMemo(() => ({ current, known, switchTo }), [current, known, switchTo]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** null outside a <PersonaProvider> (e.g. component tests). */
export function usePersona(): PersonaState | null {
  return useContext(Ctx);
}
