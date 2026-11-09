import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { remindUpcomingEvents, syncAllProfiles } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly: profile, gear, stats, professions, renders and attunements for every member (batched, backs off on 429). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!configured.db() || !configured.battlenet()) return NextResponse.json({ skipped: "database or Battle.net keys not configured" });
  try {
    const reminders = await remindUpcomingEvents().catch(() => 0);
    return NextResponse.json({ ...(await syncAllProfiles()), reminders });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
