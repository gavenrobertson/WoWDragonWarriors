// Display helpers shared by server and client components.
import type { Quality, Role } from "./types";

export const CLASS_COLOR: Record<string, string> = {
  warrior: "#C69B6D", paladin: "#F48CBA", hunter: "#AAD372", rogue: "#FFF468", priest: "#F2F2F2",
  shaman: "#4A9EFF", mage: "#3FC7EB", warlock: "#9A9BF2", druid: "#FF7C0A",
};
// Class icons from /data/wow/media/playable-class/{id} (static-forever-us).
export const CLASS_ICON: Record<string, string> = {
  warrior: "https://render.worldofwarcraft.com/forever-us/icons/56/626008.jpg",
  paladin: "https://render.worldofwarcraft.com/forever-us/icons/56/626003.jpg",
  hunter: "https://render.worldofwarcraft.com/forever-us/icons/56/626000.jpg",
  rogue: "https://render.worldofwarcraft.com/forever-us/icons/56/626005.jpg",
  priest: "https://render.worldofwarcraft.com/forever-us/icons/56/626004.jpg",
  shaman: "https://render.worldofwarcraft.com/forever-us/icons/56/626006.jpg",
  mage: "https://render.worldofwarcraft.com/forever-us/icons/56/626001.jpg",
  warlock: "https://render.worldofwarcraft.com/forever-us/icons/56/626007.jpg",
  druid: "https://render.worldofwarcraft.com/forever-us/icons/56/625999.jpg",
};
export const classIcon = (cls?: string | null) => CLASS_ICON[(cls ?? "").toLowerCase()];

export const classColor = (cls?: string | null) => CLASS_COLOR[(cls ?? "").toLowerCase()] ?? "#D9CCAE";

export const QUALITY_COLOR: Record<Quality | "empty", string> = {
  legendary: "#FF9433", epic: "#C08CFF", rare: "#5AA6FF", uncommon: "#4CD964", common: "#E6E1D8", empty: "#6f6656",
};
export const qualityColor = (q?: string | null) => QUALITY_COLOR[(q ?? "common") as Quality] ?? QUALITY_COLOR.common;

export const SLOT_ABBR: Record<string, string> = {
  Head: "HD", Neck: "NK", Shoulder: "SH", Back: "BK", Chest: "CH", Wrist: "WR", Hands: "HN", Waist: "WS", Legs: "LG",
  Feet: "FT", Finger: "RG", Trinket: "TR", "Main hand": "MH", "Off hand": "OH", Ranged: "RD", "Two-hand": "2H", Quest: "QI",
};
export const slotAbbr = (slot: string) => SLOT_ABBR[slot] ?? slot.slice(0, 2).toUpperCase();

export const ROLE_LABEL: Record<Role, string> = { tank: "Tank", healer: "Healer", melee: "Melee", ranged: "Ranged" };

export const SOURCE_COLORS: Record<string, [bg: string, fg: string]> = {
  raid: ["#3A2C10", "#F5D77E"], dungeon: ["#262019", "#B9A8FF"], quest: ["#123A35", "#7FE3D2"], crafted: ["#3E2414", "#FFB27A"],
  reputation: ["#1F3320", "#9BE59E"], world: ["#2A2A2A", "#E6E1D8"],
};

export const STATUS = { ok: "#4CD964", warn: "#F2B84B", bad: "#FF8A7A", muted: "#A8987A" };

export function timeAgo(minutes: number | null | undefined): string {
  if (minutes == null) return "Unknown";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const h = Math.round(minutes / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(minutes / 1440);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export const minutesSince = (iso?: string | Date | null) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null;

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
