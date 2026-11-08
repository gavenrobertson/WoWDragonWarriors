import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl } from "@/lib/blizzard";
import { STATE_COOKIE, cookieOptions, newToken } from "@/lib/auth";
import { configured, isDemo } from "@/lib/config";

export async function GET(req: NextRequest) {
  // Without a database or Battle.net client, walk through the demo claim flow instead.
  if (isDemo() || !configured.battlenet()) {
    return NextResponse.redirect(new URL("/sign-in?step=claim", req.url));
  }
  const state = newToken(24);
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  return NextResponse.redirect(authorizeUrl(state));
}
