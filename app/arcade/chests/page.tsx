import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { ownedCosmetics } from "@/lib/arcade";
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
        <span className="soft">Spend Dragon Marks, spin the reel, keep what you find. Duplicates turn back into marks.</span>
      </div>
      <ChestOpener chests={CHESTS} cosmetics={COSMETICS} owned={owned} />
    </section>
  );
}
