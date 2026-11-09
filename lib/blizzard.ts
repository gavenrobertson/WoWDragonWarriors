import "server-only";
// Blizzard API client for WoW Forever (undocumented namespaces — verify as Blizzard publishes docs).
// Characters are realmless: look them up as "name-surname". Guilds sit under a ruleset, not a realm.
// Based on the handoff's src/blizzard.ts, plus retry/backoff and response normalisers.
import { NS, SITE } from "./config";

const API = `https://${SITE.region}.api.blizzard.com`;
const OAUTH = "https://oauth.battle.net";

let appToken: { value: string; expires: number } | null = null;

const basicAuth = () =>
  "Basic " + Buffer.from(`${process.env.BNET_CLIENT_ID}:${process.env.BNET_CLIENT_SECRET}`).toString("base64");

export const redirectUri = () => process.env.BNET_REDIRECT_URI ?? SITE.auth.battlenetCallback;

/** Client-credentials token for public data (roster, characters, items). Cached in memory. */
export async function getAppToken(): Promise<string> {
  if (appToken && Date.now() < appToken.expires - 60_000) return appToken.value;
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Battle.net token failed: ${res.status}`);
  const j = await res.json();
  appToken = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  return appToken.value;
}

/** Battle.net sign-in: send the user here. */
export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.BNET_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid wow.profile",
    state,
  });
  return `${OAUTH}/authorize?${p}`;
}

/** Exchange the callback ?code= for a user token. */
export async function exchangeCode(code: string) {
  const res = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Code exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; expires_in: number; id_token?: string }>;
}

/** OpenID userinfo: stable account id + BattleTag. */
export async function userInfo(userToken: string) {
  const res = await fetch(`${OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${userToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return res.json() as Promise<{ id: number | string; sub: string; battletag: string }>;
}

export class RateLimited extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string, namespace: string, token?: string, attempt = 0): Promise<T | null> {
  const t = token ?? (await getAppToken());
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}namespace=${namespace}&locale=en_US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
  if (res.status === 404) return null; // not in API yet (under level 10, or render not ready)
  if (res.status === 429) {
    if (attempt >= 3) throw new RateLimited(`${path} rate limited`);
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    await sleep(Math.max(retryAfter * 1000, 500 * 2 ** attempt));
    return get<T>(path, namespace, token, attempt + 1);
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const slugify = (fullName: string) =>
  fullName.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");

const enc = encodeURIComponent;

// --- Account (user token) ---
export const accountCharacters = (userToken: string) => get<any>("/profile/user/wow", NS.profile, userToken);

// --- Character (app token) ---
export const character = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}`, NS.profile);
export const equipment = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/equipment`, NS.profile);
export const media = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/character-media`, NS.profile);
export const appearance = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/appearance`, NS.profile);
export const statistics = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/statistics`, NS.profile);
export const professions = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/professions`, NS.profile);
export const achievements = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/achievements`, NS.profile);
export const quests = (slug: string) => get<any>(`/profile/wow/character/${enc(slug)}/quests/completed`, NS.profile);

// --- Guild (app token) ---
export const guildRoster = (guildSlug = SITE.guildSlug) => get<any>(`/data/wow/guild/${enc(guildSlug)}/roster`, NS.profile);
export const guildActivity = (guildSlug = SITE.guildSlug) => get<any>(`/data/wow/guild/${enc(guildSlug)}/activity`, NS.profile);

// --- Static / dynamic ---
export const item = (id: number) => get<any>(`/data/wow/item/${id}`, NS.static);
export const itemMedia = (id: number) => get<any>(`/data/wow/media/item/${id}`, NS.static); // verify for Forever
export const rulesets = () => get<any>(`/data/wow/ruleset/index`, NS.dynamic);
export const auctions = (rulesetId: number) => get<any>(`/data/wow/ruleset/${rulesetId}/auctions`, NS.dynamic);

// ---------------------------------------------------------------------------
// Normalisers: map API responses onto the hub's shapes. Defensive, because the
// Forever namespaces are undocumented and field names may differ from Classic.
// ---------------------------------------------------------------------------
const CLASS_BY_ID: Record<number, string> = { 1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest", 7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid" };
const RACE_BY_ID: Record<number, string> = { 1: "Human", 2: "Orc", 3: "Dwarf", 4: "Night Elf", 5: "Undead", 6: "Tauren", 7: "Gnome", 8: "Troll", 9: "Goblin", 10: "Blood Elf" };

const nameOf = (ref: any, table: Record<number, string>) => ref?.name ?? (ref?.id != null ? table[ref.id] : undefined);

export function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { name: parts[0] ?? full, surname: parts.slice(1).join(" ") };
}

export interface NormalCharacter {
  slug: string; name: string; surname: string; level: number; className?: string; race?: string; rank?: number; lastLoginAt?: string;
}

export function normaliseRoster(json: any): NormalCharacter[] {
  return (json?.members ?? []).map((m: any) => {
    const c = m.character ?? {};
    const full = [c.name, c.surname].filter(Boolean).join(" ");
    return {
      slug: c.slug ?? slugify(full), // Forever returns "name-surname" slugs directly
      ...splitName(full),
      level: c.level ?? 0,
      className: nameOf(c.playable_class, CLASS_BY_ID),
      race: nameOf(c.playable_race, RACE_BY_ID),
      rank: m.rank,
    };
  });
}

export function normaliseAccount(json: any): NormalCharacter[] {
  const chars = (json?.wow_accounts ?? []).flatMap((a: any) => a.characters ?? []);
  return chars.map((c: any) => {
    const full = [c.name, c.surname].filter(Boolean).join(" ");
    return { slug: c.slug ?? slugify(full), ...splitName(full), level: c.level ?? 0, className: nameOf(c.playable_class, CLASS_BY_ID), race: nameOf(c.playable_race, RACE_BY_ID) };
  });
}

export function normaliseSummary(json: any): Partial<NormalCharacter> & { spec?: string } {
  if (!json) return {};
  return {
    level: json.level,
    className: nameOf(json.character_class, CLASS_BY_ID),
    race: nameOf(json.race, RACE_BY_ID),
    spec: json.active_spec?.name,
    lastLoginAt: json.last_login_timestamp ? new Date(json.last_login_timestamp).toISOString() : undefined,
  };
}

const SLOT_NAMES: Record<string, string> = {
  HEAD: "Head", NECK: "Neck", SHOULDER: "Shoulder", BACK: "Back", CHEST: "Chest", WRIST: "Wrist", HANDS: "Hands", WAIST: "Waist",
  LEGS: "Legs", FEET: "Feet", FINGER_1: "Finger", FINGER_2: "Finger", TRINKET_1: "Trinket", TRINKET_2: "Trinket",
  MAIN_HAND: "Main hand", OFF_HAND: "Off hand", RANGED: "Ranged",
};
const SLOT_ORDER = Object.keys(SLOT_NAMES);

export function normaliseEquipment(json: any) {
  const items = json?.equipped_items ?? [];
  const bySlot = new Map<string, any>(items.map((i: any) => [i.slot?.type, i]));
  return SLOT_ORDER.map((type) => {
    const i = bySlot.get(type);
    return i
      ? { slot: SLOT_NAMES[type], name: i.name ?? "Unknown item", quality: String(i.quality?.type ?? "common").toLowerCase(), itemId: i.item?.id }
      : { slot: SLOT_NAMES[type], name: "Empty", quality: "empty" };
  });
}

export function normaliseProfessions(json: any) {
  const list = [...(json?.primaries ?? []), ...(json?.secondaries ?? [])];
  return list
    .map((p: any) => {
      const tier = p.tiers?.[0] ?? p;
      return { name: p.profession?.name ?? tier.tier?.name, skill: tier.skill_points ?? 0, max: tier.max_skill_points ?? 300 };
    })
    .filter((p: any) => p.name);
}

const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : undefined);
const eff = (s: any) => (typeof s === "number" ? s : s?.effective ?? s?.value);

export function normaliseStats(json: any): { stats: { label: string; value: string }[]; fireResistance?: number } {
  if (!json) return { stats: [] };
  const fire = eff(json.fire_resistance);
  const pct = (v: any) => (typeof eff(v) === "number" ? `${eff(v).toFixed(1)}%` : undefined);
  const rows: [string, string | undefined][] = [
    ["Health", fmt(json.health)],
    [json.power_type?.name ?? "Power", fmt(json.power)],
    ["Strength", fmt(eff(json.strength))],
    ["Agility", fmt(eff(json.agility))],
    ["Stamina", fmt(eff(json.stamina))],
    ["Intellect", fmt(eff(json.intellect))],
    ["Spirit", fmt(eff(json.spirit))],
    ["Armor", fmt(eff(json.armor))],
    ["Defense", fmt(eff(json.defense))],
    ["Block", pct(json.block)],
    ["Melee crit", pct(json.melee_crit)],
    ["Spell crit", pct(json.spell_crit)],
    ["Fire resistance", fmt(fire)],
  ];
  return { stats: rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value })), fireResistance: fire };
}

/** Quest ids that complete an attunement. Onyxia: Alliance "Drakefire Amulet" (6502), Horde "Blood of the Black Dragon Champion" (6602). Verify for Forever. */
export const ATTUNEMENT_QUESTS: Record<string, number[]> = { onyxia: [6602, 6502] };

export function normaliseAttunements(json: any): string[] {
  const done = new Set<number>((json?.quests ?? []).map((q: any) => q.id));
  return Object.entries(ATTUNEMENT_QUESTS).filter(([, ids]) => ids.some((id) => done.has(id))).map(([k]) => k);
}

export function renderUrl(json: any): string | undefined {
  const assets: any[] = json?.assets ?? [];
  return (assets.find((a) => a.key === "main-raw") ?? assets.find((a) => a.key === "main") ?? assets.find((a) => a.key === "avatar"))?.value;
}
