import "server-only";
// Discord notifications: every hub event category can post to its own channel webhook.
// Webhooks + on/off per category live in the `settings` table (key "discord"), edited in Admin › Integrations.
// DISCORD_SIGNUPS_WEBHOOK_URL (env) is a fallback channel for any category without its own webhook.
import { SITE } from "./config";
import { d1, sqlOne } from "./db";

export const DISCORD_CATEGORIES = [
  { id: "events", label: "Raid events", desc: "New raid nights and a reminder an hour before start", defaultOn: true },
  { id: "signups", label: "Signups", desc: "Who signed up, changed status or dropped", defaultOn: true },
  { id: "loot", label: "Loot", desc: "Council awards, recorded awards and loot-log imports", defaultOn: true },
  { id: "applications", label: "Applications", desc: "New guild applications and officer decisions", defaultOn: true },
  { id: "crafting", label: "Crafting & bank", desc: "Craft requests, crafters picking them up and finishing, guild bank requests and uploads", defaultOn: true },
  { id: "announcements", label: "Announcements", desc: "Officer news posts", defaultOn: true },
  { id: "roster", label: "Roster", desc: "Members joining or leaving, new level 60s, hub sign-ups and role changes", defaultOn: true },
  { id: "health", label: "Hub health", desc: "A Blizzard sync failing", defaultOn: false },
] as const;
export type DiscordCategory = (typeof DISCORD_CATEGORIES)[number]["id"];

export interface DiscordConfig {
  webhooks: Partial<Record<DiscordCategory, string>>;
  enabled: Partial<Record<DiscordCategory, boolean>>;
  /** Optional Discord role id to ping per category (e.g. officers on new applications). */
  mentions?: Partial<Record<DiscordCategory, string>>;
}

/** Accept only real Discord webhook URLs (and a localhost receiver outside production, for testing). */
export function validWebhook(url: string) {
  if (/^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return true;
  // Local test receiver only; DISCORD_ALLOW_LOCAL is never set in production.
  return process.env.DISCORD_ALLOW_LOCAL === "1" && /^http:\/\/127\.0\.0\.1:\d+\/[\w/-]*$/.test(url);
}

export async function discordConfig(): Promise<DiscordConfig> {
  if (!d1()) return { webhooks: {}, enabled: {} };
  const row = await sqlOne<{ value: string }>("select value from settings where key = 'discord'");
  try { return { webhooks: {}, enabled: {}, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { webhooks: {}, enabled: {} }; }
}

export interface Embed {
  title: string; description?: string; url?: string; color?: number; thumbnail?: string; image?: string;
  fields?: { name: string; value: string; inline?: boolean }[]; timestamp?: string; author?: { name: string; icon_url?: string; url?: string };
}

export const hexColor = (hex?: string | null) => (hex ? parseInt(hex.replace("#", ""), 16) : 0xffd100);
export const hubUrl = (path: string) => `${SITE.url}${path}`;

/** Post one embed to the category's channel. Never throws: Discord being down must not break the hub. */
export async function notify(category: DiscordCategory, embed: Embed, opts: { content?: string; force?: boolean; config?: DiscordConfig; silent?: boolean } = {}) {
  try {
    const cfg = opts.config ?? (await discordConfig());
    const def = DISCORD_CATEGORIES.find((c) => c.id === category)!;
    const on = cfg.enabled[category] ?? def.defaultOn;
    if (!on && !opts.force) return { posted: false as const, reason: "off" };
    const url = cfg.webhooks[category] || process.env.DISCORD_SIGNUPS_WEBHOOK_URL;
    if (!url || !validWebhook(url)) return { posted: false as const, reason: "no webhook" };
    const role = cfg.mentions?.[category];
    const ping = role && /^\d{5,25}$/.test(role) && !opts.silent ? role : null;
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: SITE.name,
        avatar_url: hubUrl("/assets/crest-256.png"),
        content: [ping ? `<@&${ping}>` : "", opts.content ?? ""].filter(Boolean).join(" ") || undefined,
        allowed_mentions: ping ? { parse: [], roles: [ping] } : { parse: [] },
        embeds: [{
          color: 0xffd100, ...embed,
          thumbnail: embed.thumbnail ? { url: embed.thumbnail } : undefined,
          image: embed.image ? { url: embed.image } : undefined,
          footer: { text: `${SITE.name} guild hub`, icon_url: hubUrl("/assets/crest-256.png") },
          timestamp: embed.timestamp ?? new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) return { posted: false as const, reason: `Discord answered ${res.status}` };
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { posted: true as const, messageId: j.id };
  } catch (e) {
    console.error("discord notify", category, e);
    return { posted: false as const, reason: "network error" };
  }
}

/** Back-compat helper for simple text posts (announcement-style). */
export async function postToDiscord(content: string, embed?: Embed, category: DiscordCategory = "announcements") {
  return notify(category, embed ?? { title: content.replace(/\*\*/g, "").slice(0, 240) }, { content: embed ? content : undefined });
}

/**
 * Create a Discord server event (the server's Events list, with an Interested button and reminders) for a raid night.
 * Needs the bot token as the DISCORD_BOT_TOKEN secret and the bot's Create Events permission. Never throws.
 */
export async function createDiscordEvent(ev: { name: string; startsAt: Date; description: string }): Promise<{ link: string; id: string } | null> {
  const token = process.env.DISCORD_BOT_TOKEN, guild = process.env.DISCORD_GUILD_ID, channel = process.env.DISCORD_RAID_CHANNEL_ID;
  if (!token || !guild || !channel || ev.startsAt.getTime() < Date.now() + 60_000) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild}/scheduled-events`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "X-Audit-Log-Reason": "Raid event created on the guild hub" },
      body: JSON.stringify({
        name: ev.name.slice(0, 100), privacy_level: 2, entity_type: 2, channel_id: channel,
        scheduled_start_time: ev.startsAt.toISOString(), description: ev.description.slice(0, 1000),
      }),
    });
    if (!res.ok) { console.error("discord event", res.status, await res.text().catch(() => "")); return null; }
    const j = (await res.json()) as { id: string };
    return { id: j.id, link: `https://discord.com/events/${guild}/${j.id}` };
  } catch (e) {
    console.error("discord event", e);
    return null;
  }
}
