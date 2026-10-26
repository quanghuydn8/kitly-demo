// Taxonomy from kit/DATA.md §1. The planner's category enum; icons are lucide-react kebab names.
// Colours: Tailwind 100/600 pair per event (bg = light chip, fg = icon/text).

export const EVENT_TYPES = [
  "back_to_school",
  "newborn",
  "first_apartment",
  "camping_trip",
  "home_office",
  "tet_gifts",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_COLORS: Record<EventType, { name: string; bg: string; fg: string }> = {
  back_to_school: { name: "amber", bg: "bg-amber-100", fg: "text-amber-600" },
  newborn: { name: "pink", bg: "bg-pink-100", fg: "text-pink-600" },
  first_apartment: { name: "sky", bg: "bg-sky-100", fg: "text-sky-600" },
  camping_trip: { name: "emerald", bg: "bg-emerald-100", fg: "text-emerald-600" },
  home_office: { name: "indigo", bg: "bg-indigo-100", fg: "text-indigo-600" },
  tet_gifts: { name: "red", bg: "bg-red-100", fg: "text-red-600" },
  other: { name: "gray", bg: "bg-gray-100", fg: "text-gray-600" },
};

export interface Category {
  id: string;
  label: string;
  event: Exclude<EventType, "other">;
  icon: string;
  color: string; // Tailwind colour name of the event, e.g. "amber"
}

type Row = [id: string, label: string, icon: string];
const RAW: Record<Exclude<EventType, "other">, Row[]> = {
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

export const CATEGORIES: Category[] = (Object.keys(RAW) as (keyof typeof RAW)[]).flatMap((event) =>
  RAW[event].map(([id, label, icon]) => ({ id, label, event, icon, color: EVENT_COLORS[event].name })),
);

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

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

export function categoryById(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
