export type Role = "tank" | "healer" | "melee" | "ranged";
export type Quality = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type SignupStatus = "accepted" | "tentative" | "late" | "bench" | "declined";
export type SourceType = "raid" | "dungeon" | "quest" | "crafted" | "reputation" | "world";
export type LootSystem = "wishlist_council" | "epgp" | "dkp" | "soft_reserve";

export interface User { id: string; bnetId: string; battletag: string; discordId?: string; mainCharacterId?: string; createdAt: string; }
export interface Character {
  id: string; userId?: string; slug: string;            // name-surname
  name: string; surname: string; level: number; className: string; race: string; spec?: string;
  role?: Role; guildRank?: number; lastLoginAt?: string; renderUrl?: string; syncedAt: string;
}
export interface GuildRank { index: number; name: string; canSignUp: boolean; canWishlist: boolean; canRunRaids: boolean; canAwardLoot: boolean; isAdmin: boolean; }
export interface Item { id: number; name: string; quality: Quality; slot: string; iconUrl?: string; }
export interface ItemSource { itemId: number; type: SourceType; raid?: string; boss?: string; zone: string; mapPin?: { x: number; y: number }; how: string; }
export interface BisEntry { characterId: string; phase: string; slot: string; itemId: number; status: "have" | "wishlisted" | "need"; }
export interface WishlistItem { characterId: string; itemId: number; rank: number; approved: boolean; lockedAt?: string; }
export interface RaidEvent { id: string; raid: "onyxias-lair" | "hyjal-summit" | "barrow-deeps" | string; startsAt: string; size: number; leaderId: string; discordMessageId?: string; }
export interface Signup { eventId: string; characterId: string; status: SignupStatus; note?: string; }
export interface LootAward { id: string; eventId: string; itemId: number; characterId: string; method: string; reason?: string; awardedBy: string; awardedAt: string; }
export interface Application { id: string; characterSlug: string; role: Role; logsUrl?: string; availability: string; about: string; status: "pending" | "accepted" | "declined"; }
export interface Attendance { eventId: string; characterId: string; state: "present" | "late" | "bench" | "absent"; source: "warcraftlogs" | "manual"; }
