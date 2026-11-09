import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { NS, configured } from "@/lib/config";
import { getRanks, getSettings, store } from "@/lib/store";
import { timeAgo } from "@/lib/ui";
import { AdminConsole, type Section } from "./AdminConsole";
import { assignableRoles } from "@/lib/roles";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const SYNC_META: Record<string, { name: string; src: string }> = {
  roster: { name: "Guild roster", src: "/data/wow/guild/{slug}/roster" },
  profiles: { name: "Character profiles", src: "/profile/wow/character/{name}-{surname}" },
  renders: { name: "Renders", src: "/character-media" },
  icons: { name: "Item icons", src: "/data/wow/media/item/{id}" },
  warcraftlogs: { name: "Warcraft Logs", src: "warcraftlogs.com/api/v2 (GraphQL)" },
  discord: { name: "Discord bot", src: "Discord bot + webhooks" },
  addon: { name: "Addon exports", src: "Upload: bank + loot addon" },
};
const STATE: Record<string, [string, string]> = {
  ok: ["Healthy", "#4CD964"], partial: ["Catching up", "#F2B84B"], error: ["Failing", "#FF8A7A"], waiting: ["Waiting", "#A99CC0"],
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string; notice?: string }> }) {
  const viewer = await getViewer();
  const p = viewer.perms;
  if (!viewer.signedIn) redirect("/sign-in");
  // Gate server-side: only ranks with an officer-type permission get in, and only to their sections.
  const allowed: Section[] = [
    ...(p.isAdmin ? (["overview", "apps"] as const) : []),
    ...(p.isAdmin || p.canAwardLoot ? (["loot"] as const) : []),
    ...(p.isAdmin ? (["ranks"] as const) : []),
    ...(p.isAdmin || p.canRunRaids ? (["events"] as const) : []),
    ...(p.isAdmin ? (["guild"] as const) : []),
    ...(p.canManageRoles ? (["people"] as const) : []),
    ...(p.isAdmin ? (["keys"] as const) : []),
  ];
  if (!allowed.length) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <section className="empty stack" style={{ alignItems: "center" }}>
          <h1 style={{ fontSize: 32 }}>Officers only</h1>
          <p>The admin console is for guild ranks with officer permissions. Ask an officer if you think this is wrong.</p>
          <Link href="/" className="btn">Back to guild home</Link>
        </section>
      </main>
    );
  }

  const { section, notice } = await searchParams;
  const [runs, apps, ranks, settings, users] = await Promise.all([
    store().syncRuns(), store().applications(), getRanks(), getSettings(), p.canManageRoles ? store().users() : Promise.resolve([]),
  ]);
  const s = settings as Record<string, unknown>;
  const syncs = runs.map((r) => {
    const [state, color] = r.job === "warcraftlogs" && !configured.warcraftlogs() && !viewer.demo ? ["Not set up", "#A99CC0"] : STATE[r.status] ?? STATE.waiting;
    return { ...SYNC_META[r.job], job: r.job, state, color, value: r.value, note: r.minutesAgo != null && r.job === "roster" ? `Last sync ${timeAgo(r.minutesAgo)}` : r.note };
  });
  const on = (b: boolean): [string, string] => (viewer.demo || b ? ["Connected", "#4CD964"] : ["Not set up", "#A99CC0"]);
  const integrations = [
    { name: "Battle.net API", use: "Sign-in, characters, roster, gear, professions, items, auctions", detail: `OAuth client · client credentials + authorization code · ${NS.profile}`, status: on(configured.battlenet()), env: "BNET_CLIENT_ID, BNET_CLIENT_SECRET" },
    { name: "Warcraft Logs", use: "Attendance, parses and boss kills per raid night", detail: "API v2 client · guild reports", status: on(configured.warcraftlogs()), env: "WCL_CLIENT_ID, WCL_CLIENT_SECRET, WCL_GUILD_ID" },
    { name: "Discord", use: "Sign-in link, event posts, reminders, application pings", detail: "Bot token + channel webhooks", status: on(configured.discord()), env: "DISCORD_CLIENT_ID, DISCORD_SIGNUPS_WEBHOOK_URL, DISCORD_BOT_TOKEN" },
    { name: "Guild addon uploads", use: "Guild bank contents and loot awards from raid night", detail: "RCLootCouncil / Gargul export · bank export", status: ["Upload in Loot system", "#A99CC0"] as [string, string], env: "" },
  ];

  return (
    <AdminConsole
      sections={allowed}
      initial={allowed.includes(section as Section) ? (section as Section) : allowed[0]}
      syncs={syncs}
      apps={apps}
      ranks={ranks}
      settings={{ lootSystem: settings.loot_system, wishlistSlots: Number(settings.wishlist_slots), lockDate: settings.wishlist_lock_date, attendanceWindow: settings.attendance_window }}
      integrations={integrations}
      canSyncNow={viewer.demo || configured.battlenet()}
      users={users}
      me={{ userId: viewer.userId ?? "demo", role: viewer.siteRole ?? null }}
      assignable={assignableRoles(viewer.siteRole)}
      guildText={{ motd: String(s.guild_motd ?? ""), info: String(s.guild_info ?? "") }}
      notice={notice}
    />
  );
}
