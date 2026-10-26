// Buyer-facing names of the event shelves (taxonomy EventType → English chrome).
import type { EventType } from "@/contract";

export const EVENT_LABELS: Record<EventType, string> = {
  back_to_school: "Back to school",
  newborn: "Newborn essentials",
  first_apartment: "First apartment",
  camping_trip: "Camping trip",
  home_office: "Home office",
  tet_gifts: "Tết gifts",
  other: "Other",
};
