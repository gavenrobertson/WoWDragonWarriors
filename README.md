# Dragon Warriors Guild Hub

Guild site for **Dragon Warriors** on WoW Forever, live at **https://dragonwarriors.app**.
Raids unlock **December 9, 2026**: Onyxia's Lair (40), Hyjal Summit (20), Barrow Deeps (10).

Built with Next.js 16 (App Router), TypeScript, Cloudflare Workers + D1, Battle.net OAuth and the Blizzard API.
The design system (royal purple and gold) comes from the design handoff: `app/styles/tokens.css` and `app/styles/components.css`.

## Hosting

Runs on **Cloudflare Workers** (OpenNext adapter) with a **Cloudflare D1** database. The Worker is `wowdragonwarriors` (connected to this GitHub repo with Workers Builds, so every push deploys),
served on `dragonwarriors.app` and `www.dragonwarriors.app` (www redirects to the apex). Cron Triggers run the Blizzard
syncs: the guild roster every 30 minutes and 7 character profiles every 10 minutes (stalest first).

### Deploy

```bash
npm install
npx wrangler login               # or set CLOUDFLARE_API_TOKEN
npm run db:migrate               # applies migrations/ to the remote D1 database
npm run deploy                   # opennextjs-cloudflare build + deploy
```

The API token needs: Account › Workers Scripts: Edit, Account › D1: Edit, Account › Account Settings: Read,
Zone › Workers Routes: Edit and Zone › DNS: Edit (for dragonwarriors.app), User › User Details: Read.

Secrets live on the Worker (Cloudflare dashboard → Workers & Pages → wowdragonwarriors → Settings → Variables and Secrets,
or `npx wrangler secret put NAME`):

| Secret | What it is |
| --- | --- |
| `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` | Battle.net API client (develop.battle.net) |
| `CRON_SECRET` | Any long random string; the scheduled jobs use it to call `/api/cron/*` |
| `SUPER_ADMIN_CLAIM_CODE` | One-time code for the first Super Admin (see Roles) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_SIGNUPS_WEBHOOK_URL` | Optional: Discord linking and `#raid-signups` posts |
| `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET` | Optional: Warcraft Logs (import not built yet) |
| `PROFILE_SYNC_LIMIT` | Optional: profiles per 10-minute run (default 7, fits Workers Free; raise to ~100 on Workers Paid) |

Plain settings (`SITE_URL`, `GUILD_SLUG`, `REGION`, redirect URIs, `COOKIE_DOMAIN`) are in `wrangler.jsonc` → `vars`.

