// Arcade cosmetics: name styles, titles and site themes, plus the chests that drop them.
// Client-safe (no server imports). Rarity uses WoW item quality names and colours.

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type CosmeticKind = "name" | "title" | "theme" | "marks";
export interface Cosmetic { id: string; kind: CosmeticKind; name: string; rarity: Rarity; blurb: string; marks?: number }

export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#E6E1D8", uncommon: "#4CD964", rare: "#5AA6FF", epic: "#C08CFF", legendary: "#FF9433" };
/** Marks refunded when a chest drops something you already own. */
export const DUPLICATE_REFUND: Record<Rarity, number> = { common: 60, uncommon: 150, rare: 450, epic: 1400, legendary: 5000 };

export const COSMETICS: Cosmetic[] = [
  // marks pouches (common): chests always pay something
  { id: "marks-150", kind: "marks", name: "Pouch of Marks", rarity: "common", blurb: "150 Dragon Marks", marks: 150 },
  { id: "marks-300", kind: "marks", name: "Purse of Marks", rarity: "common", blurb: "300 Dragon Marks", marks: 300 },
  { id: "marks-600", kind: "marks", name: "Strongbox of Marks", rarity: "uncommon", blurb: "600 Dragon Marks", marks: 600 },
  // name colours
  { id: "name-ember", kind: "name", name: "Ember", rarity: "uncommon", blurb: "Warm forge-orange name" },
  { id: "name-arcane", kind: "name", name: "Arcane", rarity: "uncommon", blurb: "Crest-purple name" },
  { id: "name-frost", kind: "name", name: "Frost", rarity: "uncommon", blurb: "Icy blue name" },
  { id: "name-fel", kind: "name", name: "Fel", rarity: "uncommon", blurb: "Sickly fel-green name" },
  { id: "name-blood", kind: "name", name: "Bloodmoon", rarity: "uncommon", blurb: "Deep crimson name" },
  { id: "name-sunset", kind: "name", name: "Sunset over Elwynn", rarity: "rare", blurb: "Gold-to-rose gradient" },
  { id: "name-aurora", kind: "name", name: "Northern Lights", rarity: "rare", blurb: "Teal-to-violet gradient" },
  { id: "name-twilight", kind: "name", name: "Twilight", rarity: "rare", blurb: "Dusk purple-to-blue gradient" },
  { id: "name-felglow", kind: "name", name: "Fel Glow", rarity: "epic", blurb: "Glowing, pulsing fel green" },
  { id: "name-arcaneglow", kind: "name", name: "Arcane Glow", rarity: "epic", blurb: "Glowing, pulsing arcane violet" },
  { id: "name-holyglow", kind: "name", name: "Holy Light", rarity: "epic", blurb: "Radiant golden glow" },
  { id: "name-chrome", kind: "name", name: "Chrome", rarity: "epic", blurb: "Polished silver with a moving shine" },
  { id: "name-goldchrome", kind: "name", name: "Gilded Chrome", rarity: "legendary", blurb: "Molten gold chrome with a moving shine" },
  { id: "name-flame", kind: "name", name: "Living Flame", rarity: "legendary", blurb: "Animated fire that flickers" },
  { id: "name-void", kind: "name", name: "Void Shimmer", rarity: "legendary", blurb: "Shifting void-light with a dark glow" },
  { id: "name-prism", kind: "name", name: "Prismatic", rarity: "legendary", blurb: "Every colour, always moving" },
  // titles
  { id: "title-lucky", kind: "title", name: "the Lucky", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-pilgrim", kind: "title", name: "Plinko Pilgrim", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-coin", kind: "title", name: "Coin Flipper", rarity: "uncommon", blurb: "Title shown after your name" },
  { id: "title-hoard", kind: "title", name: "Hoardkeeper", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-unbroken", kind: "title", name: "the Unbroken", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-gavel", kind: "title", name: "of the Gilded Gavel", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-dragon", kind: "title", name: "Dragon-Touched", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-jackpot", kind: "title", name: "Lord of the Jackpot", rarity: "legendary", blurb: "Title shown after your name" },
  // site themes
  { id: "theme-stormwind", kind: "theme", name: "Stormwind Azure", rarity: "rare", blurb: "Blue and silver, for the Alliance" },
  { id: "theme-emerald", kind: "theme", name: "Emerald Dream", rarity: "rare", blurb: "Soft green dreamlight" },
  { id: "theme-fel", kind: "theme", name: "Fel Corruption", rarity: "epic", blurb: "Burning fel green" },
  { id: "theme-frost", kind: "theme", name: "Frozen Throne", rarity: "epic", blurb: "Icy blue from Northrend" },
  { id: "theme-molten", kind: "theme", name: "Molten Core", rarity: "epic", blurb: "Lava reds and ember orange" },
  { id: "theme-void", kind: "theme", name: "Void Eclipse", rarity: "legendary", blurb: "Deep void purple and starlight" },
  { id: "theme-celestial", kind: "theme", name: "Celestial Gold", rarity: "legendary", blurb: "Radiant gold and white light" },
];
export const cosmeticById = (id: string | null | undefined) => (id ? COSMETICS.find((c) => c.id === id) : undefined);

export interface Chest { id: string; name: string; price: number; blurb: string; odds: Record<Rarity, number>; icon: string }
/** Odds per rarity (sum 1). Inside a rarity every item is equally likely. */
export const CHESTS: Chest[] = [
  { id: "copper", name: "Copper-Bound Chest", price: 400, blurb: "Mostly marks and colours. A small chance at something rare.", icon: "inv_box_01",
    odds: { common: 0.55, uncommon: 0.33, rare: 0.1, epic: 0.018, legendary: 0.002 } },
  { id: "gilded", name: "Gilded Chest", price: 1500, blurb: "Better odds at gradients, glows and site themes.", icon: "inv_box_02",
    odds: { common: 0.25, uncommon: 0.38, rare: 0.27, epic: 0.09, legendary: 0.01 } },
  { id: "hoard", name: "Dragon's Hoard", price: 5000, blurb: "No commons. Real shots at chrome names and legendary themes.", icon: "inv_box_04",
    odds: { common: 0, uncommon: 0.3, rare: 0.4, epic: 0.24, legendary: 0.06 } },
];

export const DEFAULT_THEME = "default";
/** CSS class for a name style id ("name-fel" → "nx nx-fel"). */
export const nameClass = (style?: string | null) => (style && style.startsWith("name-") ? `nx nx-${style.slice(5)}` : "");
export const themeAttr = (theme?: string | null) => (theme && theme.startsWith("theme-") ? theme.slice(6) : undefined);
