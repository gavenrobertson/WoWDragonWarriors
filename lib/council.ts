import "server-only";
// Loot council sessions: the latest day's council awards, for the public overview and the Discord recap.
import { sql, sqlOne } from "./db";
import type { RecapData } from "@/components/CouncilRecap";

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** Raid items still in front of the council (someone has them wishlisted). */
export async function contestedCount() {
  const r = await sqlOne<{ n: number }>(
    `select count(distinct w.item_id) as n from wishlist_items w where exists (select 1 from item_sources s where s.item_id = w.item_id and s.type = 'raid')`);
  return r?.n ?? 0;
}

export async function latestSession(): Promise<RecapData | null> {
  const last = await sqlOne<{ at: string }>("select max(awarded_at) as at from loot_awards where method in ('council', 'admin override')");
  if (!last?.at) return null;
  const day = dayKey(last.at);
  const since = new Date(new Date(last.at).getTime() - 36 * 3600_000).toISOString();
  const rows = (await sql<any>(
    `select a.item_id, a.method, a.reason, a.awarded_at, i.name as iname, i.quality, i.icon_url,
            c.name, c.surname, c.class, c.avatar_url, c.slug, case when c.claimed then wu.name_style end as name_style,
            bc.name as by_name, bc.surname as by_surname
     from loot_awards a join items i on i.id = a.item_id join characters c on c.id = a.character_id
     left join users wu on wu.id = c.user_id
     left join users bu on bu.id = a.awarded_by left join characters bc on bc.id = bu.main_character_id
     where a.method in ('council', 'admin override') and a.awarded_at >= $1 order by a.awarded_at`, [since])).filter((r) => dayKey(r.awarded_at) === day);
  if (!rows.length) return null;
  const ids = rows.map((r) => r.item_id);
  const pool = await sql<{ item_id: number; stake: number; payout: number; status: string; name: string | null; surname: string | null; class: string | null; name_style: string | null }>(
    `select p.item_id, p.stake, p.payout, p.status, c.name, c.surname, c.class, u.name_style
     from council_pool p join users u on u.id = p.user_id left join characters c on c.id = u.main_character_id
     where p.status <> 'open' and p.created_at >= $1 and p.item_id in (select value from json_each($2))`, [since, JSON.stringify(ids)]).catch(() => []);
  const best = pool.filter((p) => p.payout > p.stake).sort((a, b) => b.payout - b.stake - (a.payout - a.stake))[0];
  return {
    date: new Date(last.at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }),
    remaining: await contestedCount(),
    items: rows.map((r) => ({
      id: r.item_id, name: r.iname, quality: r.quality ?? "epic", iconUrl: r.icon_url,
      winner: { name: `${r.name} ${r.surname}`.trim(), className: r.class ?? "", avatarUrl: r.avatar_url, nameStyle: r.name_style, slug: r.slug },
      overruled: r.method === "admin override", detail: r.reason ?? (r.method === "council" ? "Council vote" : "Admin override"),
      by: r.by_name ? `${r.by_name} ${r.by_surname ?? ""}`.trim() : null,
      pot: pool.filter((p) => p.item_id === r.item_id).reduce((a, p) => a + p.stake, 0),
      called: pool.filter((p) => p.item_id === r.item_id && p.status === "won").length,
    })),
    pool: {
      pot: pool.reduce((a, p) => a + p.stake, 0), observers: pool.length,
      best: best ? { name: `${best.name ?? "Someone"} ${best.surname ?? ""}`.trim(), className: best.class ?? "", nameStyle: best.name_style, profit: best.payout - best.stake } : null,
    },
  };
}
