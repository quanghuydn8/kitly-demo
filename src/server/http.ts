// JSON helpers for route handlers; errors follow CONTRACT.md §3: { error: { code, message } }.
import { NextResponse } from "next/server";

export const json = <T>(body: T, status = 200) => NextResponse.json(body, { status });

export const apiError = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

/** Wraps a handler so unexpected throws become a 500 contract error instead of an HTML page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return apiError(500, "internal", e instanceof Error ? e.message : "Unexpected error");
    }
  };
}
