import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { remindUpcomingEvents, syncAllProfiles } from "@/lib/sync";
import { LAUNCH_GIFT, MONTHLY_CHESTS, RAID_MARKS, grantChestsToAll, grantMonthlyChests, rewardCompletedRaids } from "@/lib/arcade";
import { CHESTS } from "@/lib/cosmetics";
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
      description: `${r.paid} raider${r.paid === 1 ? "" : "s"} earned **${RAID_MARKS.toLocaleString("en-US")} Dragon Marks** for showing up (bench: half). Spend them in the arcade.`,
    });
    const chests = await grantChests().catch((e) => { console.error("chest grants", e); return null; });
    const profiles = configured.battlenet() ? await syncAllProfiles() : { skipped: "Battle.net keys not configured" };
    return NextResponse.json({ ...profiles, reminders, raidsRewarded: raids.length, chests });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}

const chestList = (c: Record<string, number>) => {
  const items = CHESTS.filter((x) => c[x.id]).map((x) => `**${c[x.id]} ${x.name}${c[x.id] > 1 ? "s" : ""}**`);
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "";
};

/** The one-time chest gift (once ever) and the end-of-month chests (once a month), each announced in Discord. */
async function grantChests() {
  const out: Record<string, unknown> = {};
  const gift = await grantChestsToAll(LAUNCH_GIFT.key, LAUNCH_GIFT.chests, "Free chests for everyone");
  if (gift !== null) {
    out.gift = gift;
    await notify("announcements", {
      title: "🎁 Free chests for every Dragon Warrior!",
      url: hubUrl("/arcade/chests"), color: 0xffd100, thumbnail: "https://render.worldofwarcraft.com/us/icons/56/inv_box_04.jpg",
      description: [
        `Everyone just got ${chestList(LAUNCH_GIFT.chests)} in the arcade. They're waiting for you: [open them on the hub](${hubUrl("/arcade/chests")}).`,
        "",
        `Chests are cheaper now too (${CHESTS.map((c) => `${c.name} ${c.price.toLocaleString("en-US")}`).join(", ")} Dragon Marks), every bet you place can drop one, and from now on everyone gets ${chestList(MONTHLY_CHESTS)} at the end of every month.`,
        "",
        "Inside: name colours, glowing and chrome names, titles, profile banners and whole new site themes.",
      ].join("\n"),
    });
  }
  const monthly = await grantMonthlyChests();
  if (monthly) {
    out.monthly = monthly;
    await notify("announcements", {
      title: `🎁 ${monthly.month} chests are here`, url: hubUrl("/arcade/chests"), color: 0xffd100, thumbnail: "https://render.worldofwarcraft.com/us/icons/56/inv_box_02.jpg",
      description: `Thanks for another month with Dragon Warriors. Everyone got ${chestList(MONTHLY_CHESTS)}. [Open them on the hub](${hubUrl("/arcade/chests")}).`,
    });
  }
  return out;
}
