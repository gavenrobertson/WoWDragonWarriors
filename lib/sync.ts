import "server-only";
import * as bnet from "./blizzard";
import { nowIso, sql, sqlOne, tx } from "./db";
import { hexColor, hubUrl, notify } from "./discord";
import { CLASS_COLOR, classIcon } from "./ui";
import { extractMetrics } from "./metrics";

async function recordRun(job: string, status: string, value: string, note: string, startedAt: string) {
  await sql("insert into sync_runs (job, status, value, note, started_at, finished_at) values ($1,$2,$3,$4,$5,$6)", [job, status, value, note, startedAt, nowIso()]);
  if (status === "error") await notify("health", { title: `⚠️ ${job} sync failed`, description: note.slice(0, 500), color: 0xff8a7a, url: hubUrl("/admin") });
}

/** Guild roster → characters (every 30 min). Marks members in_guild and stores their rank number. */
export async function syncRoster() {
  const started = nowIso();
  try {
    const json = await bnet.guildRoster();
    if (!json) {
      await recordRun("roster", "error", "Guild not found", "Check GUILD_SLUG and the profile namespace", started);
      return { ok: false as const, members: 0 };
    }
    const members = bnet.normaliseRoster(json);
    const now = nowIso();
    const before = await sql<{ slug: string; level: number | null }>("select slug, level from characters where in_guild = 1");
    await tx(async (q) => {
      for (const m of members) {
        await q(
          `insert into characters (slug, name, surname, level, class, race, guild_rank, in_guild, synced_at)
           values ($1,$2,$3,$4,$5,$6,$7,1,$8)
           on conflict (slug) do update set level = excluded.level, class = coalesce(excluded.class, characters.class),
             race = coalesce(excluded.race, characters.race), guild_rank = excluded.guild_rank, in_guild = 1, synced_at = excluded.synced_at`,
          [m.slug, m.name, m.surname, m.level, m.className ?? null, m.race ?? null, m.rank ?? null, now],
        );
      }
      // Anyone no longer on the roster has left the guild.
      await q("update characters set in_guild = 0, guild_rank = null where in_guild = 1 and slug not in (select value from json_each($1))", [members.map((m) => m.slug)]);
      // The roster only returns rank numbers; add a placeholder row for any number officers haven't named yet.
      for (const i of [...new Set(members.map((m) => m.rank ?? 0))]) {
        await q('insert into guild_ranks ("index", name) values ($1, $2) on conflict do nothing', [i, i === 0 ? "Guild Master" : `Rank ${i}`]);
      }
    });
    await announceRosterChanges(before, members);
    // Guild summary (faction, ruleset, founding date) for the public guild page.
    const g = await bnet.guildSummary().catch(() => null);
    if (g) {
      const profile = { name: g.name, faction: g.faction?.name, ruleset: g.ruleset?.name, createdAt: g.created_timestamp ? new Date(g.created_timestamp).toISOString() : undefined, memberCount: g.member_count ?? members.length, achievementPoints: g.achievement_points ?? 0 };
      await sql("insert into settings (key, value) values ('guild_profile', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(profile)]);
    }
    await recordRun("roster", "ok", `${members.length} members`, "Synced from the guild roster", started);
    return { ok: true as const, members: members.length };
  } catch (e) {
    await recordRun("roster", e instanceof bnet.RateLimited ? "partial" : "error", "Failed", String(e instanceof Error ? e.message : e), started);
    throw e;
  }
}

/** One character's profile, gear, stats, professions, render and attunements. */
export async function syncCharacter(slug: string) {
  const [summary, equip, stats, profs, mediaJson, questJson, achStats] = await Promise.all([
    bnet.character(slug), bnet.equipment(slug), bnet.statistics(slug), bnet.professions(slug), bnet.media(slug), bnet.quests(slug),
    bnet.achievementStats(slug).catch(() => null), // Hall of Fame stats are a bonus: never fail the profile over them
  ]);
  if (!summary) return { ok: false as const, reason: "Not in the API yet (characters appear after level 10 and a logout)." };
  const s = bnet.normaliseSummary(summary);
  const st = bnet.normaliseStats(stats);
  const gear = equip ? bnet.normaliseEquipment(equip) : null;
  // Cache every equipped item so the icon job can fetch its icon once for the whole guild.
  const equipped = (gear ?? []).filter((g) => g.itemId);
  if (equipped.length) {
    await tx(async (q) => {
      for (const g of equipped) {
        await q("insert into items (id, name, quality, slot) values ($1,$2,$3,$4) on conflict (id) do nothing", [g.itemId, g.name, g.quality, g.slot]);
      }
    });
  }
  await sql(
    `update characters set level = coalesce($2, level), class = coalesce($3, class), race = coalesce($4, race), spec = coalesce($5, spec),
       last_login_at = coalesce($6, last_login_at), equipment = coalesce($7, equipment), stats = coalesce($8, stats),
       professions = coalesce($9, professions), render_url = coalesce($10, render_url), attunements = coalesce($11, attunements),
       fire_resistance = coalesce($12, fire_resistance), synced_at = $13, avatar_url = coalesce($14, avatar_url), metrics = coalesce($15, metrics)
     where slug = $1`,
    [
      slug, s.level ?? null, s.className ?? null, s.race ?? null, s.spec ?? null, s.lastLoginAt ?? null,
      gear,
      st.stats.length ? st.stats : null,
      profs ? bnet.normaliseProfessions(profs) : null,
      bnet.renderUrl(mediaJson) ?? null,
      questJson ? bnet.normaliseAttunements(questJson) : null,
      st.fireResistance ?? null,
      nowIso(),
      bnet.avatarUrl(mediaJson) ?? null,
      extractMetrics(achStats, questJson?.quests?.length) ?? null,
    ],
  );
  return { ok: true as const, hasRender: !!bnet.renderUrl(mediaJson) };
}

/** Profiles for guild members, a few at a time to stay under the rate limit. Stalest first. */
// Each profile is 7 Blizzard calls. Workers Free allows 50 outbound requests per invocation, so the default is 6 per run;
// on Workers Paid set PROFILE_SYNC_LIMIT higher (e.g. 100).
export async function syncAllProfiles({ batch = 4, limit = Number(process.env.PROFILE_SYNC_LIMIT) || 6 }: { batch?: number; limit?: number } = {}) {
  const started = nowIso();
  // Each run handles the `limit` stalest profiles; the scheduled job rotates through everyone.
  const rows = await sql<{ slug: string }>("select slug from characters where in_guild = 1 order by synced_at nulls first limit $1", [limit]);
  const total = (await sqlOne<{ n: number }>("select count(*) as n from characters where in_guild = 1"))?.n ?? rows.length;
  let ok = 0, renders = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const results = await Promise.allSettled(rows.slice(i, i + batch).map((r) => syncCharacter(r.slug)));
    for (const r of results) if (r.status === "fulfilled" && r.value.ok) { ok++; if (r.value.hasRender) renders++; }
    if (results.some((r) => r.status === "rejected" && r.reason instanceof bnet.RateLimited)) break; // back off until next run
  }
  const missing = rows.length - ok;
  await recordRun("profiles", missing ? "partial" : "ok", `${ok} / ${rows.length} this run`, missing ? `${missing} characters aren’t in the API yet` : `Rotating through ${total} members`, started);
  await recordRun("renders", renders < ok ? "partial" : "ok", `${renders} / ${ok}`, "New characters can take a day to get renders", started);
  return { ok, total: rows.length };
}

