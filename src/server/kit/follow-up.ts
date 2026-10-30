// Follow-up question (D41, CONTRACT FollowUp, seam S10): ONE structured fast-model call writes a question + 2–3 quick
// replies from the code-built SalesContext; a code GUARD rejects any number (≥ 1,000), voucher code or date that is
// not in the context / option totals, a question without "?", or fewer than 2 usable suggestions, and falls back to the
// code template of the first hook (vi/en). LLM error or > 8 s ⇒ template too. Never throws.
// A suggestion the model ties to a cart interest (`interestItemKey`) gets the swap action from code.
import { z } from "zod";
import type { BasketOption, FollowUp, KitPlan, SalesContext, Voucher } from "@/contract";
import { llmModels, type LLMClient, type LLMMessage } from "@/server/llm";
import { formatVnd } from "@/server/optimizer";
import { shortDate } from "@/server/optimizer/labels";

export const FOLLOWUP_TIMEOUT_MS = 8_000;
const MAX_SUGGESTION = 40;

export const FollowUpOutputSchema = z.object({
  question: z.string(),
  suggestions: z.array(z.object({ text: z.string(), interestItemKey: z.string().nullable() })),
});
export type FollowUpOutput = z.infer<typeof FollowUpOutputSchema>;

export interface FollowUpInput {
  plan: KitPlan;
  /** The chosen (Balanced) option of the current version; null while awaiting a budget. */
  option: BasketOption | null;
  context: SalesContext;
  /** The buyer's last message (need sentence, refine message or question). */
  lastMessage: string;
  /** Every voucher the buyer could see (public + wallet): lets the guard recognise known codes like FREESHIP. */
  vouchers?: Voucher[];
}

// ---------- prompt ----------

export function followUpMessages(input: FollowUpInput): LLMMessage[] {
  const lang = input.plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You write the follow-up question that ends a shopping assistant's answer, in ${lang}.`,
    'Write exactly ONE question; it must end with "?". Keep it under 30 words.',
    "Prefer the first hook in `hooks` when it is relevant (hooks are in priority order): deadline_soon = few days left before the deadline (offer express delivery); cart_interest = a product the buyer left in the cart fits an item; voucher_expiring = a wallet voucher expires soon; freeship_gap = a little more at a shop gives free shipping; favorite_shop_promo = a favourite shop has a voucher.",
    "Use ONLY facts from the JSON context and the kit totals: every number, price, voucher code, date and product name must come from there. Never invent any. Money format: 440.000₫.",
    `Then write 2–3 short suggestions (at most ${MAX_SUGGESTION} characters each), written as what the buyer would type next.`,
    "interestItemKey: the itemKey of a cart interest when the suggestion means switching to that cart product, else null. Clicking it switches the product, so its text must say switch (e.g. \"Switch to KidZone Lite\" / \"Đổi sang KidZone Lite\"), never just view.",
    "The kit is already built from the buyer's message (see Kit lines below): never offer to search for or find products, and never repeat the buyer's request back as a question. Ask about one next step for THIS kit.",
  ].join("\n");
  const o = input.option;
  const totals = o
    ? `Kit totals: total ${formatVnd(o.grandTotal)}, items ${formatVnd(o.itemsTotal)}, shipping ${formatVnd(o.shippingTotal)}, discounts ${formatVnd(o.discountTotal)}; budget ${input.plan.budget === null ? "none" : formatVnd(input.plan.budget)}`
    : "Kit totals: none yet (waiting for a budget)";
  // what the kit holds right now, so the question never offers to "find" something the kit already has (rehearsal 2)
  const lines = o ? o.lines.map((l) => `${l.product.title} (${l.itemKey})`).join("; ") || "none" : "none yet";
  const missing = o ? o.noMatch.map((n) => n.needLabel).join("; ") || "none" : "none yet";
  const user = [
    `Buyer's last message: ${input.lastMessage}`,
    `Context (JSON): ${JSON.stringify(input.context)}`,
    totals,
    `Kit lines: ${lines}`,
    `No exact match in the store: ${missing}`,
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ---------- guard ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CODE = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g;
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi");
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, "gi");
const VI_DATE = /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})/gi;
const SLASH = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g;
const NUMBER = /(\d[\d.,]*\d|\d)\s?(k|nghìn|ngàn|triệu|tr|m)?(?!\p{L})/giu;

