// Sample data taken from the design screens. Used in two places:
//  1. Demo mode (no DATABASE_URL): pages render straight from this file.
//  2. `npm run db:seed`: loads the same data into Postgres.
// Every name, number and item here is placeholder data.
// This file must stay import-free (type imports only) so `node scripts/seed.ts` can load it.
import type { Quality, Role, SignupStatus, SourceType } from "./types";

export interface SampleGear { slot: string; name: string; quality: Quality | "empty" }
export interface SampleCharacter {
  slug: string; name: string; surname: string; level: number; className: string; race: string;
  spec?: string; role?: Role; roleLabel?: string; rank: number; lastSeenMin: number; account?: string; isMain?: boolean;
  inGuild?: boolean; attendancePct?: number; fireResistance?: number; attunements?: string[];
  professions?: { name: string; skill: number }[];
  stats?: { label: string; value: string }[];
  legacy?: { rank: number; pct: number; milestones: { title: string; when: string }[] };
  gear?: SampleGear[];
}

const g = (rows: [string, string, string][]): SampleGear[] =>
  rows.map(([slot, name, q]) => ({
    slot, name,
    quality: ({ l: "legendary", e: "epic", r: "rare", u: "uncommon", c: "common", x: "empty" } as const)[q as "l"] ?? "common",
  }));

export const SAMPLE_USER = { bnetId: "demo-1", battletag: "Korvath#1234" };

export const RANKS = [
  { index: 0, name: "Guild Master", canSignUp: true, canWishlist: true, canRunRaids: true, canAwardLoot: true, isAdmin: true },
  { index: 1, name: "Officer", canSignUp: true, canWishlist: true, canRunRaids: true, canAwardLoot: true, isAdmin: true },
  { index: 2, name: "Raid Leader", canSignUp: true, canWishlist: true, canRunRaids: true, canAwardLoot: false, isAdmin: false },
  { index: 3, name: "Raider", canSignUp: true, canWishlist: true, canRunRaids: false, canAwardLoot: false, isAdmin: false },
  { index: 4, name: "Member", canSignUp: true, canWishlist: false, canRunRaids: false, canAwardLoot: false, isAdmin: false },
  { index: 5, name: "Alt", canSignUp: true, canWishlist: false, canRunRaids: false, canAwardLoot: false, isAdmin: false },
];

