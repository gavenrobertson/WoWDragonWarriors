import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl } from "@/lib/blizzard";
import { STATE_COOKIE, cookieOptions, newToken } from "@/lib/auth";
import { configured, isDemo } from "@/lib/config";

export async function GET(req: NextRequest) {
  // Demo mode: walk through the sample claim flow instead.
  if (isDemo()) return NextResponse.redirect(new URL("/sign-in?step=claim", req.url));
  if (!configured.battlenet()) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent("Battle.net sign-in isn't set up yet. An officer needs to add the Battle.net API keys.")}`, req.url));
  }
  const state = newToken(24);
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  return NextResponse.redirect(authorizeUrl(state));
}
