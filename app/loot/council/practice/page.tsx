import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { RAIDS, getCharacters, getItems } from "@/lib/store";
import type { CouncilMember } from "@/lib/store";
import { CouncilChamber, type CouncilItem } from "../CouncilChamber";

export const metadata: Metadata = { title: "Practice council", robots: { index: false } };

/** Small deterministic PRNG so the practice session is the same on every reload (until Reset). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// Practice council: the real chamber with the real guild roster and raid loot, but every vote, award
// and override stays in the browser. Simulated officers vote too, so one person can run a full session.
export default async function PracticeCouncilPage() {
  const [viewer, chars, items] = await Promise.all([getViewer(), getCharacters(), getItems()]);
  const guild = chars.filter((c) => c.inGuild);
  // Contenders: real members, the most raid-ready first (level, then those with a render).
  const pool = [...guild].sort((a, b) => b.level - a.level || Number(!!b.renderUrl) - Number(!!a.renderUrl)).slice(0, 12);

  // Council: you plus four simulated officers drawn from the roster.
  const me = viewer.userId ?? "practice-you";
  const myMain = viewer.main;
  const officers = [...guild].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.level - a.level).filter((c) => c.slug !== myMain?.slug).slice(0, 4);
  const roles = ["Officer", "Loot Master", "Officer", "Raid Leader"];
  const members: CouncilMember[] = [
    { userId: me, name: myMain?.name ?? "You", className: myMain?.className ?? "", avatarUrl: myMain?.avatarUrl ?? undefined, role: "You" },
    ...officers.map((c, i) => ({ userId: `bot:${c.slug}`, name: c.fullName, className: c.className, avatarUrl: c.avatarUrl, role: `${roles[i]} (simulated)` })),
  ];

  const raidItems = items.filter((i) => i.source.type === "raid");
  const picked = RAIDS.flatMap((r) => raidItems.filter((i) => i.source.raid === r.id).slice(0, 3)).slice(0, 8);
  const councilItems: CouncilItem[] = picked.map((i) => {
    const rand = rng(i.id);
    const shuffled = [...pool].sort(() => rand() - 0.5);
    const count = Math.min(shuffled.length, 2 + Math.floor(rand() * 3));
    return {
      id: i.id, name: i.name, quality: i.quality, iconUrl: i.iconUrl ?? null, slot: i.slotDetail, boss: i.source.boss,
      raid: RAIDS.find((r) => r.id === i.source.raid)?.name ?? "",
      votes: [],
      candidates: shuffled.slice(0, count).map((c) => ({
        characterId: c.id, slug: c.slug, name: c.fullName, className: c.className, spec: c.spec ?? "", race: c.race, level: c.level,
        renderUrl: c.renderUrl ?? null, avatarUrl: c.avatarUrl ?? null, wishRank: 1 + Math.floor(rand() * 5), approved: true,
        attendance: 70 + Math.round(rand() * 30), won: Math.floor(rand() * 4),
      })).sort((a, b) => a.wishRank - b.wishRank || (b.attendance ?? 0) - (a.attendance ?? 0) || a.won - b.won),
    };
  }).filter((i) => i.candidates.length > 0);

  return (
    <CouncilChamber
      practice
      items={councilItems}
      members={members}
      me={me}
      canVote
      canOverride
      roster={guild.map((c) => ({ id: c.id, name: c.fullName, className: c.className, level: c.level })).sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
