import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { NS, SITE } from "@/lib/config";
import { getCharacters, getItems, getRanks, getWishlists } from "@/lib/store";
import { CharacterView, type CharacterVM } from "./CharacterView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = (await getCharacters()).find((x) => x.slug === slug);
  return c ? { title: c.fullName, description: `Level ${c.level} ${c.race} ${c.className} of ${SITE.name}` } : { title: "Character not found" };
}

export default async function CharacterPage({ params }: Props) {
  const { slug } = await params;
  const [viewer, chars, ranks, wishes, items] = await Promise.all([getViewer(), getCharacters(), getRanks(), getWishlists(), getItems()]);
  const active = chars.find((c) => c.slug === slug);
  if (!active) notFound();

  // Switcher: every claimed character on the same Battle.net account (mains + alts).
  const account = active.userId ? chars.filter((c) => c.userId === active.userId && c.claimed) : [active];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const rankOf = (idx: number | null) => ranks.find((r) => r.index === idx);
  const beforeRaids = Date.now() < new Date(SITE.raidUnlock).getTime();

  const toVM = (c: typeof active): CharacterVM => {
    const rank = rankOf(c.rank);
    const wl = wishes.filter((w) => w.characterId === c.id).sort((a, b) => a.rank - b.rank);
    return {
      slug: c.slug, name: c.fullName, level: c.level, race: c.race, className: c.className, spec: c.spec ?? "—",
      role: c.roleLabel ?? (c.role ? c.role[0].toUpperCase() + c.role.slice(1) : c.level < 60 ? "Leveling" : "—"),
      isMain: c.isMain, rank: rank?.name ?? (c.inGuild ? "Member" : "Not in guild"),
      attendance: c.level < 60 ? "Not raiding" : beforeRaids || c.attendancePct == null ? "Starts Dec 9" : `${Math.round(c.attendancePct)}%`,
      priority: wl.length === 0 ? "None yet" : c.isMain ? "Tier 1" : "Alt",
      stats: c.stats, legacy: c.legacy ?? null, profs: c.professions, gear: c.gear, renderUrl: c.renderUrl ?? null, syncedAt: c.syncedAt ?? null,
      wishlist: wl.map((w) => {
        const it = itemById.get(w.itemId);
        return { rank: w.rank, name: it?.name ?? `Item ${w.itemId}`, source: it ? [it.source.zone.split(",")[0], it.source.boss].filter(Boolean).join(" · ") : "", status: w.approved ? "Approved" : "Pending review" };
      }),
    };
  };

  const canSync = !viewer.demo && (viewer.characters.some((c) => c.slug === slug) || viewer.perms.isAdmin);
  return (
    <CharacterView
      active={toVM(active)}
      switcher={account.map((c) => ({ slug: c.slug, name: c.fullName, level: c.level, race: c.race, className: c.className, isMain: c.isMain }))}
      isOwn={viewer.characters.some((c) => c.slug === slug)}
      canSync={canSync || viewer.demo}
      namespace={NS.profile}
    />
  );
}
