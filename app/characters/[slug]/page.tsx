import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { NS, SITE } from "@/lib/config";
import { getCharacters, getRanks, getWishlists, store } from "@/lib/store";
import { GROUPS, METRICS } from "@/lib/metrics";
import { CharacterView, type CharacterVM } from "./CharacterView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = (await getCharacters()).find((x) => x.slug === slug);
  return c ? { title: c.fullName, description: `Level ${c.level} ${c.race} ${c.className} of ${SITE.name}` } : { title: "Character not found" };
}

export default async function CharacterPage({ params }: Props) {
  const { slug } = await params;
  const [viewer, chars, ranks, wishes] = await Promise.all([getViewer(), getCharacters(), getRanks(), getWishlists()]);
  const active = chars.find((c) => c.slug === slug);
  if (!active) notFound();
  const account0 = active.userId ? chars.filter((c) => c.userId === active.userId && c.claimed) : [active];
  const wantIds = [...new Set([...active.gear.map((g) => g.itemId), ...wishes.filter((w) => account0.some((c) => c.id === w.characterId)).map((w) => w.itemId)].filter((x): x is number => !!x))];
  const items = await store().itemsByIds(wantIds);

  // Switcher: every claimed character on the same Battle.net account (mains + alts).
  const account = active.userId ? chars.filter((c) => c.userId === active.userId && c.claimed) : [active];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const rankOf = (idx: number | null) => ranks.find((r) => r.index === idx);
  const beforeRaids = Date.now() < new Date(SITE.raidUnlock).getTime();

  // Personal records: every stat with the character's place in the guild, and the guild titles they hold.
  const tracked = chars.filter((c) => c.inGuild && c.metrics);
  const recordsOf = (c: typeof active): CharacterVM["records"] => {
    if (!c.metrics) return null;
    const rows = METRICS.map((m) => {
      const value = c.metrics!.v[m.key] ?? 0;
      const rank = c.inGuild && value > 0 ? 1 + tracked.filter((o) => (o.metrics!.v[m.key] ?? 0) > value).length : null;
      return { key: m.key, group: m.group, title: m.title, label: m.label[0].toUpperCase() + m.label.slice(1), raw: m.label, icon: m.icon, value, rank };
    });
    return {
      of: tracked.length,
      titles: rows.filter((r) => r.rank === 1).map((r) => ({ title: r.title, label: r.raw, icon: r.icon })),
      groups: GROUPS.map((g) => ({ title: g.title, rows: rows.filter((r) => r.group === g.id).map(({ key, label, icon, value, rank }) => ({ key, label, icon, value, rank })) })),
    };
  };

  const toVM = (c: typeof active): CharacterVM => {
    const rank = rankOf(c.rank);
    const wl = wishes.filter((w) => w.characterId === c.id).sort((a, b) => a.rank - b.rank);
    return {
      slug: c.slug, name: c.fullName, nameStyle: c.nameStyle ?? null, title: c.title ?? null, level: c.level, race: c.race, className: c.className, spec: c.spec ?? "—",
      role: c.roleLabel ?? (c.role ? c.role[0].toUpperCase() + c.role.slice(1) : c.level < 60 ? "Leveling" : "—"),
      isMain: c.isMain, rank: rank?.name ?? (c.inGuild ? "Member" : "Not in guild"),
      attendance: c.level < 60 ? "Not raiding" : beforeRaids || c.attendancePct == null ? "Starts Dec 9" : `${Math.round(c.attendancePct)}%`,
      priority: wl.length === 0 ? "None yet" : c.isMain ? "Tier 1" : "Alt",
      records: recordsOf(c),
      stats: c.stats, legacy: c.legacy ?? null, profs: c.professions, renderUrl: c.renderUrl ?? null, syncedAt: c.syncedAt ?? null,
      gear: c.gear.map((g) => ({ ...g, iconUrl: g.itemId ? itemById.get(g.itemId)?.iconUrl ?? null : null })),
      wishlist: wl.map((w) => {
        const it = itemById.get(w.itemId);
        return { rank: w.rank, itemId: w.itemId, name: it?.name ?? `Item ${w.itemId}`, iconUrl: it?.iconUrl ?? null, slot: it?.slot ?? "", source: it ? [it.source.zone.split(",")[0], it.source.boss].filter(Boolean).join(" · ") : "", status: w.approved ? "Approved" : "Pending review" };
      }),
    };
  };

  const canSync = !viewer.demo && (viewer.characters.some((c) => c.slug === slug) || viewer.perms.isAdmin);
  return (
    <CharacterView
      active={toVM(active)}
      switcher={account.map((c) => ({ slug: c.slug, name: c.fullName, level: c.level, race: c.race, className: c.className, isMain: c.isMain, avatarUrl: c.avatarUrl ?? null }))}
      isOwn={viewer.characters.some((c) => c.slug === slug)}
      canSync={canSync || viewer.demo}
      namespace={NS.profile}
    />
  );
}
