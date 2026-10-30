// Personalisation UI (T17 Full, D39–D43): 💛 cart card, wallet savings, follow-up pills, answer turns, interleaved
// history, persona chip + "Deliver to". Component seams (KitPanel, ChatColumn, PersonaChipView) on fixtures + the pure
// client helpers (kit-run, kit-chat, persona).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import kitSample from "@/contract/fixtures/kit.sample.json";
import answerSample from "@/contract/fixtures/kit.answer.sample.json";
import personasJson from "@/contract/fixtures/personas.json";
import vouchersJson from "@/contract/fixtures/vouchers.json";
import {
  GUEST_PERSONA,
  KitStreamSchema,
  PersonaSchema,
  ThreadsSampleSchema,
  VoucherSchema,
  type KitVersion,
  type PersonaResponse,
} from "@/contract";
import { ChatColumn } from "@/components/kit/ChatColumn";
import { KitPanel } from "@/components/kit/KitPanel";
import { PersonaChipView } from "@/components/store/PersonaChip";
import { applyEvent, panelVersions, runAsVersion, startRun, type RunRequest, type RunState } from "@/lib/client/kit-run";
import { chatTurns, switchedText } from "@/lib/client/kit-chat";
import { deliverTo, personaChipLabel } from "@/lib/client/persona";

afterEach(cleanup);

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const noop = () => {};
const lan = PersonaSchema.parse(personasJson[0]);
const lanResponse: PersonaResponse = {
  persona: lan,
  walletVouchers: VoucherSchema.array()
    .parse(vouchersJson)
    .filter((v) => v.ownerPersona === "lan"),
};
const guestResponse: PersonaResponse = { persona: GUEST_PERSONA, walletVouchers: [] };

function fold(events: unknown, request: RunRequest): RunState {
  return KitStreamSchema.parse(events).reduce(applyEvent, startRun(request));
}

const heroRun = fold(kitSample, { kind: "new", query: "My kid starts Grade 1. Budget 1.5M VND." });
const heroV1 = runAsVersion(heroRun)!;
const answerRun = fold(answerSample, {
  kind: "refine",
  threadId: hero.thread.id,
  message: "Is the Minh An backpack really anti-hunchback?",
});

function panel(versions: KitVersion[], extra: Partial<Parameters<typeof KitPanel>[0]> = {}) {
  return render(
    <KitPanel
      versions={versions}
      viewVersion={null}
      onViewVersion={noop}
      onRestore={noop}
      overrides={{}}
      onSwap={noop}
      onAddToCart={noop}
      {...extra}
    />,
  );
}

function chat(versions: KitVersion[], extra: Partial<Parameters<typeof ChatColumn>[0]> = {}) {
  return render(
    <ChatColumn
      versions={versions}
      run={null}
      summaries={{}}
      busy={false}
      onSend={noop}
      onChooseBudget={noop}
      onRetry={noop}
      {...extra}
    />,
  );
}

describe("run state (kit-run)", () => {
  it("keeps the followup event and puts it on the provisional version", () => {
    expect(heroRun.followUp?.question).toMatch(/^School opens Sep 5/);
    expect(heroV1.followUp?.suggestions).toHaveLength(3);
  });

  it("an answer stream is answered, has only the Answering step and adds no panel version", () => {
    expect(answerRun.answered).toBe(true);
    expect(answerRun.steps.map((s) => [s.id, s.detail])).toEqual([["understand", "Answering"]]);
    expect(runAsVersion(answerRun)).toBeNull();
    expect(panelVersions([hero.versions[0]], answerRun)).toEqual([hero.versions[0]]);
  });

  it("panelVersions adds a new run's provisional version once", () => {
    expect(panelVersions([], heroRun).map((v) => v.version)).toEqual([1]);
    expect(panelVersions([heroV1], heroRun)).toEqual([heroV1]);
  });
});

describe("chat turns (kit-chat)", () => {
  it("interleaves versions and messages by createdAt (the message lands after its version)", () => {
    const turns = chatTurns(hero.versions, hero.messages);
    expect(turns.map((t) => (t.type === "version" ? `v${t.version.version}` : "msg"))).toEqual(["v1", "msg", "v2"]);
  });

  it("switchedText: 'Switched backpack to KidZone Lite'", () => {
    expect(switchedText("backpack", "KidZone Lite Backpack Grade 1–3")).toBe("Switched backpack to KidZone Lite");
    expect(switchedText("water-bottle", "Minh An Steel Bottle")).toBe("Switched water bottle to Minh An Steel");
    expect(switchedText("shoes", "PikoStep Canvas")).toBe("Switched shoes to PikoStep Canvas");
  });
});

