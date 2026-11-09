import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { RAIDS, getCharacters, getItems, getWishlists, store } from "@/lib/store";
import { CouncilChamber, type CouncilItem } from "./CouncilChamber";

export const metadata: Metadata = { title: "Loot council" };

export default async function CouncilPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <section className="empty stack" style={{ alignItems: "center" }}>
          <h1 style={{ fontSize: 32 }}>Loot council</h1>
          <p>Sign in to see the council chamber.</p>
          <Link href="/sign-in" className="btn btn-primary">Sign in with Battle.net</Link>
        </section>
      </main>
    );
  }
  const [chars, items, wishes, votes, members, awards] = await Promise.all([
    getCharacters(), getItems(), getWishlists(), store().councilVotes(), store().councilMembers(), store().awards(),
  ]);
  const charById = new Map(chars.map((c) => [c.id, c]));
  const won = new Map<string, number>();
  for (const a of awards) won.set(a.characterName, (won.get(a.characterName) ?? 0) + 1);

  const councilItems: CouncilItem[] = items
    .filter((i) => i.source.type === "raid")
    .map((i) => {
      const candidates = wishes
        .filter((w) => w.itemId === i.id)
        .flatMap((w) => {
          const c = charById.get(w.characterId);
          if (!c) return [];
          return [{
            characterId: c.id, slug: c.slug, name: c.fullName, className: c.className, spec: c.spec ?? "", race: c.race, level: c.level,
            renderUrl: c.renderUrl ?? null, avatarUrl: c.avatarUrl ?? null, wishRank: w.rank, approved: w.approved,
            attendance: c.attendancePct ?? null, won: won.get(c.fullName) ?? 0,
          }];
        })
        // Wishlist priority: lower rank first, then attendance, then fewer items won.
        .sort((a, b) => a.wishRank - b.wishRank || (b.attendance ?? 0) - (a.attendance ?? 0) || a.won - b.won);
      return {
        id: i.id, name: i.name, quality: i.quality, iconUrl: i.iconUrl ?? null, slot: i.slotDetail, boss: i.source.boss,
        raid: RAIDS.find((r) => r.id === i.source.raid)?.name ?? "", candidates,
        votes: votes.filter((v) => v.itemId === i.id).map((v) => ({ voterUserId: v.voterUserId, characterId: v.characterId })),
      };
    })
    .filter((i) => i.candidates.length > 0)
    .sort((a, b) => b.candidates.length - a.candidates.length || a.name.localeCompare(b.name));

  return (
    <CouncilChamber
      items={councilItems}
      members={members}
      me={viewer.userId ?? "demo"}
      canVote={viewer.perms.canAwardLoot}
      canOverride={viewer.perms.isAdmin}
      roster={viewer.perms.isAdmin ? chars.filter((c) => c.inGuild).map((c) => ({ id: c.id, name: c.fullName, className: c.className, level: c.level })).sort((a, b) => a.name.localeCompare(b.name)) : []}
    />
  );
}
