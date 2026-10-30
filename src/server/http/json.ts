// JSON responses in the contract's error shape: { error: { code, message } }.
export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
