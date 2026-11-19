"use client";
// Admin › Marks & chests: Super Admins and Guild Leaders give Dragon Marks and chests to members.
import { useMemo, useState } from "react";
import { Avatar } from "@/components/bits";
import type { ActionResult } from "@/components/useAction";
import type { GrantLog, Holdings } from "@/lib/arcade";
import { fmt, wowIconUrl } from "@/lib/arcade-games";
import type { HubUser } from "@/lib/store";
import { classColor } from "@/lib/ui";

type Chest = { id: string; name: string; icon: string; price: number };
type GrantFn = (input: { userIds: string[] | "all"; marks: number; chests: Record<string, number>; note?: string }) => Promise<ActionResult & { holdings?: Holdings; log?: GrantLog[] }>;

const MARK_PRESETS = [1000, 5000, 10000, 25000];
const when = (iso: string) => {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return isNaN(+d) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export function RewardsSection({ users, me, holdings: held0, log: log0, chests, pending, run, grant }: {
  users: HubUser[]; me: string; holdings: Holdings; log: GrantLog[]; chests: Chest[];
  pending: boolean; run: (fn: () => Promise<ActionResult>, onOk?: () => void) => void; grant: GrantFn;
}) {
  const [held, setHeld] = useState(held0);
  const [log, setLog] = useState(log0);
  const [everyone, setEveryone] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [marks, setMarks] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const shown = useMemo(() => users.filter((u) => !q || `${u.battletag} ${u.main?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())), [users, q]);
  const recipients = everyone ? users.length : picked.size;
  const chestParts = chests.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => `${counts[c.id]} ${c.name}${counts[c.id] === 1 ? "" : "s"}`);
  const gift = [marks > 0 ? `${fmt(marks)} marks` : "", ...chestParts].filter(Boolean);
  const ready = recipients > 0 && gift.length > 0;
  const summary = ready
    ? `${gift.join(" + ")} to ${everyone ? `everyone (${users.length})` : recipients === 1 ? users.find((u) => picked.has(u.id))?.main?.name ?? "1 person" : `${recipients} people`}`
    : recipients === 0 ? "Pick who gets it" : "Add marks or a chest";

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const step = (id: string, d: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(100, (c[id] ?? 0) + d)) }));

  const send = () => {
    if (!ready) return;
    if (!window.confirm(`Send ${summary}?`)) return;
    const input = { userIds: everyone ? ("all" as const) : [...picked], marks, chests: counts, note };
    run(() => grant(input).then((r) => {
      if (r.ok) {
        if (r.holdings) setHeld(r.holdings);
        if (r.log) setLog(r.log);
        setMarks(0); setCounts({}); setNote("");
      }
      return r;
    }));
  };

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 34 }}>Marks &amp; chests</h1>
        <p className="soft">Give Dragon Marks and unopened chests to members, or to everyone at once. Chests land in their arcade inventory, ready to open. Every gift is logged with your name.</p>
      </div>

      <div className="grant-grid">
        {/* who */}
        <section className="panel grant-who" aria-labelledby="grant-who-h">
          <div className="row between baseline">
            <h2 id="grant-who-h" style={{ fontSize: 20 }}>1. Who gets it</h2>
            <label className="grant-all">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              <span>Everyone ({users.length})</span>
            </label>
          </div>
          {!everyone && (
            <>
              <div className="row" style={{ gap: 8 }}>
                <label className="search-field small strong" style={{ flex: "1 1 200px" }}><span className="search-label">Search</span>
                  <input type="search" aria-label="Search people" placeholder="BattleTag or character" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set(shown.map((u) => u.id)))}>Select shown</button>
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</button>
              </div>
              <ul className="grant-people" aria-label="People">
                {shown.length === 0 && <li className="soft small" style={{ padding: 12 }}>Nobody matches.</li>}
                {shown.map((u) => {
                  const h = held[u.id], on = picked.has(u.id);
                  const owned = Object.entries(h?.chests ?? {}).filter(([, n]) => n > 0);
                  return (
                    <li key={u.id}>
                      <label className={`grant-person${on ? " on" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(u.id)} />
                        <Avatar name={u.main?.name ?? u.battletag} className={u.main?.className} size={34} url={u.main?.avatarUrl} />
                        <span className="grant-person-name">
                          <span className="strong" style={{ color: u.main ? classColor(u.main.className) : undefined }}>{u.main?.name ?? u.battletag}</span>
                          <span className="micro muted">{u.battletag}{u.id === me ? " · you" : ""}</span>
                        </span>
                        <span className="grant-person-held">
                          <span className="grant-marks">{fmt(h?.marks ?? 0)}</span>
                          {owned.length > 0 && (
                            <span className="grant-owned" aria-label="Unopened chests">
                              {owned.map(([id, n]) => { const c = chests.find((x) => x.id === id); return c ? <span key={id} title={`${n} ${c.name}`}><img src={wowIconUrl(c.icon, 36)} alt="" width={16} height={16} />{n}</span> : null; })}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {everyone && <p className="soft small">Everyone who has signed in with Battle.net ({users.length} accounts) gets the same gift.</p>}
        </section>

        {/* what */}
        <section className="panel grant-what" aria-labelledby="grant-what-h">
          <h2 id="grant-what-h" style={{ fontSize: 20 }}>2. What they get</h2>
          <label className="stack" style={{ gap: 6 }}>
            <span className="small strong">Dragon Marks</span>
            <input type="number" inputMode="numeric" min={0} max={1000000} step={100} value={marks || ""} placeholder="0"
              onChange={(e) => setMarks(Math.max(0, Math.min(1_000_000, Math.floor(Number(e.target.value) || 0))))} />
          </label>
          <div className="row" style={{ gap: 6 }}>
            {MARK_PRESETS.map((m) => <button key={m} type="button" className="btn btn-sm" onClick={() => setMarks(m)} aria-pressed={marks === m}>{fmt(m)}</button>)}
          </div>

          <span className="small strong" style={{ marginTop: 6 }}>Chests</span>
          <ul className="grant-chests">
            {chests.map((c) => (
              <li key={c.id} className={(counts[c.id] ?? 0) > 0 ? "on" : undefined}>
                <img src={wowIconUrl(c.icon)} alt="" width={36} height={36} />
                <span className="grant-chest-name"><span className="strong">{c.name}</span><span className="micro muted">{fmt(c.price)} marks in the shop</span></span>
                <span className="grant-stepper">
                  <button type="button" aria-label={`One fewer ${c.name}`} onClick={() => step(c.id, -1)} disabled={!(counts[c.id] ?? 0)}>−</button>
                  <output aria-live="polite">{counts[c.id] ?? 0}</output>
                  <button type="button" aria-label={`One more ${c.name}`} onClick={() => step(c.id, 1)}>+</button>
                </span>
              </li>
            ))}
          </ul>

          <label className="stack" style={{ gap: 6 }}>
            <span className="small strong">Reason <span className="muted">(optional, kept in the log)</span></span>
            <input type="text" maxLength={200} value={note} placeholder="e.g. Onyxia first kill" onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="grant-send">
            <span className={ready ? "strong" : "muted"}>{summary}</span>
            <button type="button" className="btn btn-primary" onClick={send} disabled={!ready || pending}>{pending ? "Sending…" : "Send gift"}</button>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="grant-log-h" style={{ gap: 12 }}>
        <h2 id="grant-log-h" style={{ fontSize: 20 }}>Recent gifts</h2>
        {log.length === 0 ? <p className="soft small">No gifts yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">When</th><th scope="col">To</th><th scope="col">Gift</th><th scope="col">From</th><th scope="col">Reason</th></tr></thead>
              <tbody>
                {log.map((g, i) => (
                  <tr key={`${g.at}-${i}`}>
                    <td className="small">{when(g.at)}</td>
                    <td><span className="strong">{g.character ?? g.battletag}</span><br /><span className="micro muted">{g.battletag}</span></td>
                    <td className="small">{[g.marks ? `${fmt(g.marks)} marks` : "", ...Object.entries(g.chests).map(([id, n]) => `${n} ${chests.find((c) => c.id === id)?.name ?? id}${n === 1 ? "" : "s"}`)].filter(Boolean).join(", ") || "—"}</td>
                    <td className="small">{g.by}</td>
                    <td className="small soft">{g.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
