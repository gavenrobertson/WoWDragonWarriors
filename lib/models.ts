import "server-only";
// Builds the ZamModelViewer (Wowhead) config for a character from Blizzard data:
//   appearance → race, gender, customization choices, equipped item ids
//   item → appearance → item_display_info_id (Forever first, then retail static data), cached in item_displays.
import * as bnet from "./blizzard";
import { nowIso, sql, sqlOne, tx } from "./db";

// Wowhead viewer inventory-type numbers (WH.Wow.Item.INVENTORY_TYPE_*).
const INV: Record<string, number> = {
  HEAD: 1, NECK: 2, SHOULDER: 3, BODY: 4, SHIRT: 4, CHEST: 5, WAIST: 6, LEGS: 7, FEET: 8, WRIST: 9, HAND: 10, HANDS: 10,
  WEAPON: 13, SHIELD: 14, RANGED: 15, CLOAK: 16, BACK: 16, TWOHWEAPON: 17, TABARD: 19, ROBE: 20, WEAPONMAINHAND: 21,
  WEAPONOFFHAND: 22, HOLDABLE: 23, THROWN: 25, RANGEDRIGHT: 26, RELIC: 28,
};
// Appearance slot → fallback inventory type when the item's own type is unknown.
const SLOT_INV: Record<string, string> = {
  HEAD: "HEAD", SHOULDER: "SHOULDER", SHIRT: "BODY", CHEST: "CHEST", WAIST: "WAIST", LEGS: "LEGS", FEET: "FEET", WRIST: "WRIST",
  HANDS: "HAND", BACK: "CLOAK", TABARD: "TABARD", MAIN_HAND: "WEAPONMAINHAND", OFF_HAND: "WEAPONOFFHAND", RANGED: "RANGED",
};
const HIDDEN = new Set(["NECK", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"]);
// Playable races Wowhead's live viewer has character models for. WoW Forever adds races of its own
// (e.g. 95, High Order Skyborne) that the viewer doesn't know: those fall back to Blizzard's 2D render.
const VIEWER_RACES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 52, 70, 84, 85]);
// Viewer slots whose models live under meta/item (weapons, shields, held items); everything else is meta/armor/{slot}.
const ITEM_META_SLOTS = new Set([13, 14, 15, 17, 21, 22, 23, 25, 26]);
const viewerMetaUrl = (slot: number, display: number) =>
  `https://wow.zamimg.com/modelviewer/live/meta/${ITEM_META_SLOTS.has(slot) ? "item" : `armor/${slot}`}/${display}.json`;
async function viewerHas(slot: number, display: number) {
  try {
    const r = await fetch(viewerMetaUrl(slot, display), { headers: { "User-Agent": "Mozilla/5.0 (compatible; DragonWarriorsHub/1.0)", Referer: "https://www.wowhead.com/" }, cf: { cacheEverything: true, cacheTtl: 604800 } } as RequestInit);
    return r.ok;
  } catch { return null; }
}
const APPEARANCE_TTL_MS = 6 * 3600_000;
const MAX_LOOKUPS = 36; // Blizzard calls per request (Workers Free allows 50 subrequests)

export interface ModelConfig {
  race: number; gender: number; modelId: number; raceName?: string; supported: boolean;
  options: { optionId: number; choiceId: number }[];
  items: [number, number][]; // [inventoryType, displayId]
  missing: number;           // equipped items we couldn't resolve yet
}

interface Appearance { race: number; raceName?: string; gender: number; options: { optionId: number; choiceId: number }[]; items: { id: number; slot: string }[] }

async function loadAppearance(slug: string): Promise<Appearance | null> {
  const row = await sqlOne<{ appearance: string | null; appearance_at: string | null }>("select appearance, appearance_at from characters where slug = $1", [slug]);
  if (row?.appearance && row.appearance_at && Date.now() - new Date(row.appearance_at).getTime() < APPEARANCE_TTL_MS) return JSON.parse(row.appearance);
  const j = await bnet.appearance(slug);
  if (!j?.playable_race) return row?.appearance ? JSON.parse(row.appearance) : null;
  const a: Appearance = {
    race: j.playable_race.id,
    raceName: j.playable_race.name,
    gender: j.gender?.type === "FEMALE" ? 1 : 0,
    options: (j.customizations ?? []).map((c: any) => ({ optionId: c.option?.id, choiceId: c.choice?.id })).filter((o: any) => o.optionId && o.choiceId),
    items: (j.items ?? []).map((i: any) => ({ id: i.id, slot: i.slot?.type })).filter((i: any) => i.id && i.slot),
  };
  await sql("update characters set appearance = $2, appearance_at = $3 where slug = $1", [slug, JSON.stringify(a), nowIso()]);
  return a;
}

