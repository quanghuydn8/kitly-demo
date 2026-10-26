// Demand history generator (kit/DATA.md §5): ~1,500 seeded sessions over the 28 days before DEMO_TODAY.
// Pure code, deterministic per seed. Template plans per event with noise, then forced needs are written in so the
// this-week / last-week counts are exact. Base items only use tags ≥2 catalog products carry, so the forced needs
// are the only unmet (matchedCount < 2) demand in the seed.
import { CATEGORIES, type EventType } from "@/contract/taxonomy";
import type { DemandItemRow, KitPlan, PlanItem, Product } from "@/contract/types";
import { addDays } from "@/server/today";
import { countMatches } from "./match-count";
import { PRICE_BANDS } from "./world";

export interface SeedSession {
  id: string;
  query: string;
  event: EventType;
  language: "en" | "vi";
  plan: KitPlan;
  source: "seed";
  createdAt: string;
}
export interface SeedDemand {
  sessions: SeedSession[];
  items: DemandItemRow[];
}

export interface ForcedNeed {
  key: string;
  needLabel: string;
  event: EventType;
  category: string | null;
  tags: string[];
  thisWeek: number;
  lastWeek: number;
  band: [number, number] | null; // budget hint p25–p75
}

export const FORCED_NEEDS: ForcedNeed[] = [
  {
    key: "backpack",
    needLabel: "Anti-hunchback backpack",
    event: "back_to_school",
    category: "school-backpack",
    tags: ["anti-hunchback"],
    thisWeek: 37,
    lastWeek: 21,
    band: [300000, 400000],
  },
  {
    key: "raincoat",
    needLabel: "Kids raincoat with backpack cover",
    event: "back_to_school",
    category: "kids-raincoat",
    tags: ["backpack-cover"],
    thisWeek: 52,
    lastWeek: 30,
    band: [120000, 180000],
  },
  {
    key: "desk-lamp",
    needLabel: "Anti-blue-light desk lamp",
    event: "back_to_school",
    category: "kids-desk-lamp",
    tags: ["anti-blue-light"],
    thisWeek: 18,
    lastWeek: 15,
    band: [250000, 400000],
  },
  {
    key: "pet",
    needLabel: "Pet supplies",
    event: "other",
    category: null,
    tags: [],
    thisWeek: 9,
    lastWeek: 4,
    band: null,
  },
];

/** Sessions per week, oldest → newest (the last entry is "this week"). back_to_school rises ×1.5 in August. */
const WEEKLY_VOLUME: Record<Exclude<EventType, "other">, [number, number, number, number]> = {
  back_to_school: [110, 130, 160, 240],
  newborn: [60, 62, 58, 60],
  first_apartment: [72, 68, 70, 70],
  camping_trip: [52, 48, 50, 50],
  home_office: [40, 42, 38, 40],
  tet_gifts: [10, 9, 11, 10],
};

/** Inclusion probability per category in an event's template plan (first entries = core items). */
const TEMPLATE_P: Record<Exclude<EventType, "other">, Record<string, number>> = {
  back_to_school: {
    "school-backpack": 0.93,
    "water-bottle": 0.92,
    "lunch-box": 0.9,
    notebooks: 0.85,
    "pencils-pens": 0.85,
    "pencil-case": 0.6,
    "uniform-shirt": 0.6,
    "school-shoes": 0.5,
    "crayons-paints": 0.5,
    "book-covers": 0.4,
    "kids-raincoat": 0.35,
    "kids-desk-lamp": 0.3,
  },
  newborn: {
    diapers: 0.95,
    "baby-bottles": 0.9,
    swaddles: 0.8,
    "baby-clothes": 0.85,
    "baby-wipes": 0.85,
    "baby-bathtub": 0.6,
    stroller: 0.55,
    "baby-carrier": 0.5,
    "breast-pump": 0.45,
    "baby-thermometer": 0.5,
  },
  first_apartment: {
    "rice-cooker": 0.9,
    "bedding-set": 0.9,
    pillow: 0.85,
    "storage-boxes": 0.7,
    "desk-fan": 0.65,
    "cookware-set": 0.7,
    "dish-rack": 0.6,
    hangers: 0.6,
    "power-strip": 0.55,
    curtains: 0.5,
  },
  camping_trip: {
    tent: 0.95,
    "sleeping-bag": 0.9,
    headlamp: 0.8,
    "camping-stove": 0.7,
    "cooler-box": 0.6,
    "insect-repellent": 0.7,
    sunscreen: 0.65,
    "folding-chair": 0.55,
    "dry-bag": 0.5,
    "beach-towel": 0.45,
  },
  home_office: {
    "office-chair": 0.9,
    desk: 0.85,
    monitor: 0.75,
    keyboard: 0.75,
    mouse: 0.75,
    "laptop-stand": 0.6,
    webcam: 0.55,
    headset: 0.55,
    "desk-lamp": 0.5,
    "monitor-arm": 0.45,
  },
  tet_gifts: {
    "tea-gift-box": 0.85,
    "gift-basket": 0.8,
    "dried-fruit-box": 0.75,
    "cookie-tin": 0.75,
    "red-envelopes": 0.8,
    wine: 0.6,
    "coffee-gift-set": 0.6,
    "bird-nest-gift": 0.5,
  },
};

