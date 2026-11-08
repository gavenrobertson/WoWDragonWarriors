// Loads the sample guild from lib/sample.ts into Postgres (dev/staging only).
// Usage: DATABASE_URL=... npm run db:seed        (refuses to run twice unless SEED_FORCE=1)
import pg from "pg";
import * as S from "../lib/sample.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await db.connect();
const q = (text: string, params: unknown[] = []) => db.query(text, params);

const existing = await q("select count(*)::int as n from characters");
if (existing.rows[0].n > 0 && process.env.SEED_FORCE !== "1") {
  console.error("characters table isn't empty; set SEED_FORCE=1 to wipe and reseed");
  process.exit(1);
}

await q("begin");
await q(`truncate sessions, sync_runs, settings, bank_snapshots, craft_requests, announcements, applications, attendance, loot_awards,
         signups, raid_events, wishlist_items, bis_entries, item_sources, items, characters, guild_ranks, users restart identity cascade`);

for (const r of S.RANKS) {
  await q("insert into guild_ranks values ($1,$2,$3,$4,$5,$6,$7)", [r.index, r.name, r.canSignUp, r.canWishlist, r.canRunRaids, r.canAwardLoot, r.isAdmin]);
}

const demoUser = (await q("insert into users (bnet_id, battletag) values ($1,$2) returning id", [S.SAMPLE_USER.bnetId, S.SAMPLE_USER.battletag])).rows[0].id;
const ids = new Map<string, string>();
for (const c of S.CHARACTERS) {
  // Roster-only characters get their own placeholder user so mains/alts link like real accounts.
  let userId: string | null = demoUser;
  if (c.account !== "demo") userId = (await q("insert into users (bnet_id, battletag) values ($1,$2) returning id", [`seed-${c.slug}`, `${c.name}#0000`])).rows[0].id;
  const row = await q(
    `insert into characters (user_id, slug, name, surname, level, class, race, spec, role, guild_rank, last_login_at, claimed, in_guild,
       equipment, stats, professions, legacy, attunements, fire_resistance, attendance_pct, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - ($11 || ' minutes')::interval, $12,$13,$14,$15,$16,$17,$18,$19,$20, now()) returning id`,
    [userId, c.slug, c.name, c.surname, c.level, c.className, c.race, c.spec ?? null, c.role ?? null, c.rank >= 0 ? c.rank : null, String(c.lastSeenMin),
     c.account !== "demo" || c.inGuild !== false, c.inGuild !== false, c.gear ? JSON.stringify(c.gear) : null, c.stats ? JSON.stringify(c.stats) : null,
     JSON.stringify(c.professions ?? []), c.legacy ? JSON.stringify(c.legacy) : null, c.attunements ?? [], c.fireResistance ?? null, c.attendancePct ?? null],
  );
  ids.set(c.slug, row.rows[0].id);
  if (c.isMain) await q("update users set main_character_id = $2 where id = $1", [userId, row.rows[0].id]);
}

for (const it of S.ITEMS) {
  await q("insert into items (id, name, quality, slot, slot_detail, roles, cached_at) values ($1,$2,$3,$4,$5,$6, now())", [it.id, it.name, it.quality, it.slot, it.slotDetail, it.roles]);
  const s = it.source;
  await q("insert into item_sources (item_id, type, raid, boss, zone, map_x, map_y, how, map_label) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [it.id, s.type, s.raid ?? null, s.boss, s.zone, s.mapX ?? null, s.mapY ?? null, s.how, s.mapLabel ?? null]);
}
for (const [slug, list] of Object.entries(S.BIS)) for (const b of list) {
  await q("insert into bis_entries (character_id, phase, slot, item_id, status) values ($1,'phase-1',$2,$3,$4)", [ids.get(slug), b.slot, b.itemId, b.status === "have" ? "have" : "need"]);
}
for (const [slug, list] of Object.entries(S.WISHLISTS)) for (const [i, w] of list.entries()) {
  await q("insert into wishlist_items (character_id, item_id, rank, approved) values ($1,$2,$3,$4)", [ids.get(slug), w.itemId, i + 1, w.approved]);
}
for (const e of S.EVENTS) {
  const ev = await q("insert into raid_events (raid, name, kind, starts_at, size, leader_id, comp_needs, requirements) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [e.raid, e.name, e.kind, e.startsAt, e.size, ids.get("korvath-emberfang"), JSON.stringify(e.compNeeds), JSON.stringify(e.requirements)]);
  for (const s of e.signups) await q("insert into signups (event_id, character_id, status) values ($1,$2,$3)", [ev.rows[0].id, ids.get(s.slug), s.status]);
}
for (const a of S.APPLICATIONS) {
  await q("insert into applications (user_id, character_slug, role, logs_url, availability, about) values ($1,$2,$3,$4,$5,$6)", [demoUser, a.slug, a.role, a.logs || null, a.availability, a.about]);
}
for (const a of S.ANNOUNCEMENTS) await q("insert into announcements (title, body, author_id) values ($1,$2,$3)", [a.title, a.body, demoUser]);
await q("insert into bank_snapshots (gold, items, uploaded_by) values ($1,$2,$3)", [S.BANK.gold, JSON.stringify(S.BANK.items), demoUser]);
for (const r of S.SYNC_RUNS) {
  await q("insert into sync_runs (job, status, value, note, started_at, finished_at) values ($1,$2,$3,$4, now() - ($5 || ' minutes')::interval, now() - ($5 || ' minutes')::interval)",
    [r.job, r.status, r.value, r.note, String(r.minutesAgo ?? 0)]);
}
for (const [k, v] of Object.entries(S.SETTINGS)) await q("insert into settings (key, value) values ($1,$2)", [k, JSON.stringify(v)]);
await q("commit");
console.log(`seeded ${S.CHARACTERS.length} characters, ${S.ITEMS.length} items, ${S.EVENTS.length} events`);
await db.end();
