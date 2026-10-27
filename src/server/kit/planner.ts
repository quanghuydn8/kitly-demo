// Planner (PRD "Planner"): need sentence → KitPlan via the planner model with Structured Outputs.
// The output schema constrains categories to the taxonomy ids (+ null) and tags to the canonical tags, so the
// model cannot invent a category; normalizePlan then makes keys unique and numbers sane.
import { z } from "zod";
import {
  CANONICAL_TAGS,
  CATEGORIES,
  CATEGORY_IDS,
  EVENT_TYPES,
  KitPlanSchema,
  type KitPlan,
} from "@/contract";
import { models, type LLM, type LLMMessage } from "@/server/llm";

const Tag = z.enum(CANONICAL_TAGS);
const Money = z.number().int().nullable();

/** What the model must return. Same field names as KitPlan; dates validated after (no regex in the JSON schema). */
export const PlannerOutputSchema = z.object({
  event: z.enum(EVENT_TYPES),
  language: z.enum(["en", "vi"]),
  budget: Money,
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
      maxUnitPrice: Money,
    }),
  ),
  assumptions: z.array(z.string()),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export function plannerSystemPrompt(today: string): string {
  const cats = CATEGORIES.map((c) => `${c.id} (${c.label}, ${c.event})`).join("; ");
  return [
    "You are Kitly's planner for an online marketplace. Turn the buyer's need into a shopping plan (KitPlan).",
    `Today is ${today} (DEMO_TODAY). Resolve relative or partial dates against it; "by 25/8" or "by Aug 25" means the next such date on or after today, as YYYY-MM-DD. No deadline mentioned → null.`,
    'Money is integer VND. "1.5M", "1,5 triệu" = 1500000; "400k", "400 nghìn" = 400000. No budget mentioned → null.',
    "Language: Vietnamese input → language vi; otherwise en. Write needLabel and assumptions in that language.",
    "Event: the life event behind the need (back_to_school, newborn, first_apartment, camping_trip, home_office, tet_gifts), else other.",
    "Items: list everything the need typically requires (usually 6–10 items for an event), one item per category, short unique kebab-case keys.",
    "required = true for essentials, false for nice-to-haves.",
    "quantity: pack/set-type items (book covers, pens/pencils, notebooks, crayons, wipes, diapers, …) are quantity 1 = one pack. Use quantity > 1 only when the buyer asks for it or for clothing changes (e.g. 2 uniform shirts). Never more than 3.",
    "Be consistent: the same sentence must give the same plan (same items, keys, quantities and tags). Still list the full kit — for tet_gifts that means 5–8 gift items.",
    "mustHaveTags: only attributes the buyer explicitly demands for that specific item ('the backpack must be anti-hunchback', 'balo phải chống gù'); usually empty. Context of the whole need (e.g. 'Grade 1', 'lớp 1', 'newborn', kids, budget, premium, gift-wrapped, eco-friendly) is never a must-have: put such tags in niceToHaveTags. niceToHaveTags: tags that would make the item better. Use only the allowed tags.",
    "maxUnitPrice: only when the buyer states a per-item price cap, else null. Use the stated number as is: 'under 400k' / 'dưới 400k' → 400000.",
    "needLabel: short buyer-language name that includes the must-have attribute (e.g. 'Anti-hunchback backpack', 'Balo chống gù').",
    "category: use null when no category fits, never force one. Items for needs the store does not cover (e.g. pets) keep category null.",
    "assumptions: short statements of what you assumed (e.g. 'Assumed 1 child').",
    `Categories: ${cats}.`,
  ].join("\n");
}

/** Context tags describe the whole need, not one item: they can never be a must-have (F1). */
export const CONTEXT_TAGS: readonly string[] = [
  "grade-1",
  "kids",
  "newborn-0-3m",
  "budget",
  "premium",
  "gift-wrapped",
  "eco-friendly",
];
export const MAX_QUANTITY = 3;

const kebab = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const posInt = (n: number | null) => (n !== null && Number.isFinite(n) && n > 0 ? Math.round(n) : null);

function validDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Makes a model plan safe for the pipeline: unique keys, quantity ≥ 1, positive money, deduped tags, valid date. */
export function normalizePlan(out: PlannerOutput): KitPlan {
  const seen = new Set<string>();
  const items = out.items.map((it) => {
    let key = kebab(it.key || it.needLabel);
    for (let n = 2; seen.has(key); n++) key = `${kebab(it.key || it.needLabel)}-${n}`;
    seen.add(key);
    const must = [...new Set(it.mustHaveTags)].filter((t) => !CONTEXT_TAGS.includes(t));
    const demotedContext = it.mustHaveTags.filter((t) => CONTEXT_TAGS.includes(t));
    return {
      key,
      needLabel: it.needLabel.trim() || key,
      category: it.category,
      required: it.required,
      quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(it.quantity) || 1)),
      mustHaveTags: must,
      niceToHaveTags: [...new Set([...it.niceToHaveTags, ...demotedContext])].filter((t) => !must.includes(t)),
      maxUnitPrice: posInt(it.maxUnitPrice),
    };
  });
  return KitPlanSchema.parse({
    event: out.event,
    language: out.language,
    budget: posInt(out.budget),
    deadline: validDate(out.deadline),
    items,
    assumptions: out.assumptions,
  });
}

/** One model call; a failure (network, proxy, schema parse) is retried exactly once before it propagates (F2). */
export async function planKit(llm: LLM, query: string, today: string, extra: LLMMessage[] = []): Promise<KitPlan> {
  const messages: LLMMessage[] = [{ role: "system", content: plannerSystemPrompt(today) }, ...extra, { role: "user", content: query }];
  const call = () => llm.structured(models.planner(), PlannerOutputSchema, messages, "kit_plan");
  let out: PlannerOutput;
  try {
    out = await call();
  } catch {
    out = await call();
  }
  return normalizePlan(out);
}
