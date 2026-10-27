// F19: optional Basic Auth for shared demo links, so a public URL cannot burn the LLM key.
// KITLY_BASIC_AUTH="user:pass" turns it on; unset = open (hackathon day / local dev).
import { NextResponse, type NextRequest } from "next/server";

/** null = allowed; otherwise the 401 response to return. */
export function checkBasicAuth(req: NextRequest, expected: string | undefined): NextResponse | null {
  if (!expected) return null;
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded && atob(encoded) === expected) return null;
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Kitly demo"' },
  });
}
