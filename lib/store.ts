import "server-only";
// One read API for every page. Demo mode reads lib/sample.ts; otherwise Postgres.
// Guild-sized data (tens to low hundreds of rows), so loading whole tables per request is fine.
import { cache } from "react";
import { isDemo } from "./config";
import { json, sql, sqlOne } from "./db";
import * as S from "./sample";
import type { Quality, Role, SignupStatus, SourceType } from "./types";
import { minutesSince } from "./ui";
import type { CharMetrics } from "./metrics";

export interface HubCharacter {
  id: string; slug: string; name: string; surname: string; fullName: string; level: number; className: string; race: string;
  spec?: string; role?: Role; roleLabel?: string; rank: number | null; lastSeenMin: number | null; userId?: string;
  isMain: boolean; inGuild: boolean; claimed: boolean; attendancePct?: number; fireResistance?: number; attunements: string[];
  professions: { name: string; skill: number; max?: number }[]; stats: { label: string; value: string }[];
  legacy?: { rank: number; pct: number; milestones: { title: string; when: string }[] };
  gear: { slot: string; name: string; quality: Quality | "empty"; itemId?: number }[]; renderUrl?: string; avatarUrl?: string; syncedAt?: string;
  metrics?: CharMetrics;
  /** Arcade cosmetics of the owning user (claimed characters only). */
  nameStyle?: string; title?: string;
}
export interface HubItem {
  id: number; name: string; quality: Quality; slot: string; slotDetail: string; roles: Role[]; iconUrl?: string; itemLevel?: number; requiredLevel?: number;
  source: { type: SourceType; raid?: string; boss: string; zone: string; mapLabel?: string; mapX?: number; mapY?: number; how: string };
}
export interface HubWish { characterId: string; itemId: number; rank: number; approved: boolean }
export interface HubBis { characterId: string; itemId: number; slot: string; status: "have" | "wishlisted" | "need"; how?: string; sourceType?: string | null; note?: string | null }
export interface HubEvent {
  id: string; raid: string; name: string; kind: string; startsAt: string; size: number; sizeLabel: string; leader: string;
  compNeeds: { role: string; need: number }[]; requirements: string[];
  signups: { characterId: string; status: SignupStatus; consumables: boolean }[]; extraSigned: number;
}
export interface HubRank { index: number; name: string; canSignUp: boolean; canWishlist: boolean; canRunRaids: boolean; canAwardLoot: boolean; isAdmin: boolean }
export interface HubApplication { id: string; name: string; slug: string; level: number | null; className: string | null; role: Role; availability: string; logs: string; about: string; status: "pending" | "accepted" | "declined" }
export interface HubAnnouncement { id: string; title: string; body: string; author: string; authorRole: string; authorColor?: string; date: string }
export interface HubAward { id: string; date: string; itemId: number; itemName: string; quality: Quality; characterName: string; className: string; raid: string; boss: string; method: string; reason?: string }
export interface HubSyncRun { job: string; status: string; value: string; note: string; minutesAgo: number | null }
export interface HubBank { gold: number | null; uploadedAt?: string; items: { name: string; tab: string; qty: number; quality: Quality }[] }
export interface HubCraftRequest { id: string; itemName: string; quantity: number; requester: string; requesterId: string | null; crafter: string | null; crafterId: string | null; status: string; createdAt?: string }

export interface HubUser {
  id: string; battletag: string; siteRole: string | null; createdAt: string;
  main?: { name: string; className: string; level: number; avatarUrl?: string };
  characterCount: number; rankName?: string;
}
export interface CouncilVote { itemId: number; voterUserId: string; characterId: string }
export interface CouncilMember { userId: string; name: string; className: string; avatarUrl?: string; role: string }
export interface GuildProfile { name: string; faction: string; ruleset: string; createdAt?: string; memberCount: number; achievementPoints: number }

