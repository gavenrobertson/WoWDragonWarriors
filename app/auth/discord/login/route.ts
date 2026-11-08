import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { STATE_COOKIE, cookieOptions, getViewer, newToken } from "@/lib/auth";
import { SITE } from "@/lib/config";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (viewer.demo || !process.env.DISCORD_CLIENT_ID) return NextResponse.redirect(new URL("/sign-in?discord=unavailable", req.url));
  if (!viewer.signedIn) return NextResponse.redirect(new URL("/sign-in", req.url));
  const state = newToken(24);
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(600));
  const p = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI ?? SITE.auth.discordCallback,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "none",
  });
  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${p}`);
}
