"use client";
import { useState } from "react";
import {
  createEvent, decideApplication, importBank, importLootLog, publishAnnouncement, recordAward, saveLootSettings, saveRanks, syncEverything,
} from "@/app/actions";
import { StatusDot } from "@/components/bits";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { HubApplication, HubRank } from "@/lib/store";
import { ROLE_LABEL, classColor } from "@/lib/ui";

export type Section = "overview" | "apps" | "loot" | "ranks" | "events" | "keys";
const LABELS: Record<Section, string> = { overview: "Sync & health", apps: "Applications", loot: "Loot system", ranks: "Ranks & permissions", events: "Events & news", keys: "Integrations" };
const SYSTEMS = [
  ["wishlist_council", "Wishlist + loot council", "Ranked wishlists, officers decide ties"],
  ["epgp", "EPGP", "Effort points vs. gear points ratio"],
  ["dkp", "DKP", "Earn points per raid, bid on drops"],
  ["soft_reserve", "Soft reserve", "Each raider reserves 1–2 items per run"],
] as const;
const PERMS = [["canSignUp", "Sign up", "can sign up"], ["canWishlist", "Wishlist", "can keep a wishlist"], ["canRunRaids", "Run raids", "can run raids"], ["canAwardLoot", "Award loot", "can award loot"], ["isAdmin", "Admin", "has admin"]] as const;

