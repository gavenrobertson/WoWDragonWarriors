import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getCharacters, getItems, getWishlists, store } from "@/lib/store";
import { BisPlanner, type BisChar, type BisRow } from "./BisPlanner";

export const metadata: Metadata = { title: "BiS Planner" };

export default async function BisPage() {
  const [viewer, chars, items, wishes, bis] = await Promise.all([getViewer(), getCharacters(), getItems(), getWishlists(), store().bis()]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const mine = chars.filter((c) => viewer.characters.some((v) => v.id === c.id));

  const lists: BisChar[] = mine
    .map((c) => {
      const wished = new Set(wishes.filter((w) => w.characterId === c.id).map((w) => w.itemId));
      const rows = bis.filter((b) => b.characterId === c.id).flatMap((b) => {
        const it = itemById.get(b.itemId);
        if (!it) return [];
        const status: BisRow["status"] = b.status === "have" ? "have" : wished.has(it.id) ? "wishlisted" : "need";
        return [{
          itemId: it.id, iconUrl: it.iconUrl ?? null, slot: b.slot, name: it.name, quality: it.quality, type: it.source.type, source: it.source.boss, zone: it.source.zone,
          pin: it.source.mapLabel && it.source.mapX != null && it.source.mapY != null ? { label: it.source.mapLabel, x: it.source.mapX, y: it.source.mapY } : null,
          status, how: b.how ?? it.source.how,
        }];
      });
      return { slug: c.slug, name: c.name, className: c.className, avatarUrl: c.avatarUrl ?? null, rows };
    })
    .filter((c) => c.rows.length > 0);

  if (!viewer.signedIn) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <section className="empty stack" style={{ alignItems: "center" }}>
          <h1 style={{ fontSize: 32 }}>BiS Planner</h1>
          <p>Sign in to see the best-in-slot list for your characters.</p>
          <Link href="/sign-in" className="btn btn-primary">Sign in with Battle.net</Link>
        </section>
      </main>
    );
  }
  return <BisPlanner chars={lists} />;
}