/** item → its first appearance → display info id. Tries Forever's static namespace, then retail's. */
async function resolveDisplay(itemId: number, budget: { left: number }) {
  for (const [ns, source] of [[undefined, "forever"], [bnet.RETAIL_STATIC_NS, "retail"]] as const) {
    if (budget.left < 2) return null;
    budget.left--;
    const item = ns ? await bnet.itemIn(itemId, ns).catch(() => null) : await bnet.item(itemId).catch(() => null);
    const apId = item?.appearances?.[0]?.id;
    if (!apId) continue;
    budget.left--;
    const ap = await bnet.itemAppearance(apId, ns).catch(() => null);
    if (ap?.item_display_info_id) {
      return { displayId: ap.item_display_info_id as number, invType: (ap.slot?.type as string) ?? item?.inventory_type?.type ?? null, source };
    }
  }
  return { displayId: null, invType: null, source: "none" };
}

export async function modelConfig(slug: string): Promise<ModelConfig | null> {
  const a = await loadAppearance(slug);
  if (!a) return null;
  if (!VIEWER_RACES.has(a.race)) {
    return { race: a.race, raceName: a.raceName, gender: a.gender, modelId: 0, options: [], items: [], missing: 0, supported: false };
  }
  const shown = a.items.filter((i) => !HIDDEN.has(i.slot));
  const ids = shown.map((i) => i.id);
  const cached = ids.length
    ? await sql<{ item_id: number; display_id: number | null; inv_type: string | null; viewer_ok: number | null }>("select item_id, display_id, inv_type, viewer_ok from item_displays where item_id in (select value from json_each($1))", [ids])
    : [];
  const known = new Map(cached.map((c) => [c.item_id, c]));
  const budget = { left: MAX_LOOKUPS };
  const fresh: { item_id: number; display_id: number | null; inv_type: string | null; source: string; viewer_ok?: number | null }[] = [];
  // Resolve uncached items a few at a time.
  const todo = shown.filter((i) => !known.has(i.id));
  for (let k = 0; k < todo.length && budget.left >= 2; k += 4) {
    const batch = todo.slice(k, k + 4);
    const results = await Promise.all(batch.map((i) => resolveDisplay(i.id, budget)));
    results.forEach((r, j) => {
      if (!r) return; // out of budget: try again next view
      const row = { item_id: batch[j].id, display_id: r.displayId, inv_type: r.invType, source: r.source, viewer_ok: null as number | null };
      fresh.push(row);
      known.set(row.item_id, row);
    });
  }
  if (fresh.length) {
    await tx(async (q) => {
      for (const f of fresh) {
        await q("insert into item_displays (item_id, display_id, inv_type, source, cached_at) values ($1,$2,$3,$4,$5) on conflict (item_id) do update set display_id = excluded.display_id, inv_type = excluded.inv_type, source = excluded.source, cached_at = excluded.cached_at",
          [f.item_id, f.display_id, f.inv_type, f.source, nowIso()]);
      }
    });
  }
  // Check once per item whether Wowhead's viewer has the model; cache the answer.
  const placed = shown.map((i) => {
    const d = known.get(i.id) as { item_id: number; display_id: number | null; inv_type: string | null; viewer_ok?: number | null } | undefined;
    const inv = d?.display_id ? INV[d.inv_type ?? ""] ?? INV[SLOT_INV[i.slot] ?? ""] : undefined;
    return { item: i, d, inv };
  });
  const unchecked = placed.filter((p) => p.d?.display_id && p.inv && p.d.viewer_ok == null);
  const checks = await Promise.all(unchecked.map((p) => viewerHas(p.inv!, p.d!.display_id!)));
  const verdicts = unchecked.map((p, k) => ({ id: p.item.id, ok: checks[k] })).filter((v) => v.ok !== null);
  if (verdicts.length) {
    await tx(async (q) => { for (const v of verdicts) await q("update item_displays set viewer_ok = $2 where item_id = $1", [v.id, v.ok ? 1 : 0]); });
    for (const v of verdicts) { const p = placed.find((x) => x.item.id === v.id); if (p?.d) p.d.viewer_ok = v.ok ? 1 : 0; }
  }
  const items: [number, number][] = [];
  let missing = 0;
  for (const p of placed) {
    if (!p.d?.display_id || !p.inv || p.d.viewer_ok === 0) { missing++; continue; }
    items.push([p.inv, p.d.display_id]);
  }
  return { race: a.race, raceName: a.raceName, gender: a.gender, modelId: a.race * 2 - 1 + a.gender, options: a.options, items, missing, supported: true };
}
