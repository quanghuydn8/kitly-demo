// Optional HTTP Basic Auth for a shared demo link: active only when KITLY_BASIC_AUTH=user:pass is set.
// Edge-safe (atob, no Buffer). Returns a 401 Response to send, or null to let the request through.

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeBasic(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    return atob(header.slice(6).trim());
  } catch {
    return null;
  }
}

export function basicAuthChallenge(request: Request): Response | null {
  const expected = process.env.KITLY_BASIC_AUTH?.trim();
  if (!expected) return null;
  const given = decodeBasic(request.headers.get("authorization"));
  if (given !== null && safeEqual(given, expected)) return null;
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Kitly", charset="UTF-8"' },
  });
}
