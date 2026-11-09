"use server";
// Every write goes through here and is permission-checked server-side (never trust the UI).
// In demo mode the checks pass but nothing is persisted.
import { revalidatePath } from "next/cache";
import { Forbidden, ownsCharacter, requirePermission, type Permission, type Viewer } from "@/lib/auth";
import { json, nowIso, sql, sqlOne, tx } from "@/lib/db";
import { postToDiscord } from "@/lib/discord";
import { syncAllProfiles, syncCharacter, syncRoster } from "@/lib/sync";
import { configured } from "@/lib/config";
import type { ActionResult } from "@/components/useAction";
import type { Role, SignupStatus } from "@/lib/types";
import { assignableRoles, canChangeRoleOf, roleLabel, type SiteRole } from "@/lib/roles";
import { BIS_PHASE, SLOTS, SOURCE_TYPES } from "@/lib/bis";

const ROLES: Role[] = ["tank", "healer", "melee", "ranged"];
const SIGNUP: SignupStatus[] = ["accepted", "tentative", "late", "bench", "declined"];
const LOOT_SYSTEMS = ["wishlist_council", "epgp", "dkp", "soft_reserve"];

/** Wraps an action: permission check, demo short-circuit, error → message. */
async function act(perm: Permission | undefined, demoMessage: string, fn: (v: Viewer) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const v = await requirePermission(perm);
    if (v.demo) return { ok: true, demo: true, message: demoMessage };
    return await fn(v);
  } catch (e) {
    if (e instanceof Forbidden) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Resolve a character the viewer owns (id or slug) → id. */
function ownCharacterId(v: Viewer, idOrSlug: string) {
  const c = v.characters.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
  if (!c) throw new Forbidden("That isn't one of your characters.");
  return c.id;
}

// ------------------------------------------------------------ sign-in
export async function claimCharacters(input: { claimed: string[]; main: string }): Promise<ActionResult> {
  return act(undefined, "Characters linked", async (v) => {
    if (!input.claimed.includes(input.main)) return { ok: false, error: "Your main must be one of the claimed characters." };
    const rows = await sql<{ id: string; slug: string }>("select id, slug from characters where user_id = $1", [v.userId]);
    const mine = new Map(rows.map((r) => [r.slug, r.id]));
    const mainId = mine.get(input.main);
    if (!mainId) return { ok: false, error: "That character isn't on your Battle.net account." };
    await tx(async (q) => {
      await q("update characters set claimed = (slug in (select value from json_each($2))) where user_id = $1", [v.userId, input.claimed]);
      await q("update users set main_character_id = $2 where id = $1", [v.userId, mainId]);
    });
    // Pull fresh profiles for the claimed characters in the background of this request.
    if (configured.battlenet()) await Promise.allSettled(input.claimed.filter((s) => mine.has(s)).map((s) => syncCharacter(s)));
    revalidatePath("/", "layout");
    return { ok: true, message: "Characters linked" };
  });
}

export async function submitApplication(input: { characterSlug: string; role: string; logsUrl: string; availability: string; about: string }): Promise<ActionResult> {
  return act(undefined, "Application sent", async (v) => {
    if (!ROLES.includes(input.role as Role)) return { ok: false, error: "Pick a role." };
    if (!ownsCharacter(v, input.characterSlug)) {
      const own = await sqlOne("select 1 from characters where slug = $1 and user_id = $2", [input.characterSlug, v.userId]);
      if (!own) return { ok: false, error: "Pick one of your characters." };
    }
    const logs = str(input.logsUrl, 300);
    if (logs && !/^https:\/\/(www\.)?(classic\.|fresh\.)?warcraftlogs\.com\//.test(logs)) return { ok: false, error: "Logs link must be a warcraftlogs.com URL." };
    const pending = await sqlOne("select 1 from applications where user_id = $1 and status = 'pending'", [v.userId]);
    if (pending) return { ok: false, error: "You already have an application waiting for review." };
    await sql(
      "insert into applications (user_id, character_slug, role, logs_url, availability, about) values ($1,$2,$3,$4,$5,$6)",
      [v.userId, input.characterSlug, input.role, logs || null, str(input.availability, 200), str(input.about, 2000)],
    );
    revalidatePath("/admin");
    return { ok: true, message: "Application sent" };
  });
}

// ------------------------------------------------------------ raids
export async function setSignup(input: { eventId: string; character: string; status: string; consumables?: boolean }): Promise<ActionResult> {
  return act("canSignUp", "Signup updated", async (v) => {
    if (!SIGNUP.includes(input.status as SignupStatus)) return { ok: false, error: "Unknown signup status." };
    const characterId = ownCharacterId(v, input.character);
    const ev = await sqlOne("select 1 from raid_events where id = $1", [input.eventId]);
    if (!ev) return { ok: false, error: "That event no longer exists." };
    // One signup per user per event: switching characters replaces the earlier one.
    await tx(async (q) => {
      await q("delete from signups where event_id = $1 and character_id in (select id from characters where user_id = $2) and character_id <> $3", [input.eventId, v.userId, characterId]);
      await q(
        `insert into signups (event_id, character_id, status, consumables, updated_at) values ($1,$2,$3,$4,$5)
         on conflict (event_id, character_id) do update set status = excluded.status, consumables = excluded.consumables, updated_at = excluded.updated_at`,
        [input.eventId, characterId, input.status, !!input.consumables, nowIso()],
      );
    });
    revalidatePath("/raids");
    return { ok: true, message: "Signup updated" };
  });
}

// ------------------------------------------------------------ loot & BiS
export async function saveWishlist(input: { character: string; itemIds: number[] }): Promise<ActionResult> {
  return act("canWishlist", "Wishlist saved", async (v) => {
    const characterId = ownCharacterId(v, input.character);
    const settings = await sql<{ key: string; value: any }>("select key, value from settings where key in ('wishlist_slots','wishlist_lock_date')");
    const s = Object.fromEntries(settings.map((r) => [r.key, json<any>(r.value, r.value)]));
    const slots = Number(s.wishlist_slots ?? 6);
    if (s.wishlist_lock_date && new Date() > new Date(`${s.wishlist_lock_date}T23:59:59-06:00`)) return { ok: false, error: "Wishlists are locked for this tier." };
    const ids = [...new Set(input.itemIds.map(Number).filter(Number.isInteger))];
    if (ids.length > slots) return { ok: false, error: `You can wishlist up to ${slots} items.` };
    await tx(async (q) => {
      // Keep council approvals on items that stay on the list.
      const prev = await q<{ item_id: number; approved: boolean }>("select item_id, approved from wishlist_items where character_id = $1", [characterId]);
      const approved = new Map(prev.map((p) => [p.item_id, !!p.approved]));
      await q("delete from wishlist_items where character_id = $1", [characterId]);
      for (const [i, id] of ids.entries()) {
        await q("insert into wishlist_items (character_id, item_id, rank, approved) values ($1,$2,$3,$4)", [characterId, id, i + 1, approved.get(id) ?? false]);
      }
    });
    revalidatePath("/loot");
    revalidatePath("/bis");
    return { ok: true, message: "Wishlist saved" };
  });
}

export async function setBisStatus(input: { character: string; slot: string; status: "have" | "need" }): Promise<ActionResult> {
  return act(undefined, input.status === "have" ? "Marked as obtained" : "Marked as needed", async (v) => {
    const characterId = ownCharacterId(v, input.character);
    if (!["have", "need"].includes(input.status)) return { ok: false, error: "Unknown status." };
    await sql("update bis_entries set status = $3, updated_at = $4 where character_id = $1 and phase = $5 and slot = $2", [characterId, input.slot, input.status, nowIso(), BIS_PHASE]);
    revalidatePath("/bis");
    return { ok: true, message: input.status === "have" ? "Marked as obtained" : "Marked as needed" };
  });
}

/** Choose (or replace) the BiS item for one slot. One item per slot per character. */
export async function setBisItem(input: { character: string; slot: string; itemId: number; sourceType?: string; note?: string }): Promise<ActionResult> {
  return act(undefined, "BiS updated", async (v) => {
    const characterId = ownCharacterId(v, input.character);
    if (!(SLOTS as readonly string[]).includes(input.slot)) return { ok: false, error: "Unknown slot." };
    const item = await sqlOne<{ id: number }>("select id from items where id = $1", [Math.floor(Number(input.itemId))]);
    if (!item) return { ok: false, error: "Pick the item from the search results." };
    const curated = await sqlOne<{ type: string; boss: string | null }>("select type, boss from item_sources where item_id = $1 limit 1", [item.id]);
    const type = (SOURCE_TYPES as readonly string[]).includes(input.sourceType ?? "") ? input.sourceType! : curated?.type ?? null;
    await tx(async (q) => {
      await q("delete from bis_entries where character_id = $1 and phase = $2 and slot = $3", [characterId, BIS_PHASE, input.slot]);
      await q("insert into bis_entries (character_id, phase, slot, item_id, status, source_type, note, updated_at) values ($1,$2,$3,$4,'need',$5,$6,$7)",
        [characterId, BIS_PHASE, input.slot, item.id, type, str(input.note, 120) || curated?.boss || null, nowIso()]);
    });
    revalidatePath("/bis");
    return { ok: true, message: "BiS updated" };
  });
}

export async function updateBisEntry(input: { character: string; slot: string; sourceType: string | null; note: string }): Promise<ActionResult> {
  return act(undefined, "Saved", async (v) => {
    const characterId = ownCharacterId(v, input.character);
    const type = input.sourceType && (SOURCE_TYPES as readonly string[]).includes(input.sourceType) ? input.sourceType : null;
    await sql("update bis_entries set source_type = $3, note = $4, updated_at = $5 where character_id = $1 and phase = $6 and slot = $2",
      [characterId, input.slot, type, str(input.note, 120) || null, nowIso(), BIS_PHASE]);
    revalidatePath("/bis");
    return { ok: true, message: "Saved" };
  });
}

export async function removeBisItem(input: { character: string; slot: string }): Promise<ActionResult> {
  return act(undefined, "Removed from BiS", async (v) => {
    const characterId = ownCharacterId(v, input.character);
    await sql("delete from bis_entries where character_id = $1 and phase = $2 and slot = $3", [characterId, BIS_PHASE, input.slot]);
    revalidatePath("/bis");
    return { ok: true, message: "Removed from BiS" };
  });
}

// ------------------------------------------------------------ roster
export async function requestCraft(input: { itemName: string; quantity: number }): Promise<ActionResult> {
  return act(undefined, "Request sent to crafters", async (v) => {
    const name = str(input.itemName, 120);
    const qty = Math.max(1, Math.min(200, Math.floor(Number(input.quantity) || 1)));
    if (!name) return { ok: false, error: "Name the item or recipe." };
    if (!v.main) return { ok: false, error: "Claim a character first." };
    await sql("insert into craft_requests (requester_id, item_name, quantity) values ($1,$2,$3)", [v.main.id, name, qty]);
    revalidatePath("/roster");
    return { ok: true, message: "Request sent to crafters" };
  });
}

// ------------------------------------------------------------ characters
export async function syncMyCharacter(slug: string): Promise<ActionResult> {
  return act(undefined, "Synced from Armory", async (v) => {
    if (!ownsCharacter(v, slug) && !v.perms.isAdmin) return { ok: false, error: "You can only sync your own characters." };
    if (!configured.battlenet()) return { ok: false, error: "Battle.net API keys aren't configured." };
    const r = await syncCharacter(slug);
    if (!r.ok) return { ok: false, error: r.reason };
    revalidatePath(`/characters/${slug}`);
    return { ok: true, message: "Synced from Armory" };
  });
}

// ------------------------------------------------------------ admin
export async function decideApplication(input: { id: string; status: "accepted" | "declined" | "pending" }): Promise<ActionResult> {
  return act("isAdmin", input.status === "pending" ? "Decision undone" : `Application ${input.status}`, async (v) => {
    if (!["accepted", "declined", "pending"].includes(input.status)) return { ok: false, error: "Unknown decision." };
    const app = await sqlOne<{ character_slug: string }>(
      "update applications set status = $2, decided_by = $3 where id = $1 returning character_slug",
      [input.id, input.status, input.status === "pending" ? null : v.userId],
    );
    if (!app) return { ok: false, error: "Application not found." };
    if (input.status === "accepted") await postToDiscord(`✅ Application accepted: **${app.character_slug}**. An officer will send the in-game invite.`).catch(() => {});
    revalidatePath("/admin");
    return { ok: true, message: input.status === "pending" ? "Decision undone" : `Application ${input.status}` };
  });
}

export async function saveLootSettings(input: { lootSystem: string; wishlistSlots: number; lockDate: string; attendanceWindow: string }): Promise<ActionResult> {
  return act("isAdmin", "Loot settings saved", async () => {
    if (!LOOT_SYSTEMS.includes(input.lootSystem)) return { ok: false, error: "Unknown loot system." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lockDate)) return { ok: false, error: "Pick a lock date." };
    if (!["4w", "8w", "tier"].includes(input.attendanceWindow)) return { ok: false, error: "Unknown attendance window." };
    const slots = Math.max(1, Math.min(20, Math.floor(Number(input.wishlistSlots))));
    const pairs: [string, unknown][] = [["loot_system", input.lootSystem], ["wishlist_slots", slots], ["wishlist_lock_date", input.lockDate], ["attendance_window", input.attendanceWindow]];
    for (const [k, val] of pairs) await sql("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [k, JSON.stringify(val)]);
    revalidatePath("/", "layout");
    return { ok: true, message: "Loot settings saved" };
  });
}

export async function saveRanks(input: { index: number; name: string; canSignUp: boolean; canWishlist: boolean; canRunRaids: boolean; canAwardLoot: boolean; isAdmin: boolean }[]): Promise<ActionResult> {
  return act("isAdmin", "Ranks saved", async (v) => {
    // Never let an admin lock every admin out.
    if (!input.some((r) => r.isAdmin)) return { ok: false, error: "At least one rank must keep admin access." };
    await tx(async (q) => {
      for (const r of input) {
        const name = str(r.name, 40) || `Rank ${r.index}`;
        await q(
          `insert into guild_ranks ("index", name, can_sign_up, can_wishlist, can_run_raids, can_award_loot, is_admin) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict ("index") do update set name = excluded.name, can_sign_up = excluded.can_sign_up, can_wishlist = excluded.can_wishlist,
             can_run_raids = excluded.can_run_raids, can_award_loot = excluded.can_award_loot, is_admin = excluded.is_admin`,
          [Math.floor(r.index), name, !!r.canSignUp, !!r.canWishlist, !!r.canRunRaids, !!r.canAwardLoot, !!r.isAdmin],
        );
      }
    });
    void v;
    revalidatePath("/", "layout");
    return { ok: true, message: "Ranks saved" };
  });
}

const RAID_DEFS: Record<string, { name: string; size: number; comp: { role: string; need: number }[]; reqs: string[] }> = {
  "onyxias-lair": { name: "Onyxia’s Lair", size: 40, comp: [{ role: "Tanks", need: 4 }, { role: "Healers", need: 11 }, { role: "Melee", need: 12 }, { role: "Ranged", need: 13 }], reqs: ["level:60", "attune:onyxia", "consumables"] },
  "hyjal-summit": { name: "Hyjal Summit", size: 20, comp: [{ role: "Tanks", need: 2 }, { role: "Healers", need: 5 }, { role: "Damage", need: 13 }], reqs: ["level:60"] },
  "barrow-deeps": { name: "Barrow Deeps", size: 10, comp: [{ role: "Tanks", need: 1 }, { role: "Healers", need: 3 }, { role: "Damage", need: 6 }], reqs: ["level:60"] },
};

export async function createEvent(input: { raid: string; date: string; time: string; postToDiscord: boolean }): Promise<ActionResult> {
  return act("canRunRaids", "Event created", async (v) => {
    const def = RAID_DEFS[input.raid];
    if (!def) return { ok: false, error: "Pick a raid." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "Pick a date and start time." };
    const startsAt = new Date(`${input.date}T${input.time}:00-06:00`); // server time zone: US Central
    const ev = await sqlOne<{ id: string }>(
      `insert into raid_events (raid, name, kind, starts_at, size, leader_id, comp_needs, requirements) values ($1,$2,'Raid',$3,$4,$5,$6,$7) returning id`,
      [input.raid, def.name, startsAt, def.size, v.main?.id ?? null, JSON.stringify(def.comp), JSON.stringify(def.reqs)],
    );
    if (input.postToDiscord && ev) {
      const posted = await postToDiscord(`📅 **${def.name}** signups are open`, { title: def.name, description: `${def.size} players · sign up on the hub`, timestamp: startsAt.toISOString() });
      if (posted.messageId) await sql("update raid_events set discord_message_id = $2 where id = $1", [ev.id, posted.messageId]);
    }
    revalidatePath("/raids");
    revalidatePath("/");
    return { ok: true, message: "Event created" };
  });
}

export async function publishAnnouncement(input: { title: string; body: string; postToDiscord?: boolean }): Promise<ActionResult> {
  return act("isAdmin", "Announcement published", async (v) => {
    const title = str(input.title, 140), body = str(input.body, 4000);
    if (!title || !body) return { ok: false, error: "Add a title and a message." };
    const row = await sqlOne<{ id: string }>("insert into announcements (title, body, author_id) values ($1,$2,$3) returning id", [title, body, v.userId]);
    if (input.postToDiscord !== false && row) {
      const r = await postToDiscord(`📣 **${title}**\n${body}`).catch(() => ({ posted: false }));
      if (r.posted) await sql("update announcements set posted_to_discord = true where id = $1", [row.id]);
    }
    revalidatePath("/");
    return { ok: true, message: "Announcement published" };
  });
}

export async function recordAward(input: { itemName: string; character: string; reason?: string }): Promise<ActionResult> {
  return act("canAwardLoot", "Award recorded", async (v) => {
    const item = await sqlOne<{ id: number }>("select id from items where lower(name) = lower($1) or cast(id as text) = $1", [str(input.itemName, 120)]);
    if (!item) return { ok: false, error: "Item not found in the hub's item list." };
    const ch = await sqlOne<{ id: string }>(
      "select id from characters where lower(name || ' ' || surname) = lower($1) or slug = lower($1) or lower(name) = lower($1) limit 1",
      [str(input.character, 80)],
    );
    if (!ch) return { ok: false, error: "Character not found on the roster." };
    await tx(async (q) => {
      await q("insert into loot_awards (item_id, character_id, method, reason, awarded_by) values ($1,$2,'council',$3,$4)", [item.id, ch.id, str(input.reason, 300) || null, v.userId]);
      await q("delete from wishlist_items where character_id = $1 and item_id = $2", [ch.id, item.id]);
    });
    revalidatePath("/loot");
    return { ok: true, message: "Award recorded" };
  });
}

/**
 * Import an RCLootCouncil or Gargul CSV export.
 * RCLootCouncil CSV: player,date,time,id,item,itemID,itemString,response,votes,class,instance,boss,…
 * Gargul CSV:        dateTime,character,itemID,itemName,…   (column names are matched case-insensitively)
 */
export async function importLootLog(csv: string): Promise<ActionResult> {
  return act("canAwardLoot", "Loot log imported", async (v) => {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { ok: false, error: "That file has no rows." };
    const parse = (line: string) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    const head = parse(lines[0]).map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
    const cPlayer = col("player", "character", "winner"), cItem = col("itemid", "item_id"), cDate = col("date", "datetime", "awarded_at"), cBoss = col("boss"), cResp = col("response", "method");
    if (cPlayer < 0 || cItem < 0) return { ok: false, error: "Couldn't find player and itemID columns. Export as CSV from RCLootCouncil or Gargul." };
    let imported = 0, skipped = 0;
    await tx(async (q) => {
      for (const line of lines.slice(1)) {
        const cells = parse(line);
        const player = (cells[cPlayer] ?? "").split("-")[0].trim();
        const itemId = Number(cells[cItem]);
        const ch = (await q<{ id: string }>("select id from characters where lower(name) = lower($1) or lower(name || ' ' || surname) = lower($1) limit 1", [player]))[0];
        const it = (await q<{ id: number }>("select id from items where id = $1", [itemId]))[0];
        if (!ch || !it) { skipped++; continue; }
        const when = cDate >= 0 && cells[cDate] ? new Date(cells[cDate]) : new Date();
        await q("insert into loot_awards (item_id, character_id, method, boss, awarded_by, awarded_at) values ($1,$2,$3,$4,$5,$6)", [
          it.id, ch.id, cResp >= 0 ? cells[cResp]?.slice(0, 40) || "import" : "import", cBoss >= 0 ? cells[cBoss] ?? null : null, v.userId, isNaN(+when) ? new Date() : when,
        ]);
        imported++;
      }
    });
    await sql("insert into sync_runs (job, status, value, note, finished_at) values ('addon','ok',$1,$2,$3)", [`Loot: ${imported} awards`, skipped ? `${skipped} rows skipped (unknown item or character)` : "Loot export imported", nowIso()]);
    revalidatePath("/loot");
    revalidatePath("/admin");
    return { ok: true, message: `Imported ${imported} awards${skipped ? `, skipped ${skipped}` : ""}` };
  });
}

/** Guild bank addon export: JSON {gold, items:[{name,tab,qty,quality}]}. */
export async function importBank(json: string): Promise<ActionResult> {
  return act("isAdmin", "Bank export uploaded", async (v) => {
    let data: any;
    try { data = JSON.parse(json); } catch { return { ok: false, error: "Bank export must be JSON." }; }
    const items = Array.isArray(data.items) ? data.items.slice(0, 2000).map((i: any) => ({ name: str(i.name, 120), tab: str(i.tab, 60), qty: Number(i.qty) || 0, quality: str(i.quality, 20) || "common" })) : [];
    await sql("insert into bank_snapshots (gold, items, uploaded_by) values ($1,$2,$3)", [Number.isFinite(Number(data.gold)) ? Math.floor(Number(data.gold)) : null, JSON.stringify(items), v.userId]);
    await sql("insert into sync_runs (job, status, value, note, finished_at) values ('addon','ok',$1,'Bank export uploaded',$2)", [`Bank: ${items.length} items`, nowIso()]);
    revalidatePath("/roster");
    revalidatePath("/");
    return { ok: true, message: "Bank export uploaded" };
  });
}

export async function syncEverything(): Promise<ActionResult> {
  return act("isAdmin", "Sync started", async () => {
    if (!configured.battlenet()) return { ok: false, error: "Battle.net API keys aren't configured." };
    const roster = await syncRoster();
    const profiles = await syncAllProfiles();
    revalidatePath("/", "layout");
    return { ok: true, message: `Roster: ${roster.members} members · profiles: ${profiles.ok}/${profiles.total}` };
  });
}

// ------------------------------------------------------------ roles & guild page
export async function setUserRole(input: { userId: string; role: SiteRole | null }): Promise<ActionResult> {
  return act("canManageRoles", `Role set to ${roleLabel(input.role)}`, async (v) => {
    const role = input.role || null;
    if (!assignableRoles(v.siteRole).includes(role)) return { ok: false, error: "You can't assign that role." };
    const target = await sqlOne<{ id: string; site_role: string | null }>("select id, site_role from users where id = $1", [input.userId]);
    if (!target) return { ok: false, error: "That account no longer exists." };
    if (!canChangeRoleOf(v.siteRole, target.site_role)) return { ok: false, error: "You can't change the role of someone at or above your level." };
    if (target.site_role === "super_admin" && role !== "super_admin") {
      const supers = await sqlOne<{ n: number }>("select count(*) as n from users where site_role = 'super_admin'");
      if ((supers?.n ?? 0) <= 1) return { ok: false, error: "The hub needs at least one Super Admin." };
    }
    await sql("update users set site_role = $2 where id = $1", [input.userId, role]);
    revalidatePath("/", "layout");
    return { ok: true, message: `Role set to ${roleLabel(role)}` };
  });
}

export async function saveGuildPage(input: { motd: string; info: string }): Promise<ActionResult> {
  return act("isAdmin", "Guild page saved", async () => {
    const pairs: [string, string][] = [["guild_motd", str(input.motd, 280)], ["guild_info", str(input.info, 4000)]];
    for (const [k, val] of pairs) await sql("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [k, JSON.stringify(val)]);
    revalidatePath("/guild");
    return { ok: true, message: "Guild page saved" };
  });
}