export const CHARACTERS: SampleCharacter[] = [
  {
    slug: "korvath-emberfang", name: "Korvath", surname: "Emberfang", level: 60, className: "Warrior", race: "Human",
    spec: "Protection", role: "tank", roleLabel: "Tank", rank: 1, lastSeenMin: 12, account: "demo", isMain: true, inGuild: true,
    attendancePct: 100, fireResistance: 85, attunements: ["onyxia"],
    professions: [{ name: "Blacksmithing", skill: 300 }, { name: "Mining", skill: 285 }],
    stats: [{ label: "Health", value: "6,840" }, { label: "Armor", value: "9,120" }, { label: "Strength", value: "214" }, { label: "Agility", value: "118" }, { label: "Stamina", value: "402" }, { label: "Defense", value: "441" }, { label: "Fire resistance", value: "85" }, { label: "Block", value: "18.4%" }],
    legacy: { rank: 14, pct: 62, milestones: [{ title: "Reached level 60", when: "[DATE]" }, { title: "First dungeon full clear", when: "[DATE]" }, { title: "Seasonal journey chapter complete", when: "[DATE]" }] },
    gear: g([["Head", "Helm of Valor", "r"], ["Neck", "Mark of Fordring", "r"], ["Shoulder", "Spaulders of Valor", "r"], ["Back", "Cape of the Black Baron", "r"], ["Chest", "Breastplate of Valor", "r"], ["Wrist", "Bracers of Valor", "r"], ["Hands", "Gauntlets of Valor", "r"], ["Waist", "Belt of Valor", "r"], ["Legs", "Legplates of Valor", "r"], ["Feet", "Boots of Valor", "r"], ["Finger", "Blackstone Ring", "r"], ["Finger", "Painweaver Band", "r"], ["Trinket", "Hand of Justice", "r"], ["Trinket", "Mark of Tyranny", "r"], ["Main hand", "Ironfoe", "e"], ["Off hand", "Draconian Deflector", "r"]]),
  },
  {
    slug: "morwen-ashveil", name: "Morwen", surname: "Ashveil", level: 60, className: "Mage", race: "Gnome",
    spec: "Fire", role: "ranged", roleLabel: "Ranged DPS", rank: 5, lastSeenMin: 3 * 1440, account: "demo", inGuild: true,
    attendancePct: 75, fireResistance: 40, attunements: ["onyxia"],
    professions: [{ name: "Tailoring", skill: 290 }, { name: "Enchanting", skill: 265 }],
    stats: [{ label: "Health", value: "3,410" }, { label: "Mana", value: "6,920" }, { label: "Intellect", value: "298" }, { label: "Spirit", value: "121" }, { label: "Stamina", value: "176" }, { label: "Spell damage", value: "+212" }, { label: "Spell crit", value: "8.9%" }, { label: "Fire resistance", value: "40" }],
    legacy: { rank: 9, pct: 35, milestones: [{ title: "Reached level 60", when: "[DATE]" }, { title: "Learned all class trainers’ ranks", when: "[DATE]" }] },
    gear: g([["Head", "Magister’s Crown", "r"], ["Neck", "Tooth of Gnarr", "r"], ["Shoulder", "Magister’s Mantle", "r"], ["Back", "Archivist Cape", "r"], ["Chest", "Magister’s Robes", "r"], ["Wrist", "Magister’s Bindings", "r"], ["Hands", "Magister’s Gloves", "r"], ["Waist", "Magister’s Belt", "r"], ["Legs", "Magister’s Leggings", "r"], ["Feet", "Magister’s Boots", "r"], ["Finger", "Maiden’s Circle", "r"], ["Finger", "Band of Rumination", "r"], ["Trinket", "Briarwood Reed", "r"], ["Trinket", "Eye of the Beast", "r"], ["Main hand", "Hand of Edward the Odd", "e"], ["Ranged", "Skul’s Ghastly Touch", "r"]]),
  },
  {
    slug: "zanjin-stormtusk", name: "Zanjin", surname: "Stormtusk", level: 47, className: "Shaman", race: "Dwarf",
    spec: "Enhancement", roleLabel: "Leveling", rank: 4, lastSeenMin: 2 * 1440, account: "demo", inGuild: true,
    professions: [{ name: "Herbalism", skill: 210 }, { name: "Alchemy", skill: 195 }],
    stats: [{ label: "Health", value: "2,280" }, { label: "Mana", value: "2,610" }, { label: "Strength", value: "131" }, { label: "Agility", value: "74" }, { label: "Stamina", value: "138" }, { label: "Intellect", value: "96" }, { label: "Armor", value: "2,940" }, { label: "Level", value: "47 / 60" }],
    legacy: { rank: 4, pct: 80, milestones: [{ title: "Reached level 40", when: "[DATE]" }, { title: "Earned first mount", when: "[DATE]" }] },
    gear: g([["Head", "Empty", "x"], ["Neck", "Jungle Pendant", "u"], ["Shoulder", "Ridgeback Mantle", "u"], ["Back", "Cloak of the Wild", "u"], ["Chest", "Raptorhide Hauberk", "r"], ["Wrist", "Empty", "x"], ["Hands", "Stonefist Gloves", "u"], ["Waist", "Ironbark Girdle", "u"], ["Legs", "Marsh Walker Leggings", "u"], ["Feet", "Swiftstep Boots", "u"], ["Finger", "Copper Band", "c"], ["Finger", "Empty", "x"], ["Trinket", "Empty", "x"], ["Trinket", "Empty", "x"], ["Main hand", "Earthsplitter Axe", "r"], ["Off hand", "Tidecaller Totem", "u"]]),
  },
  { slug: "gildra-coinpurse", name: "Gildra", surname: "Coinpurse", level: 12, className: "Rogue", race: "Gnome", rank: -1, lastSeenMin: 300, account: "demo", inGuild: false },
  { slug: "brugor-ironhide", name: "Brugor", surname: "Ironhide", level: 60, className: "Warrior", race: "Night Elf", spec: "Protection", role: "tank", rank: 3, lastSeenMin: 1440, inGuild: true, isMain: true, attendancePct: 92, fireResistance: 120, attunements: ["onyxia"] },
  { slug: "seraphine-dawnmere", name: "Seraphine", surname: "Dawnmere", level: 60, className: "Priest", race: "Human", spec: "Holy", role: "healer", rank: 1, lastSeenMin: 40, inGuild: true, isMain: true, attendancePct: 100, attunements: ["onyxia"], professions: [{ name: "Tailoring", skill: 300 }] },
  { slug: "zultaki-riverhorn", name: "Zultaki", surname: "Riverhorn", level: 58, className: "Shaman", race: "Night Elf", spec: "Restoration", role: "healer", rank: 3, lastSeenMin: 60, inGuild: true, isMain: true, attendancePct: 88 },
  { slug: "thornhoof-greymane", name: "Thornhoof", surname: "Greymane", level: 55, className: "Druid", race: "Night Elf", spec: "Restoration", role: "healer", rank: 4, lastSeenMin: 180, inGuild: true, isMain: true, attendancePct: 83, professions: [{ name: "Leatherworking", skill: 285 }] },
  { slug: "grashk-bloodhowl", name: "Grashk", surname: "Bloodhowl", level: 60, className: "Warrior", race: "Human", spec: "Fury", role: "melee", rank: 3, lastSeenMin: 120, inGuild: true, isMain: true, attendancePct: 96 },
  { slug: "kessa-nightbloom", name: "Kessa", surname: "Nightbloom", level: 60, className: "Rogue", race: "Human", spec: "Combat", role: "melee", rank: 3, lastSeenMin: 300, inGuild: true, isMain: true, attendancePct: 90, attunements: ["onyxia"] },
  { slug: "vexmora-duskhollow", name: "Vexmora", surname: "Duskhollow", level: 60, className: "Warlock", race: "Human", spec: "Destruction", role: "ranged", rank: 3, lastSeenMin: 120, inGuild: true, isMain: true, attendancePct: 96, attunements: ["onyxia"], professions: [{ name: "Alchemy", skill: 300 }] },
  { slug: "ashlynn-coldwater", name: "Ashlynn", surname: "Coldwater", level: 60, className: "Mage", race: "Dwarf", spec: "Frost", role: "ranged", rank: 3, lastSeenMin: 1500, inGuild: true, isMain: true, attendancePct: 100, attunements: ["onyxia"], professions: [{ name: "Enchanting", skill: 300 }] },
  { slug: "draven-swiftarrow", name: "Draven", surname: "Swiftarrow", level: 59, className: "Hunter", race: "Human", spec: "Marksmanship", role: "ranged", rank: 4, lastSeenMin: 360, inGuild: true, isMain: true, professions: [{ name: "Engineering", skill: 280 }] },
];