/** Every amount ≥ 1,000 written in the text: "440.000₫", "440,000", "440k", "1.5M", "1,5 triệu". */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const [, digits, suffix] = m;
    let n: number;
    if (suffix) {
      const mult = /^k|^ng/i.test(suffix) ? 1_000 : 1_000_000;
      n = Math.round(Number.parseFloat(digits.replace(",", ".")) * mult);
    } else {
      n = Number(digits.replace(/[.,]/g, ""));
    }
    if (Number.isFinite(n) && n >= 1_000) out.push(n);
  }
  return out;
}

/** Month-day pairs ("09-05") of the dates written in the text; strips them from the text. */
function datesIn(text: string): { rest: string; dates: string[] } {
  const dates: string[] = [];
  const md = (m: number, d: number) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const rest = text
    .replace(ISO, (_, y, m, d) => (dates.push(`${y}-${m}-${d}`), " "))
    .replace(MONTH_DAY, (_, mon, d) => (dates.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, Number(d))), " "))
    .replace(DAY_MONTH, (_, d, mon) => (dates.push(md(MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1, Number(d))), " "))
    .replace(VI_DATE, (_, d, m) => (dates.push(md(Number(m), Number(d))), " "))
    .replace(SLASH, (_, d, m) => (dates.push(md(Number(m), Number(d))), " "));
  return { rest, dates };
}

function allowedFacts(input: FollowUpInput) {
  const { context: c, option: o, plan } = input;
  const numbers = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (typeof n === "number" && n >= 1_000) numbers.add(n);
  };
  for (const i of c.interests) {
    add(i.price);
    add(i.priceAfterVoucher);
    add(i.overMaxPriceBy);
    add(i.price - i.priceAfterVoucher);
  }
  for (const g of c.freeshipGaps) add(g.missing);
  for (const label of [...c.walletVouchers.map((v) => v.label), ...c.favoriteShopPromos.map((p) => p.label)]) {
    for (const n of amountsIn(label)) add(n);
  }
  // the buyer's own numbers (budget, per-item max price) are facts too: "under 400k" quotes the buyer, it is not invented
  add(plan.budget);
  for (const item of plan.items) add(item.maxUnitPrice);
  if (o) {
    for (const n of [o.itemsTotal, o.shippingTotal, o.discountTotal, o.grandTotal, o.overBy, o.minimumCost]) add(n);
    for (const s of o.savings) add(s.amount);
    for (const g of o.shops) [g.subtotal, g.shipping, g.shopDiscount].forEach(add);
    for (const l of o.lines) add(l.lineTotal);
  }
  const codes = new Set<string>([
    ...c.walletVouchers.map((v) => v.code),
    ...c.interests.flatMap((i) => (i.voucherCode ? [i.voucherCode] : [])),
    ...c.favoriteShopPromos.map((p) => p.code),
    ...(o?.shops.flatMap((g) => g.voucherCodes) ?? []),
  ]);
  const knownCodes = new Set((input.vouchers ?? []).map((v) => v.code));
  const dates = new Set([c.today, c.deadline].filter((d): d is string => !!d));
  // product names may contain numbers ("… Model 2026", "Grade 1–3"): they are names, not facts to check
  const titles = [
    ...c.interests.map((i) => i.title),
    ...(o?.lines.map((l) => l.product.title) ?? []),
    ...(o?.noMatch.flatMap((n) => (n.closest ? [n.closest.candidate.product.title] : [])) ?? []),
    ...(o?.interests?.map((i) => i.candidate.product.title) ?? []),
  ].sort((a, b) => b.length - a.length);
  return { numbers, codes, knownCodes, dates, titles };
}

