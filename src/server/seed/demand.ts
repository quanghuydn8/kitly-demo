// Demand history generator (DATA.md §5): pure code, no LLM, deterministic.
// ~1,500 seed sessions over the 28 days before DEMO_TODAY; the four planted gaps get EXACT distinct-session counts
// for this week / last week. Normal needs only use tags that ≥ 2 in-stock products carry, so they never show up as
// unintended gaps in Seller Insights.
import type { EventType, KitPlan, PlanItem, Product } from "@/contract";
import { CATEGORIES, CONTEXT_TAGS } from "@/contract";
import { addDays } from "@/server/today";
import { countMatches } from "./matched";
import { rng, type Rng } from "./rng";

export interface SeedDemandItem {
  needLabel: string;
  category: string | null;
  tags: string[];
  matchedCount: number;
  budgetHint: number | null;
}
export interface SeedSession {
  id: string;
  query: string;
  event: EventType;
  language: "en" | "vi";
  plan: KitPlan;
  source: "seed";
  createdAt: string;
  items: SeedDemandItem[];
}

export interface ForcedNeed {
  category: string | null;
  tags: string[];
  needLabel: string;
  thisWeek: number;
  lastWeek: number;
  band: [number, number] | null; // budget-hint p25–p75
}

/** DATA.md §5 forced counts (distinct sessions). The null-category row = pet items. */
export const FORCED_NEEDS: ForcedNeed[] = [
  {
    category: "school-backpack",
    tags: ["anti-hunchback"],
    needLabel: "Anti-hunchback backpack",
    thisWeek: 37,
    lastWeek: 21,
    band: [300000, 400000],
  },
  {
    category: "kids-raincoat",
    tags: ["backpack-cover"],
    needLabel: "Raincoat with backpack cover",
    thisWeek: 52,
    lastWeek: 30,
    band: [120000, 180000],
  },
  {
    category: "kids-desk-lamp",
    tags: ["anti-blue-light"],
    needLabel: "Anti-blue-light desk lamp",
    thisWeek: 18,
    lastWeek: 15,
    band: [250000, 400000],
  },
  { category: null, tags: [], needLabel: "Pet items", thisWeek: 9, lastWeek: 4, band: null },
];

/** Tags reserved for the planted gaps: never used by normal demand. */
const GAP_TAGS = new Set(["anti-hunchback", "backpack-cover", "anti-blue-light"]);

type DemoEvent = Exclude<EventType, "other">;
/** Sessions per week, oldest → this week (back_to_school rises ×1.5 into Sep 5). */
const WEEKLY_VOLUME: Record<DemoEvent, [number, number, number, number]> = {
  back_to_school: [120, 140, 150, 225],
  newborn: [58, 62, 60, 60],
  first_apartment: [68, 72, 70, 70],
  camping_trip: [48, 52, 50, 50],
  home_office: [40, 38, 42, 40],
  tet_gifts: [9, 11, 10, 10],
};

const QUERIES: Record<DemoEvent, { text: string; language: "en" | "vi" }[]> = {
  back_to_school: [
    { text: "My kid starts Grade 1, what do I need?", language: "en" },
    { text: "Con tôi vào lớp 1, cần mua gì?", language: "vi" },
    { text: "Back to school shopping for my 7 year old", language: "en" },
    { text: "Chuẩn bị đồ đi học cho bé lớp 2", language: "vi" },
  ],
  newborn: [
    { text: "We're expecting a baby next month", language: "en" },
    { text: "Chuẩn bị đồ sơ sinh cho bé", language: "vi" },
  ],
  first_apartment: [
    { text: "Moving into my first apartment", language: "en" },
    { text: "Mới thuê phòng trọ, cần sắm đồ gì?", language: "vi" },
  ],
  camping_trip: [
    { text: "Camping trip with friends this weekend", language: "en" },
    { text: "Đi cắm trại 2 ngày 1 đêm", language: "vi" },
  ],
  home_office: [
    { text: "Setting up a home office", language: "en" },
    { text: "Làm việc ở nhà, cần setup góc làm việc", language: "vi" },
  ],
  tet_gifts: [
    { text: "Tet gifts for my parents and boss", language: "en" },
    { text: "Quà Tết cho sếp và bố mẹ", language: "vi" },
  ],
};

const PET_LABELS = ["Dog food", "Dog bed", "Dog leash", "Puppy toys", "Pet shampoo"];
const PET_QUERIES = ["I'm adopting a puppy", "Mình sắp nuôi một bé cún"];
const COMBO = ["school-backpack", "water-bottle", "lunch-box"];

const round10k = (n: number) => Math.round(n / 10000) * 10000;

/** Uniform on [p25 − h/2, p75 + h/2] (h = p75 − p25) has exactly that p25–p75. */
function bandHint(r: Rng, [p25, p75]: [number, number]): number {
  const h = p75 - p25;
  return round10k(p25 - h / 2 + r.next() * 2 * h);
}

