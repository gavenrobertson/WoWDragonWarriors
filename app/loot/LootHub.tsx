"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { saveWishlist } from "@/app/actions";
import { ItemIcon } from "@/components/bits";
import { IconDown, IconUp, IconX } from "@/components/icons";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { HubAward } from "@/lib/store";
import { classColor, qualityColor } from "@/lib/ui";

export interface LootItem {
  id: number; name: string; quality: string; slot: string; slotDetail: string; roles: string[]; raid: string; boss: string; iconUrl: string | null;
  queue: { name: string; className: string; rank: number; won: number; att: number }[];
}
type Tab = "pools" | "wish" | "history";

const ROLE_FILTERS = [["all", "All roles"], ["tank", "Tank"], ["healer", "Healer"], ["melee", "Melee"], ["ranged", "Ranged"]] as const;

export function LootHub(props: {
  initialTab: Tab; raids: { id: string; name: string; meta: string; lootKnown: boolean }[]; items: LootItem[]; initialWish: number[];
  owner: { slug: string; name: string } | null; canWishlist: boolean; canImport: boolean; slots: number; systemLabel: string; lockLabel: string;
  locked: boolean; awards: HubAward[]; namespace: string;
}) {
  const { items, raids, owner, slots } = props;
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [raid, setRaid] = useState(raids[0]?.id ?? "");
  const [role, setRole] = useState("all");
  const [sel, setSel] = useState<number>(props.initialWish[0] ?? items[0]?.id ?? 0);
  const [wish, setWish] = useState<number[]>(props.initialWish);
  const [query, setQuery] = useState("");
  const { pending, run, toast } = useAction();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const editable = !!owner && props.canWishlist && !props.locked;

  const commit = (next: number[]) => {
    if (!owner) return;
    const prev = wish;
    setWish(next);
    run(() => saveWishlist({ character: owner.slug, itemIds: next }).then((r) => { if (!r.ok) setWish(prev); return r; }));
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= wish.length) return;
    const next = wish.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const raidMeta = raids.find((r) => r.id === raid);
  const shown = items.filter((it) => it.raid === raid && (role === "all" || it.roles.includes(role)));
  const s = byId.get(sel) ?? shown[0];
  const inWish = s ? wish.includes(s.id) : false;
  const ownerFull = owner?.name;
  // Show the viewer in the queue at their current wishlist position (optimistic).
  const isYou = (q: { name: string }) => !!ownerFull && q.name.startsWith(ownerFull + " ");
  const yours = s?.queue.find(isYou);
  const queue = s
    ? [...s.queue.filter((q) => !isYou(q)), ...(inWish && ownerFull ? [{ name: `${ownerFull} (you)`, className: "", rank: wish.indexOf(s.id) + 1, won: yours?.won ?? 0, att: yours?.att ?? 0, you: true }] : [])]
        .sort((a, b) => a.rank - b.rank || b.att - a.att || a.won - b.won)
    : [];
  const awards = props.awards.filter((a) => !query || `${a.itemName} ${a.characterName}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="panel-royal page-head">
        <div className="stack" style={{ gap: 8 }}>
          <h1>Loot hub</h1>
          <p className="soft" style={{ fontSize: 16 }}>Every drop, every wishlist, every award. Wishlists lock the night before raids open.</p>
        </div>
        <div className="row">
          <Link href="/loot/council" className="btn btn-primary">Enter the council chamber</Link>
          <span className="pill plain">System: {props.systemLabel}</span>
          <span className="pill">{props.locked ? "Wishlists locked" : `Wishlists lock ${props.lockLabel}`}</span>
        </div>
      </section>

      <div role="tablist" aria-label="Loot views" className="tablist">
        {([["pools", "Loot pools"], ["wish", "My wishlist"], ["history", "Loot history"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "pools" && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="grid-auto" style={{ ["--min" as string]: "240px" }}>
            {raids.map((r) => (
              <button key={r.id} type="button" className="select-card" aria-pressed={raid === r.id} onClick={() => setRaid(r.id)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "16px 18px" }}>
                <span className="display bold" style={{ fontSize: 18 }}>{r.name}</span>
                <span className="small muted">{r.meta}</span>
              </button>
            ))}
          </div>

          {raidMeta?.lootKnown ? (
            <>
              <div className="row" role="group" aria-label="Filter by role" style={{ gap: 8 }}>
                <span className="small muted">Show items for</span>
                {ROLE_FILTERS.map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={role === k} onClick={() => setRole(k)}>{label}</button>
                ))}
              </div>
              <div className="split" style={{ gap: 16 }}>
                <div className="main-col panel" style={{ padding: 0, gap: 0, flexBasis: 480 }}>
                  <div className="row between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--dw-border)" }}>
                    <span className="strong">{shown[0]?.boss ?? "Onyxia"} · {shown.length} items</span>
                    <span className="src">Item data: Blizzard API /data/wow/item · {props.namespace}</span>
                  </div>
                  <ul className="divided">
                    {shown.map((it) => {
                      const mine = wish.includes(it.id);
                      return (
                        <li key={it.id}>
                          <button type="button" aria-pressed={sel === it.id} onClick={() => setSel(it.id)} className="loot-row">
                            <ItemIcon slot={it.slot} quality={it.quality} iconUrl={it.iconUrl} />
                            <span className="stack grow" style={{ gap: 0, lineHeight: 1.3 }}>
                              <span className="strong" style={{ color: qualityColor(it.quality) }}>{it.name}</span>
                              <span className="micro muted">{it.slotDetail}</span>
                            </span>
                            <span className="stack" style={{ gap: 0, alignItems: "flex-end", lineHeight: 1.3, flex: "none" }}>
                              <span className="small strong">{it.queue.length ? `${it.queue.length} interested` : "Open roll"}</span>
                              <span className="micro" style={{ color: mine ? "var(--dw-gold-link)" : "var(--dw-text-muted)" }}>
                                {mine ? "On your wishlist" : it.queue.length ? `Top: ${it.queue[0].name.split(" ")[0]}` : "No wishlists"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {s && (
                  <aside aria-label="Item detail" className="side-col panel sticky-aside" style={{ flexBasis: 380 }}>
                    <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
                      <ItemIcon slot={s.slot} quality={s.quality} iconUrl={s.iconUrl} size={56} />
                      <div className="stack" style={{ gap: 2 }}>
                        <h2 style={{ fontSize: 20, color: qualityColor(s.quality) }}>{s.name}</h2>
                        <span className="small muted">{s.slotDetail} · {s.boss}</span>
                      </div>
                    </div>
                    <button type="button" className={inWish ? "btn btn-lg" : "btn btn-primary btn-lg"} disabled={!editable || pending || (!inWish && wish.length >= slots)}
                      onClick={() => commit(inWish ? wish.filter((x) => x !== s.id) : [...wish, s.id])}>
                      {inWish ? "Remove from my wishlist" : wish.length >= slots ? `Wishlist full (${slots})` : "Add to my wishlist"}
                    </button>
                    {!props.canWishlist && <p className="micro muted">Your guild rank can&apos;t keep a raid wishlist yet.</p>}
                    {props.canWishlist && !owner && <p className="micro muted">You need a level 60 character to build a raid wishlist.</p>}
                    <div className="stack" style={{ gap: 10 }}>
                      <div className="row between baseline"><h3>Priority queue</h3><span className="src">Hub database</span></div>
                      {queue.length ? (
                        <ol className="stack" style={{ gap: 8 }}>
                          {queue.map((q, i) => (
                            <li key={q.name} className="tile row" style={{ gap: 12, flexWrap: "nowrap", padding: "10px 14px", ...("you" in q ? { borderColor: "var(--dw-gold)" } : {}) }}>
                              <span className="bold gold" style={{ width: 20, textAlign: "center" }}>{i + 1}</span>
                              <span className="stack grow" style={{ gap: 0, lineHeight: 1.3 }}>
                                <span className="strong" style={{ color: q.className ? classColor(q.className) : "var(--dw-gold-link)" }}>{q.name}</span>
                                <span className="micro muted">Wishlist #{q.rank} · {q.won} items won</span>
                              </span>
                              <span className="small strong soft">{Math.round(q.att)}%</span>
                            </li>
                          ))}
                        </ol>
                      ) : <p className="soft small">No one has wishlisted this yet. It goes to open roll unless the council assigns it.</p>}
                    </div>
                    <p className="micro muted">Attendance shown is the last 8 weeks, counted from Warcraft Logs reports. Council decides ties.</p>
                  </aside>
                )}
              </div>
            </>
          ) : (
            <div className="panel stack" style={{ alignItems: "flex-start" }}>
              <h2>{raidMeta?.name} loot table opens December 9</h2>
              <p className="soft">This is a new WoW Forever raid, so its drops aren&apos;t known yet. When it opens, the hub fills each boss&apos;s loot from Blizzard&apos;s item data and the guild&apos;s first-kill loot logs. Wishlists unlock for it at the same time.</p>
              <span className="src">Sources: /data/wow/item · {props.namespace}, plus RCLootCouncil or Gargul exports from raid night</span>
            </div>
          )}
        </div>
      )}

      {tab === "wish" && (
        <div className="split" style={{ gap: 16 }}>
          <div className="main-col panel">
            <div className="row between baseline">
              <h2>{owner ? `${owner.name}'s wishlist` : "Your wishlist"}</h2>
              <span className="small muted">{wish.length} of {slots} slots used · reorder to set priority</span>
            </div>
            {!owner && <p className="soft">Reach level 60 on a claimed character to build a raid wishlist.</p>}
            {owner && wish.length === 0 && <p className="empty">Nothing yet. Pick items from the Loot pools tab.</p>}
            <div className="stack" style={{ gap: 8 }}>
              {wish.map((id, i) => {
                const it = byId.get(id);
                if (!it) return null;
                return (
                  <div key={id} className="tile" style={{ display: "grid", gridTemplateColumns: "36px 40px minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                    <span className="bold gold" style={{ fontSize: 18, textAlign: "center" }}>#{i + 1}</span>
                    <ItemIcon slot={it.slot} quality={it.quality} iconUrl={it.iconUrl} />
                    <span className="stack" style={{ gap: 0, lineHeight: 1.3, minWidth: 0 }}>
                      <span className="strong" style={{ color: qualityColor(it.quality) }}>{it.name}</span>
                      <span className="micro muted">{it.slotDetail} · {raids.find((r) => r.id === it.raid)?.name}</span>
                    </span>
                    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <button type="button" className="icon-btn" aria-label={`Move ${it.name} up`} disabled={!editable || i === 0} onClick={() => move(i, -1)}><IconUp /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${it.name} down`} disabled={!editable || i === wish.length - 1} onClick={() => move(i, 1)}><IconDown /></button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${it.name}`} disabled={!editable} onClick={() => commit(wish.filter((x) => x !== id))}><IconX /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <aside className="side-col panel">
            <h3>How priority works</h3>
            <p className="soft small">Your #1 pick outranks anyone&apos;s #2. Ties go to higher attendance, then fewer items won this tier. Officers can override with a recorded reason.</p>
            <p className="soft small">Tier pieces count toward set bonuses, so the council weighs them by how close you are to 2-piece.</p>
            <span className="src">Rules set by officers in Admin › Loot system</span>
          </aside>
        </div>
      )}

      {tab === "history" && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row between">
            <h2>Loot history</h2>
            <div className="row">
              <label className="row small strong" style={{ gap: 8 }}>Search
                <input type="search" placeholder="Player or item" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {props.canImport && <Link href="/admin?section=loot" className="btn">Import loot log</Link>}
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Date</th><th scope="col">Item</th><th scope="col">Awarded to</th><th scope="col">Raid · boss</th><th scope="col">Method</th></tr></thead>
              <tbody>
                {awards.length === 0 ? (
                  <tr><td colSpan={5} className="soft" style={{ textAlign: "center", padding: 28 }}>
                    {props.awards.length ? "No awards match that search." : "No awards yet. The first entries land after raid night on December 9, imported from the in-game loot addon export."}
                  </td></tr>
                ) : awards.map((a) => (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td><span className="strong" style={{ color: qualityColor(a.quality) }}>{a.itemName}</span></td>
                    <td><span className="strong" style={{ color: classColor(a.className) }}>{a.characterName}</span></td>
                    <td>{[raids.find((r) => r.id === a.raid)?.name, a.boss].filter(Boolean).join(" · ") || "—"}</td>
                    <td>
                      <span className={a.method === "admin override" ? "strong" : undefined} style={a.method === "admin override" ? { color: "#ffb4a6" } : undefined}>{a.method === "admin override" ? "⚖ Admin override" : a.method}</span>
                      {a.reason && <><br /><span className="micro muted">{a.reason}</span></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Toast toast={toast} />
    </main>
  );
}
