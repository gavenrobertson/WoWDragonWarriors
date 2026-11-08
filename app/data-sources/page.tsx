import type { Metadata } from "next";
import { NS } from "@/lib/config";

export const metadata: Metadata = { title: "Data sources" };

const ROWS: [string, string, string, string, string][] = [
  ["Sign up / log in", "Battle.net", "OAuth authorization code, scope openid wow.profile", "User", "On login"],
  ["Your characters", "Blizzard API", "/profile/user/wow", "User token", "Login + daily"],
  ["Character summary", "Blizzard API", "/profile/wow/character/{name}-{surname}", "App token", "30 min"],
  ["Gear paperdoll", "Blizzard API", "…/equipment", "App", "30 min"],
  ["Renders", "Blizzard API", "…/character-media", "App", "Daily (lags ~1 day)"],
  ["3D viewer", "Blizzard API + model viewer", "…/appearance + …/equipment", "App", "On view"],
  ["Stats", "Blizzard API", "…/statistics", "App", "30 min"],
  ["Professions", "Blizzard API", "…/professions", "App", "Daily"],
  ["Legacy / achievements", "Blizzard API", "…/achievements", "App", "Daily"],
  ["Attunements", "Blizzard API", "…/quests/completed", "App", "Daily"],
  ["Roster + rank numbers", "Blizzard API", "/data/wow/guild/{guild-slug}/roster", "App", "30 min"],
  ["Guild activity", "Blizzard API", "/data/wow/guild/{guild-slug}/activity", "App", "Hourly"],
  ["Items", "Blizzard API", "/data/wow/item/{id}", "App", "Cache weekly"],
  ["Item icons", "Blizzard API", "/data/wow/media/item/{id}", "App", "Cache weekly"],
  ["Auction prices", "Blizzard API", "/data/wow/ruleset/{id}/auctions", "App", "Hourly"],
  ["BiS sources, raid loot pools", "Hub DB", "item_sources, curated per raid release", "Officer", "Per release"],
  ["Wishlists, council, signups, applications, news, craft requests", "Hub DB", "—", "Member / officer", "Live"],
  ["Loot awards", "Addon export", "RCLootCouncil / Gargul upload", "Officer", "After raid"],
  ["Guild bank", "Addon export", "Bank export upload (no Blizzard endpoint)", "Officer", "Per upload"],
  ["Attendance + parses", "Warcraft Logs", "API v2 GraphQL: guild reports → fights → players", "App", "After raid"],
  ["Event posts, reminders", "Discord", "Bot + webhooks", "Bot", "Live"],
  ["Who's online", "—", "Not available; use last login or Discord presence", "—", "—"],
];

export default function DataSourcesPage() {
  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="panel-royal stack" style={{ gap: 8 }}>
        <span className="eyebrow">How the hub works</span>
        <h1>Where every number comes from</h1>
        <p className="soft" style={{ maxWidth: 720 }}>
          Namespaces: <span className="mono">{NS.profile}</span>, <span className="mono">{NS.static}</span>, <span className="mono">{NS.dynamic}</span>.
          These are live but undocumented as of November 2026, so Admin › Sync health acts as the canary.
        </p>
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">Feature</th><th scope="col">Source</th><th scope="col">Endpoint / method</th><th scope="col">Auth</th><th scope="col">Refresh</th></tr></thead>
          <tbody>{ROWS.map((r) => <tr key={r[0]}><td className="strong">{r[0]}</td><td>{r[1]}</td><td className="mono small">{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="small muted">Gotchas: characters appear only after level 10 and a logout; the account list can lag 20–40 minutes; renders can lag a day.</p>
    </main>
  );
}