/** Item icons from /data/wow/media/item/{id}, for items cached without one (1 Blizzard call each). */
export async function syncItemIcons({ limit = Number(process.env.ICON_SYNC_LIMIT) || 40 }: { limit?: number } = {}) {
  const started = nowIso();
  const rows = await sql<{ id: number }>("select id from items where icon_url is null order by id limit $1", [limit]);
  let ok = 0, missing = 0;
  for (let i = 0; i < rows.length; i += 8) {
    const results = await Promise.allSettled(rows.slice(i, i + 8).map((r) => bnet.itemMedia(r.id)));
    const updates: [string, number][] = [];
    results.forEach((r, j) => {
      const url = r.status === "fulfilled" ? bnet.itemIconUrl(r.value) : undefined;
      // Mark items with no icon as "" so they aren't retried every run.
      if (r.status === "fulfilled") { updates.push([url ?? "", rows[i + j].id]); url ? ok++ : missing++; }
    });
    if (updates.length) await tx(async (q) => { for (const [url, id] of updates) await q("update items set icon_url = $1, cached_at = $2 where id = $3", [url, nowIso(), id]); });
    if (results.some((r) => r.status === "rejected" && r.reason instanceof bnet.RateLimited)) break;
  }
  const left = (await sqlOne<{ n: number }>("select count(*) as n from items where icon_url is null"))?.n ?? 0;
  await recordRun("icons", "ok", `${ok} icons cached`, left ? `${left} items still waiting for icons` : missing ? `${missing} items have no icon` : "All item icons cached", started);
  return { ok, missing, left };
}