describe("KitPanel personalisation", () => {
  it("kit.sample renders the 💛 In your cart card under the backpack No exact match row", () => {
    panel([heroV1]);
    const card = screen.getByRole("region", { name: "In your cart" });
    expect(card.textContent).toMatch(/💛 In your cart/);
    expect(card.textContent).toContain("KidZone Lite Backpack Grade 1–3");
    expect(card.textContent).toMatch(/520\.000 ?₫ → 440\.000 ?₫ with LAN-KZ80/);
    expect(card.textContent).toMatch(/over your 400k limit by 40\.000 ?₫/);
    expect(card.textContent).toContain("missing: anti-hunchback");
    // under the backpack's No exact match row
    const noMatch = screen.getByRole("list", { name: "No exact match" });
    expect(within(noMatch).getByRole("region", { name: "In your cart" })).toBe(card);
  });

  it("Switch to this sends the cart product as the item's pick", () => {
    const onSwitchInterest = vi.fn();
    panel([heroV1], { onSwitchInterest });
    fireEvent.click(screen.getByRole("button", { name: "Switch to this" }));
    expect(onSwitchInterest).toHaveBeenCalledWith(1, "balanced", "backpack", "prod-kidzone-lite-backpack");
  });

  it("the card is hidden once the cart product is the line (re-priced option)", () => {
    const base = heroV1.options.find((o) => o.profile === "balanced")!;
    const interest = base.interests![0];
    const switched = {
      ...base,
      noMatch: [],
      interests: [],
      lines: [
        { itemKey: "backpack", product: interest.candidate.product, shop: interest.candidate.shop, quantity: 1, lineTotal: 520000, reason: "From your cart · missing: anti-hunchback", alternatives: [] },
        ...base.lines,
      ],
    };
    // the server still listing it must not bring the card back
    panel([heroV1], { overrides: { "1:balanced": { ...switched, interests: base.interests } } });
    expect(screen.queryByRole("region", { name: "In your cart" })).toBeNull();
    expect(screen.getByText("💛 From your cart")).toBeTruthy();
  });

  it("the card sits under the basket line when the item has an exact match", () => {
    const base = hero.versions[0].options.find((o) => o.profile === "balanced")!;
    const interest = { ...base.interests![0], itemKey: "notebooks", missingTags: [], overMaxPriceBy: null };
    const v = { ...hero.versions[0], options: hero.versions[0].options.map((o) => (o.profile === "balanced" ? { ...o, interests: [interest] } : o)) };
    panel([v]);
    const basket = screen.getByRole("list", { name: "Basket" });
    const card = within(basket).getByRole("region", { name: "In your cart" });
    expect(card.textContent).not.toMatch(/over your|missing:/);
  });

  it("wallet savings get 🎟 and are listed first", () => {
    panel([heroV1]);
    const items = within(screen.getByRole("region", { name: "Totals" })).getAllByRole("listitem");
    const texts = items.map((li) => li.textContent ?? "");
    expect(texts[0]).toMatch(/^🎟 Your wallet voucher KidZone 80k off/);
    expect(texts[1]).toMatch(/^🎟 Your wallet voucher Back-to-school 10%/);
    expect(texts.slice(2).every((t) => !t.includes("🎟"))).toBe(true);
  });

  it("the header shows Deliver to for Lan and nothing for Guest", () => {
    panel([heroV1], { deliverTo: deliverTo(lan) });
    expect(screen.getByText("Deliver to Cau Giay, Hanoi")).toBeTruthy();
    cleanup();
    panel([heroV1], { deliverTo: deliverTo(GUEST_PERSONA) });
    expect(screen.queryByText(/Deliver to/)).toBeNull();
  });
});