/** True when every number / voucher code / date in `text` is one the context allows. */
function textIsGrounded(text: string, facts: ReturnType<typeof allowedFacts>): boolean {
  let rest = text;
  for (const t of facts.titles) rest = rest.split(t).join(" ");
  for (const m of rest.matchAll(CODE)) {
    const token = m[0];
    const codeLike = token.length >= 4 && (/\d|-/.test(token) || facts.knownCodes.has(token));
    if (codeLike && !facts.codes.has(token)) return false;
  }
  rest = rest.replace(CODE, (t) => (t.length >= 4 && /\d|-/.test(t) ? " " : t));
  const { rest: noDates, dates } = datesIn(rest);
  const allowedMd = new Set([...facts.dates].map((d) => d.slice(5)));
  for (const d of dates) {
    if (d.length === 10 ? !facts.dates.has(d) : !allowedMd.has(d)) return false;
  }
  return amountsIn(noDates).every((n) => facts.numbers.has(n));
}

/** The model's follow-up if it passes the guard (with code-made swap actions), else null. */
export function guardFollowUp(raw: FollowUpOutput, input: FollowUpInput): FollowUp | null {
  const question = raw.question.trim();
  if (!question.endsWith("?")) return null;
  const suggestions = raw.suggestions
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0 && s.text.length <= MAX_SUGGESTION)
    .slice(0, 3);
  if (suggestions.length < 2) return null;
  const facts = allowedFacts(input);
  if (![question, ...suggestions.map((s) => s.text)].every((t) => textIsGrounded(t, facts))) return null;
  const interests = input.option?.interests ?? [];
  return {
    question,
    suggestions: suggestions.map((s) => {
      const i = s.interestItemKey ? interests.find((x) => x.itemKey === s.interestItemKey) : undefined;
      return i
        ? { text: s.text, action: { type: "swap" as const, itemKey: i.itemKey, productId: i.candidate.product.id } }
        : { text: s.text };
    }),
    source: "llm",
  };
}

// ---------- template (code fallback) ----------

const days = (n: number, lang: KitPlan["language"]) => (lang === "vi" ? `${n} ngày` : `${n} day${n === 1 ? "" : "s"}`);

