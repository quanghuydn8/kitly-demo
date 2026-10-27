import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkBasicAuth } from "@/server/basic-auth";

export function middleware(req: NextRequest) {
  return checkBasicAuth(req, process.env.KITLY_BASIC_AUTH) ?? NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"] };
