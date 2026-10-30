import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Two projects (they inherit plugins/resolve from this file): server tests in node,
// tests/ui/** (React components, .test.tsx) in jsdom. Every test runs on the In-memory adapter
// with the fixed demo date; Basic Auth off unless a test sets it.
const env = { KITLY_ADAPTER: "memory", DEMO_TODAY: "2026-09-02", KITLY_BASIC_AUTH: "" };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "server", include: ["tests/server/**/*.test.{ts,tsx}"], environment: "node", env },
      },
      { extends: true, test: { name: "ui", include: ["tests/ui/**/*.test.{ts,tsx}"], environment: "jsdom", env } },
    ],
  },
});
