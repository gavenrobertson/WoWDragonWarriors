import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { ownedCosmetics } from "@/lib/arcade";
import { COSMETICS } from "@/lib/cosmetics";
import { Collection } from "@/components/arcade/Collection";

export const metadata: Metadata = { title: "Collection · DW Arcade" };

export default async function CollectionPage() {
  const v = await getViewer();
  if (!v.signedIn || v.demo || !v.userId) {
    return <div className="empty">Sign in to see your collection. <Link href="/sign-in">Sign in</Link></div>;
  }
  const owned = await ownedCosmetics(v.userId);
  return (
    <section className="arcade-game" aria-labelledby="col-title">
      <div className="arcade-game-head">
        <h1 id="col-title">Collection</h1>
        <span className="soft">Equip your name style, title, profile banner and site theme. Everyone sees your name, title and banner; the theme is just for you.</span>
      </div>
      <Collection cosmetics={COSMETICS.filter((c) => c.kind !== "marks")} owned={owned} equipped={v.cosmetics}
        me={{ name: v.main?.name ?? v.battletag?.split("#")[0] ?? "You", className: v.main?.className ?? null }} />
    </section>
  );
}
