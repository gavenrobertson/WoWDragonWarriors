// Arcade cosmetics: name styles, titles, site themes and profile banners, plus the chests that drop them.
// Client-safe (no server imports). Rarity uses WoW item quality names and colours.

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type CosmeticKind = "name" | "title" | "theme" | "banner" | "marks";
export type EquipKind = Exclude<CosmeticKind, "marks">;
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
  { id: "name-moonlight", kind: "name", name: "Moonlight", rarity: "uncommon", blurb: "Pale silver-blue name" },
  { id: "name-rosegold", kind: "name", name: "Rose Gold", rarity: "uncommon", blurb: "Soft rose-gold name" },
  { id: "name-toxic", kind: "name", name: "Toxic", rarity: "uncommon", blurb: "Plaguelands lime name" },
  { id: "name-ocean", kind: "name", name: "Tidecaller", rarity: "uncommon", blurb: "Deep sea teal name" },
  { id: "name-icefire", kind: "name", name: "Ice and Fire", rarity: "rare", blurb: "Frost blue melting into flame red" },
  { id: "name-grove", kind: "name", name: "Druid's Grove", rarity: "rare", blurb: "Leaf green to harvest gold" },
  { id: "name-bloodfang", kind: "name", name: "Bloodfang", rarity: "rare", blurb: "Dark crimson to ember orange" },
  { id: "name-nexus", kind: "name", name: "Nexus", rarity: "rare", blurb: "Ley-line cyan to arcane violet" },
  { id: "name-dawn", kind: "name", name: "First Light", rarity: "rare", blurb: "Rose to gold to white" },
  { id: "name-frostglow", kind: "name", name: "Frostbound", rarity: "epic", blurb: "Glowing, breathing ice blue" },
  { id: "name-bloodglow", kind: "name", name: "Blood Rage", rarity: "epic", blurb: "Glowing, pulsing crimson" },
  { id: "name-shadowflame", kind: "name", name: "Shadowflame", rarity: "epic", blurb: "Purple and orange fire that moves" },
  { id: "name-lightforged", kind: "name", name: "Lightforged", rarity: "epic", blurb: "Gold and white with a holy shimmer" },
  { id: "name-emeraldglow", kind: "name", name: "Emerald Dreamer", rarity: "epic", blurb: "Glowing dream green" },
  { id: "name-sunwell", kind: "name", name: "Sunwell", rarity: "legendary", blurb: "Blinding white-gold radiance" },
  { id: "name-frostmourne", kind: "name", name: "Runeblade", rarity: "legendary", blurb: "Ice-steel chrome with glowing runes" },
  { id: "name-ashbringer", kind: "name", name: "Lightbringer", rarity: "legendary", blurb: "Holy silver chrome wreathed in light" },
  { id: "name-timeways", kind: "name", name: "Timeways", rarity: "legendary", blurb: "Bronze sands that flow through your name" },
  { id: "name-nightmare", kind: "name", name: "Nightmare", rarity: "legendary", blurb: "Corrupted green and violet, never still" },
  // titles
  { id: "title-lucky", kind: "title", name: "the Lucky", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-pilgrim", kind: "title", name: "Plinko Pilgrim", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-coin", kind: "title", name: "Coin Flipper", rarity: "uncommon", blurb: "Title shown after your name" },
  { id: "title-hoard", kind: "title", name: "Hoardkeeper", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-unbroken", kind: "title", name: "the Unbroken", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-gavel", kind: "title", name: "of the Gilded Gavel", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-dragon", kind: "title", name: "Dragon-Touched", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-jackpot", kind: "title", name: "Lord of the Jackpot", rarity: "legendary", blurb: "Title shown after your name" },
  { id: "title-patient", kind: "title", name: "the Patient", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-unlucky", kind: "title", name: "the Unlucky", rarity: "common", blurb: "Title shown after your name" },
  { id: "title-cards", kind: "title", name: "Card Shark", rarity: "uncommon", blurb: "Title shown after your name" },
  { id: "title-mines", kind: "title", name: "Master of Mines", rarity: "uncommon", blurb: "Title shown after your name" },
  { id: "title-flight", kind: "title", name: "Flight Master", rarity: "uncommon", blurb: "Title shown after your name" },
  { id: "title-roller", kind: "title", name: "High Roller", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-goblin", kind: "title", name: "Loot Goblin", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-bearer", kind: "title", name: "Gavel-Bearer", rarity: "rare", blurb: "Title shown after your name" },
  { id: "title-dragonbane", kind: "title", name: "Dragonbane", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-undying", kind: "title", name: "the Undying", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-keeper", kind: "title", name: "Keeper of the Hoard", rarity: "epic", blurb: "Title shown after your name" },
  { id: "title-champion", kind: "title", name: "Champion of the Arcade", rarity: "legendary", blurb: "Title shown after your name" },
  { id: "title-eternal", kind: "title", name: "the Eternal", rarity: "legendary", blurb: "Title shown after your name" },
  // site themes
  { id: "theme-stormwind", kind: "theme", name: "Stormwind Azure", rarity: "rare", blurb: "Blue and silver, for the Alliance" },
  { id: "theme-emerald", kind: "theme", name: "Emerald Dream", rarity: "rare", blurb: "Soft green dreamlight" },
  { id: "theme-fel", kind: "theme", name: "Fel Corruption", rarity: "epic", blurb: "Burning fel green" },
  { id: "theme-frost", kind: "theme", name: "Frozen Throne", rarity: "epic", blurb: "Icy blue from Northrend" },
  { id: "theme-molten", kind: "theme", name: "Molten Core", rarity: "epic", blurb: "Lava reds and ember orange" },
  { id: "theme-void", kind: "theme", name: "Void Eclipse", rarity: "legendary", blurb: "Deep void purple and starlight" },
  { id: "theme-celestial", kind: "theme", name: "Celestial Gold", rarity: "legendary", blurb: "Radiant gold and white light" },
  { id: "theme-darkmoon", kind: "theme", name: "Darkmoon Carnival", rarity: "rare", blurb: "Carnival violet and teal lanterns" },
  { id: "theme-shadowlands", kind: "theme", name: "Shadowlands", rarity: "rare", blurb: "Ghostly blue-grey of the afterlife" },
  { id: "theme-bloodmoon", kind: "theme", name: "Blood Moon", rarity: "epic", blurb: "Crimson night under a red moon" },
  { id: "theme-bronze", kind: "theme", name: "Bronze Timeways", rarity: "epic", blurb: "Bronze and sand from the Caverns of Time" },
  { id: "theme-nexus", kind: "theme", name: "Arcane Nexus", rarity: "epic", blurb: "Crackling blue-violet ley energy" },
  { id: "theme-nightmare", kind: "theme", name: "Emerald Nightmare", rarity: "legendary", blurb: "The Dream, corrupted: sickly green and violet" },
  { id: "theme-twilight", kind: "theme", name: "Twilight Dragonflight", rarity: "legendary", blurb: "Molten dusk orange over twilight purple" },
  // deep site themes: full reskins of every surface, not just a tint ("theme-x-*")
  { id: "theme-x-obsidian", kind: "theme", name: "Obsidian Matte", rarity: "rare", blurb: "All black, matte, no glare. Silver type" },
  { id: "theme-x-onyx", kind: "theme", name: "Onyx and Gold", rarity: "epic", blurb: "Matte black with polished gold" },
  { id: "theme-x-chrome", kind: "theme", name: "Midnight Chrome", rarity: "epic", blurb: "Brushed gunmetal and mirror chrome" },
  { id: "theme-x-cyber", kind: "theme", name: "Arcane Circuit", rarity: "rare", blurb: "Cyan ley-light traced on deep navy" },
  { id: "theme-x-felneon", kind: "theme", name: "Fel Neon", rarity: "epic", blurb: "Acid-green neon on pure black" },
  { id: "theme-x-neon", kind: "theme", name: "Neon Nightfall", rarity: "legendary", blurb: "Synthwave pink and cyan, glowing grid horizon" },
  { id: "theme-x-aurora", kind: "theme", name: "Aurora Glass", rarity: "legendary", blurb: "Frosted glass over drifting northern lights" },
  { id: "theme-x-prismatic", kind: "theme", name: "Prismatic", rarity: "legendary", blurb: "Black, with every colour running round the frames" },
  // profile banners: the background behind your name on your character page
  { id: "banner-obsidian", kind: "banner", name: "Obsidian", rarity: "uncommon", blurb: "Matte black with a silver edge" },
  { id: "banner-alliance", kind: "banner", name: "Alliance Standard", rarity: "uncommon", blurb: "Royal blue silk and gold" },
  { id: "banner-horde", kind: "banner", name: "Horde Warbanner", rarity: "uncommon", blurb: "Crimson cloth on dark iron" },
  { id: "banner-emerald", kind: "banner", name: "Emerald Canopy", rarity: "rare", blurb: "Dream-green light through the leaves" },
  { id: "banner-starfall", kind: "banner", name: "Starfall", rarity: "rare", blurb: "A night sky with twinkling stars" },
  { id: "banner-frost", kind: "banner", name: "Frozen Throne", rarity: "rare", blurb: "Shimmering ice crystals" },
  { id: "banner-aurora", kind: "banner", name: "Northern Lights", rarity: "epic", blurb: "Drifting aurora curtains" },
  { id: "banner-inferno", kind: "banner", name: "Inferno", rarity: "epic", blurb: "Rising flames and embers" },
  { id: "banner-leylines", kind: "banner", name: "Ley Lines", rarity: "epic", blurb: "Glowing arcane grid that pulses" },
  { id: "banner-hoard", kind: "banner", name: "Dragon's Hoard", rarity: "epic", blurb: "Piled gold with a moving gleam" },
  { id: "banner-neon", kind: "banner", name: "Neon Horizon", rarity: "legendary", blurb: "Synthwave sun over a racing neon grid" },
  { id: "banner-void", kind: "banner", name: "Void Rift", rarity: "legendary", blurb: "A slowly turning void vortex" },
  { id: "banner-prism", kind: "banner", name: "Prismatic", rarity: "legendary", blurb: "Every colour, flowing" },
  { id: "banner-dragonfire", kind: "banner", name: "Dragonfire", rarity: "legendary", blurb: "The crest wreathed in living flame" },
];
export const cosmeticById = (id: string | null | undefined) => (id ? COSMETICS.find((c) => c.id === id) : undefined);

