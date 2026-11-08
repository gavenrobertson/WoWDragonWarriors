import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { syncRoster } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 30 min: guild roster → characters. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!configured.db() || !configured.battlenet()) return NextResponse.json({ skipped: "database or Battle.net keys not configured" });
  try {
    return NextResponse.json(await syncRoster());
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