export interface Store {
  characters(): Promise<HubCharacter[]>;
  items(): Promise<HubItem[]>;
  itemsByIds(ids: number[]): Promise<HubItem[]>;
  wishlists(): Promise<HubWish[]>;
  bis(): Promise<HubBis[]>;
  events(): Promise<HubEvent[]>;
  ranks(): Promise<HubRank[]>;
  applications(): Promise<HubApplication[]>;
  announcements(): Promise<HubAnnouncement[]>;
  awards(): Promise<HubAward[]>;
  syncRuns(): Promise<HubSyncRun[]>;
  bank(): Promise<HubBank>;
  craftRequests(): Promise<HubCraftRequest[]>;
  settings(): Promise<typeof S.SETTINGS>;
  memberTotal(): Promise<number>;
  users(): Promise<HubUser[]>;
  councilVotes(): Promise<CouncilVote[]>;
  councilMembers(): Promise<CouncilMember[]>;
  guildProfile(): Promise<GuildProfile>;
}

// ---------------------------------------------------------------- demo store
const demoChars = (): HubCharacter[] =>
  S.CHARACTERS.map((c) => ({
    id: c.slug, slug: c.slug, name: c.name, surname: c.surname, fullName: `${c.name} ${c.surname}`, level: c.level, className: c.className, race: c.race,
    spec: c.spec, role: c.role, roleLabel: c.roleLabel, rank: c.rank >= 0 ? c.rank : null, lastSeenMin: c.lastSeenMin,
    userId: c.account ?? c.slug, isMain: !!c.isMain, inGuild: c.inGuild !== false, claimed: c.inGuild !== false,
    attendancePct: c.attendancePct, fireResistance: c.fireResistance, attunements: c.attunements ?? [],
    professions: c.professions ?? [], stats: c.stats ?? [], legacy: c.legacy, gear: c.gear ?? [], metrics: S.demoMetrics(c.slug, c.level),
  }));

const demoStore: Store = {
  characters: async () => demoChars(),
  items: async () => S.ITEMS,
  itemsByIds: async (ids) => S.ITEMS.filter((i) => ids.includes(i.id)),
  wishlists: async () => Object.entries(S.WISHLISTS).flatMap(([slug, list]) => list.map((w, i) => ({ characterId: slug, itemId: w.itemId, rank: i + 1, approved: w.approved }))),
  bis: async () => Object.entries(S.BIS).flatMap(([slug, list]) => list.map((b) => ({ characterId: slug, ...b }))),
  events: async () =>
    S.EVENTS.map((e) => ({
      id: e.key, raid: e.raid, name: e.name, kind: e.kind, startsAt: e.startsAt, size: e.size, sizeLabel: e.sizeLabel, leader: e.leader,
      compNeeds: e.compNeeds, requirements: e.requirements, extraSigned: e.extraSigned,
      signups: e.signups.map((s) => ({ characterId: s.slug, status: s.status, consumables: false })),
    })),
  ranks: async () => S.RANKS,
  applications: async () => S.APPLICATIONS.map((a) => ({ ...a, status: "pending" as const })),
  announcements: async () => S.ANNOUNCEMENTS.map((a, i) => ({ id: String(i), ...a })),
  awards: async () => [],
  syncRuns: async () => S.SYNC_RUNS,
  bank: async () => S.BANK,
  craftRequests: async () => [],
  settings: async () => S.SETTINGS,
  memberTotal: async () => S.MEMBER_TOTAL,
  users: async () => {
    const chars = demoChars();
    const accounts = [...new Set(chars.map((c) => c.userId!))];
    return accounts.map((acc, i) => {
      const own = chars.filter((c) => c.userId === acc);
      const main = own.find((c) => c.isMain) ?? own[0];
      return {
        id: acc, battletag: acc === "demo" ? "Korvath#1234" : `${main.name}#${1100 + i}`, siteRole: acc === "demo" ? "super_admin" : main.rank === 1 ? "officer" : null,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(), characterCount: own.length,
        main: { name: main.fullName, className: main.className, level: main.level }, rankName: S.RANKS.find((r) => r.index === main.rank)?.name,
      };
    });
  },
  guildProfile: async () => S.GUILD_PROFILE,
  councilVotes: async () => [
    { itemId: 16963, voterUserId: "demo", characterId: "korvath-emberfang" },
    { itemId: 16963, voterUserId: "seraphine-dawnmere", characterId: "brugor-ironhide" },
    { itemId: 17068, voterUserId: "seraphine-dawnmere", characterId: "grashk-bloodhowl" },
  ],
  councilMembers: async () => [
    { userId: "demo", name: "Korvath Emberfang", className: "Warrior", role: "Super Admin" },
    { userId: "seraphine-dawnmere", name: "Seraphine Dawnmere", className: "Priest", role: "Officer" },
  ],
};

