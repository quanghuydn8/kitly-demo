import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { KITLY_ADAPTER: "memory", DEMO_TODAY: "2026-08-20" },
  },
});
