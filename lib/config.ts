import { d1 } from "./db";

export const SITE = {
  url: process.env.SITE_URL ?? "https://dragonwarriors.app",
  name: process.env.APP_NAME ?? "Dragon Warriors",
  tagline: "WoW Forever · PvP · Alliance",
  description: "Dragon Warriors guild hub for WoW Forever: characters, BiS planner, loot, raids and roster.",
  ogImage: "/og/dragon-warriors-1200x630.jpg",
  favicon: "/favicon.png",
  guildSlug: process.env.GUILD_SLUG ?? "dragon-warriors",
  region: process.env.REGION ?? "us",
  /** All three raids unlock together. */
  raidUnlock: "2026-12-09T00:00:00-06:00",
  routes: {
    home: "/",
    signIn: "/sign-in",
    characters: "/characters",
    character: (slug: string) => `/characters/${slug}`, // slug = name-surname
    loot: "/loot",
    bis: "/bis",
    raids: "/raids",
    raid: (id: string) => `/raids?event=${id}`,
    roster: "/roster",
    admin: "/admin",
    apply: "/apply",
  },
  auth: {
    battlenetCallback: `${process.env.SITE_URL ?? "https://dragonwarriors.app"}/auth/battlenet/callback`,
    discordCallback: `${process.env.SITE_URL ?? "https://dragonwarriors.app"}/auth/discord/callback`,
  },
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/guild", label: "Guild" },
  { href: "/characters", label: "Characters" },
  { href: "/loot", label: "Loot" },
  { href: "/bis", label: "BiS Planner" },
  { href: "/raids", label: "Raids" },
  { href: "/roster", label: "Roster" },
  { href: "/admin", label: "Admin", adminOnly: true },
  { href: "/arcade", label: "Arcade" },
] as const;

export const NS = {
  profile: process.env.FOREVER_PROFILE_NS ?? `profile-forever-${SITE.region}`,
  static: process.env.FOREVER_STATIC_NS ?? `static-forever-${SITE.region}`,
  dynamic: process.env.FOREVER_DYNAMIC_NS ?? `dynamic-forever-${SITE.region}`,
};

/** Integrations are "configured" when their keys are present. */
export const configured = {
  db: () => !!d1(),
  battlenet: () => !!(process.env.BNET_CLIENT_ID && process.env.BNET_CLIENT_SECRET),
  warcraftlogs: () => !!(process.env.WCL_CLIENT_ID && process.env.WCL_CLIENT_SECRET),
  discord: () => !!(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_SIGNUPS_WEBHOOK_URL),
};

/** Demo mode: no database, so pages render the sample data from lib/sample.ts and writes aren't saved. */
export const isDemo = () => !configured.db();
