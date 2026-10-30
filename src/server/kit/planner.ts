// Planner (PRD "Planner"): need sentence → KitPlan. One structured LLM call (planner model + KITLY_PLANNER_EFFORT),
// categories constrained to the taxonomy enum + null, tags to the canonical list. The prompt asks for the rules; code
// guarantees them after parsing (context tags never must-have, quantity 1..3, deadline valid and ≥ today, unique keys).
// One automatic retry on an invalid output or a network error; the second failure is PlannerError("llm_error").
import { z } from "zod";
import {
  CANONICAL_TAGS,
  CATEGORIES,
  CATEGORY_IDS,
  CONTEXT_TAGS,
  EventTypeSchema,
  type KitPlan,
  type PlanItem,
} from "@/contract";
import { llmModels, type LLMClient, type LLMMessage } from "@/server/llm";
import { addDays } from "@/server/today";

const Tag = z.enum(CANONICAL_TAGS);

/** What the LLM must return (Structured Outputs). Deadline stays a plain string: code validates it. */
export const PlannerOutputSchema = z.object({
  event: EventTypeSchema,
  language: z.enum(["en", "vi"]),
  budget: z.number().int().nullable(),
  deadline: z.string().nullable(),
  items: z.array(
    z.object({
      key: z.string(),
      needLabel: z.string(),
      category: z.enum(CATEGORY_IDS).nullable(),
      required: z.boolean(),
      quantity: z.number().int(),
      mustHaveTags: z.array(Tag),
      niceToHaveTags: z.array(Tag),
      maxUnitPrice: z.number().int().nullable(),
    }),
  ),
  assumptions: z.array(z.string()),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export class PlannerError extends Error {
  code = "llm_error" as const;
  constructor(message: string) {
    super(message);
    this.name = "PlannerError";
  }
}

/** The next Sep 5 (Vietnamese school opening) on/after today. */
export function nextSchoolOpening(today: string): string {
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-09-05`;
  return today <= thisYear ? thisYear : `${year + 1}-09-05`;
}

export function plannerMessages(query: string, today: string): LLMMessage[] {
  const cats = CATEGORIES.map((c) => `${c.id} (${c.label}, ${c.event})`).join("; ");
  const system = [
    "You are Kitly's planner for DemoMart, a Vietnamese marketplace. Turn the buyer's need sentence into a shopping plan (KitPlan).",
    `Today is ${today}. Money is integer VND (1.5M = 1500000, 400k = 400000).`,
    "Language: Vietnamese input → language vi, otherwise en. needLabel and assumptions are written in that language.",
    `Categories (use only these ids): ${cats}.`,
    "Category: use null when no category fits, never force one (e.g. dog food → null). Keep such items in the plan.",
    `Tags (use only these): ${CANONICAL_TAGS.join(", ")}.`,
    "mustHaveTags: only attributes the buyer stated for that exact item (\"the backpack must be anti-hunchback\" → only the backpack gets anti-hunchback). Every other item has mustHaveTags []. Context words (grade 1, kids, newborn, budget, premium, gift-wrapped, eco-friendly) go to niceToHaveTags, never mustHaveTags.",
    "maxUnitPrice: only when the buyer gives a price limit for that item, else null. budget: the total budget the buyer stated, else null (never guess a budget).",
    "Quantity: set/pack items (book covers, pens, pencils, notebooks, crayons, paints, wipes, diapers…) = quantity 1 (one pack). quantity > 1 only when the buyer says so or for clothing worn in rotation (uniform = 2). Never more than 3.",
    "required: true for essentials of the occasion, false for nice-to-have extras.",
    `Deadline (ISO YYYY-MM-DD, on/after ${today}, or null): a date the buyer states. Vietnamese school year opens on Sep 5: for back_to_school without a stated date, deadline = the next Sep 5 on/after today (${nextSchoolOpening(today)}) and add the assumption "By Sep 5 (school opening)". express / hoả tốc / giao nhanh ⇒ deadline = today + 2 days (${addDays(today, 2)}).`,
    "event: back_to_school, newborn, first_apartment, camping_trip, home_office, tet_gifts, or other when none fits.",
    "assumptions: short chips for what you assumed (e.g. \"1 child\", \"Grade 1\").",
    "key: short kebab-case id, unique in the plan (e.g. backpack, water-bottle).",
    "Be consistent: the same sentence must give the same plan, with the usual items for the occasion. Still list the full kit — typically 8–10 items for back_to_school, for tet_gifts 5–8 gift items.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: query },
  ];
}

const isRealDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const CONTEXT = new Set<string>(CONTEXT_TAGS);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
const positiveOrNull = (n: number | null) => (n !== null && n > 0 ? n : null);

/** Code-enforced planner rules (PRD), applied to whatever the LLM returned. */
export function postProcessPlan(raw: PlannerOutput, today: string): KitPlan {
  const used = new Set<string>();
  const items: PlanItem[] = raw.items.map((i) => {
    let key = slug(i.key || i.needLabel);
    for (let n = 2; used.has(key); n++) key = `${slug(i.key || i.needLabel)}-${n}`;
    used.add(key);
    const must = [...new Set(i.mustHaveTags)];
    return {
      key,
      needLabel: i.needLabel.trim() || key,
      category: i.category,
      required: i.required,
      quantity: Math.min(3, Math.max(1, Math.round(i.quantity))),
      mustHaveTags: must.filter((t) => !CONTEXT.has(t)),
      niceToHaveTags: [...new Set([...i.niceToHaveTags, ...must.filter((t) => CONTEXT.has(t))])],
      maxUnitPrice: positiveOrNull(i.maxUnitPrice),
    };
  });
  const deadline = raw.deadline && isRealDate(raw.deadline) && raw.deadline >= today ? raw.deadline : null;
  return {
    event: raw.event,
    language: raw.language,
    budget: positiveOrNull(raw.budget),
    deadline,
    items,
    assumptions: raw.assumptions.map((a) => a.trim()).filter(Boolean),
  };
}

export async function planKit(llm: LLMClient, query: string, opts: { today: string }): Promise<KitPlan> {
  const { planner } = llmModels();
  const messages = plannerMessages(query, opts.today);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.structured(planner.model, PlannerOutputSchema, messages, {
        effort: planner.effort,
        name: "kit_plan",
      });
      return postProcessPlan(raw, opts.today);
    } catch (err) {
      lastError = err;
    }
  }
  throw new PlannerError(`Planner failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