const SESSION_BUDGET: Record<EventType, [number, number]> = {
  back_to_school: [800000, 3000000],
  newborn: [3000000, 15000000],
  first_apartment: [3000000, 10000000],
  camping_trip: [2000000, 8000000],
  home_office: [5000000, 20000000],
  tet_gifts: [1500000, 6000000],
  other: [500000, 3000000],
};

const QUERIES: Record<EventType, { en: string[]; vi: string[] }> = {
  back_to_school: {
    en: [
      "My kid starts Grade 1 next month, what do we need?",
      "Back to school shopping for my 7 year old",
      "Everything for first grade, budget 2M",
    ],
    vi: [
      "Con tôi chuẩn bị vào lớp 1, cần mua gì?",
      "Đồ dùng học tập cho bé lớp 2",
      "Chuẩn bị năm học mới cho con",
    ],
  },
  newborn: {
    en: [
      "We are expecting a baby in October",
      "Newborn essentials checklist",
      "Baby shower gift set for a newborn",
    ],
    vi: ["Chuẩn bị đồ sơ sinh cho bé", "Sắp sinh em bé cần mua gì?"],
  },
  first_apartment: {
    en: [
      "Moving into my first apartment",
      "Setting up a studio flat on a budget",
      "First rented room essentials",
    ],
    vi: ["Mới thuê phòng trọ cần mua gì?", "Dọn về căn hộ đầu tiên"],
  },
  camping_trip: {
    en: ["Weekend camping trip for 4 people", "First time camping by the lake", "Beach camping in Vung Tau"],
    vi: ["Đi cắm trại cuối tuần 4 người", "Cắm trại bãi biển cần mang gì?"],
  },
  home_office: {
    en: [
      "Setting up a home office for remote work",
      "Ergonomic work-from-home desk setup",
      "Home office upgrade",
    ],
    vi: ["Làm việc tại nhà cần setup bàn làm việc", "Góc làm việc tại nhà"],
  },
  tet_gifts: {
    en: ["Tet gifts for my parents and boss", "Lunar New Year gift baskets"],
    vi: ["Quà Tết cho bố mẹ và sếp", "Giỏ quà Tết sang trọng"],
  },
  other: { en: ["I'm adopting a puppy, what do I need?"], vi: ["Tôi sắp nhận nuôi một chú cún"] },
};

const PET_LABELS = ["Puppy food", "Dog bed", "Leash and collar"];

