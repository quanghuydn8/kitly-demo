import { afterEach, describe, expect, it, vi } from "vitest";
import { today, todayIso } from "@/server/today";

describe("today()", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads DEMO_TODAY", () => {
    vi.stubEnv("DEMO_TODAY", "2026-09-01");
    expect(today()).toBe("2026-09-01");
  });

  it("defaults to 2026-08-20", () => {
    vi.stubEnv("DEMO_TODAY", "");
    expect(today()).toBe("2026-08-20");
  });

  it("todayIso keeps the demo date with the current time of day", () => {
    vi.stubEnv("DEMO_TODAY", "2026-08-20");
    expect(todayIso()).toMatch(/^2026-08-20T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
