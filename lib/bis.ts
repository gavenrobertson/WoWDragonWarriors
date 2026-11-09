// BiS planner slot model, shared by server and client.
export const BIS_PHASE = "phase-1";

export const SLOTS = [
  "Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", "Hands", "Waist",
  "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2", "Main hand", "Off hand", "Ranged",
] as const;
export type Slot = (typeof SLOTS)[number];

/** Paperdoll layout like the in-game character sheet. */
export const PAPERDOLL: { left: Slot[]; right: Slot[]; bottom: Slot[] } = {
  left: ["Head", "Neck", "Shoulder", "Back", "Chest", "Wrist"],
  right: ["Hands", "Waist", "Legs", "Feet", "Finger 1", "Finger 2", "Trinket 1", "Trinket 2"],
  bottom: ["Main hand", "Off hand", "Ranged"],
};

/** Blizzard inventory_type values that fit each slot (item search filter). */
export const SLOT_TYPES: Record<Slot, string[]> = {
  Head: ["HEAD"], Neck: ["NECK"], Shoulder: ["SHOULDER"], Back: ["CLOAK"], Chest: ["CHEST", "ROBE"], Wrist: ["WRIST"],
  Hands: ["HAND"], Waist: ["WAIST"], Legs: ["LEGS"], Feet: ["FEET"], "Finger 1": ["FINGER"], "Finger 2": ["FINGER"],
  "Trinket 1": ["TRINKET"], "Trinket 2": ["TRINKET"], "Main hand": ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"],
  "Off hand": ["SHIELD", "HOLDABLE", "WEAPONOFFHAND", "WEAPON"], Ranged: ["RANGED", "RANGEDRIGHT", "THROWN", "RELIC"],
};

/** Our stored item slot names (loot table / equipment) → planner slots they can fill. */
export function slotsForItemSlot(slot: string): Slot[] {
  const s = slot.toLowerCase();
  if (s.startsWith("finger")) return ["Finger 1", "Finger 2"];
  if (s.startsWith("trinket")) return ["Trinket 1", "Trinket 2"];
  if (s === "two-hand") return ["Main hand"];
  return (SLOTS as readonly string[]).includes(slot) ? [slot as Slot] : [];
}

export const SOURCE_TYPES = ["raid", "dungeon", "quest", "crafted", "reputation", "pvp", "world"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABEL: Record<SourceType, string> = {
  raid: "Raid", dungeon: "Dungeon", quest: "Quest", crafted: "Crafted", reputation: "Reputation", pvp: "PvP", world: "World drop",
};

export interface SearchItem { id: number; name: string; quality: string; iconUrl: string | null; itemLevel: number | null; requiredLevel: number | null; inventoryType: string }

/** Equipment comes back as Finger/Finger, Trinket/Trinket: number them for the planner. */
export function plannerSlotsForGear<T extends { slot: string }>(gear: T[]): (T & { plannerSlot: Slot | null })[] {
  const seen: Record<string, number> = {};
  return gear.map((g) => {
    if (g.slot === "Finger" || g.slot === "Trinket") {
      seen[g.slot] = (seen[g.slot] ?? 0) + 1;
      return { ...g, plannerSlot: `${g.slot} ${seen[g.slot]}` as Slot };
    }
    return { ...g, plannerSlot: (SLOTS as readonly string[]).includes(g.slot) ? (g.slot as Slot) : null };
  });
}
