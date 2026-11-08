import "server-only";
import * as bnet from "./blizzard";
import { sql, sqlOne } from "./db";

async function recordRun(job: string, status: string, value: string, note: string, startedAt: Date) {
  await sql("insert into sync_runs (job, status, value, note, started_at, finished_at) values ($1,$2,$3,$4,$5, now())", [job, status, value, note, startedAt]);
}

/** Guild roster → characters (every 30 min). Marks members in_guild and stores their rank number. */
export async function syncRoster() {
  const started = new Date();
  try {
    const json = await bnet.guildRoster();
    if (!json) {
      await recordRun("roster", "error", "Guild not found", "Check GUILD_SLUG and the profile namespace", started);
      return { ok: false as const, members: 0 };
    }
    const members = bnet.normaliseRoster(json);
    for (const m of members) {
      await sql(
        `insert into characters (slug, name, surname, level, class, race, guild_rank, in_guild, synced_at)
         values ($1,$2,$3,$4,$5,$6,$7,true, now())
         on conflict (slug) do update set level = excluded.level, class = coalesce(excluded.class, characters.class),
           race = coalesce(excluded.race, characters.race), guild_rank = excluded.guild_rank, in_guild = true, synced_at = now()`,
        [m.slug, m.name, m.surname, m.level, m.className ?? null, m.race ?? null, m.rank ?? null],
      );
    }
    // Anyone no longer on the roster has left the guild.
    await sql("update characters set in_guild = false, guild_rank = null where in_guild and not (slug = any($1))", [members.map((m) => m.slug)]);
    await ensureRanks(members.map((m) => m.rank ?? 0));
    await recordRun("roster", "ok", `${members.length} members`, "Synced from the guild roster", started);
    return { ok: true as const, members: members.length };
  } catch (e) {
    await recordRun("roster", e instanceof bnet.RateLimited ? "partial" : "error", "Failed", String(e instanceof Error ? e.message : e), started);
    throw e;
  }
}

/** The roster only returns rank numbers; create a placeholder row for any number officers haven't named yet. */
async function ensureRanks(indices: number[]) {
  for (const i of [...new Set(indices)]) {
    await sql("insert into guild_ranks (index, name) values ($1, $2) on conflict do nothing", [i, i === 0 ? "Guild Master" : `Rank ${i}`]);
  }
}

/** One character's profile, gear, stats, professions, render and attunements. */
export async function syncCharacter(slug: string) {
  const [summary, equip, stats, profs, mediaJson, questJson] = await Promise.all([
    bnet.character(slug), bnet.equipment(slug), bnet.statistics(slug), bnet.professions(slug), bnet.media(slug), bnet.quests(slug),
  ]);
  if (!summary) return { ok: false as const, reason: "Not in the API yet (characters appear after level 10 and a logout)." };
  const s = bnet.normaliseSummary(summary);
  const st = bnet.normaliseStats(stats);
  await sql(
    `update characters set level = coalesce($2, level), class = coalesce($3, class), race = coalesce($4, race), spec = coalesce($5, spec),
       last_login_at = coalesce($6, last_login_at), equipment = coalesce($7, equipment), stats = coalesce($8, stats),
       professions = coalesce($9, professions), render_url = coalesce($10, render_url), attunements = coalesce($11, attunements),
       fire_resistance = coalesce($12, fire_resistance), synced_at = now()
     where slug = $1`,
    [
      slug, s.level ?? null, s.className ?? null, s.race ?? null, s.spec ?? null, s.lastLoginAt ?? null,
      equip ? JSON.stringify(bnet.normaliseEquipment(equip)) : null,
      st.stats.length ? JSON.stringify(st.stats) : null,
      profs ? JSON.stringify(bnet.normaliseProfessions(profs)) : null,
      bnet.renderUrl(mediaJson) ?? null,
      questJson ? bnet.normaliseAttunements(questJson) : null,
      st.fireResistance ?? null,
    ],
  );
  return { ok: true as const, hasRender: !!bnet.renderUrl(mediaJson) };
}

/** Profiles for every guild member, a few at a time to stay under the rate limit. */
export async function syncAllProfiles(batch = 4) {
  const started = new Date();
  const rows = await sql<{ slug: string }>("select slug from characters where in_guild order by synced_at nulls first");
  let ok = 0, renders = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const results = await Promise.allSettled(rows.slice(i, i + batch).map((r) => syncCharacter(r.slug)));
    for (const r of results) if (r.status === "fulfilled" && r.value.ok) { ok++; if (r.value.hasRender) renders++; }
    if (results.some((r) => r.status === "rejected" && r.reason instanceof bnet.RateLimited)) break; // back off until next run
  }
  const missing = rows.length - ok;
  await recordRun("profiles", missing ? "partial" : "ok", `${ok} / ${rows.length}`, missing ? `${missing} characters aren’t in the API yet` : "All profiles synced", started);
  await recordRun("renders", renders < ok ? "partial" : "ok", `${renders} / ${rows.length}`, "New characters can take a day to get renders", started);
  return { ok, total: rows.length };
}

/** After sign-in: upsert the Battle.net account's characters and attach them to the user. */
export async function syncAccount(userId: string, userToken: string) {
  const json = await bnet.accountCharacters(userToken);
  const chars = bnet.normaliseAccount(json);
  for (const c of chars) {
    // A character can only belong to one account: the Battle.net account that owns it.
    await sql(
      `insert into characters (slug, name, surname, level, class, race, user_id, synced_at)
       values ($1,$2,$3,$4,$5,$6,$7, now())
       on conflict (slug) do update set user_id = excluded.user_id, level = excluded.level,
         claimed = case when characters.user_id = excluded.user_id then characters.claimed else false end,
         class = coalesce(excluded.class, characters.class), race = coalesce(excluded.race, characters.race)`,
      [c.slug, c.name, c.surname, c.level, c.className ?? null, c.race ?? null, userId],
    );
  }
  return chars.length;
}

export async function upsertUser(bnetId: string, battletag: string) {
  return sqlOne<{ id: string; main_character_id: string | null }>(
    `insert into users (bnet_id, battletag) values ($1, $2)
     on conflict (bnet_id) do update set battletag = excluded.battletag returning id, main_character_id`,
    [bnetId, battletag],
  );
}
