// 1) Optional Basic Auth (KITLY_BASIC_AUTH). 2) Ensure the kitly_uid owner cookie exists; on the first request the
// new uid is also forwarded on the request so route handlers see it immediately via ownerFrom().
import { NextResponse, type NextRequest } from "next/server";
import { basicAuthChallenge } from "@/server/basic-auth";
import { ONE_YEAR_SECONDS, OWNER_COOKIE, ownerFrom } from "@/server/http/request";

export function middleware(request: NextRequest): NextResponse {
  const challenge = basicAuthChallenge(request);
  if (challenge) return new NextResponse(challenge.body, { status: challenge.status, headers: challenge.headers });

  if (ownerFrom(request)) return NextResponse.next();

  const uid = crypto.randomUUID();
  const headers = new Headers(request.headers);
  const cookie = headers.get("cookie");
  headers.set("cookie", cookie ? `${cookie}; ${OWNER_COOKIE}=${uid}` : `${OWNER_COOKIE}=${uid}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(OWNER_COOKIE, uid, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
}

export const config = {
  // Everything except Next static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