/** After sign-in: upsert the Battle.net account's characters and attach them to the user. */
export async function syncAccount(userId: string, userToken: string) {
  const json = await bnet.accountCharacters(userToken);
  const chars = bnet.normaliseAccount(json);
  const now = nowIso();
  await tx(async (q) => {
    for (const c of chars) {
      // A character belongs to the Battle.net account that owns it; if it changed hands, its claim resets.
      await q(
        `insert into characters (slug, name, surname, level, class, race, user_id, synced_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (slug) do update set
           claimed = case when characters.user_id = excluded.user_id then characters.claimed else 0 end,
           user_id = excluded.user_id, level = excluded.level,
           class = coalesce(excluded.class, characters.class), race = coalesce(excluded.race, characters.race)`,
        [c.slug, c.name, c.surname, c.level, c.className ?? null, c.race ?? null, userId, now],
      );
    }
  });
  return chars.length;
}

export async function upsertUser(bnetId: string, battletag: string) {
  return sqlOne<{ id: string; main_character_id: string | null }>(
    `insert into users (bnet_id, battletag) values ($1, $2)
     on conflict (bnet_id) do update set battletag = excluded.battletag returning id, main_character_id`,
    [bnetId, battletag],
  );
}

/** Roster diff → Discord: joins, departures and new level 60s (batched; skipped on the very first sync). */
async function announceRosterChanges(before: { slug: string; level: number | null }[], after: bnet.NormalCharacter[]) {
  if (!before.length) return;
  const prev = new Map(before.map((b) => [b.slug, b.level ?? 0]));
  const now = new Set(after.map((m) => m.slug));
  const joined = after.filter((m) => !prev.has(m.slug));
  const left = before.filter((b) => !now.has(b.slug));
  const dinged = after.filter((m) => prev.has(m.slug) && (prev.get(m.slug) ?? 0) < 60 && m.level >= 60);
  const line = (m: bnet.NormalCharacter) => `**${m.name} ${m.surname}** · ${m.level} ${m.className ?? ""}`.trim();
  if (joined.length) {
    await notify("roster", {
      title: joined.length === 1 ? `🛡️ ${joined[0].name} ${joined[0].surname} joined the guild` : `🛡️ ${joined.length} new members joined`,
      description: joined.slice(0, 20).map(line).join("\n"), color: 0x4cd964, url: hubUrl("/guild"),
      thumbnail: joined.length === 1 ? classIcon(joined[0].className) : undefined,
    });
  }
  if (left.length) {
    await notify("roster", { title: `👋 ${left.length} member${left.length === 1 ? "" : "s"} left the guild`, description: left.slice(0, 20).map((l) => l.slug).join(", "), color: 0xa8987a, url: hubUrl("/guild") });
  }
  for (const m of dinged.slice(0, 10)) {
    await notify("roster", {
      title: `🎉 ${m.name} ${m.surname} reached level 60!`, description: `Congratulations, ${m.name}! Time to get attuned and build that wishlist.`,
      color: hexColor(CLASS_COLOR[(m.className ?? "").toLowerCase()]), thumbnail: classIcon(m.className), url: hubUrl(`/characters/${m.slug}`),
    });
  }
}

/** Post a reminder for raid nights starting within the next hour (once per event). Runs from the 10-minute job. */
export async function remindUpcomingEvents() {
  const now = Date.now();
  const rows = await sql<{ id: string; name: string | null; raid: string; starts_at: string; n: number }>(
    `select e.id, e.name, e.raid, e.starts_at, (select count(*) from signups s where s.event_id = e.id and s.status in ('accepted','late','tentative')) as n
     from raid_events e where e.reminded_at is null and e.starts_at > $1 and e.starts_at <= $2`,
    [new Date(now).toISOString(), new Date(now + 65 * 60_000).toISOString()],
  );
  for (const e of rows) {
    const t = Math.floor(new Date(e.starts_at).getTime() / 1000);
    const r = await notify("events", {
      title: `⏰ ${e.name ?? e.raid} starts <t:${t}:R>`, description: `${e.n} signed up. Flasks, potions, repairs, and see you at the summoning stone!`,
      color: 0xffd100, url: hubUrl(`/raids?event=${e.id}`),
    });
    if (r.posted || r.reason === "off" || r.reason === "no webhook") await sql("update raid_events set reminded_at = $2 where id = $1", [e.id, nowIso()]);
  }
  return rows.length;
}