export function AdminConsole(props: {
  sections: Section[]; initial: Section;
  syncs: { job: string; name: string; src: string; state: string; color: string; value: string; note: string }[];
  apps: HubApplication[]; ranks: HubRank[];
  settings: { lootSystem: string; wishlistSlots: number; lockDate: string; attendanceWindow: string };
  integrations: { name: string; use: string; detail: string; status: [string, string]; env: string }[];
  canSyncNow: boolean;
}) {
  const [sec, setSec] = useState<Section>(props.initial);
  const [apps, setApps] = useState(props.apps);
  const [loot, setLoot] = useState(props.settings);
  const [ranks, setRanks] = useState(props.ranks);
  const [award, setAward] = useState({ itemName: "", character: "", reason: "" });
  const [ev, setEv] = useState({ raid: "onyxias-lair", date: "2026-12-09", time: "20:00", postToDiscord: true });
  const [news, setNews] = useState({ title: "", body: "" });
  const { pending, run, toast } = useAction();
  const pendingApps = apps.filter((a) => a.status === "pending").length;

  const decide = (id: string, status: HubApplication["status"]) => {
    const prev = apps;
    setApps(apps.map((a) => (a.id === id ? { ...a, status } : a)));
    run(() => decideApplication({ id, status }).then((r) => { if (!r.ok) setApps(prev); return r; }));
  };
  const readFile = (file: File | undefined, fn: (text: string) => void) => { if (file) file.text().then(fn); };

  return (
    <div className="container admin">
      <nav aria-label="Admin sections" className="admin-nav">
        <span className="eyebrow muted" style={{ padding: "0 12px 8px" }}>Guild admin</span>
        {props.sections.map((s) => (
          <button key={s} type="button" aria-current={sec === s ? "page" : undefined} onClick={() => setSec(s)} className="admin-nav-item">
            <span>{LABELS[s]}</span>
            {s === "apps" && pendingApps > 0 && <span className="badge" aria-label={`${pendingApps} pending`}>{pendingApps}</span>}
          </button>
        ))}
      </nav>

      <main id="main" tabIndex={-1} className="page" style={{ flex: "999 1 640px", minWidth: 0, paddingTop: 0, gap: 20 }}>
        {sec === "overview" && (
          <>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Sync &amp; health</h1><p className="soft">Everything the hub pulls in, and when it last succeeded.</p></div>
              <button type="button" className="btn btn-primary" disabled={pending || !props.canSyncNow} onClick={() => run(() => syncEverything())}>{pending ? "Syncing…" : "Sync everything now"}</button>
            </div>
            <div className="grid-auto" style={{ ["--min" as string]: "260px" }}>
              {props.syncs.map((y) => (
                <article key={y.job} className="panel" style={{ gap: 8, padding: 20 }}>
                  <div className="row between"><h2 style={{ fontSize: 17, fontFamily: "var(--font-body)" }}>{y.name}</h2><span className="row small strong" style={{ gap: 6, color: y.color }}><StatusDot color={y.color} live={y.color === "#4CD964"} />{y.state}</span></div>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{y.value}</span>
                  <span className="small soft">{y.note}</span>
                  <span className="src mono">{y.src}</span>
                </article>
              ))}
            </div>
          </>
        )}

        {sec === "apps" && (
          <>
            <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Applications</h1><p className="soft">Accepting sends the applicant a guild invite reminder on Discord. The in-game invite is still done by an officer.</p></div>
            {apps.length === 0 && <div className="empty">No applications yet.</div>}
            {apps.map((a) => (
              <article key={a.id} className="panel" style={{ gap: 10 }}>
                <div className="row between baseline">
                  <h2 style={{ fontSize: 20, color: classColor(a.className) }}>{a.name}</h2>
                  <span className="small muted">Level {a.level ?? "?"} {a.className ?? ""} · wants {ROLE_LABEL[a.role] ?? a.role}</span>
                </div>
                <p className="soft">{a.about}</p>
                <span className="small muted">Available: {a.availability || "—"} · Logs: {a.logs ? <a href={a.logs} target="_blank" rel="noopener noreferrer">Warcraft Logs</a> : "None yet"}</span>
                {a.status === "pending" ? (
                  <span className="row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-danger" disabled={pending} onClick={() => decide(a.id, "declined")}>Decline</button>
                    <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide(a.id, "accepted")}>Accept</button>
                  </span>
                ) : (
                  <span className="row" style={{ justifyContent: "flex-end" }}>
                    <span className="strong" style={{ color: a.status === "accepted" ? "#4CD964" : "#FF8A7A" }}>{a.status === "accepted" ? "Accepted" : "Declined"}</span>
                    <button type="button" className="btn btn-sm" disabled={pending} onClick={() => decide(a.id, "pending")}>Undo</button>
                  </span>
                )}
              </article>
            ))}
          </>
        )}

        {sec === "loot" && (
          <>
            <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Loot system</h1><p className="soft">Pick how the guild distributes loot. Members see the rules on the Loot hub.</p></div>
            <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => saveLootSettings(loot)); }}>
              <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
                <legend className="strong" style={{ marginBottom: 10 }}>Distribution method</legend>
                <div className="grid-auto" style={{ ["--min" as string]: "220px", gap: 10 }}>
                  {SYSTEMS.map(([k, label, desc]) => (
                    <button key={k} type="button" className="select-card" aria-pressed={loot.lootSystem === k} onClick={() => setLoot({ ...loot, lootSystem: k })} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <span className="strong">{label}</span><span className="small muted">{desc}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid-auto" style={{ ["--min" as string]: "200px", gap: 12 }}>
                <label className="field">Wishlist slots per tier<input type="number" min={1} max={20} value={loot.wishlistSlots} onChange={(e) => setLoot({ ...loot, wishlistSlots: Number(e.target.value) })} /></label>
                <label className="field">Wishlists lock on<input type="date" value={loot.lockDate} onChange={(e) => setLoot({ ...loot, lockDate: e.target.value })} /></label>
                <label className="field">Attendance window
                  <select value={loot.attendanceWindow} onChange={(e) => setLoot({ ...loot, attendanceWindow: e.target.value })}>
                    <option value="8w">Last 8 weeks</option><option value="4w">Last 4 weeks</option><option value="tier">Whole tier</option>
                  </select>
                </label>
              </div>
              <div><button type="submit" className="btn btn-primary" disabled={pending}>Save loot settings</button></div>
            </form>

            <section className="panel">
              <h2>Award or import loot</h2>
              <form className="grid-auto" style={{ ["--min" as string]: "200px", gap: 12, alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); run(() => recordAward(award), () => setAward({ itemName: "", character: "", reason: "" })); }}>
                <label className="field">Item<input type="text" required placeholder="Item name or id" value={award.itemName} onChange={(e) => setAward({ ...award, itemName: e.target.value })} /></label>
                <label className="field">Recipient<input type="text" required placeholder="Character name" value={award.character} onChange={(e) => setAward({ ...award, character: e.target.value })} /></label>
                <label className="field">Reason (optional)<input type="text" placeholder="e.g. Council override: closer to 2-piece" value={award.reason} onChange={(e) => setAward({ ...award, reason: e.target.value })} /></label>
                <button type="submit" className="btn btn-primary" disabled={pending}>Record award</button>
              </form>
              <div className="row">
                <label className="btn">
                  Upload RCLootCouncil or Gargul export (.csv)
                  <input type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(e) => readFile(e.target.files?.[0], (t) => run(() => importLootLog(t)))} />
                </label>
                <label className="btn">
                  Upload guild bank export (.json)
                  <input type="file" accept=".json,application/json" className="visually-hidden" onChange={(e) => readFile(e.target.files?.[0], (t) => run(() => importBank(t)))} />
                </label>
              </div>
              <span className="src">CSV needs player and itemID columns. Bank JSON: {"{"}&quot;gold&quot;: copper, &quot;items&quot;: [{"{"}&quot;name&quot;, &quot;tab&quot;, &quot;qty&quot;, &quot;quality&quot;{"}"}]{"}"}</span>
            </section>
          </>
        )}

        {sec === "ranks" && (
          <>
            <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Ranks &amp; permissions</h1><p className="soft">The roster API returns rank numbers only. Name them here and choose what each can do on the hub.</p></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Rank #</th><th scope="col">Name</th>{PERMS.map(([, h]) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>
                  {ranks.map((r, i) => (
                    <tr key={r.index}>
                      <td>{r.index}</td>
                      <td><input type="text" value={r.name} aria-label={`Name for rank ${r.index}`} onChange={(e) => setRanks(ranks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                      {PERMS.map(([k, , aria]) => (
                        <td key={k}><input type="checkbox" checked={r[k]} aria-label={`Rank ${r.index} ${aria}`} onChange={(e) => setRanks(ranks.map((x, j) => (j === i ? { ...x, [k]: e.target.checked } : x)))} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div><button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveRanks(ranks))}>Save ranks</button></div>
          </>
        )}

        {sec === "events" && (
          <>
            <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Events &amp; announcements</h1><p className="soft">Create raid nights and post news. Both can mirror to Discord.</p></div>
            <div className="grid-auto" style={{ ["--min" as string]: "320px" }}>
              <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => createEvent(ev)); }}>
                <h2>New raid night</h2>
                <label className="field">Raid
                  <select value={ev.raid} onChange={(e) => setEv({ ...ev, raid: e.target.value })}>
                    <option value="onyxias-lair">Onyxia&apos;s Lair (40)</option><option value="hyjal-summit">Hyjal Summit (20)</option><option value="barrow-deeps">Barrow Deeps (10)</option>
                  </select>
                </label>
                <label className="field">Date<input type="date" required value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></label>
                <label className="field">Start time (server time, US Central)<input type="time" required value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></label>
                <label className="check"><input type="checkbox" checked={ev.postToDiscord} onChange={(e) => setEv({ ...ev, postToDiscord: e.target.checked })} />Post signup to Discord #raid-signups</label>
                <div><button type="submit" className="btn btn-primary" disabled={pending}>Create event</button></div>
              </form>
              {props.sections.includes("overview") && (
                <form className="panel" onSubmit={(e) => { e.preventDefault(); run(() => publishAnnouncement(news), () => setNews({ title: "", body: "" })); }}>
                  <h2>Announcement</h2>
                  <label className="field">Title<input type="text" required value={news.title} onChange={(e) => setNews({ ...news, title: e.target.value })} /></label>
                  <label className="field">Message<textarea rows={4} required value={news.body} onChange={(e) => setNews({ ...news, body: e.target.value })} /></label>
                  <div><button type="submit" className="btn btn-primary" disabled={pending}>Publish</button></div>
                </form>
              )}
            </div>
          </>
        )}

        {sec === "keys" && (
          <>
            <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: 34 }}>Integrations</h1><p className="soft">API credentials are stored server-side as environment variables and never shown to members.</p></div>
            <div className="grid-auto" style={{ ["--min" as string]: "300px" }}>
              {props.integrations.map((g) => (
                <article key={g.name} className="panel" style={{ gap: 8 }}>
                  <h2 style={{ fontSize: 18 }}>{g.name}</h2>
                  <span className="soft small">{g.use}</span>
                  <span className="micro muted">{g.detail}</span>
                  {g.env && <span className="src mono">{g.env}</span>}
                  <div className="row small strong" style={{ gap: 6, color: g.status[1] }}><StatusDot color={g.status[1]} />{g.status[0]}</div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
      <Toast toast={toast} />
    </div>
  );
}
