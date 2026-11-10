import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { CHEST_DROP_DAILY, chestDropChance, ownedCosmetics } from "@/lib/arcade";
import { CHESTS, COSMETICS } from "@/lib/cosmetics";
import { ChestOpener } from "@/components/arcade/ChestOpener";

export const metadata: Metadata = { title: "Chests · Arcade" };

export default async function ChestsPage() {
  const v = await getViewer();
  const owned = v.signedIn && !v.demo && v.userId ? await ownedCosmetics(v.userId) : [];
  return (
    <section className="arcade-game" aria-labelledby="chests-title">
      <div className="arcade-game-head">
        <h1 id="chests-title">Chests</h1>
        <span className="soft">Every bet you place in the arcade can drop a chest, and bigger bets drop them more often. Open the ones you find for free, or buy one with marks. Duplicates turn back into marks.</span>
      </div>
      <ChestOpener chests={CHESTS} cosmetics={COSMETICS} owned={owned}
        drop={{ daily: CHEST_DROP_DAILY, chance: Object.fromEntries(CHESTS.map((c) => [c.id, { at100: chestDropChance(c.id, 100), at1000: chestDropChance(c.id, 1000) }])) }} />
    </section>
  );
}
