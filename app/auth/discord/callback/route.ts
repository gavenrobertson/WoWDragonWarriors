import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { STATE_COOKIE, getViewer } from "@/lib/auth";
import { SITE } from "@/lib/config";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  const code = req.nextUrl.searchParams.get("code");
  if (viewer.demo || !viewer.userId || !code || req.nextUrl.searchParams.get("state") !== expected) {
    return NextResponse.redirect(new URL("/sign-in?discord=failed", req.url));
  }
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!, client_secret: process.env.DISCORD_CLIENT_SECRET!, grant_type: "authorization_code", code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? SITE.auth.discordCallback,
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL("/sign-in?discord=failed", req.url));
  const { access_token } = await tokenRes.json();
  const me = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json());
  await sql("update users set discord_id = $2 where id = $1", [viewer.userId, me.id]);
  return NextResponse.redirect(new URL("/?discord=linked", req.url));
}
