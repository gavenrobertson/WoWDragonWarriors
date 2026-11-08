import "server-only";
import type { Viewer } from "./auth";
import { sql } from "./db";
import { CHARACTERS } from "./sample";

export interface AccountChar { slug: string; name: string; level: number; className: string; inGuild: boolean; claimed: boolean; isMain: boolean }

/** Every character on the viewer's Battle.net account (claimed or not). */
export async function accountCharacters(v: Viewer): Promise<AccountChar[]> {
  if (v.demo) {
    return CHARACTERS.filter((c) => c.account === "demo").map((c) => ({
      slug: c.slug, name: `${c.name} ${c.surname}`, level: c.level, className: c.className, inGuild: c.inGuild !== false, claimed: c.inGuild !== false, isMain: !!c.isMain,
    }));
  }
  if (!v.userId) return [];
  const rows = await sql<any>(
    `select c.slug, c.name, c.surname, c.level, c.class, c.in_guild, c.claimed, (u.main_character_id = c.id) as is_main
     from characters c join users u on u.id = c.user_id where c.user_id = $1 order by c.level desc nulls last, c.name`,
    [v.userId],
  );
  return rows.map((r) => ({ slug: r.slug, name: `${r.name} ${r.surname}`.trim(), level: r.level ?? 0, className: r.class ?? "", inGuild: !!r.in_guild, claimed: !!r.claimed, isMain: !!r.is_main }));
}
