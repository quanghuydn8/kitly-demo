// Taxonomy (DATA.md §1): 60 categories, their event, lucide-react icon name and Tailwind colour pair.
// The planner's category enum and the store's category browse both come from here.
import type { EventType } from "./domain";

export interface EventStyle {
  label: string;
  color: string; // Tailwind 100/600 pair, e.g. "bg-amber-100 text-amber-600"
}

export const EVENTS: Record<Exclude<EventType, "other">, EventStyle> = {
  back_to_school: { label: "Back to school", color: "bg-amber-100 text-amber-600" },
  newborn: { label: "Newborn", color: "bg-pink-100 text-pink-600" },
  first_apartment: { label: "First apartment", color: "bg-sky-100 text-sky-600" },
  camping_trip: { label: "Camping trip", color: "bg-emerald-100 text-emerald-600" },
  home_office: { label: "Home office", color: "bg-indigo-100 text-indigo-600" },
  tet_gifts: { label: "Tet gifts", color: "bg-red-100 text-red-600" },
};

export interface Category {
  id: string;
  label: string;
  event: Exclude<EventType, "other">;
  icon: string; // lucide-react icon name (kebab-case); "package" when DATA.md's icon does not exist
  color: string;
}

type Row = [id: string, label: string, icon: string];

const ROWS: Record<Exclude<EventType, "other">, Row[]> = {
  back_to_school: [
    ["school-backpack", "School backpack", "backpack"],
    ["notebooks", "Notebooks", "notebook"],
    ["pencils-pens", "Pencils & pens", "pencil"],
    ["pencil-case", "Pencil case", "package"],
    ["crayons-paints", "Crayons & paints", "palette"],
    ["water-bottle", "Water bottle", "cup-soda"],
    ["lunch-box", "Lunch box", "sandwich"],
    ["school-shoes", "School shoes", "footprints"],
    ["uniform-shirt", "Uniform shirt", "shirt"],
    ["kids-raincoat", "Kids raincoat", "umbrella"],
    ["book-covers", "Book covers", "book"],
    ["kids-desk-lamp", "Kids desk lamp", "lamp-desk"],
  ],
  newborn: [
    ["diapers", "Diapers", "baby"],
    ["baby-bottles", "Baby bottles", "milk"],
    ["swaddles", "Swaddles", "bed"],
    ["baby-clothes", "Baby clothes", "shirt"],
    ["baby-bathtub", "Baby bathtub", "bath"],
    ["stroller", "Stroller", "baby"],
    ["baby-carrier", "Baby carrier", "heart-handshake"],
    ["breast-pump", "Breast pump", "droplets"],
    ["baby-wipes", "Baby wipes", "sparkles"],
    ["baby-thermometer", "Baby thermometer", "thermometer"],
  ],
  first_apartment: [
    ["rice-cooker", "Rice cooker", "cooking-pot"],
    ["bedding-set", "Bedding set", "bed"],
    ["pillow", "Pillow", "bed-single"],
    ["storage-boxes", "Storage boxes", "archive"],
    ["desk-fan", "Desk fan", "fan"],
    ["cookware-set", "Cookware set", "chef-hat"],
    ["dish-rack", "Dish rack", "utensils"],
    ["hangers", "Hangers", "shirt"],
    ["power-strip", "Power strip", "plug"],
    ["curtains", "Curtains", "panels-top-left"],
  ],
  camping_trip: [
    ["tent", "Tent", "tent"],
    ["sleeping-bag", "Sleeping bag", "bed-double"],
    ["camping-stove", "Camping stove", "flame"],
    ["cooler-box", "Cooler box", "refrigerator"],
    ["headlamp", "Headlamp", "flashlight"],
    ["sunscreen", "Sunscreen", "sun"],
    ["beach-towel", "Beach towel", "waves"],
    ["dry-bag", "Dry bag", "backpack"],
    ["insect-repellent", "Insect repellent", "bug"],
    ["folding-chair", "Folding chair", "armchair"],
  ],
  home_office: [
    ["office-chair", "Office chair", "armchair"],
    ["desk", "Desk", "table"],
    ["monitor", "Monitor", "monitor"],
    ["monitor-arm", "Monitor arm", "move-diagonal"],
    ["keyboard", "Keyboard", "keyboard"],
    ["mouse", "Mouse", "mouse"],
    ["webcam", "Webcam", "webcam"],
    ["laptop-stand", "Laptop stand", "laptop"],
    ["headset", "Headset", "headphones"],
    ["desk-lamp", "Desk lamp", "lamp"],
  ],
  tet_gifts: [
    ["tea-gift-box", "Tea gift box", "coffee"],
    ["dried-fruit-box", "Dried fruit box", "cherry"],
    ["wine", "Wine", "wine"],
    ["bird-nest-gift", "Bird's nest gift", "gift"],
    ["cookie-tin", "Cookie tin", "cookie"],
    ["red-envelopes", "Red envelopes", "mail"],
    ["gift-basket", "Gift basket", "shopping-basket"],
    ["coffee-gift-set", "Coffee gift set", "coffee"],
  ],
};

export const CATEGORIES: Category[] = (Object.keys(ROWS) as (keyof typeof ROWS)[]).flatMap((event) =>
  ROWS[event].map(([id, label, icon]) => ({ id, label, event, icon, color: EVENTS[event].color })),
);

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export function categoryById(id: string | null | undefined): Category | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Canonical tags (DATA.md §1): the only tags planner items and products may carry. */
export const CANONICAL_TAGS = [
  "anti-hunchback",
  "lightweight",
  "waterproof",
  "grade-1",
  "kids",
  "bpa-free",
  "insulated",
  "leak-proof",
  "non-slip",
  "organic-cotton",
  "newborn-0-3m",
  "foldable",
  "compact",
  "quiet",
  "energy-saving",
  "ergonomic",
  "adjustable",
  "wireless",
  "noise-cancelling",
  "uv-protection",
  "reef-safe",
  "2-person",
  "4-person",
  "gift-wrapped",
  "premium",
  "budget",
  "eco-friendly",
  "anti-blue-light",
  "backpack-cover",
] as const;
export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

/** Context tags are never must-have: the planner moves them to niceToHaveTags (PRD Planner rules). */
export const CONTEXT_TAGS: CanonicalTag[] = [
  "grade-1",
  "kids",
  "newborn-0-3m",
  "budget",
  "premium",
  "gift-wrapped",
  "eco-friendly",
];
