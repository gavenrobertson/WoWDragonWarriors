// Writes D1 seed SQL from lib/sample.ts.
//   node scripts/seed-sql.mts           → seeds/base.sql  (ranks, settings, Onyxia loot table + BiS item sources) for production
//   node scripts/seed-sql.mts --demo    → seeds/demo.sql  (base + the whole sample guild) for local dev / staging
import { mkdirSync, writeFileSync } from "node:fs";
import * as S from "../lib/sample.ts";

const demo = process.argv.includes("--demo");
const out: string[] = [];
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return lit(JSON.stringify(v));
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ins = (table: string, row: Record<string, unknown>, conflict = "") =>
  out.push(`insert into ${table} (${Object.keys(row).map((k) => (k === "index" ? '"index"' : k)).join(", ")}) values (${Object.values(row).map(lit).join(", ")})${conflict};`);
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const id = (s: string) => s.replace(/[^a-z0-9]/g, "").slice(0, 32).padEnd(12, "0");

for (const r of S.RANKS) {
  ins("guild_ranks", { index: r.index, name: r.name, can_sign_up: r.canSignUp, can_wishlist: r.canWishlist, can_run_raids: r.canRunRaids, can_award_loot: r.canAwardLoot, is_admin: r.isAdmin }, " on conflict do nothing");
}
for (const [k, v] of Object.entries(S.SETTINGS)) ins("settings", { key: k, value: JSON.stringify(v) }, " on conflict do nothing");
for (const it of S.ITEMS) {
  ins("items", { id: it.id, name: it.name, quality: it.quality, slot: it.slot, slot_detail: it.slotDetail, roles: it.roles, icon_url: it.iconUrl ?? null }, " on conflict (id) do update set icon_url = coalesce(items.icon_url, excluded.icon_url)");
  const s = it.source;
  ins("item_sources", { item_id: it.id, type: s.type, raid: s.raid ?? null, boss: s.boss, zone: s.zone, map_x: s.mapX ?? null, map_y: s.mapY ?? null, how: s.how, map_label: s.mapLabel ?? null }, " on conflict do nothing");
}

if (demo) {
  const demoUser = "demouser0001";
  ins("users", { id: demoUser, bnet_id: S.SAMPLE_USER.bnetId, battletag: S.SAMPLE_USER.battletag });
  for (const c of S.CHARACTERS) {
    const userId = c.account === "demo" ? demoUser : id(`u${c.slug}`);
    if (c.account !== "demo") ins("users", { id: userId, bnet_id: `seed-${c.slug}`, battletag: `${c.name}#0000` });
    ins("characters", {
      id: id(c.slug), user_id: userId, slug: c.slug, name: c.name, surname: c.surname, level: c.level, class: c.className, race: c.race,
      spec: c.spec ?? null, role: c.role ?? null, guild_rank: c.rank >= 0 ? c.rank : null, last_login_at: ago(c.lastSeenMin),
      claimed: c.account !== "demo" || c.inGuild !== false, in_guild: c.inGuild !== false, equipment: c.gear ?? null, stats: c.stats ?? null,
      professions: c.professions ?? [], legacy: c.legacy ?? null, attunements: c.attunements ?? [], fire_resistance: c.fireResistance ?? null,
      attendance_pct: c.attendancePct ?? null, synced_at: ago(0),
    });
    if (c.isMain) out.push(`update users set main_character_id = ${lit(id(c.slug))} where id = ${lit(userId)};`);
  }
  for (const [slug, list] of Object.entries(S.BIS)) for (const b of list) ins("bis_entries", { character_id: id(slug), phase: "phase-1", slot: b.slot, item_id: b.itemId, status: b.status === "have" ? "have" : "need" });
  for (const [slug, list] of Object.entries(S.WISHLISTS)) list.forEach((w, i) => ins("wishlist_items", { character_id: id(slug), item_id: w.itemId, rank: i + 1, approved: w.approved }));
  for (const e of S.EVENTS) {
    ins("raid_events", { id: id(`ev${e.key}`), raid: e.raid, name: e.name, kind: e.kind, starts_at: new Date(e.startsAt).toISOString(), size: e.size, leader_id: id("korvath-emberfang"), comp_needs: e.compNeeds, requirements: e.requirements });
    for (const s of e.signups) ins("signups", { event_id: id(`ev${e.key}`), character_id: id(s.slug), status: s.status });
  }
  for (const a of S.APPLICATIONS) ins("applications", { id: id(`app${a.id}`), user_id: demoUser, character_slug: a.slug, role: a.role, logs_url: a.logs || null, availability: a.availability, about: a.about });
  S.ANNOUNCEMENTS.forEach((a, i) => ins("announcements", { id: id(`ann${i}`), title: a.title, body: a.body, author_id: demoUser, created_at: ago(60 * (i + 1)) }));
  ins("bank_snapshots", { id: "bank00000001", gold: S.BANK.gold, items: S.BANK.items, uploaded_by: demoUser });
  for (const r of S.SYNC_RUNS) ins("sync_runs", { job: r.job, status: r.status, value: r.value, note: r.note, started_at: ago(r.minutesAgo ?? 0), finished_at: ago(r.minutesAgo ?? 0) });
}

mkdirSync("seeds", { recursive: true });
const file = demo ? "seeds/demo.sql" : "seeds/base.sql";
writeFileSync(file, out.join("\n") + "\n");
console.log(`wrote ${file} (${out.length} statements)`);
