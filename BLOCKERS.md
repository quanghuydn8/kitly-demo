# BLOCKERS

One line per blocker: `T<NN> | lane | what is missing | who can unblock`.

T10 | 2 | (non-blocking, worked around) vitest cannot transform JSX (tsconfig `jsx: preserve`) and there is no jsdom/@testing-library: please add `@testing-library/react` + `jsdom` devDeps, `oxc/esbuild jsx: "automatic"` and `tests/**/*.test.tsx` to vitest.config.ts — then Lane 2 deletes `src/components/tsconfig.json` (current workaround) | Lane 1