export function generateDemand(opts: { catalog: Product[]; today: string; seed?: number }): SeedSession[] {
  const { catalog, today } = opts;
  const r = rng(opts.seed ?? 20260905);
  const context = new Set<string>(CONTEXT_TAGS);

  // Per category: the tags normal demand may ask for (≥ 2 in-stock carriers), and a price range for hints.
  const usable = new Map<string, { tags: string[]; min: number; max: number }>();
  for (const c of CATEGORIES) {
    const inStock = catalog.filter((p) => p.category === c.id && p.stock > 0);
    if (inStock.length < 2) continue;
    const tags = [...new Set(inStock.flatMap((p) => p.tags))].filter(
      (t) => !GAP_TAGS.has(t) && !context.has(t) && countMatches(catalog, c.id, [t]) >= 2,
    );
    const prices = inStock.map((p) => p.price);
    usable.set(c.id, { tags, min: Math.min(...prices), max: Math.max(...prices) });
  }

  const item = (category: string): SeedDemandItem => {
    const u = usable.get(category)!;
    const tags = u.tags.length && r.next() < 0.35 ? [r.pick(u.tags)] : [];
    const label = CATEGORIES.find((c) => c.id === category)!.label;
    return {
      needLabel: label,
      category,
      tags,
      matchedCount: countMatches(catalog, category, tags),
      budgetHint: r.next() < 0.6 ? Math.max(10000, round10k(u.min + r.next() * (u.max - u.min))) : null,
    };
  };

  const stamp = (week: number): string => {
    // week 3 = this week (today−6 … today), 2 = last week, …
    const date = addDays(today, -(3 - week) * 7 - r.int(0, 6));
    const hh = String(r.int(1, 14)).padStart(2, "0");
    const mm = String(r.int(0, 59)).padStart(2, "0");
    return `${date}T${hh}:${mm}:${String(r.int(0, 59)).padStart(2, "0")}.000Z`;
  };

  const session = (
    event: EventType,
    q: { text: string; language: "en" | "vi" },
    createdAt: string,
    items: SeedDemandItem[],
  ): SeedSession => ({
    id: r.uuid(),
    query: q.text,
    event,
    language: q.language,
    plan: planOf(event, q.language, items),
    source: "seed",
    createdAt,
    items,
  });

  const sessions: SeedSession[] = [];
  for (const event of Object.keys(WEEKLY_VOLUME) as DemoEvent[]) {
    const cats = CATEGORIES.filter((c) => c.event === event && usable.has(c.id)).map((c) => c.id);
    if (!cats.length) continue;
    WEEKLY_VOLUME[event].forEach((volume, week) => {
      for (let n = 0; n < volume; n++) {
        const size = Math.min(cats.length, r.int(6, 10));
        let chosen: string[] = [];
        const combo = COMBO.filter((c) => cats.includes(c));
        if (event === "back_to_school" && r.next() < 0.75) chosen = [...combo];
        for (const c of r.shuffle(cats)) if (chosen.length < size && !chosen.includes(c)) chosen.push(c);
        sessions.push(session(event, r.pick(QUERIES[event]), stamp(week), chosen.map(item)));
      }
    });
  }

  // Forced needs: exactly N distinct sessions per week carry the need.
  for (const f of FORCED_NEEDS) {
    for (const [week, n] of [
      [3, f.thisWeek],
      [2, f.lastWeek],
    ] as const) {
      if (f.category === null) {
        for (let k = 0; k < n; k++) {
          const labels = r.shuffle(PET_LABELS).slice(0, r.int(1, 3));
          const items = labels.map((needLabel) => ({
            needLabel,
            category: null,
            tags: [],
            matchedCount: 0,
            budgetHint: null,
          }));
          const text = r.pick(PET_QUERIES);
          sessions.push(session("other", { text, language: text.startsWith("I") ? "en" : "vi" }, stamp(week), items));
        }
        continue;
      }
      const pool = r.shuffle(
        sessions.filter((s) => s.event === "back_to_school" && weekOf(s.createdAt, today) === week),
      );
      for (const s of pool.slice(0, n)) {
        const forced: SeedDemandItem = {
          needLabel: f.needLabel,
          category: f.category,
          tags: [...f.tags],
          matchedCount: countMatches(catalog, f.category, f.tags),
          budgetHint: f.band ? bandHint(r, f.band) : null,
        };
        const i = s.items.findIndex((x) => x.category === f.category);
        if (i >= 0) s.items[i] = forced;
        else s.items.push(forced);
        s.plan = planOf(s.event, s.language, s.items);
      }
    }
  }

  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function weekOf(createdAt: string, today: string): number {
  const d = createdAt.slice(0, 10);
  for (let w = 3; w >= 0; w--) if (d >= addDays(today, -(3 - w) * 7 - 6)) return w;
  return -1;
}

function planOf(event: EventType, language: "en" | "vi", items: SeedDemandItem[]): KitPlan {
  const used = new Set<string>();
  const planItems: PlanItem[] = items.map((i) => {
    let key = (i.category ?? i.needLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
    while (used.has(key)) key += "-2";
    used.add(key);
    return {
      key,
      needLabel: i.needLabel,
      category: i.category,
      required: true,
      quantity: 1,
      mustHaveTags: [...i.tags],
      niceToHaveTags: [],
      maxUnitPrice: i.budgetHint,
    };
  });
  return { event, language, budget: null, deadline: null, items: planItems, assumptions: [] };
}
