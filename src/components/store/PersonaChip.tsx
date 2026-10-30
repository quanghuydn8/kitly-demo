"use client";
// Header persona chip (T17, D43): "👤 Lan · Cau Giay, Hanoi · 2 vouchers" / "👤 Guest"; click ⇒ Lan / Guest menu
// ⇒ POST /api/persona. Inside a kit the menu notes that the switch applies to new kits (a thread keeps its persona).
import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { PersonaId, PersonaResponse } from "@/contract";
import { personaChipLabel } from "@/lib/client/persona";
import { usePersona } from "@/lib/client/persona-store";

const CHOICES: { id: PersonaId; label: string }[] = [
  { id: "lan", label: "Lan" },
  { id: "guest", label: "Guest" },
];

export function PersonaChipView({
  data,
  onSwitch,
  inKit = false,
}: {
  data: PersonaResponse | null;
  onSwitch(id: PersonaId): void;
  inKit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-white/15 px-2.5 py-0.5 hover:bg-white/25"
      >
        {personaChipLabel(data)}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border bg-white p-1 text-sm text-gray-800 shadow-lg">
            <div role="menu" aria-label="Shop as">
              {CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={data.persona.id === c.id}
                  onClick={() => {
                    setOpen(false);
                    if (data.persona.id !== c.id) onSwitch(c.id);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-gray-100"
                >
                  {c.label}
                  {data.persona.id === c.id && <Check aria-hidden className="h-4 w-4 text-[var(--kitly-accent)]" />}
                </button>
              ))}
            </div>
            {inKit && (
              <div className="mt-1 border-t px-2 pb-1 pt-1.5 text-xs text-gray-500">
                <p>Applies to new kits</p>
                <Link href="/kit/new" onClick={() => setOpen(false)} className="font-medium text-[var(--kitly-accent)] hover:underline">
                  + New kit
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Connected chip: renders nothing outside a <PersonaProvider>. */
export function PersonaChip({ inKit = false }: { inKit?: boolean }) {
  const persona = usePersona();
  if (!persona) return null;
  return <PersonaChipView data={persona.current} onSwitch={(id) => void persona.switchTo(id).catch(() => {})} inKit={inKit} />;
}
