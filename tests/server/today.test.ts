import { afterEach, describe, expect, it } from "vitest";
import { addDays, daysBetween, demoNowIso, today } from "@/server/today";

afterEach(() => {
  process.env.DEMO_TODAY = "2026-09-02";
});

describe("today()", () => {
  it("reads DEMO_TODAY, defaults to 2026-09-02 (D45)", () => {
    process.env.DEMO_TODAY = "2026-08-20";
    expect(today()).toBe("2026-08-20");
    delete process.env.DEMO_TODAY;
    expect(today()).toBe("2026-09-02");
    process.env.DEMO_TODAY = "garbage";
    expect(today()).toBe("2026-09-02");
  });

  it("demoNowIso() is on DEMO_TODAY; date maths helpers", () => {
    expect(demoNowIso().slice(0, 10)).toBe("2026-09-02");
    expect(addDays("2026-09-02", 3)).toBe("2026-09-05");
    expect(addDays("2026-09-02", -14)).toBe("2026-08-19");
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(daysBetween("2026-09-02", "2026-09-05")).toBe(3);
  });
});
