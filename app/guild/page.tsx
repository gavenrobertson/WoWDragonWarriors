import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { SITE } from "@/lib/config";
import { getCharacters, getRanks, getSettings, store } from "@/lib/store";
import { classIcon } from "@/lib/ui";
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
  return (
    <main id="main" tabIndex={-1} className="container page guild-page">
      <GuildWindow
        profile={profile}
        members={members}
        motd={String(s.guild_motd ?? "")}
        info={String(s.guild_info ?? "")}
        isMember={viewer.characters.some((c) => c.inGuild)}
        signedIn={viewer.signedIn}
      />
    </main>
  );
}
