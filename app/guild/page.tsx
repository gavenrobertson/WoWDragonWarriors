import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { SITE } from "@/lib/config";
import { getCharacters, getRanks, getSettings, store } from "@/lib/store";
import { classIcon } from "@/lib/ui";
import { METRICS } from "@/lib/metrics";
import type { HallOfFameData } from "./HallOfFame";
import { GuildWindow, type GuildMember } from "./GuildWindow";

export const metadata: Metadata = {
  title: "Guild",
  description: `${SITE.name}: Alliance guild on WoW Forever. Roster, ranks and how to join.`,
};

export default async function GuildPage() {
  const [viewer, chars, ranks, profile, settings] = await Promise.all([getViewer(), getCharacters(), getRanks(), store().guildProfile(), getSettings()]);
  const rankName = (i: number | null) => ranks.find((r) => r.index === i)?.name ?? (i == null ? "" : `Rank ${i}`);
  const members: GuildMember[] = chars
    .filter((c) => c.inGuild)
    .map((c) => ({
      slug: c.slug, name: c.fullName, level: c.level, className: c.className, classIcon: classIcon(c.className) ?? null,
      rank: rankName(c.rank), rankIndex: c.rank ?? 99, lastSeenMin: c.lastSeenMin, race: c.race,
    }));
  const s = settings as Record<string, unknown>;

  // Hall of Fame: leaderboards from each member's Blizzard statistics (computed here so the page ships only the top 3s).
  const tracked = chars.filter((c) => c.inGuild && c.metrics);
  const sum = (k: string) => tracked.reduce((a, c) => a + (c.metrics!.v[k] ?? 0), 0);
  const inst: Record<string, number> = {};
  for (const c of tracked) for (const [k, n] of Object.entries(c.metrics!.inst)) inst[k] = (inst[k] ?? 0) + n;
  const hall: HallOfFameData = {
    tracked: tracked.length,
    members: members.length,
    totals: { quests: sum("quests"), dungeons: sum("dungeons"), bosses: sum("bosses"), kills: sum("kills"), hks: sum("hks"), deaths: sum("deaths") },
    boards: METRICS.map((m) => ({
      key: m.key, title: m.title, label: m.label, group: m.group, icon: m.icon,
      top: tracked
        .map((c) => ({ slug: c.slug, name: c.fullName, className: c.className, avatarUrl: c.avatarUrl ?? null, level: c.level, value: c.metrics!.v[m.key] ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value || b.level - a.level)
        .slice(0, 3),
    })),
    dungeons: Object.entries(inst).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, kills]) => ({ name, kills })),
  };
  return (
    <main id="main" tabIndex={-1} className="container page guild-page">
      <GuildWindow
        profile={profile}
        members={members}
        motd={String(s.guild_motd ?? "")}
        info={String(s.guild_info ?? "")}
        isMember={viewer.characters.some((c) => c.inGuild)}
        signedIn={viewer.signedIn}
        hall={hall}
      />
    </main>
  );
}