export function templateFollowUp(input: FollowUpInput): FollowUp {
  const { plan, context: c } = input;
  const vi = plan.language === "vi";
  const done = (question: string, suggestions: FollowUp["suggestions"]): FollowUp => ({ question, suggestions, source: "template" });
  for (const hook of c.hooks) {
    switch (hook) {
      case "deadline_soon": {
        if (c.deadline === null || c.daysLeft === null) break;
        const d = shortDate(c.deadline, plan.language);
        const school = plan.event === "back_to_school";
        if (vi)
          return done(
            `Còn ${days(c.daysLeft, "vi")} nữa là ${school ? "khai giảng" : "đến hạn"} ${d}, bạn có muốn chuyển sang giao hoả tốc để chắc chắn nhận kịp không?`,
            [{ text: "Giao hoả tốc" }, { text: "Giữ như cũ" }],
          );
        return done(
          `Only ${days(c.daysLeft, "en")} left until ${school ? `school opens on ${d}` : `your ${d} deadline`}. Switch to express delivery to be sure it arrives in time?`,
          [{ text: "Express delivery" }, { text: "Keep as is" }],
        );
      }
      case "cart_interest": {
        const i = c.interests[0];
        if (!i) break;
        const full = input.option?.interests?.find((x) => x.itemKey === i.itemKey && x.candidate.product.title === i.title);
        const action = full ? { action: { type: "swap" as const, itemKey: full.itemKey, productId: full.candidate.product.id } } : {};
        const price = formatVnd(i.priceAfterVoucher);
        if (vi)
          return done(
            i.voucherCode
              ? `${i.title} trong giỏ của bạn chỉ còn ${price} với ${i.voucherCode}, bạn có muốn đổi sang không?`
              : `${i.title} trong giỏ của bạn giá ${price}, bạn có muốn đổi sang không?`,
            [{ text: "Đổi sang món này", ...action }, { text: "Giữ như cũ" }],
          );
        return done(
          i.voucherCode ? `${i.title} from your cart is ${price} with ${i.voucherCode}. Switch to it?` : `${i.title} from your cart is ${price}. Switch to it?`,
          [{ text: "Switch to this", ...action }, { text: "Keep as is" }],
        );
      }
      case "voucher_expiring": {
        const v = c.walletVouchers.find((x) => x.daysToExpiry >= 0 && x.daysToExpiry <= 3);
        if (!v) break;
        if (vi)
          return done(
            `Voucher ${v.code} (${v.label}) trong ví của bạn hết hạn sau ${days(v.daysToExpiry, "vi")}, bạn có muốn đặt bộ đồ luôn không?`,
            [{ text: "Thêm bộ đồ vào giỏ" }, { text: "Chỉnh tiếp" }],
          );
        return done(`Your wallet voucher ${v.code} (${v.label}) expires in ${days(v.daysToExpiry, "en")}. Check out the kit before then?`, [
          { text: "Add kit to cart" },
          { text: "Keep editing" },
        ]);
      }
      case "freeship_gap": {
        const g = c.freeshipGaps[0];
        if (!g) break;
        if (vi)
          return done(`Mua thêm ${formatVnd(g.missing)} ở ${g.shopName} là được miễn phí vận chuyển, bạn có muốn thêm món không?`, [
            { text: "Gợi ý thêm món" },
            { text: "Không cần" },
          ]);
        return done(`Add ${formatVnd(g.missing)} more at ${g.shopName} to get free shipping?`, [{ text: "Suggest an add-on" }, { text: "No thanks" }]);
      }
      case "favorite_shop_promo": {
        const p = c.favoriteShopPromos[0];
        if (!p) break;
        if (vi)
          return done(`Shop yêu thích ${p.shopName} đang có ${p.code} (${p.label}), bạn có muốn xem thêm không?`, [
            { text: "Xem thêm" },
            { text: "Để sau" },
          ]);
        return done(`Your favourite shop ${p.shopName} has ${p.code} (${p.label}). Want to see more from them?`, [
          { text: "Show me" },
          { text: "Not now" },
        ]);
      }
    }
  }
  return vi
    ? done("Bạn muốn chỉnh gì thêm cho bộ đồ này không?", [{ text: "Rẻ hơn một chút" }, { text: "Ổn rồi" }])
    : done("Anything you'd like to change in this kit?", [{ text: "Make it cheaper" }, { text: "Looks good" }]);
}

// ---------- the call ----------

class FollowUpTimeout extends Error {}

/** The follow-up for this turn: the model's if it passes the guard, else the template. Never throws. */
export async function followUp(llm: LLMClient, input: FollowUpInput, opts: { timeoutMs?: number } = {}): Promise<FollowUp> {
  const { fast } = llmModels();
  const timeoutMs = opts.timeoutMs ?? FOLLOWUP_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = llm.structured(fast.model, FollowUpOutputSchema, followUpMessages(input), { effort: fast.effort, name: "kit_followup" });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new FollowUpTimeout(`follow-up took more than ${timeoutMs} ms`)), timeoutMs);
    });
    call.catch(() => {}); // a late rejection after the timeout must not be unhandled
    const raw = await Promise.race([call, timeout]);
    const guarded = guardFollowUp(raw, input);
    if (!guarded) console.warn("[kit] follow-up rejected by the guard, using the template");
    return guarded ?? templateFollowUp(input);
  } catch (err) {
    console.warn(`[kit] follow-up failed: ${err instanceof Error ? err.message : String(err)}`);
    return templateFollowUp(input);
  } finally {
    clearTimeout(timer);
  }
}
