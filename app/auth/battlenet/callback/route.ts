import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, userInfo } from "@/lib/blizzard";
import { STATE_COOKIE, createSession } from "@/lib/auth";
import { isDemo } from "@/lib/config";
import { sqlOne } from "@/lib/db";
import { syncAccount, upsertUser } from "@/lib/sync";

const fail = (req: NextRequest, reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(reason)}`, req.url));

export async function GET(req: NextRequest) {
  if (isDemo()) return NextResponse.redirect(new URL("/sign-in?step=claim", req.url));
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail(req, "Battle.net sign-in was cancelled.");

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected) return fail(req, "Sign-in expired. Please try again.");

  try {
    const token = await exchangeCode(code);
    const me = await userInfo(token.access_token);
    const user = await upsertUser(String(me.id ?? me.sub), me.battletag);
    if (!user) return fail(req, "Could not create your account.");
    await syncAccount(user.id, token.access_token);
    await createSession(user.id, { value: token.access_token, expiresIn: token.expires_in });

    const claimed = await sqlOne<{ n: number }>("select count(*) as n from characters where user_id = $1 and claimed = 1", [user.id]);
    return NextResponse.redirect(new URL(claimed?.n ? "/" : "/sign-in?step=claim", req.url));
  } catch (e) {
    console.error("battle.net callback", e);
    return fail(req, "Battle.net didn't respond. Please try again in a minute.");
  }
}