// ---------------------------------------------------------------- D1 store
async function itemRows(where: string, params: unknown[]): Promise<HubItem[]> {
  const rows = await sql<any>(
    `select i.*, s.type, s.raid, s.boss, s.zone, s.map_label, s.map_x, s.map_y, s.how
     from items i left join item_sources s on s.rowid = (select s2.rowid from item_sources s2 where s2.item_id = i.id order by s2.type limit 1)
     ${where} order by i.id`,
    params,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, quality: r.quality ?? "common", slot: r.slot ?? "", slotDetail: r.slot_detail ?? r.slot ?? "", roles: json(r.roles, []),
    iconUrl: r.icon_url || undefined, itemLevel: r.item_level ?? undefined, requiredLevel: r.required_level ?? undefined,
    source: { type: r.type ?? "", raid: r.raid ?? undefined, boss: r.boss ?? "", zone: r.zone ?? "", mapLabel: r.map_label ?? undefined, mapX: r.map_x ?? undefined, mapY: r.map_y ?? undefined, how: r.how ?? "" },
  }));
}
const iso = (d: string | null) => (d ? new Date(d).toISOString() : "");
const shortDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

const dbStore: Store = {
  async characters() {
    const rows = await sql<any>(
      `select c.*, (u.main_character_id = c.id) as is_main, case when c.claimed then u.name_style end as u_name_style, case when c.claimed then u.title end as u_title
       from characters c left join users u on u.id = c.user_id
       order by c.level desc nulls last, c.name`,
    );
    return rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, surname: r.surname, fullName: `${r.name} ${r.surname}`.trim(), level: r.level ?? 0,
      className: r.class ?? "Unknown", race: r.race ?? "", spec: r.spec ?? undefined, role: r.role ?? undefined, rank: r.guild_rank,
      lastSeenMin: minutesSince(r.last_login_at), userId: r.user_id ?? undefined, isMain: !!r.is_main, inGuild: !!r.in_guild, claimed: !!r.claimed,
      attendancePct: r.attendance_pct ?? undefined, fireResistance: r.fire_resistance ?? undefined, attunements: json(r.attunements, []),
      professions: json(r.professions, []), stats: json(r.stats, []), legacy: json(r.legacy, undefined), gear: json(r.equipment, []),
      renderUrl: r.render_url ?? undefined, avatarUrl: r.avatar_url ?? undefined, syncedAt: iso(r.synced_at),
      metrics: json(r.metrics, undefined), nameStyle: r.u_name_style ?? undefined, title: r.u_title ?? undefined,
    }));
  },
  async items() {
    // Loot pools and BiS sources: only items with a curated source (searched/equipped items are fetched by id).
    return itemRows("where exists (select 1 from item_sources x where x.item_id = i.id)", []);
  },
  async itemsByIds(ids) {
    if (!ids.length) return [];
    return itemRows("where i.id in (select value from json_each($1))", [ids]);
  },
  async wishlists() {
    const rows = await sql<any>("select character_id, item_id, rank, approved from wishlist_items order by character_id, rank");
    return rows.map((r) => ({ characterId: r.character_id, itemId: r.item_id, rank: r.rank, approved: !!r.approved }));
  },
  async bis() {
    const rows = await sql<any>("select character_id, item_id, slot, status, source_type, note from bis_entries where phase = 'phase-1' order by character_id, slot");
    return rows.map((r) => ({ characterId: r.character_id, itemId: r.item_id, slot: r.slot, status: r.status, sourceType: r.source_type, note: r.note }));
  },
  async events() {
    const since = new Date(Date.now() - 86400_000).toISOString();
    const evs = await sql<any>(
      `select e.*, coalesce(l.name || ' ' || l.surname, '[RAID LEADER]') as leader_name from raid_events e
       left join characters l on l.id = e.leader_id where e.starts_at > $1 order by e.starts_at`,
      [since],
    );
    const sus = await sql<any>("select s.event_id, s.character_id, s.status, s.consumables from signups s join raid_events e on e.id = s.event_id where e.starts_at > $1", [since]);
    return evs.map((e) => ({
      id: e.id, raid: e.raid, name: e.name ?? e.raid, kind: e.kind ?? "Raid", startsAt: iso(e.starts_at), size: e.size ?? 0,
      sizeLabel: e.size ? `${e.size} players` : "All members", leader: e.leader_name, compNeeds: json(e.comp_needs, []), requirements: json(e.requirements, []),
      extraSigned: 0,
      signups: sus.filter((s) => s.event_id === e.id).map((s) => ({ characterId: s.character_id, status: s.status, consumables: !!s.consumables })),
    }));
  },
  async ranks() {
    const rows = await sql<any>('select * from guild_ranks order by "index"');
    return rows.map((r) => ({ index: r.index, name: r.name, canSignUp: !!r.can_sign_up, canWishlist: !!r.can_wishlist, canRunRaids: !!r.can_run_raids, canAwardLoot: !!r.can_award_loot, isAdmin: !!r.is_admin }));
  },
  async applications() {
    const rows = await sql<any>(
      `select a.*, c.name, c.surname, c.level, c.class from applications a left join characters c on c.slug = a.character_slug
       order by (a.status = 'pending') desc, a.created_at desc limit 50`,
    );
    return rows.map((r) => ({
      id: r.id, name: r.name ? `${r.name} ${r.surname}` : r.character_slug, slug: r.character_slug, level: r.level, className: r.class,
      role: r.role, availability: r.availability ?? "", logs: r.logs_url ?? "", about: r.about ?? "", status: r.status,
    }));
  },
  async announcements() {
    const rows = await sql<any>(
      `select a.*, c.name, c.surname, c.class, r.name as rank_name from announcements a
       left join users u on u.id = a.author_id left join characters c on c.id = u.main_character_id left join guild_ranks r on r."index" = c.guild_rank
       order by a.created_at desc limit 5`,
    );
    return rows.map((r) => ({
      id: r.id, title: r.title, body: r.body, author: r.name ? `${r.name} ${r.surname}` : "Officer", authorRole: r.rank_name ?? "Officer",
      authorColor: undefined, date: shortDate(r.created_at),
    }));
  },
  async awards() {
    const rows = await sql<any>(
      `select a.id, a.awarded_at, a.item_id, i.name as item_name, i.quality, c.name, c.surname, c.class, e.raid, a.boss, a.method, a.reason
       from loot_awards a join items i on i.id = a.item_id join characters c on c.id = a.character_id left join raid_events e on e.id = a.event_id
       order by a.awarded_at desc limit 200`,
    );
    return rows.map((r) => ({
      id: r.id, date: shortDate(r.awarded_at), itemId: r.item_id, itemName: r.item_name, quality: r.quality ?? "epic", characterName: `${r.name} ${r.surname}`.trim(),
      className: r.class, raid: r.raid ?? "", boss: r.boss ?? "", method: r.method ?? "", reason: r.reason ?? undefined,
    }));
  },
  async syncRuns() {
    const rows = await sql<any>(
      `select job, status, value, note, coalesce(finished_at, started_at) as at from sync_runs s
       where id = (select max(id) from sync_runs s2 where s2.job = s.job)`,
    );
    const byJob = new Map(rows.map((r) => [r.job, r]));
    return ["roster", "profiles", "renders", "icons", "warcraftlogs", "discord", "addon"].map((job) => {
      const r = byJob.get(job);
      return r
        ? { job, status: r.status, value: r.value ?? "", note: r.note ?? "", minutesAgo: minutesSince(r.at) }
        : { job, status: "waiting", value: "Never run", note: "No runs recorded yet", minutesAgo: null };
    });
  },
  async bank() {
    const r = await sqlOne<any>("select gold, items, uploaded_at from bank_snapshots order by uploaded_at desc limit 1");
    return r ? { gold: r.gold != null ? Number(r.gold) : null, uploadedAt: iso(r.uploaded_at), items: json(r.items, []) } : { gold: null, items: [] };
  },
  async craftRequests() {
    const rows = await sql<any>(
      `select r.id, r.item_name, r.quantity, r.status, r.requester_id, r.crafter_id, r.created_at, c.name, c.surname, k.name as k_name, k.surname as k_surname
       from craft_requests r left join characters c on c.id = r.requester_id left join characters k on k.id = r.crafter_id
       where r.status in ('open', 'claimed') order by r.created_at desc limit 30`,
    );
    return rows.map((r) => ({
      id: r.id, itemName: r.item_name, quantity: r.quantity, status: r.status, requesterId: r.requester_id ?? null, crafterId: r.crafter_id ?? null,
      requester: r.name ? `${r.name} ${r.surname}`.trim() : "", crafter: r.k_name ? `${r.k_name} ${r.k_surname}`.trim() : null, createdAt: iso(r.created_at),
    }));
  },
  async settings() {
    const rows = await sql<any>("select key, value from settings");
    const out = { ...S.SETTINGS } as Record<string, unknown>;
    for (const r of rows) out[r.key] = json(r.value, r.value);
    return out as typeof S.SETTINGS;
  },
  async memberTotal() {
    return (await sqlOne<any>("select count(*) as n from characters where in_guild = 1"))?.n ?? 0;
  },
  async users() {
    const rows = await sql<any>(
      `select u.id, u.battletag, u.site_role, u.created_at,
         m.name, m.surname, m.class, m.level, m.avatar_url,
         (select count(*) from characters c where c.user_id = u.id and c.claimed = 1) as n,
         (select r.name from characters c join guild_ranks r on r."index" = c.guild_rank where c.user_id = u.id and c.in_guild = 1 order by c.guild_rank limit 1) as rank_name
       from users u left join characters m on m.id = u.main_character_id
       order by case u.site_role when 'super_admin' then 0 when 'guild_leader' then 1 when 'officer' then 2 when 'raid_leader' then 3 when 'loot_master' then 3 else 9 end, lower(u.battletag)`,
    );
    return rows.map((r) => ({
      id: r.id, battletag: r.battletag, siteRole: r.site_role, createdAt: iso(r.created_at), characterCount: r.n ?? 0, rankName: r.rank_name ?? undefined,
      main: r.name ? { name: `${r.name} ${r.surname}`.trim(), className: r.class ?? "", level: r.level ?? 0, avatarUrl: r.avatar_url ?? undefined } : undefined,
    }));
  },
  async councilVotes() {
    const rows = await sql<any>("select item_id, voter_user_id, character_id from council_votes");
    return rows.map((r) => ({ itemId: r.item_id, voterUserId: r.voter_user_id, characterId: r.character_id }));
  },
  async councilMembers() {
    // Council = anyone whose hub role or best in-guild rank can award loot.
    const rows = await sql<any>(
      `select u.id, u.site_role, m.name, m.surname, m.class, m.avatar_url,
         (select r.name from characters c join guild_ranks r on r."index" = c.guild_rank where c.user_id = u.id and c.in_guild = 1 and r.can_award_loot = 1 order by c.guild_rank limit 1) as rank_name
       from users u left join characters m on m.id = u.main_character_id
       where u.site_role in ('super_admin','guild_leader','officer','loot_master')
          or exists (select 1 from characters c join guild_ranks r on r."index" = c.guild_rank where c.user_id = u.id and c.in_guild = 1 and r.can_award_loot = 1)`,
    );
    const label: Record<string, string> = { super_admin: "Super Admin", guild_leader: "Guild Leader", officer: "Officer", loot_master: "Loot Master" };
    return rows.map((r) => ({
      userId: r.id, name: r.name ? `${r.name} ${r.surname}`.trim() : "Officer", className: r.class ?? "", avatarUrl: r.avatar_url ?? undefined,
      role: label[r.site_role] ?? r.rank_name ?? "Council",
    }));
  },
  async guildProfile() {
    const r = await sqlOne<any>("select value from settings where key = 'guild_profile'");
    const p = json<Partial<GuildProfile>>(r?.value, {});
    const n = await this.memberTotal();
    return { name: p.name ?? "Dragon Warriors", faction: p.faction ?? "Alliance", ruleset: p.ruleset ?? "PvP", createdAt: p.createdAt, memberCount: p.memberCount ?? n, achievementPoints: p.achievementPoints ?? 0 };
  },
};

export const store = (): Store => (isDemo() ? demoStore : dbStore);

// Per-request memoised accessors (several components on one page ask for the same table).
export const getCharacters = cache(() => store().characters());
export const getItems = cache(() => store().items());
export const getWishlists = cache(() => store().wishlists());
export const getEvents = cache(() => store().events());
export const getRanks = cache(() => store().ranks());
export const getSettings = cache(() => store().settings());

export const RAIDS = S.RAIDS;
export const LEVEL_BANDS_SAMPLE = S.LEVEL_BANDS;
