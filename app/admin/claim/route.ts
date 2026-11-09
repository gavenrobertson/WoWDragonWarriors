import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getViewer } from "@/lib/auth";
import { sql, sqlOne } from "@/lib/db";

/**
 * One-time bootstrap: the signed-in user who opens /admin/claim?code=<SUPER_ADMIN_CLAIM_CODE>
 * becomes Super Admin. Works only while no Super Admin exists; after that, Super Admins assign roles in Admin.
 */
export async function GET(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin?section=people&notice=${encodeURIComponent(msg)}`, req.url));
  const expected = process.env.SUPER_ADMIN_CLAIM_CODE ?? "";
  const given = req.nextUrl.searchParams.get("code") ?? "";
  const viewer = await getViewer();
  if (viewer.demo) return back("Demo mode: nothing to claim.");
  if (!viewer.signedIn || !viewer.userId) return NextResponse.redirect(new URL("/sign-in?error=" + encodeURIComponent("Sign in with Battle.net first, then open the claim link again."), req.url));
  const ok = expected.length >= 16 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.redirect(new URL("/?notice=" + encodeURIComponent("That claim link isn't valid."), req.url));
  const existing = await sqlOne<{ n: number }>("select count(*) as n from users where site_role = 'super_admin'");
  if ((existing?.n ?? 0) > 0) return back("A Super Admin already exists. Ask them to assign your role.");
  await sql("update users set site_role = 'super_admin' where id = $1", [viewer.userId]);
  return back("You're now Super Admin.");
}
