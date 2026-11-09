import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { NS } from "@/lib/config";
import { RAIDS, getCharacters, getItems, getSettings, getWishlists, store } from "@/lib/store";
import { LootHub, type LootItem } from "./LootHub";

export const metadata: Metadata = { title: "Loot" };

const SYSTEM_LABEL: Record<string, string> = {
  wishlist_council: "Wishlist priority + loot council", epgp: "EPGP", dkp: "DKP", soft_reserve: "Soft reserve",
};

export default async function LootPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [viewer, chars, items, wishes, awards, settings] = await Promise.all([
    getViewer(), getCharacters(), getItems(), getWishlists(), store().awards(), getSettings(),
  ]);
  const charById = new Map(chars.map((c) => [c.id, c]));
  const wonCount = new Map<string, number>();
  for (const a of awards) wonCount.set(a.characterName, (wonCount.get(a.characterName) ?? 0) + 1);

  const raidItems: LootItem[] = items
    .filter((i) => i.source.type === "raid")
    .map((i) => {
      const queue = wishes
        .filter((w) => w.itemId === i.id)
        .map((w) => {
          const c = charById.get(w.characterId);
          return c && { name: c.fullName, className: c.className, rank: w.rank, won: wonCount.get(c.fullName) ?? 0, att: c.attendancePct ?? 0 };
        })
        .filter((q): q is NonNullable<typeof q> => !!q)
        // Your #1 outranks anyone's #2; ties → attendance, then fewer items won.
        .sort((a, b) => a.rank - b.rank || b.att - a.att || a.won - b.won);
      return { id: i.id, iconUrl: i.iconUrl ?? null, name: i.name, quality: i.quality, slot: i.slot, slotDetail: i.slotDetail, roles: i.roles, raid: i.source.raid ?? "", boss: i.source.boss, queue };
    });

  // Wishlist owner: the viewer's main if it's level 60, else their highest level-60 character.
  const owner = viewer.characters.find((c) => c.isMain && (c.level ?? 0) >= 60) ?? viewer.characters.find((c) => (c.level ?? 0) >= 60);
  const myWish = owner ? wishes.filter((w) => w.characterId === owner.id).sort((a, b) => a.rank - b.rank).map((w) => w.itemId) : [];
  const lockDate = new Date(`${settings.wishlist_lock_date}T12:00:00-06:00`);

  return (
    <LootHub
      initialTab={tab === "wish" ? "wish" : tab === "history" ? "history" : "pools"}
      raids={RAIDS.map((r) => ({ id: r.id, name: r.name, meta: r.lootKnown ? `${r.size} players · ${r.bosses.join(", ")} · ${raidItems.filter((i) => i.raid === r.id).length} items` : `${r.size} players · new raid · loot TBA`, lootKnown: r.lootKnown }))}
      items={raidItems}
      initialWish={myWish}
      owner={owner ? { slug: owner.slug, name: owner.name.split(" ")[0] } : null}
      canWishlist={viewer.perms.canWishlist}
      canImport={viewer.perms.canAwardLoot}
      slots={Number(settings.wishlist_slots) || 6}
      systemLabel={SYSTEM_LABEL[settings.loot_system] ?? settings.loot_system}
      lockLabel={lockDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}
      locked={Date.now() > lockDate.getTime() + 12 * 3600_000}
      awards={awards}
      namespace={NS.static}
    />
  );
}
