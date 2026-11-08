import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { NS, SITE } from "@/lib/config";
import { getCharacters, getRanks, store } from "@/lib/store";
import { ROLE_LABEL, timeAgo } from "@/lib/ui";
import { RosterView, type MemberVM } from "./RosterView";

export const metadata: Metadata = { title: "Roster" };
const GATHERING = new Set(["Mining", "Herbalism", "Skinning", "Fishing", "Cooking", "First Aid"]);

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [viewer, chars, ranks, bank, requests, total] = await Promise.all([
    getViewer(), getCharacters(), getRanks(), store().bank(), store().craftRequests(), store().memberTotal(),
  ]);
  const members = chars.filter((c) => c.inGuild);
  const rankName = (i: number | null) => ranks.find((r) => r.index === i)?.name ?? (i == null ? "—" : `Rank ${i}`);
  const mainOf = new Map(chars.filter((c) => c.isMain && c.userId).map((c) => [c.userId!, c]));

  const rows: MemberVM[] = members.map((m) => {
    const main = m.userId ? mainOf.get(m.userId) : undefined;
    const ready = m.level < 60 ? `Level ${m.level}` : m.attunements.includes("onyxia") ? "Ready" : "Needs attunement";
    return {
      slug: m.slug, name: m.fullName, className: m.className, spec: m.spec ?? "", level: m.level, rank: rankName(m.rank),
      role: m.role ? ROLE_LABEL[m.role] : "—", roleKey: m.role ?? "", main: m.isMain ? "Main" : main ? `Alt of ${main.name}` : "—", ready, seen: timeAgo(m.lastSeenMin),
    };
  });

  const profs = new Map<string, { name: string; className: string; skill: number }[]>();
  for (const m of members) for (const p of m.professions) {
    if (GATHERING.has(p.name)) continue;
    profs.set(p.name, [...(profs.get(p.name) ?? []), { name: m.fullName, className: m.className, skill: p.skill }]);
  }
  const profList = [...profs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => ({ name, crafters: list.sort((a, b) => b.skill - a.skill) }));

  return (
    <RosterView
      initialTab={tab === "craft" ? "craft" : tab === "bank" ? "bank" : "members"}
      total={total}
      rows={rows}
      profs={profList}
      bank={bank}
      requests={requests}
      signedIn={viewer.signedIn}
      source={`/data/wow/guild/${SITE.guildSlug}/roster · ${NS.profile}`}
      auctionNs={NS.dynamic}
    />
  );
}
