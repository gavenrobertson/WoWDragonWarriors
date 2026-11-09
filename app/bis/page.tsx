import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { SLOTS, plannerSlotsForGear, type Slot } from "@/lib/bis";
import { getCharacters, getWishlists, store } from "@/lib/store";
import { BisPlanner, type BisChar, type BisEntry } from "./BisPlanner";

export const metadata: Metadata = { title: "BiS Planner" };

export default async function BisPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <section className="empty stack" style={{ alignItems: "center" }}>
          <h1 style={{ fontSize: 32 }}>BiS Planner</h1>
          <p>Sign in to plan the best-in-slot gear for your characters.</p>
          <Link href="/sign-in" className="btn btn-primary">Sign in with Battle.net</Link>
        </section>
      </main>
    );
  }

  const [chars, wishes, bis] = await Promise.all([getCharacters(), getWishlists(), store().bis()]);
  const mine = chars.filter((c) => viewer.characters.some((v) => v.id === c.id));
  const ids = new Set<number>();
  for (const c of mine) {
    for (const b of bis) if (b.characterId === c.id) ids.add(b.itemId);
    for (const g of c.gear) if (g.itemId) ids.add(g.itemId);
  }
  const items = new Map((await store().itemsByIds([...ids])).map((i) => [i.id, i]));

  const lists: BisChar[] = mine.map((c) => {
    const equipped = plannerSlotsForGear(c.gear);
    const equippedIds = new Set(c.gear.map((g) => g.itemId).filter(Boolean));
    const wished = new Set(wishes.filter((w) => w.characterId === c.id).map((w) => w.itemId));
    const slots = Object.fromEntries(SLOTS.map((s) => [s, null])) as Record<Slot, BisEntry | null>;
    for (const b of bis) {
      if (b.characterId !== c.id || !(SLOTS as readonly string[]).includes(b.slot)) continue;
      const it = items.get(b.itemId);
      const src = it?.source;
      slots[b.slot as Slot] = {
        itemId: b.itemId, name: it?.name ?? `Item ${b.itemId}`, quality: it?.quality ?? "common", iconUrl: it?.iconUrl ?? null, itemLevel: it?.itemLevel ?? null,
        sourceType: b.sourceType ?? (src?.type || null), note: b.note ?? (src?.boss || ""),
        status: b.status === "have" ? "have" : "need", equipped: equippedIds.has(b.itemId), wishlisted: wished.has(b.itemId),
        curated: src && src.type ? { zone: src.zone, how: b.how ?? src.how, pin: src.mapLabel && src.mapX != null && src.mapY != null ? { label: src.mapLabel, x: src.mapX, y: src.mapY } : null } : null,
      };
    }
    const eq = Object.fromEntries(SLOTS.map((s) => [s, null])) as BisChar["equipped"];
    for (const g of equipped) {
      if (!g.plannerSlot || g.quality === "empty") continue;
      eq[g.plannerSlot] = { name: g.name, quality: g.quality, iconUrl: g.itemId ? items.get(g.itemId)?.iconUrl ?? null : null };
    }
    return { slug: c.slug, name: c.fullName, className: c.className, level: c.level, avatarUrl: c.avatarUrl ?? null, renderUrl: c.renderUrl ?? null, slots, equipped: eq };
  });

  return <BisPlanner chars={lists} />;
}
