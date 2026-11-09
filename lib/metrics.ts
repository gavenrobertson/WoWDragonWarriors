// Guild Hall of Fame: which Blizzard character statistics we keep and how each leaderboard reads.
// Safe to import from client components (no server-only code).

export interface CharMetrics {
  /** Metric key → value. */
  v: Record<string, number>;
  /** Boss kills per instance, e.g. { "Deadmines": 3 }. */
  inst: Record<string, number>;
}

export type MetricGroup = "legends" | "infamy" | "azeroth";
export interface MetricDef { key: string; title: string; label: string; group: MetricGroup; ids: number[]; icon: string }

/** Stat ids from /profile/wow/character/{slug}/achievements/statistics (profile-forever namespace). */
export const METRICS: MetricDef[] = [
  { key: "quests", title: "Questmaster", label: "quests completed", group: "legends", ids: [98], icon: "achievement_quests_completed_08" },
  { key: "dungeons", title: "Dungeon Delver", label: "dungeons entered", group: "legends", ids: [932], icon: "achievement_dungeon_classicdungeonmaster" },
  { key: "bosses", title: "Boss Slayer", label: "boss kills", group: "legends", ids: [], icon: "inv_misc_bone_humanskull_01" },
  { key: "raidBosses", title: "Raid Conqueror", label: "raid boss kills", group: "legends", ids: [], icon: "achievement_boss_onyxia" },
  { key: "kills", title: "Executioner", label: "total kills", group: "legends", ids: [1197], icon: "ability_warrior_bladestorm" },
  { key: "hks", title: "Warmonger", label: "honorable kills", group: "legends", ids: [588], icon: "achievement_pvp_a_a" },
  { key: "killingBlows", title: "Finisher", label: "killing blows", group: "legends", ids: [1487], icon: "ability_backstab" },
  { key: "exalted", title: "Diplomat", label: "factions at Exalted", group: "legends", ids: [1466], icon: "achievement_reputation_08" },
  { key: "flights", title: "World Traveler", label: "flight paths taken", group: "legends", ids: [349], icon: "ability_mount_gryphon_01" },

  { key: "deaths", title: "Spirit Healer's Regular", label: "deaths", group: "infamy", ids: [60], icon: "spell_holy_guardianspirit" },
  { key: "pvpDeaths", title: "Gankee", label: "deaths to other players", group: "infamy", ids: [1501], icon: "ability_rogue_ambush" },
  { key: "camped", title: "Most Camped", label: "times camped", group: "infamy", ids: [64222], icon: "achievement_zone_stranglethorn_01" },
  { key: "falls", title: "Gravity Tester", label: "deaths from falling", group: "infamy", ids: [114], icon: "spell_magic_featherfall" },
  { key: "dungeonDeaths", title: "Wiped Out", label: "deaths in dungeons", group: "infamy", ids: [918], icon: "inv_misc_bone_skull_01" },
  { key: "abandoned", title: "Commitment Issues", label: "quests abandoned", group: "infamy", ids: [94], icon: "inv_misc_note_02" },


  { key: "hearths", title: "Homebody", label: "hearthstone uses", group: "azeroth", ids: [353], icon: "inv_misc_rune_01" },
  { key: "fish", title: "Master Angler", label: "fish caught", group: "azeroth", ids: [1518], icon: "trade_fishing" },
  { key: "drinks", title: "Thirstiest", label: "drinks", group: "azeroth", ids: [346], icon: "inv_drink_05" },
  { key: "food", title: "Hungriest", label: "meals eaten", group: "azeroth", ids: [347], icon: "inv_misc_food_14" },
  { key: "potions", title: "Potion Chugger", label: "potions consumed", group: "azeroth", ids: [345, 922], icon: "inv_potion_51" },
  { key: "critters", title: "Critter Menace", label: "critters killed", group: "azeroth", ids: [108], icon: "spell_magic_polymorphrabbit" },
  { key: "needRolls", title: "Needs Everything", label: "need rolls", group: "azeroth", ids: [1044], icon: "inv_misc_dice_01" },
  { key: "greedRolls", title: "Greedy", label: "greed rolls", group: "azeroth", ids: [1043], icon: "inv_misc_coin_02" },
  { key: "disenchanted", title: "Shard Maker", label: "items disenchanted", group: "azeroth", ids: [181], icon: "inv_enchant_disenchant" },
];

/** Blizzard's icon CDN (the same art the game uses). */
export const wowIcon = (name: string, size: 36 | 56 = 56) => `https://render.worldofwarcraft.com/us/icons/${size}/${name}.jpg`;

export const GROUPS: { id: MetricGroup; title: string; blurb: string }[] = [
  { id: "legends", title: "Legends of the Guild", blurb: "Quests, dungeons and the things that make a hero." },
  { id: "infamy", title: "Hall of Infamy", blurb: "Someone has to hold these records." },
  { id: "azeroth", title: "Around Azeroth", blurb: "Life between the fights." },
];

/** Raids that count toward raid boss kills (instance names as Blizzard writes them). */
export const RAID_INSTANCES = ["Onyxia's Lair", "Hyjal Summit", "Barrow Deeps", "Molten Core", "Blackwing Lair", "Zul'Gurub", "Ruins of Ahn'Qiraj", "Temple of Ahn'Qiraj", "Naxxramas"];

/** Turn the statistics response into compact metrics. Defensive: categories can move between game versions. */
export function extractMetrics(json: any, completedQuests?: number): CharMetrics | null {
  if (!json?.categories) return null;
  const byId = new Map<number, number>();
  const inst: Record<string, number> = {};
  const walk = (cat: any, bossCat: boolean) => {
    const isBoss = bossCat || /boss kills/i.test(cat?.name ?? "");
    for (const s of cat?.statistics ?? []) {
      const q = typeof s.quantity === "number" ? s.quantity : Number(s.quantity);
      if (!Number.isFinite(q)) continue;
      byId.set(s.id, q);
      if (isBoss) {
        const m = /\(([^)]+)\)\s*$/.exec(s.name ?? "");
        const where = m?.[1] ?? "Other";
        inst[where] = (inst[where] ?? 0) + q;
      }
    }
    for (const sc of cat?.sub_categories ?? []) walk(sc, isBoss);
  };
  for (const c of json.categories) walk(c, false);
  const v: Record<string, number> = {};
  for (const m of METRICS) {
    if (!m.ids.length) continue;
    const vals = m.ids.map((id) => byId.get(id)).filter((x): x is number => typeof x === "number");
    if (vals.length) v[m.key] = vals.reduce((a, b) => a + b, 0);
  }
  v.bosses = Object.values(inst).reduce((a, b) => a + b, 0);
  v.raidBosses = Object.entries(inst).filter(([k]) => RAID_INSTANCES.some((r) => r.toLowerCase() === k.toLowerCase())).reduce((a, [, n]) => a + n, 0);
  if (v.quests == null && completedQuests != null) v.quests = completedQuests;
  return { v, inst };
}
