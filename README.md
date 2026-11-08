# Dragon Warriors Guild Hub

Guild site for **Dragon Warriors** on WoW Forever, live at **https://dragonwarriors.app**.
Raids unlock **December 9, 2026**: Onyxia's Lair (40), Hyjal Summit (20), Barrow Deeps (10).

Built with Next.js 16 (App Router), TypeScript, Postgres, Battle.net OAuth and the Blizzard API.
The design system (royal purple and gold) comes from the design handoff: `app/styles/tokens.css` and `app/styles/components.css`.

## Quick start (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL`, the hub runs in **demo mode**: every page renders the sample guild from
`lib/sample.ts`, you're signed in as the sample officer *Korvath Emberfang*, and nothing you change is saved.
A banner at the top says so.

## Running against Postgres

```bash
cp .env.example .env.local        # fill in DATABASE_URL at least
npm run db:migrate                # applies db/*.sql once each
npm run db:seed                   # optional: loads the sample guild (dev/staging only)
npm run dev
```

With a database configured, visitors are guests until they sign in with Battle.net. What each person can see and do
comes from their characters' guild rank (Admin › Ranks & permissions). **Every write is checked on the server**
in `app/actions.ts`, not just hidden in the UI.

## Going live

1. **Battle.net client** (develop.battle.net → API Access): add redirect URLs
   `https://dragonwarriors.app/auth/battlenet/callback` and `http://localhost:3000/auth/battlenet/callback`.
   Set `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` and `BNET_REDIRECT_URI`.
2. **Postgres** (Neon or Supabase): set `DATABASE_URL`, run `npm run db:migrate`.
3. **Host** (Vercel recommended): point the apex and `www` at it. `www` redirects to the apex (`next.config.ts`),
   and HSTS is sent on every response (`.app` is HSTS-preloaded, so HTTPS is mandatory anyway).
4. Set `SITE_URL`, `COOKIE_DOMAIN=dragonwarriors.app` and `CRON_SECRET`. (No `SESSION_SECRET` needed: sessions are random ids stored in Postgres.) `vercel.json` schedules:
   - `/api/cron/roster` every 30 min: guild roster → `characters` (rank numbers, levels, who's still in the guild)
   - `/api/cron/profiles` hourly: gear, stats, professions, renders and attunements per member, 4 at a time, backing off on 429
5. Sign in as the guild master, then name ranks in **Admin › Ranks & permissions**. The roster API only returns rank numbers.
6. Optional: `DISCORD_*` for account linking and `#raid-signups` posts; `WCL_*` for Warcraft Logs attendance (import not built yet).

## What's built

| Route | What it does |
| --- | --- |
| `/` | Countdown to raid unlock, raid readiness, Road to 60, officer news, recently active, guild bank, crafters |
| `/sign-in`, `/apply` | Battle.net OAuth → claim characters → pick a main; guild application form |
| `/characters/[slug]` | Account character switcher, paperdoll, model stage (render or placeholder), stats / Legacy / wishlist / professions tabs, "Sync from Armory" |
| `/bis` | BiS per slot with source type, schematic map pins, have/need toggles |
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
lib/store.ts         one read API with two backends: demo (lib/sample.ts) and Postgres
db/                  001 = handoff schema, 002 = hub extensions (cached profile JSON, comp needs, sessions, sync runs)
```

## Not built yet

- **Warcraft Logs attendance import.** `attendance_pct` is a cached column ready for it; the GraphQL client isn't written.
- **3D model viewer.** The stage shows the `/character-media` render when available, or a placeholder silhouette. Plug a
  third-party viewer into `CharacterView.tsx` fed by `/appearance` + `/equipment`.
- **Item icons.** `items.icon_url` exists; a job that caches `/data/wow/media/item/{id}` isn't written yet.
- **Discord bot.** Only webhooks are wired: event and announcement posts, application pings.
- **Curated BiS lists per class.** `bis_entries` is per character; officers need a way to publish class lists.

## Forever API caveats

The `profile-forever-*`, `static-forever-*` and `dynamic-forever-*` namespaces are live but undocumented (Nov 2026).
The normalisers in `lib/blizzard.ts` are defensive, and the attunement quest ids (`ATTUNEMENT_QUESTS`) and sample item ids
are the Classic ones; verify them once Blizzard publishes docs. Characters appear only after level 10 and a logout,
the account list can lag 20–40 minutes, and renders can lag a day.

## Content rules

Don't rip or rehost Blizzard's textures, models, map art or logos. Item icons and character renders come from the API,
which its terms permit. The map is the original schematic. The footer says the site is fan-made and not affiliated with
Blizzard Entertainment.

## Placeholders to fill

`[RULESET]` (lib/config.ts `tagline`), `[GOLD]` (bank export), `[TIME]`, `[DATE]`, `[DAYS]`, `[GUILD MASTER]`, `[RAID LEADER]`,
`[OFFICER]` (sample data in lib/sample.ts). All names, numbers and gear in `lib/sample.ts` are placeholders.