describe("ChatColumn follow-up + answer turns", () => {
  const followUps = () => screen.getAllByRole("group", { name: "Suggestions" });

  it("renders 1 question + its pills; a swap pill goes to the price path (fake), not refine", () => {
    const onSend = vi.fn();
    const onFollowUpSwap = vi.fn();
    chat([heroV1], { onSend, onFollowUpSwap });
    expect(screen.getAllByText(/^School opens Sep 5, in 3 days/)).toHaveLength(1);
    const pills = within(followUps()[0]).getAllByRole("button");
    expect(pills.map((b) => b.textContent)).toEqual(["Yes, express delivery", "Switch to KidZone Lite (440k)", "Keep as is"]);
    fireEvent.click(pills[1]);
    expect(onFollowUpSwap).toHaveBeenCalledWith("Switch to KidZone Lite (440k)", {
      type: "swap",
      itemKey: "backpack",
      productId: "prod-kidzone-lite-backpack",
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("a plain pill takes the composer path (refine)", () => {
    const onSend = vi.fn();
    const onFollowUpSwap = vi.fn();
    chat([heroV1], { onSend, onFollowUpSwap });
    fireEvent.click(within(followUps()[0]).getByRole("button", { name: "Yes, express delivery" }));
    expect(onSend).toHaveBeenCalledWith("Yes, express delivery");
    expect(onFollowUpSwap).not.toHaveBeenCalled();
  });

  it("a thread with 1 message interleaves it after its version; only the latest follow-up is clickable", () => {
    chat(hero.versions, { messages: hero.messages });
    expect(screen.getAllByTestId("user-bubble").map((b) => b.textContent)).toEqual([
      hero.versions[0].userText,
      "Is the Minh An backpack really anti-hunchback?",
      hero.versions[1].userText,
    ]);
    expect(screen.getByText(/its description says/)).toBeTruthy();
    const groups = followUps();
    expect(groups).toHaveLength(3);
    const enabled = groups.map((g) => within(g).getAllByRole("button").every((b) => !(b as HTMLButtonElement).disabled));
    expect(enabled).toEqual([false, false, true]);
  });

  it("the latest message's follow-up is clickable when the message is the last turn", () => {
    chat([hero.versions[0]], { messages: hero.messages });
    const groups = followUps();
    expect(within(groups[1]).getByRole("button", { name: "Add it anyway" })).toHaveProperty("disabled", false);
    expect(within(groups[0]).getByRole("button", { name: "Keep as is" })).toHaveProperty("disabled", true);
  });

  it("kit.answer.sample adds an assistant message without changing 'Version 1 of 1'", () => {
    const v1 = hero.versions[0];
    chat([v1], { run: answerRun });
    expect(screen.getAllByTestId("user-bubble").map((b) => b.textContent)).toEqual([v1.userText, answerRun.request.kind === "refine" ? answerRun.request.message : ""]);
    expect(screen.getByText(/its description says/)).toBeTruthy();
    expect(screen.getByText("Do you want to keep the Minh An backpack at 349.000₫ in your kit?")).toBeTruthy();
    cleanup();
    panel(panelVersions([v1], answerRun));
    expect(screen.getByRole("combobox", { name: "Version" }).textContent).toBe("Version 1 of 1");
  });

  it("a follow-up swap shows the pill text as a user bubble + '⚙ Switched backpack to KidZone Lite · Undo'", () => {
    const onUndoLocal = vi.fn();
    chat([heroV1], {
      localTurns: [{ id: "s1", userText: "Switch to KidZone Lite (440k)", systemText: "Switched backpack to KidZone Lite", undoable: true }],
      onUndoLocal,
    });
    const bubbles = screen.getAllByTestId("user-bubble");
    expect(bubbles[bubbles.length - 1].textContent).toBe("Switch to KidZone Lite (440k)");
    expect(screen.getByText(/⚙ Switched backpack to KidZone Lite/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndoLocal).toHaveBeenCalledWith("s1");
    // the follow-up above is no longer the latest turn
    expect(within(followUps()[0]).getByRole("button", { name: "Keep as is" })).toHaveProperty("disabled", true);
  });
});

describe("persona chip", () => {
  it("labels: Lan with address + wallet count, Guest alone", () => {
    expect(personaChipLabel(lanResponse)).toBe("👤 Lan · Cau Giay, Hanoi · 2 vouchers");
    expect(personaChipLabel(guestResponse)).toBe("👤 Guest");
    expect(deliverTo(lan)).toBe("Cau Giay, Hanoi");
    expect(deliverTo(GUEST_PERSONA)).toBeNull();
  });

  it("click opens Lan / Guest; picking Guest switches", () => {
    const onSwitch = vi.fn();
    render(<PersonaChipView data={lanResponse} onSwitch={onSwitch} />);
    const chip = screen.getByRole("button", { name: /👤 Lan · Cau Giay, Hanoi · 2 vouchers/ });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(chip);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["Lan", "Guest"]);
    expect(within(menu).getByRole("menuitemradio", { name: "Lan" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Applies to new kits")).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Guest" }));
    expect(onSwitch).toHaveBeenCalledWith("guest");
  });

  it("Guest chip shows only 'Guest'; inside a kit the menu notes 'Applies to new kits' + New kit link", () => {
    render(<PersonaChipView data={guestResponse} onSwitch={noop} inKit />);
    const chip = screen.getByRole("button", { name: "👤 Guest" });
    fireEvent.click(chip);
    expect(screen.getByText("Applies to new kits")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+ New kit" }).getAttribute("href")).toBe("/kit/new");
  });

  it("renders nothing until the persona is loaded", () => {
    const { container } = render(<PersonaChipView data={null} onSwitch={noop} />);
    expect(container.textContent).toBe("");
  });
});