export interface Chest { id: string; name: string; price: number; blurb: string; odds: Record<Rarity, number>; icon: string }
/** Odds per rarity (sum 1). Inside a rarity every item is equally likely. */
export const CHESTS: Chest[] = [
  { id: "copper", name: "Copper-Bound Chest", price: 250, blurb: "Mostly marks and colours. A small chance at something rare.", icon: "inv_box_01",
    odds: { common: 0.55, uncommon: 0.33, rare: 0.1, epic: 0.018, legendary: 0.002 } },
  { id: "gilded", name: "Gilded Chest", price: 800, blurb: "Better odds at gradients, glows and site themes.", icon: "inv_box_02",
    odds: { common: 0.25, uncommon: 0.38, rare: 0.27, epic: 0.09, legendary: 0.01 } },
  { id: "hoard", name: "Dragon's Hoard", price: 2500, blurb: "No commons. Real shots at chrome names and legendary themes.", icon: "inv_box_04",
    odds: { common: 0, uncommon: 0.3, rare: 0.4, epic: 0.24, legendary: 0.06 } },
];

/** The drop table: rarity by the chest's odds, then any item of that rarity with equal chance.
 *  r1 and r2 are uniform [0,1) numbers (the server passes CSPRNG values). */
export function rollChest(chest: Chest, r1: number, r2: number): Cosmetic {
  let r = r1, rarity: Rarity = "uncommon";
  for (const k of ["legendary", "epic", "rare", "uncommon", "common"] as Rarity[]) {
    if (chest.odds[k] <= 0) continue;
    rarity = k;
    r -= chest.odds[k];
    if (r < 0) break;
  }
  const pool = COSMETICS.filter((c) => c.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(r2 * pool.length))];
}
/** Exact chance (0-1) of one specific item from a chest. */
export const itemOdds = (chest: Chest, c: Cosmetic) => chest.odds[c.rarity] / COSMETICS.filter((x) => x.rarity === c.rarity).length;

export const DEFAULT_THEME = "default";
/** CSS class for a name style id ("name-fel" → "nx nx-fel"). */
export const nameClass = (style?: string | null) => (style && style.startsWith("name-") ? `nx nx-${style.slice(5)}` : "");
export const themeAttr = (theme?: string | null) => (theme && theme.startsWith("theme-") ? theme.slice(6) : undefined);
/** CSS classes for a profile banner id ("banner-neon" → "banner-art bn-neon"). */
export const bannerClass = (id?: string | null) => (id && id.startsWith("banner-") ? `banner-art bn-${id.slice(7)}` : "");
