# API & data source map (WoW Forever)

Namespaces: `profile-forever-{region}`, `static-forever-{region}`, `dynamic-forever-{region}` — live but undocumented as of Nov 2026; keep the Admin › Sync health page as a canary.

| Feature | Source | Endpoint / method | Auth | Refresh |
| --- | --- | --- | --- | --- |
| Sign up / log in | Battle.net | OAuth authorization code, scope `openid wow.profile`, redirect `https://dragonwarriors.app/auth/battlenet/callback` | User | On login |
| Your characters | Blizzard API | `/profile/user/wow` | User token | Login + daily |
| Character summary | Blizzard API | `/profile/wow/character/{name}-{surname}` | App token | 30 min |
| Gear paperdoll | Blizzard API | `…/equipment` | App | 30 min |
| Renders | Blizzard API | `…/character-media` | App | Daily (lags ~1 day) |
| 3D viewer | Blizzard API + model viewer | `…/appearance` + `…/equipment` | App | On view |
| Stats | Blizzard API | `…/statistics` | App | 30 min |
| Professions | Blizzard API | `…/professions` | App | Daily |
| Legacy / achievements | Blizzard API | `…/achievements` | App | Daily |
| Attunements | Blizzard API | `…/quests/completed` | App | Daily |
| Roster + rank numbers | Blizzard API | `/data/wow/guild/{guild-slug}/roster` (profile ns) | App | 30 min |
| Guild activity | Blizzard API | `/data/wow/guild/{guild-slug}/activity` | App | Hourly |
| Items | Blizzard API | `/data/wow/item/{id}` (static ns) | App | Cache weekly |
| Item icons | Blizzard API | `/data/wow/media/item/{id}` (verify for Forever) | App | Cache weekly |
| Auction prices | Blizzard API | `/data/wow/ruleset/{id}/auctions` (dynamic ns) | App | Hourly |
| BiS sources, raid loot pools | Hub DB | `item_sources` curated per raid release | Officer | Per release |
| Wishlists, council, signups, applications, news, craft requests | Hub DB | — | Member/officer | Live |
| Loot awards | Addon export | RCLootCouncil / Gargul upload | Officer | After raid |
| Guild bank | Addon export | Bank export upload (no Blizzard endpoint) | Officer | Per upload |
| Attendance + parses | Warcraft Logs | API v2 GraphQL: guild reports → fights → players | App | After raid |
| Event posts, reminders | Discord | Bot + webhooks | Bot | Live |
| Who's online | — | Not available; use last login or Discord presence | — | — |

Gotchas: characters appear only after level 10 + logout; the account list can lag 20–40 min; renders can lag a day; respect rate limits (batch + cache).
