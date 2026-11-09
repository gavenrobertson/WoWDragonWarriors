"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCraft } from "@/app/actions";
import { Avatar, StatusDot } from "@/components/bits";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { HubBank, HubCraftRequest } from "@/lib/store";
import { classColor, qualityColor } from "@/lib/ui";

export interface MemberVM { slug: string; avatarUrl: string | null; name: string; className: string; spec: string; level: number; rank: string; role: string; roleKey: string; main: string; ready: string; seen: string }
type Tab = "members" | "craft" | "bank";
const FILTERS = [["all", "Everyone"], ["tank", "Tanks"], ["healer", "Healers"], ["melee", "Melee"], ["ranged", "Ranged"]] as const;

export function RosterView({ initialTab, total, rows, profs, bank, requests, signedIn, source, auctionNs }: {
  initialTab: Tab; total: number; rows: MemberVM[]; profs: { name: string; crafters: { name: string; className: string; skill: number }[] }[];
  bank: HubBank; requests: HubCraftRequest[]; signedIn: boolean; source: string; auctionNs: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const [craft, setCraft] = useState({ itemName: "", quantity: 1 });
  const { pending, run, toast } = useAction();

  const shown = rows.filter((m) => (role === "all" || m.roleKey === role) && (!q || `${m.name} ${m.className} ${m.spec}`.toLowerCase().includes(q.toLowerCase())));
  const sendCraft = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => requestCraft(craft), () => setCraft({ itemName: "", quantity: 1 }));
  };

  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="panel-royal page-head">
        <div className="stack" style={{ gap: 8 }}>
          <h1>Roster</h1>
          <p className="soft" style={{ fontSize: 16 }}>{total} members, synced from the guild roster every 30 minutes. Mains and alts are linked by Battle.net account.</p>
          <span className="src">Blizzard API · {source}</span>
        </div>
      </section>

      <div role="tablist" aria-label="Roster views" className="tablist">
        {([["members", "Members"], ["craft", "Crafting"], ["bank", "Guild bank"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "members" && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 8 }}>
            <label className="row small strong" style={{ gap: 8 }}>Search<input type="search" placeholder="Name or class" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <div className="row" role="group" aria-label="Filter by role" style={{ gap: 8 }}>
              {FILTERS.map(([k, label]) => <button key={k} type="button" className="chip" aria-pressed={role === k} onClick={() => setRole(k)}>{label}</button>)}
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th scope="col">Character</th><th scope="col">Level</th><th scope="col">Rank</th><th scope="col">Role</th><th scope="col">Main / alt</th><th scope="col">Onyxia ready</th><th scope="col">Last seen</th>
              </tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={7} className="soft" style={{ textAlign: "center", padding: 28 }}>{rows.length ? "No members match." : "The roster hasn't synced yet."}</td></tr>}
                {shown.map((m) => (
                  <tr key={m.slug}>
                    <td>
                      <Link href={`/characters/${m.slug}`} className="row" style={{ textDecoration: "none", gap: 10, flexWrap: "nowrap" }}>
                        <Avatar name={m.name} className={m.className} size={36} url={m.avatarUrl} />
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                          <span className="strong" style={{ color: classColor(m.className) }}>{m.name}</span>
                          <span className="micro muted">{m.spec} {m.className}</span>
                        </span>
                      </Link>
                    </td>
                    <td>{m.level}</td><td>{m.rank}</td><td>{m.role}</td><td>{m.main}</td>
                    <td><span className="row small strong" style={{ gap: 6, flexWrap: "nowrap", color: m.ready === "Ready" ? "#4CD964" : "#F2B84B" }}><StatusDot color={m.ready === "Ready" ? "#4CD964" : "#F2B84B"} />{m.ready}</span></td>
                    <td className="muted">{m.seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="src">Rank names map to the roster&apos;s rank numbers in Admin › Ranks. Readiness = level 60 + attunement from /quests/completed.</span>
        </div>
      )}

      {tab === "craft" && (
        <div className="split" style={{ gap: 16 }}>
          <div className="main-col grid-auto" style={{ ["--min" as string]: "240px" }}>
            {profs.length === 0 && <div className="empty">No crafters synced yet.</div>}
            {profs.map((p) => (
              <article key={p.name} className="panel" style={{ gap: 10, padding: 20 }}>
                <h2 style={{ fontSize: 18 }}>{p.name}</h2>
                {p.crafters.map((c) => (
                  <div key={c.name} className="row between small"><span className="strong" style={{ color: classColor(c.className) }}>{c.name}</span><span className="bold gold">{c.skill}</span></div>
                ))}
              </article>
            ))}
          </div>
          <aside className="side-col stack" style={{ gap: 16 }}>
            <form className="panel" onSubmit={sendCraft}>
              <h2>Request a craft</h2>
              <label className="field">Item or recipe<input type="text" required placeholder="e.g. Greater Fire Protection Potion" value={craft.itemName} onChange={(e) => setCraft({ ...craft, itemName: e.target.value })} /></label>
              <label className="field">Quantity<input type="number" min={1} max={200} value={craft.quantity} onChange={(e) => setCraft({ ...craft, quantity: Number(e.target.value) })} /></label>
              <button type="submit" className="btn btn-primary" disabled={pending || !signedIn}>{pending ? "Sending…" : "Send to crafters"}</button>
              {!signedIn && <span className="micro muted"><Link href="/sign-in">Sign in</Link> to request crafts.</span>}
              <span className="src">Skill levels and known recipes: Blizzard API /professions. Requests live in the hub database.</span>
            </form>
            {requests.length > 0 && (
              <div className="panel" style={{ gap: 10 }}>
                <h3>Open requests</h3>
                <ul className="divided">{requests.map((r) => <li key={r.id} className="row between small" style={{ padding: "8px 0" }}><span>{r.itemName} × {r.quantity}</span><span className="muted">{r.requester}</span></li>)}</ul>
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "bank" && (
        <div className="split" style={{ gap: 16 }}>
          <div className="main-col panel">
            <div className="row between baseline">
              <span className="strong">Guild bank · <span className="gold">{bank.gold != null ? `${Math.floor(bank.gold / 10000).toLocaleString("en-US")} gold` : "[GOLD] gold"}</span></span>
              <span className="src">Addon export uploaded by the bank officer · last sync {bank.uploadedAt ? new Date(bank.uploadedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "[TIME]"}</span>
            </div>
            {bank.items.length === 0 ? <p className="empty">No bank export uploaded yet.</p> : (
              <ul className="divided">
                {bank.items.map((b) => (
                  <li key={`${b.tab}-${b.name}`} className="row between" style={{ padding: "10px 0" }}>
                    <span className="stack" style={{ gap: 0, lineHeight: 1.3 }}><span className="strong" style={{ color: qualityColor(b.quality) }}>{b.name}</span><span className="micro muted">{b.tab}</span></span>
                    <span className="row" style={{ gap: 12 }}>
                      <span className="small strong soft">× {b.qty}</span>
                      <button type="button" className="btn btn-sm" disabled={pending || !signedIn} onClick={() => run(() => requestCraft({ itemName: `Bank request: ${b.name}`, quantity: 1 }))}>Request</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="side-col panel">
            <h2>Why an addon?</h2>
            <p className="soft small">Blizzard&apos;s API has no guild bank endpoint, so contents come from an in-game export. Prices next to items can come from the auction house endpoint for your ruleset.</p>
            <span className="src">Prices: /data/wow/ruleset/{"{id}"}/auctions · {auctionNs}</span>
          </aside>
        </div>
      )}
      <Toast toast={toast} />
    </main>
  );
}
