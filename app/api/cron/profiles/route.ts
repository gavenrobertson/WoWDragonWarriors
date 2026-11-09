import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { remindUpcomingEvents, syncAllProfiles } from "@/lib/sync";
import { RAID_MARKS, rewardCompletedRaids } from "@/lib/arcade";
import { hubUrl, notify } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly: profile, gear, stats, professions, renders and attunements for every member (batched, backs off on 429). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!configured.db()) return NextResponse.json({ skipped: "database not configured" });
  try {
    // Reminders and raid rewards only need the database.
    const reminders = await remindUpcomingEvents().catch(() => 0);
    const raids = await rewardCompletedRaids().catch((e) => { console.error("raid rewards", e); return []; });
    for (const r of raids) if (r.paid) await notify("events", {
      title: `🐉 ${r.name}: raid complete`, color: 0xffd100, url: hubUrl("/arcade"),
      description: `${r.paid} raider${r.paid === 1 ? "" : "s"} earned **${RAID_MARKS} Dragon Marks** for showing up (bench: half). Spend them in the arcade.`,
    });
    const profiles = configured.battlenet() ? await syncAllProfiles() : { skipped: "Battle.net keys not configured" };
    return NextResponse.json({ ...profiles, reminders, raidsRewarded: raids.length });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
