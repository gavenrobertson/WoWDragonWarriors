import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { isDemo } from "./config";
import { sql, sqlOne } from "./db";
import { CHARACTERS, RANKS } from "./sample";

export const SESSION_COOKIE = "dw_session";
export const STATE_COOKIE = "dw_oauth_state";
const SESSION_DAYS = 30;

export type Permission = "canSignUp" | "canWishlist" | "canRunRaids" | "canAwardLoot" | "isAdmin";
type Perms = Record<Permission, boolean>;
const NO_PERMS: Perms = { canSignUp: false, canWishlist: false, canRunRaids: false, canAwardLoot: false, isAdmin: false };

export interface ViewerCharacter { id: string; slug: string; name: string; className: string | null; level: number | null; isMain: boolean; inGuild: boolean }
export interface Viewer {
  demo: boolean;
  signedIn: boolean;
  userId?: string;
  battletag?: string;
  rankName?: string;
  characters: ViewerCharacter[];
  main?: ViewerCharacter;
  perms: Perms;
}

export function cookieOptions(maxAgeSeconds: number) {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(prod && process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function createSession(userId: string, bnetToken?: { value: string; expiresIn: number }) {
  const id = newToken();
  await sql(
    `insert into sessions (id, user_id, bnet_token, bnet_token_expires, expires_at)
     values ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [id, userId, bnetToken?.value ?? null, bnetToken ? new Date(Date.now() + bnetToken.expiresIn * 1000) : null, String(SESSION_DAYS)],
  );
  (await cookies()).set(SESSION_COOKIE, id, cookieOptions(SESSION_DAYS * 86400));
  return id;
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id && !isDemo()) await sql("delete from sessions where id = $1", [id]);
  jar.delete(SESSION_COOKIE);
}

/** The session row (with the Battle.net user token) for the current request, if any. */
export async function currentSession() {
  if (isDemo()) return null;
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return sqlOne<{ id: string; user_id: string; bnet_token: string | null; bnet_token_expires: Date | null }>(
    "select id, user_id, bnet_token, bnet_token_expires from sessions where id = $1 and expires_at > now()",
    [id],
  );
}

function demoViewer(): Viewer {
  const chars = CHARACTERS.filter((c) => c.account === "demo").map((c) => ({
    id: c.slug, slug: c.slug, name: `${c.name} ${c.surname}`, className: c.className, level: c.level, isMain: !!c.isMain, inGuild: c.inGuild !== false,
  }));
  const rank = RANKS[1];
  return {
    demo: true, signedIn: true, battletag: "Korvath#1234", rankName: rank.name, characters: chars, main: chars.find((c) => c.isMain),
    perms: { canSignUp: rank.canSignUp, canWishlist: rank.canWishlist, canRunRaids: rank.canRunRaids, canAwardLoot: rank.canAwardLoot, isAdmin: rank.isAdmin },
  };
}

/** Who is looking at this page. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (isDemo()) return demoViewer();
  const session = await currentSession();
  if (!session) return { demo: false, signedIn: false, characters: [], perms: NO_PERMS };

  const user = await sqlOne<{ id: string; battletag: string; main_character_id: string | null }>(
    "select id, battletag, main_character_id from users where id = $1",
    [session.user_id],
  );
  if (!user) return { demo: false, signedIn: false, characters: [], perms: NO_PERMS };

  const rows = await sql<{ id: string; slug: string; name: string; surname: string; class: string | null; level: number | null; in_guild: boolean; guild_rank: number | null }>(
    `select id, slug, name, surname, class, level, in_guild, guild_rank from characters
     where user_id = $1 and claimed order by level desc nulls last, name`,
    [user.id],
  );
  const characters = rows.map((r) => ({
    id: r.id, slug: r.slug, name: `${r.name} ${r.surname}`.trim(), className: r.class, level: r.level, isMain: r.id === user.main_character_id, inGuild: r.in_guild,
  }));

  // Permissions come from the best (lowest-numbered) guild rank among the user's claimed, in-guild characters.
  const ranks = rows.filter((r) => r.in_guild && r.guild_rank != null).map((r) => r.guild_rank!);
  const best = ranks.length ? Math.min(...ranks) : null;
  const rank = best == null ? null : await sqlOne<{ name: string; can_sign_up: boolean; can_wishlist: boolean; can_run_raids: boolean; can_award_loot: boolean; is_admin: boolean }>(
    "select * from guild_ranks where index = $1",
    [best],
  );

  return {
    demo: false,
    signedIn: true,
    userId: user.id,
    battletag: user.battletag,
    rankName: rank?.name,
    characters,
    main: characters.find((c) => c.isMain) ?? characters[0],
    perms: rank
      ? { canSignUp: rank.can_sign_up, canWishlist: rank.can_wishlist, canRunRaids: rank.can_run_raids, canAwardLoot: rank.can_award_loot, isAdmin: rank.is_admin }
      : NO_PERMS,
  };
});

export class Forbidden extends Error {}

/** Gate every write server-side. In demo mode writes are allowed but never persisted. */
export async function requirePermission(perm?: Permission): Promise<Viewer> {
  const v = await getViewer();
  if (v.demo) return v;
  if (!v.signedIn) throw new Forbidden("Sign in first.");
  if (perm && !v.perms[perm]) throw new Forbidden("Your guild rank can't do that.");
  return v;
}

/** Does this viewer own (have claimed) the given character? */
export function ownsCharacter(v: Viewer, characterIdOrSlug: string) {
  return v.characters.some((c) => c.id === characterIdOrSlug || c.slug === characterIdOrSlug);
}
