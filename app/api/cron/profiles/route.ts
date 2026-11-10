import { NextResponse, type NextRequest } from "next/server";
import { configured } from "@/lib/config";
import { cronAuthorized } from "@/lib/cron";
import { remindUpcomingEvents, syncAllProfiles } from "@/lib/sync";
import { LAUNCH_GIFT, MONTHLY_CHESTS, RAID_MARKS, crownMonthlyChampions, grantChestsToAll, grantMonthlyChests, rewardCompletedRaids } from "@/lib/arcade";
import { sqlOne } from "@/lib/db";
import { MONTHLY_PRIZES, SKILL_META, fmtScore } from "@/lib/skill-games";
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
  const champs = await crownMonthlyChampions();
  if (champs) {
    out.champions = champs.winners.length;
    const medal = ["🥇", "🥈", "🥉"];
    await notify("announcements", {
      title: `🏆 ${champs.month} arcade champions`, url: hubUrl("/arcade/leaderboard"), color: 0xffd100, thumbnail: "https://render.worldofwarcraft.com/us/icons/56/inv_misc_trophy_argent.jpg",
      description: champs.winners.length
        ? `The month's best scores have been paid out: ${MONTHLY_PRIZES.map((p, i) => `${medal[i]} ${p.marks.toLocaleString("en-US")} marks + a ${CHESTS.find((c) => c.id === p.chest)?.name}`).join(", ")}. A new month starts now. [See the leaderboard](${hubUrl("/arcade/leaderboard")}).`
        : `Nobody set a score last month. The leaderboard is wide open: [go claim it](${hubUrl("/arcade/leaderboard")}).`,
      fields: champs.winners.slice(0, 25).map((w) => ({
        name: SKILL_META[w.game].name, inline: true,
        value: w.rows.map((r, i) => `${medal[i]} ${r.name} · ${SKILL_META[w.game].agg === "wins" ? `${r.score} wins` : fmtScore(w.game, r.score)}`).join("\n"),
      })),
    });
  }
  const news = await announceOnce("new-games-2026-11");
  if (news) {
    out.newsPosted = true;
    await notify("announcements", {
      title: "🎮 8 new arcade games, a leaderboard and monthly prizes",
      url: hubUrl("/arcade/leaderboard"), color: 0x9b5dff, thumbnail: "https://render.worldofwarcraft.com/us/icons/56/inv_misc_trophy_argent.jpg",
      description: [
        "The arcade just got a lot bigger. Eight new skill games, all **free to play**, and every run pays Dragon Marks:",
        "",
        `⌨️ **[Incantations](${hubUrl("/arcade/typing")})**: a 60-second typing test of spells and places`,
        `⚡ **[Interrupt!](${hubUrl("/arcade/reaction")})**: kick the cast the instant it turns red (reaction test)`,
        `🐟 **[Murloc Mayhem](${hubUrl("/arcade/murloc")})**: bonk the murlocs, spare the whelps`,
        `🔮 **[Rune Recall](${hubUrl("/arcade/runes")})**: repeat the rune sequence, one longer every round`,
        `🦅 **[Gryphon Flight](${hubUrl("/arcade/gryphon")})**: flap your gryphon between the towers`,
        `💰 **[Hoard Pairs](${hubUrl("/arcade/pairs")})**: match the loot in as few flips as you can`,
        `🔥 **[Don't Stand in the Fire](${hubUrl("/arcade/fire")})**: dodge the fire for as long as you can`,
        `✨ **[Arcane Barrage](${hubUrl("/arcade/barrage")})**: pop the arcane orbs before they fade`,
        "",
        `🏆 **New [arcade leaderboard](${hubUrl("/arcade/leaderboard")})** with *This month* and *All time* tabs for every skill game, Wyrm Run and 8-ball included.`,
        `At the end of each month the **top three in every game** win prizes: 🥇 ${MONTHLY_PRIZES[0].marks.toLocaleString("en-US")} marks + a Dragon's Hoard, 🥈 ${MONTHLY_PRIZES[1].marks.toLocaleString("en-US")} marks + a Gilded Chest, 🥉 ${MONTHLY_PRIZES[2].marks.toLocaleString("en-US")} marks + a Copper-Bound Chest.`,
        "",
        `📦 Small correction to the last post: the monthly chest everyone gets is **${Object.entries(MONTHLY_CHESTS).map(([id, n]) => `${n} ${CHESTS.find((c) => c.id === id)?.name}`).join(", ")}** at the end of each month.`,
      ].join("\n"),
    });
  }
  return out;
}

/** True the first time it's called for `key`, false ever after (a settings row marks it). */
async function announceOnce(key: string) {
  const r = await sqlOne<{ key: string }>("insert into settings (key, value) values ($1, $2) on conflict (key) do nothing returning key", [`announce:${key}`, new Date().toISOString()]);
  return !!r;
}
