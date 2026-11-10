// Skill games: free to play, scored, on the arcade leaderboard. Client-safe metadata only;
// rewards and score checks live in lib/arcade.ts (SKILL_GAMES).

export const SKILL_IDS = ["typing", "reaction", "murloc", "runes", "gryphon", "pairs", "fire", "barrage", "snake", "pool"] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillMeta {
  /** Must match the game's name in GAMES. */
  name: string;
  /** What the score counts, for labels. */
  unit: string;
  /** "low" when a smaller score is better (reaction times). */
  better: "high" | "low";
  /** "wins" ranks by number of winning games instead of best score. */
  agg?: "wins";
  icon: string;
}

export const SKILL_META: Record<SkillId, SkillMeta> = {
  typing: { name: "Incantations", unit: "WPM", better: "high", icon: "inv_scroll_03" },
  reaction: { name: "Interrupt!", unit: "ms", better: "low", icon: "ability_kick" },
  murloc: { name: "Murloc Mayhem", unit: "bonks", better: "high", icon: "inv_misc_head_murloc_01" },
  runes: { name: "Rune Recall", unit: "runes", better: "high", icon: "inv_misc_rune_01" },
  gryphon: { name: "Gryphon Flight", unit: "towers", better: "high", icon: "ability_mount_gryphon_01" },
  pairs: { name: "Hoard Pairs", unit: "points", better: "high", icon: "inv_misc_bag_10" },
  fire: { name: "Don't Stand in the Fire", unit: "seconds", better: "high", icon: "spell_fire_incinerate" },
  barrage: { name: "Arcane Barrage", unit: "hits", better: "high", icon: "spell_nature_starfall" },
  snake: { name: "Wyrm Run", unit: "points", better: "high", icon: "inv_misc_head_dragon_01" },
  pool: { name: "Dragon's Eye 8-Ball", unit: "wins", better: "high", agg: "wins", icon: "inv_misc_orb_03" },
};

export const isSkill = (slug: string): slug is SkillId => (SKILL_IDS as readonly string[]).includes(slug);

/** Format a stored score for display ("Don't Stand in the Fire" stores tenths of a second). */
export function fmtScore(id: SkillId, n: number) {
  if (id === "fire") return `${(n / 10).toFixed(1)} s`;
  if (id === "reaction") return `${n} ms`;
  if (id === "typing") return `${n} WPM`;
  return n.toLocaleString("en-US");
}

/** Prizes for each game's top three every month. */
export const MONTHLY_PRIZES = [
  { place: "1st", marks: 2500, chest: "hoard" },
  { place: "2nd", marks: 1000, chest: "gilded" },
  { place: "3rd", marks: 500, chest: "copper" },
] as const;
