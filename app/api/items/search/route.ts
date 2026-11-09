import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import * as bnet from "@/lib/blizzard";
import { SLOTS, SLOT_TYPES, slotsForItemSlot, type SearchItem, type Slot } from "@/lib/bis";
import { configured, isDemo } from "@/lib/config";
import { sql, tx } from "@/lib/db";
import { ITEMS } from "@/lib/sample";

export const dynamic = "force-dynamic";

/**
 * Item search for the BiS planner: Blizzard's item search (static-forever namespace) filtered to the slot,
 * merged with items the hub already knows (substring match, so partial words work too).
 * Signed-in members only. Results and icons are cached in `items`.
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.signedIn) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const slot = req.nextUrl.searchParams.get("slot") as Slot;
  if (!SLOTS.includes(slot)) return NextResponse.json({ error: "Unknown slot." }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ items: [] });
  const types = SLOT_TYPES[slot];

  if (isDemo() || !configured.battlenet()) {
    const local = ITEMS.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && slotsForItemSlot(i.slot).includes(slot))
      .map<SearchItem>((i) => ({ id: i.id, name: i.name, quality: i.quality, iconUrl: i.iconUrl ?? null, itemLevel: null, requiredLevel: 60, inventoryType: i.slot }));
    return NextResponse.json({ items: local, note: "Demo mode: searching the sample loot table only." });
  }

  // 1) Blizzard search (whole-word match).
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 4).join(" ");
  const params = new URLSearchParams({
    "name.en_US": words, "inventory_type.type": types.join("||"), is_equippable: "true", orderby: "level:desc", _pageSize: "20",
  });
  let remote: any[] = [];
  try {
    const res = await bnet.searchItems(params);
    remote = (res?.results ?? []).map((r: any) => r.data).filter((d: any) => d?.name?.en_US && !/^(Monster -|\[PH\])/i.test(d.name.en_US));
  } catch (e) {
    console.error("item search", e);
  }

  // 2) Known items with a substring match (partial words), filtered by slot type where we know it.
  const known = await sql<any>(
    "select id, name, quality, icon_url, item_level, required_level, slot from items where lower(name) like $1 order by item_level desc nulls last limit 10",
    [`%${q.toLowerCase().replace(/[%_]/g, "")}%`],
  );

  const byId = new Map<number, SearchItem>();
  for (const d of remote) {
    byId.set(d.id, {
      id: d.id, name: d.name.en_US, quality: String(d.quality?.type ?? "common").toLowerCase(), iconUrl: null,
      itemLevel: d.level ?? null, requiredLevel: d.required_level ?? null, inventoryType: d.inventory_type?.type ?? "",
    });
  }
  const cached = byId.size ? await sql<any>(`select id, icon_url from items where id in (select value from json_each($1))`, [[...byId.keys()]]) : [];
  for (const c of cached) { const it = byId.get(c.id); if (it && c.icon_url) it.iconUrl = c.icon_url; }
  for (const k of known) {
    if (k.slot && !slotsForItemSlot(k.slot).includes(slot)) continue;
    if (!byId.has(k.id)) byId.set(k.id, { id: k.id, name: k.name, quality: k.quality ?? "common", iconUrl: k.icon_url || null, itemLevel: k.item_level, requiredLevel: k.required_level, inventoryType: k.slot ?? "" });
  }
  const items = [...byId.values()].slice(0, 16);

  // 3) Icons for results we haven't cached yet (one Blizzard call each, in parallel).
  const missing = items.filter((i) => !i.iconUrl);
  const media = await Promise.allSettled(missing.map((i) => bnet.itemMedia(i.id)));
  media.forEach((m, j) => { if (m.status === "fulfilled") missing[j].iconUrl = bnet.itemIconUrl(m.value) ?? null; });

  // 4) Cache what we found so pages and later searches don't need Blizzard again.
  await tx(async (qq) => {
    for (const i of items) {
      await qq(
        `insert into items (id, name, quality, slot, icon_url, item_level, required_level, cached_at) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (id) do update set icon_url = coalesce(items.icon_url, excluded.icon_url), item_level = coalesce(excluded.item_level, items.item_level),
           required_level = coalesce(excluded.required_level, items.required_level)`,
        [i.id, i.name, i.quality, slot.replace(/ \d$/, ""), i.iconUrl, i.itemLevel, i.requiredLevel, new Date().toISOString()],
      );
    }
  });
  return NextResponse.json({ items });
}
