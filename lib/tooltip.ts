// WoW-style item tooltips. Blizzard returns the same tooltip shape on equipped items (profile /equipment)
// and on static items (preview_item), so one normaliser serves both. Safe to import on the client (types only there).

export interface ItemTip {
  name: string;
  quality: string;
  binding?: string;
  unique?: string;
  slot?: string;
  subclass?: string;
  armor?: string;
  block?: string;
  weapon?: { damage?: string; speed?: string; dps?: string };
  /** White base stats first, then green "Equip:" bonuses. */
  stats: { text: string; green?: boolean }[];
  /** "Equip: …", "Use: …", "Chance on hit: …" */
  spells: string[];
  set?: { name: string; items: string[]; effects: { text: string; active?: boolean }[] };
  durability?: string;
  classes?: string;
  requires?: string;
  itemLevel?: string;
  sell?: { g: number; s: number; c: number };
  description?: string;
  /** "retail" when Forever had no data and the tooltip came from Blizzard's retail item data. */
  source?: "forever" | "retail";
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function normaliseTip(i: any, source: ItemTip["source"] = "forever"): ItemTip | null {
  if (!i) return null;
  const stats = (i.stats ?? [])
    .map((x: any) => ({ text: s(x.display?.display_string) ?? "", green: !!x.is_equip_bonus || (x.display?.color?.g === 255 && x.display?.color?.r === 0) }))
    .filter((x: any) => x.text);
  const spells = (i.spells ?? []).map((x: any) => s(x.description)).filter(Boolean) as string[];
  const sp = i.sell_price?.display_strings;
  const sell = sp ? { g: Number(sp.gold) || 0, s: Number(sp.silver) || 0, c: Number(sp.copper) || 0 } : undefined;
  const set = i.set
    ? {
        name: s(i.set.display_string) ?? s(i.set.item_set?.name) ?? "Item set",
        items: (i.set.items ?? []).map((x: any) => s(x.item?.name)).filter(Boolean),
        effects: (i.set.effects ?? []).map((x: any) => ({ text: s(x.display_string) ?? "", active: !!x.is_active })).filter((x: any) => x.text),
      }
    : undefined;
  return {
    name: s(i.name) ?? "Unknown item",
    quality: String(i.quality?.type ?? "common").toLowerCase(),
    binding: s(i.binding?.name),
    unique: s(i.unique_equipped),
    slot: s(i.inventory_type?.name),
    subclass: i.is_subclass_hidden ? undefined : s(i.item_subclass?.name),
    armor: s(i.armor?.display?.display_string) ?? s(i.armor?.display_string),
    block: s(i.shield_block?.display?.display_string),
    weapon: i.weapon ? { damage: s(i.weapon.damage?.display_string), speed: s(i.weapon.attack_speed?.display_string), dps: s(i.weapon.dps?.display_string) } : undefined,
    stats,
    spells,
    set: set && (set.items.length || set.effects.length) ? set : undefined,
    durability: s(i.durability?.display_string),
    classes: s(i.requirements?.playable_classes?.display_string),
    requires: s(i.requirements?.level?.display_string),
    itemLevel: s(i.level?.display_string),
    sell: sell && (sell.g || sell.s || sell.c) ? sell : undefined,
    description: s(i.description),
    source,
  };
}