// ---------- deterministic randomness ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
function shuffle<T>(r: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function uuid(r: Rng): string {
  const h = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[Math.floor(r() * 4)]}${h.slice(17, 20)}-${h.slice(20)}`;
}
const pad = (n: number) => String(n).padStart(2, "0");
const round = (n: number, step: number) => Math.round(n / step) * step;

/** Evenly spread values whose p25/p75 land on the band, shuffled. */
function bandHints(r: Rng, n: number, [p25, p75]: [number, number]): number[] {
  const lo = p25 - (p75 - p25) / 2;
  const span = 2 * (p75 - p25);
  return shuffle(
    r,
    Array.from({ length: n }, (_, i) => round(lo + (span * (i + 0.5)) / n, 5000)),
  );
}

// ---------- generator ----------
interface Draft {
  session: SeedSession;
  hints: (number | null)[]; // parallel to session.plan.items
}

const labelOf = (category: string) => CATEGORIES.find((c) => c.id === category)!.label;
const MAX_ITEMS = 10;

export function generateDemand(opts: { products: Product[]; today: string; seed?: number }): SeedDemand {
  const r = mulberry32(opts.seed ?? 42);
  const { products, today } = opts;
  const weekStart = (w: number) => addDays(today, -27 + 7 * w); // w = 0..3, 3 = this week

  // Tags ≥2 catalog products carry, per category: base demand stays "met".
  const safeTags = new Map<string, string[]>();
  for (const c of CATEGORIES) {
    const inCat = products.filter((p) => p.category === c.id);
    const tags = [...new Set(inCat.flatMap((p) => p.tags))].sort();
    safeTags.set(
      c.id,
      tags.filter((t) => countMatches(products, c.id, [t]) >= 2),
    );
  }

  const timestamp = (w: number) => {
    const day = addDays(weekStart(w), int(r, 0, 6));
    return `${day}T${pad(int(r, 7, 22))}:${pad(int(r, 0, 59))}:${pad(int(r, 0, 59))}.000Z`;
  };

  const baseItem = (category: string): { item: PlanItem; hint: number | null } => {
    const tags = r() < 0.55 ? [] : [pick(r, safeTags.get(category) ?? [])].filter(Boolean);
    const band = PRICE_BANDS[category] ?? [50000, 1000000];
    return {
      item: {
        key: category,
        needLabel: labelOf(category),
        category,
        required: r() < 0.7,
        quantity: 1,
        mustHaveTags: tags,
        niceToHaveTags: [],
        maxUnitPrice: null,
      },
      hint: r() < 0.7 ? round(band[0] + r() * (band[1] - band[0]), 10000) : null,
    };
  };

  const newSession = (
    event: EventType,
    w: number,
    entries: { item: PlanItem; hint: number | null }[],
  ): Draft => {
    const language = r() < 0.7 ? "en" : "vi";
    const [blo, bhi] = SESSION_BUDGET[event];
    return {
      session: {
        id: uuid(r),
        query: pick(r, QUERIES[event][language]),
        event,
        language,
        plan: {
          event,
          language,
          budget: r() < 0.75 ? round(blo + r() * (bhi - blo), 100000) : null,
          deadline: r() < 0.4 ? addDays(today, int(r, 3, 14)) : null,
          items: entries.map((e) => e.item),
          assumptions: [],
        },
        source: "seed",
        createdAt: timestamp(w),
      },
      hints: entries.map((e) => e.hint),
    };
  };

  const drafts: Draft[] = [];
  for (const event of Object.keys(WEEKLY_VOLUME) as (keyof typeof WEEKLY_VOLUME)[]) {
    const pool = Object.entries(TEMPLATE_P[event]); // ordered by priority
    for (let w = 0; w < 4; w++) {
      for (let n = 0; n < WEEKLY_VOLUME[event][w]; n++) {
        let cats = pool.filter(([, p]) => r() < p).map(([c]) => c);
        for (const [c] of pool) if (cats.length < 6 && !cats.includes(c)) cats.push(c);
        cats = pool
          .map(([c]) => c)
          .filter((c) => cats.includes(c))
          .slice(0, MAX_ITEMS - 1); // keep room for a forced item
        drafts.push(newSession(event, w, cats.map(baseItem)));
      }
    }
  }

  // Forced needs: exact counts in this week (w=3) and last week (w=2).
  for (const need of FORCED_NEEDS) {
    for (const [w, count] of [
      [3, need.thisWeek],
      [2, need.lastWeek],
    ] as const) {
      if (need.category === null) {
        // Pet sessions: event "other", 2–3 off-taxonomy items each.
        const sizes = count % 3 === 0 ? Array(count / 3).fill(3) : Array(count / 2).fill(2);
        for (const size of sizes) {
          const entries = PET_LABELS.slice(0, size).map((label) => ({
            item: {
              key: label.toLowerCase().replace(/\W+/g, "-"),
              needLabel: label,
              category: null,
              required: true,
              quantity: 1,
              mustHaveTags: [],
              niceToHaveTags: [],
              maxUnitPrice: null,
            },
            hint: null,
          }));
          drafts.push(newSession("other", w, entries));
        }
        continue;
      }
      const inWeek = drafts.filter(
        (d) =>
          d.session.event === need.event &&
          d.session.createdAt >= weekStart(w) &&
          d.session.createdAt < addDays(weekStart(w), 7),
      );
      const chosen = shuffle(r, inWeek).slice(0, count);
      if (chosen.length < count) throw new Error(`not enough ${need.event} sessions for ${need.needLabel}`);
      const hints = bandHints(r, count, need.band!);
      chosen.forEach((d, i) => {
        const items = d.session.plan.items;
        const forced: PlanItem = {
          key: need.key,
          needLabel: need.needLabel,
          category: need.category,
          required: true,
          quantity: 1,
          mustHaveTags: [...need.tags],
          niceToHaveTags: [],
          maxUnitPrice: hints[i],
        };
        const at = items.findIndex((it) => it.category === need.category);
        if (at >= 0) {
          items[at] = forced;
          d.hints[at] = hints[i];
        } else if (items.length < MAX_ITEMS) {
          items.push(forced);
          d.hints.push(hints[i]);
        } else {
          // Full plan: replace the lowest-priority item that is neither core (combo) nor another forced need.
          const core = Object.keys(TEMPLATE_P[need.event as keyof typeof TEMPLATE_P]).slice(0, 3);
          const forcedKeys = FORCED_NEEDS.map((f) => f.key);
          const j = items.findLastIndex(
            (it) => !forcedKeys.includes(it.key) && !core.includes(it.category ?? ""),
          );
          items[j] = forced;
          d.hints[j] = hints[i];
        }
      });
    }
  }

  drafts.sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt));
  const sessions = drafts.map((d) => d.session);
  const items: DemandItemRow[] = drafts.flatMap(({ session: s, hints }) =>
    s.plan.items.map((it, i) => ({
      sessionId: s.id,
      createdAt: s.createdAt,
      event: s.event,
      needLabel: it.needLabel,
      category: it.category,
      tags: [...it.mustHaveTags],
      matchedCount: countMatches(products, it.category, it.mustHaveTags),
      budgetHint: hints[i],
    })),
  );
  return { sessions, items };
}