After the first sign-in, the guild master names the ranks in **Admin › Ranks & permissions**: the roster API only returns
rank numbers. Rank 0 is always the guild master.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # local settings and secrets
npm run db:local                 # local D1: schema + the sample guild
npm run dev                      # http://localhost:3000
```

`npm run preview` runs the production build in the Workers runtime locally. Set `DEMO_MODE=1` in `.dev.vars` to ignore
the database and render the built-in sample guild (signed in as the sample officer *Korvath Emberfang*, nothing saved).

Who can see and do what comes from each person's characters' guild rank. **Every write is checked on the server**
in `app/actions.ts`, not just hidden in the UI.

## Roles and the Super Admin

Permissions come from two places, added together:
- **In-game guild rank** (from the roster), configured in Admin › Ranks & permissions.
- **Hub role** per Battle.net account, assigned in Admin › People & roles: Super Admin, Guild Leader, Officer, Raid Leader, Loot Master.

Super Admins can assign any role; Guild Leaders can assign Officer, Raid Leader and Loot Master. The last Super Admin can't be
removed. The first Super Admin claims the role by signing in and opening `/admin/claim?code=<SUPER_ADMIN_CLAIM_CODE>` (a Worker
secret); the link stops working once a Super Admin exists.

## What's built

| Route | What it does |
| --- | --- |
| `/guild` | Public guild page styled like the in-game guild window: roster with class icons, ranks, MOTD, guild info |
| `/` | Countdown to raid unlock, raid readiness, Road to 60, officer news, recently active, guild bank, crafters |
| `/sign-in`, `/apply` | Battle.net OAuth → claim characters → pick a main; guild application form |
| `/characters/[slug]` | Account character switcher, paperdoll, **real 3D model** (Wowhead's model viewer fed by Blizzard `/appearance`: race, gender, customization choices, equipped item display IDs; animations; falls back to the 2D render), stats / Legacy / wishlist / professions tabs |
| `/bis` | Self-service BiS planner: every member picks their own item per slot (17 slots) from Blizzard's item search, sets where it drops, tracks have/need; equipped items count as Have |
| `/loot` | Raid loot pools with role filter and priority queue, wishlist with reorder, loot history |
| `/raids` | Event list, signup with status and character, comp bars, signups, readiness checks; `/raids/calendar.ics` iCal feed |
| `/roster` | Members table (search and role filter, main/alt, Onyxia ready), crafting directory and requests, guild bank |
| `/admin` | Sync health, applications, loot system and award/import (RCLootCouncil or Gargul CSV, bank JSON), ranks and permissions, events and announcements, integrations |
| `/data-sources`, `/brand` | Where every number comes from; crest and palette |

### Layout

```
app/                 routes (server components) + client components per page, app/actions.ts = all writes
lib/auth.ts          sessions (random id in an HttpOnly cookie, row in `sessions`), viewer + rank permissions
lib/blizzard.ts      Battle.net OAuth + Forever API client, retry/backoff, response normalisers
lib/sync.ts          roster / profile / account sync jobs (record runs in `sync_runs` for Admin › Sync health)
lib/store.ts         one read API with two backends: demo (lib/sample.ts) and D1
lib/db.ts            D1 access: sql(), sqlOne(), tx() (writes batched atomically)
migrations/          D1 schema (wrangler d1 migrations)
custom-worker.ts     Worker entry: the Next.js handler plus Cron Triggers for the sync jobs
scripts/seed-sql.mts writes seeds/base.sql (ranks, settings, loot table) and seeds/demo.sql (sample guild)
```

## Not built yet

- **Warcraft Logs attendance import.** `attendance_pct` is a cached column ready for it; the GraphQL client isn't written.
- **Item icons.** `items.icon_url` exists; a job that caches `/data/wow/media/item/{id}` isn't written yet.
- **Discord bot.** Only webhooks are wired: event and announcement posts, application pings.

## Forever API caveats

The `profile-forever-*`, `static-forever-*` and `dynamic-forever-*` namespaces are live but undocumented (Nov 2026).
The normalisers in `lib/blizzard.ts` are defensive, and the attunement quest ids (`ATTUNEMENT_QUESTS`) and sample item ids
are the Classic ones; verify them once Blizzard publishes docs. Characters appear only after level 10 and a logout,
the account list can lag 20–40 minutes, and renders can lag a day.

## Content rules

3D models: `lib/models.ts` resolves item display IDs from Blizzard (`item` → `item-appearance`, Forever data first, then retail) and
caches them in `item_displays`. Wowhead's viewer and model files load through `/modelviewer/live/*`, a same-origin relay
(Wowhead's CDN sends no CORS headers) cached at Cloudflare's edge. The files are Wowhead's copies of Blizzard models: fine for a
small guild site, but Wowhead could block the relay; the character page then falls back to the official 2D render.


Don't rip or rehost Blizzard's textures, models, map art or logos. Item icons and character renders come from the API,
which its terms permit. The map is the original schematic. The footer says the site is fan-made and not affiliated with
Blizzard Entertainment.

## Placeholders to fill

`[RULESET]` (lib/config.ts `tagline`), `[GOLD]` (bank export), `[TIME]`, `[DATE]`, `[DAYS]`, `[GUILD MASTER]`, `[RAID LEADER]`,
`[OFFICER]` (sample data in lib/sample.ts). All names, numbers and gear in `lib/sample.ts` are placeholders.