// Zanjin's Alchemy shows up in the crafting directory too.
export const MEMBER_TOTAL = 48; // the full guild; only the characters above are modelled in detail
export const LEVEL_BANDS = [
  { band: "Level 60", count: 23 }, { band: "50–59", count: 11 }, { band: "40–49", count: 7 }, { band: "30–39", count: 4 }, { band: "Under 30", count: 3 },
];

export interface SampleItem {
  id: number; name: string; quality: Quality; slot: string; slotDetail: string; roles: Role[]; iconUrl?: string;
  source: { type: SourceType; raid?: string; boss: string; zone: string; mapLabel?: string; mapX?: number; mapY?: number; how: string };
}
const ONY = { type: "raid" as const, raid: "onyxias-lair", boss: "Onyxia", zone: "Onyxia’s Lair, Dustwallow Marsh", mapLabel: "Onyxia’s Lair", mapX: 34, mapY: 70, how: "Drops from Onyxia." };
const all: Role[] = ["tank", "healer", "melee", "ranged"];

// Item ids are the classic ids for these items; verify against static-forever-us once Blizzard publishes the namespace.
export const ITEMS: SampleItem[] = [
  { id: 16963, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133173.jpg", name: "Helm of Wrath", quality: "epic", slot: "Head", slotDetail: "Head · Plate · Warrior tier 2", roles: ["tank", "melee"], source: ONY },
  { id: 16914, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133172.jpg", name: "Netherwind Crown", quality: "epic", slot: "Head", slotDetail: "Head · Cloth · Mage tier 2", roles: ["ranged"], source: { ...ONY, how: "Mage tier 2 helm from Onyxia." } },
  { id: 16921, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133126.jpg", name: "Halo of Transcendence", quality: "epic", slot: "Head", slotDetail: "Head · Cloth · Priest tier 2", roles: ["healer"], source: ONY },
  { id: 16929, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133076.jpg", name: "Nemesis Skullcap", quality: "epic", slot: "Head", slotDetail: "Head · Cloth · Warlock tier 2", roles: ["ranged"], source: ONY },
  { id: 16947, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133171.jpg", name: "Helmet of Ten Storms", quality: "epic", slot: "Head", slotDetail: "Head · Mail · Shaman tier 2", roles: ["healer"], source: ONY },
  { id: 16900, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133077.jpg", name: "Stormrage Cover", quality: "epic", slot: "Head", slotDetail: "Head · Leather · Druid tier 2", roles: ["healer"], source: ONY },
  { id: 16908, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133143.jpg", name: "Bloodfang Hood", quality: "epic", slot: "Head", slotDetail: "Head · Leather · Rogue tier 2", roles: ["melee"], source: ONY },
  { id: 16939, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133073.jpg", name: "Dragonstalker’s Helm", quality: "epic", slot: "Head", slotDetail: "Head · Mail · Hunter tier 2", roles: ["ranged"], source: ONY },
  { id: 17068, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/132400.jpg", name: "Deathbringer", quality: "epic", slot: "Main hand", slotDetail: "One-hand axe", roles: ["melee", "tank"], source: ONY },
  { id: 17075, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/135316.jpg", name: "Vis’kag the Bloodletter", quality: "epic", slot: "Main hand", slotDetail: "One-hand sword", roles: ["melee"], source: ONY },
  { id: 17063, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133357.jpg", name: "Ring of Binding", quality: "epic", slot: "Finger", slotDetail: "Finger", roles: ["tank"], source: { ...ONY, how: "Drops from Onyxia. Usually low contest, so a good tank pickup." } },
  { id: 17064, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/134317.jpg", name: "Shard of the Scale", quality: "epic", slot: "Trinket", slotDetail: "Trinket", roles: ["healer"], source: ONY },
  { id: 17078, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133768.jpg", name: "Sapphiron Drape", quality: "epic", slot: "Back", slotDetail: "Back", roles: ["ranged", "healer"], source: { ...ONY, how: "Caster cloak from Onyxia." } },
  { id: 18205, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/132501.jpg", name: "Eskhandar’s Collar", quality: "epic", slot: "Neck", slotDetail: "Neck", roles: ["melee"], source: ONY },
  { id: 17067, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133739.jpg", name: "Ancient Cornerstone Grimoire", quality: "epic", slot: "Off hand", slotDetail: "Held in off hand", roles: ["ranged", "healer"], source: { ...ONY, how: "Held-in-off-hand drop from Onyxia." } },
  { id: 18422, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/134153.jpg", name: "Head of Onyxia", quality: "epic", slot: "Quest", slotDetail: "Quest item · one per kill", roles: all, source: ONY },
  // Non-raid BiS items
  { id: 18404, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133296.jpg", name: "Onyxia Tooth Pendant", quality: "epic", slot: "Neck", slotDetail: "Neck", roles: ["tank", "melee"], source: { type: "quest", boss: "The Lord of Blackrock", zone: "Stormwind City, Elwynn Forest", mapLabel: "Stormwind", mapX: 63, mapY: 88, how: "Someone in the raid loots the Head of Onyxia and turns it in to Highlord Bolvar Fordragon in Stormwind. The follow-up rewards the pendant (or the Onyxia Blood Talisman or Dragonslayer’s Signet)." } },
  { id: 13340, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133772.jpg", name: "Cape of the Black Baron", quality: "rare", slot: "Back", slotDetail: "Back", roles: ["tank", "melee"], source: { type: "dungeon", boss: "Baron Rivendare", zone: "Stratholme, Eastern Plaguelands", mapLabel: "Stratholme", mapX: 81, mapY: 22, how: "Final boss of Stratholme’s Undead side." } },
  { id: 11815, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133434.jpg", name: "Hand of Justice", quality: "rare", slot: "Trinket", slotDetail: "Trinket", roles: ["tank", "melee"], source: { type: "dungeon", boss: "Trash, rare drop", zone: "Blackrock Depths, Blackrock Mountain", mapLabel: "Blackrock Mountain", mapX: 71, mapY: 62, how: "Random drop from Blackrock Depths trash. Farm full clears." } },
  { id: 13965, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/133604.jpg", name: "Blackhand’s Breadth", quality: "epic", slot: "Trinket", slotDetail: "Trinket", roles: ["tank", "melee"], source: { type: "dungeon", boss: "General Drakkisath", zone: "Upper Blackrock Spire, Blackrock Mountain", mapLabel: "Blackrock Mountain", mapX: 71, mapY: 62, how: "Final boss of Upper Blackrock Spire. Needs a 10-player group." } },
  { id: 12784, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/132400.jpg", name: "Arcanite Reaper", quality: "epic", slot: "Two-hand", slotDetail: "Two-hand axe", roles: ["melee"], source: { type: "crafted", boss: "Blacksmithing", zone: "Any guild blacksmith", how: "Crafted by a blacksmith. You can make it yourself once you have the materials." } },
  { id: 14152, iconUrl: "https://render.worldofwarcraft.com/forever-us/icons/56/132679.jpg", name: "Robe of the Archmage", quality: "epic", slot: "Chest", slotDetail: "Chest · Cloth", roles: ["ranged"], source: { type: "crafted", boss: "Tailoring", zone: "Any guild tailor", how: "Crafted by a tailor." } },
];

// BiS lists (phase 1) — status: have | wishlisted | need
export const BIS: Record<string, { itemId: number; slot: string; status: "have" | "wishlisted" | "need"; how?: string }[]> = {
  "korvath-emberfang": [
    { itemId: 16963, slot: "Head", status: "wishlisted", how: "Drops from Onyxia. It’s on your wishlist at #1, so you’re first in the priority queue." },
    { itemId: 18404, slot: "Neck", status: "need" },
    { itemId: 13340, slot: "Back", status: "have" },
    { itemId: 17068, slot: "Main hand", status: "wishlisted", how: "Drops from Onyxia. Wishlisted at #2, behind another warrior’s #1." },
    { itemId: 17063, slot: "Finger 1", status: "wishlisted" },
    { itemId: 11815, slot: "Trinket 1", status: "have" },
    { itemId: 13965, slot: "Trinket 2", status: "need" },
  ],
  "morwen-ashveil": [
    { itemId: 16914, slot: "Head", status: "wishlisted" },
    { itemId: 17078, slot: "Back", status: "wishlisted" },
    { itemId: 17067, slot: "Off hand", status: "need" },
    { itemId: 14152, slot: "Chest", status: "have" },
  ],
};

// Raid wishlists: rank order per character; approved = council signed off.
export const WISHLISTS: Record<string, { itemId: number; approved: boolean }[]> = {
  "korvath-emberfang": [{ itemId: 16963, approved: true }, { itemId: 17068, approved: false }, { itemId: 17063, approved: true }],
  "brugor-ironhide": [{ itemId: 16963, approved: true }],
  "ashlynn-coldwater": [{ itemId: 16914, approved: true }],
  "morwen-ashveil": [{ itemId: 16914, approved: true }, { itemId: 17078, approved: false }],
  "seraphine-dawnmere": [{ itemId: 16921, approved: true }, { itemId: 17064, approved: true }],
  "vexmora-duskhollow": [{ itemId: 16929, approved: true }],
  "zultaki-riverhorn": [{ itemId: 17064, approved: false }, { itemId: 16947, approved: true }],
  "thornhoof-greymane": [{ itemId: 16900, approved: true }],
  "grashk-bloodhowl": [{ itemId: 17068, approved: true }],
};

export const RAIDS = [
  { id: "onyxias-lair", name: "Onyxia’s Lair", size: 40, bosses: ["Onyxia"], lootKnown: true },
  { id: "hyjal-summit", name: "Hyjal Summit", size: 20, bosses: [], lootKnown: false },
  { id: "barrow-deeps", name: "Barrow Deeps", size: 10, bosses: [], lootKnown: false },
];

export interface SampleEvent {
  key: string; raid: string; name: string; kind: string; startsAt: string; size: number; sizeLabel: string; leader: string;
  compNeeds: { role: string; need: number }[]; requirements: string[];
  signups: { slug: string; status: SignupStatus }[]; extraSigned: number;
}
// [TIME] placeholders: events default to 8pm Central.
export const EVENTS: SampleEvent[] = [
  { key: "meeting", raid: "guild", name: "Guild meeting: loot rules Q&A", kind: "Guild event", startsAt: "2026-11-14T20:00:00-06:00", size: 0, sizeLabel: "All members", leader: "[GUILD MASTER]", compNeeds: [], requirements: [], signups: [], extraSigned: 21 },
  { key: "dungeons", raid: "dungeons", name: "Dungeon night: pre-raid gear", kind: "Guild event", startsAt: "2026-11-21T20:00:00-06:00", size: 0, sizeLabel: "5-player groups", leader: "[OFFICER]", compNeeds: [{ role: "Tanks", need: 4 }, { role: "Healers", need: 4 }, { role: "Damage", need: 12 }], requirements: ["level:55"], signups: [], extraSigned: 15 },
  {
    key: "ony1", raid: "onyxias-lair", name: "Onyxia’s Lair: first clear", kind: "Raid · main team", startsAt: "2026-12-09T20:00:00-06:00", size: 40, sizeLabel: "40 players", leader: "[RAID LEADER]",
    compNeeds: [{ role: "Tanks", need: 4 }, { role: "Healers", need: 11 }, { role: "Melee", need: 12 }, { role: "Ranged", need: 13 }],
    requirements: ["level:60", "attune:onyxia", "fireres:150", "consumables"],
    signups: [
      { slug: "korvath-emberfang", status: "accepted" }, { slug: "brugor-ironhide", status: "accepted" }, { slug: "seraphine-dawnmere", status: "accepted" },
      { slug: "thornhoof-greymane", status: "tentative" }, { slug: "zultaki-riverhorn", status: "accepted" }, { slug: "grashk-bloodhowl", status: "late" },
      { slug: "vexmora-duskhollow", status: "accepted" }, { slug: "ashlynn-coldwater", status: "bench" },
    ],
    extraSigned: 18,
  },
  { key: "hyjal1", raid: "hyjal-summit", name: "Hyjal Summit: Team A", kind: "Raid · team A", startsAt: "2026-12-10T20:00:00-06:00", size: 20, sizeLabel: "20 players", leader: "[RAID LEADER]", compNeeds: [{ role: "Tanks", need: 2 }, { role: "Healers", need: 5 }, { role: "Damage", need: 13 }], requirements: ["level:60"], signups: [], extraSigned: 14 },
  { key: "barrow1", raid: "barrow-deeps", name: "Barrow Deeps: groups 1 & 2", kind: "Raid · alt-friendly", startsAt: "2026-12-12T20:00:00-06:00", size: 20, sizeLabel: "10 players × 2", leader: "[OFFICER]", compNeeds: [{ role: "Tanks", need: 4 }, { role: "Healers", need: 6 }, { role: "Damage", need: 10 }], requirements: ["level:60"], signups: [], extraSigned: 17 },
];

export const ANNOUNCEMENTS = [
  { title: "Loot rules for the first tier are posted", body: "Wishlist priority with loot council review. Attendance from day one counts toward your priority, so sign up early.", author: "[GUILD MASTER]", authorRole: "Guild Master", authorColor: "#C69B6D", date: "[DATE]" },
  { title: "Raid nights: [DAYS] at [TIME]", body: "Main team runs Onyxia's Lair; Hyjal and Barrow Deeps groups form from the signup board.", author: "[RAID LEADER]", authorRole: "Raid Leader", authorColor: "#F48CBA", date: "[DATE]" },
];

export const APPLICATIONS = [
  { id: "a1", name: "Gildra Coinpurse", slug: "gildra-coinpurse", level: 12, className: "Rogue", role: "melee" as Role, availability: "Wed, Thu", logs: "", about: "Leveling a new rogue, raided in Classic and want a steady Forever home." },
  { id: "a2", name: "Halvar Stonebrow", slug: "halvar-stonebrow", level: 60, className: "Shaman", role: "healer" as Role, availability: "Wed, Thu, Sat", logs: "https://www.warcraftlogs.com/character/…", about: "Restoration main, attuned, fire resist set in progress." },
  { id: "a3", name: "Nyra Moonwhisper", slug: "nyra-moonwhisper", level: 58, className: "Druid", role: "tank" as Role, availability: "Thu", logs: "", about: "Feral tank, happy to start on the Barrow Deeps team." },
];

export const BANK = {
  gold: null as number | null, // [GOLD] — filled by the first addon export
  items: [
    { name: "Greater Fire Protection Potion", tab: "Raid consumables", qty: 25, quality: "common" as Quality },
    { name: "Major Healing Potion", tab: "Raid consumables", qty: 40, quality: "common" as Quality },
    { name: "Elixir of the Mongoose", tab: "Raid consumables", qty: 12, quality: "common" as Quality },
    { name: "Arcanite Bar", tab: "Crafting materials", qty: 6, quality: "uncommon" as Quality },
    { name: "Runecloth", tab: "Crafting materials", qty: 340, quality: "common" as Quality },
    { name: "Black Lotus", tab: "Crafting materials", qty: 2, quality: "uncommon" as Quality },
  ],
};

export const SYNC_RUNS = [
  { job: "icons", status: "ok", value: "22 icons cached", note: "All item icons cached", minutesAgo: 9 },
  { job: "roster", status: "ok", value: "48 members", note: "Last sync 4 min ago", minutesAgo: 4 },
  { job: "profiles", status: "ok", value: "46 / 48", note: "2 characters under level 10 aren’t in the API yet", minutesAgo: 4 },
  { job: "renders", status: "partial", value: "41 / 48", note: "New characters can take a day to get renders", minutesAgo: 60 },
  { job: "warcraftlogs", status: "ok", value: "0 reports", note: "Raid reports import after each raid night", minutesAgo: 120 },
  { job: "discord", status: "ok", value: "#raid-signups", note: "Posts events, pings applicants", minutesAgo: 30 },
  { job: "addon", status: "waiting", value: "Bank: [TIME]", note: "Loot export expected after Dec 9", minutesAgo: null },
];

export const SETTINGS = {
  loot_system: "wishlist_council",
  wishlist_slots: 6,
  wishlist_lock_date: "2026-12-08",
  attendance_window: "8w",
  guild_motd: "Raids open December 9. Hit 60, get attuned, and lock your wishlist by the 8th!",
  guild_info: "Dragon Warriors is an Alliance guild on the WoW Forever PvP ruleset.\n\nWe raid Onyxia's Lair, Hyjal Summit and the Barrow Deeps, run dungeon nights for pre-raid gear, and help each other level. Loot is wishlist priority with loot council review.\n\nNew players and alts welcome. Apply on the hub and an officer will reach out.",
};

export const GUILD_PROFILE = { name: "Dragon Warriors", faction: "Alliance", ruleset: "PvP", createdAt: "2026-11-05T08:35:27.000Z", memberCount: 48, achievementPoints: 0 };
