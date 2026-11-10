"use client";
// Loot council chamber: the item on a pedestal, candidates standing as their Blizzard renders,
// council members' votes as portraits on each candidate, and an award button.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { awardItem, castVote, councilPulse, overrideAward } from "@/app/actions";
import { backContender } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import { CouncilRecap, type RecapItem } from "@/components/CouncilRecap";
import { Avatar, ItemIcon } from "@/components/bits";
import { GavelSlam, type GavelMoment } from "@/components/Gavel";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { CouncilMember } from "@/lib/store";
import { classColor, qualityColor } from "@/lib/ui";

export interface CouncilCandidate {
  characterId: string; slug: string; name: string; className: string; spec: string; race: string; level: number;
  renderUrl: string | null; avatarUrl: string | null; wishRank: number; approved: boolean; attendance: number | null; won: number;
}
export interface PoolEntry { itemId: number; characterId: string; stake: number; mine: boolean; name: string; className: string; avatarUrl: string | null; nameStyle: string | null }
export interface CouncilItem {
  id: number; name: string; quality: string; iconUrl: string | null; slot: string; boss: string; raid: string;
  candidates: CouncilCandidate[]; votes: { voterUserId: string; characterId: string }[];
}

// Practice mode swaps the server actions for local ones: nothing is saved and nothing posts to Discord.
const practiceOk = (message?: string) => async () => ({ ok: true as const, message });

export function CouncilChamber({ items: initial, members, me, canVote, canOverride, roster, practice = false, pool: pool0 = [], canObserve = false, marks: marks0 = 0, now }: {
  items: CouncilItem[]; members: CouncilMember[]; me: string; canVote: boolean; canOverride: boolean;
  roster: { id: string; name: string; className: string; level: number }[]; practice?: boolean;
  pool?: PoolEntry[]; canObserve?: boolean; marks?: number; now?: string;
}) {
  const [pool, setPool] = useState(pool0);
  const [marks, setMarks] = useState(marks0);
  const [stake, setStake] = useState(100);
  const act = practice
    ? { castVote: practiceOk(), awardItem: practiceOk("Practice award: not saved, nothing posted"), overrideAward: practiceOk("Practice override: not saved, nothing posted") }
    : { castVote, awardItem, overrideAward };
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id ?? 0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [awarded, setAwarded] = useState<Record<number, string>>({});
  const [log, setLog] = useState<RecapItem[]>([]);
  const [slam, setSlam] = useState<GavelMoment | null>(null);
  const [override, setOverride] = useState<{ characterId: string; reason: string } | null>(null);
  const { pending, run, toast } = useAction();
  const hall = useRef<HTMLElement>(null);
  // Bring the hall (and the gavel) into view and show the awarded item, on every screen watching.
  const strike = (itemId: number, moment: GavelMoment) => {
    setSel(itemId); setConfirm(null);
    setSlam(moment);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    hall.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  };
  // Live: other officers' votes and awards show up for everyone within a few seconds.
  const awardedRef = useRef(awarded); awardedRef.current = awarded;
  const mine = useRef(new Set<number>()); // awards this screen made itself (it plays its own gavel)
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => {
    if (practice || !now) return;
    let stop = false, busy = false;
    const tick = async () => {
      if (stop || busy || document.hidden) return;
      busy = true;
      try {
        const r = await councilPulse({ since: now, itemIds: initial.map((i) => i.id) });
        if (stop || !r.ok) return;
        const fresh = r.awards.filter((a) => !awardedRef.current[a.item_id] && !mine.current.has(a.item_id));
        if (!pendingRef.current) {
          setItems((is) => is.map((it) => {
            if (awardedRef.current[it.id]) return it;
            const votes = r.votes.filter((v) => v.item_id === it.id).map((v) => ({ voterUserId: v.voter_user_id, characterId: v.character_id }));
            const same = votes.length === it.votes.length && votes.every((v) => it.votes.some((x) => x.voterUserId === v.voterUserId && x.characterId === v.characterId));
            return same ? it : { ...it, votes };
          }));
        }
        if (fresh.length) {
          const next: Record<number, string> = {};
          for (const a of fresh) next[a.item_id] = `${a.name} ${a.surname ?? ""}`.trim();
          setAwarded((x) => ({ ...x, ...next }));
          setLog((l) => [...l, ...fresh.flatMap((a) => {
            const it = itemsRef.current.find((i) => i.id === a.item_id);
            return it ? [{ id: it.id, name: it.name, quality: it.quality, iconUrl: it.iconUrl, overruled: a.method !== "council", detail: a.method === "council" ? "Council decision" : "Admin override",
              winner: { name: next[a.item_id], className: a.class ?? "", avatarUrl: a.avatar_url, slug: a.slug } }] : [];
          })]);
          const last = fresh[fresh.length - 1], it = itemsRef.current.find((i) => i.id === last.item_id);
          if (it) strike(it.id, { key: Date.now(), item: it.name, winner: next[last.item_id], color: qualityColor(it.quality), icon: it.iconUrl, word: last.method === "council" ? undefined : "Overruled" });
        }
      } catch { /* offline for a moment; try again next tick */ } finally { busy = false; }
    };
    const id = setInterval(tick, 4000);
    const vis = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practice, now]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  // Practice: simulated officers vote a moment after you do, so a majority can form.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const simulate = (itemId: number, hint?: string) => {
    const bots = members.filter((m) => m.userId.startsWith("bot:"));
    bots.forEach((b, i) => {
      timers.current.push(setTimeout(() => {
        setItems((is) => is.map((it) => {
          if (it.id !== itemId || it.votes.some((v) => v.voterUserId === b.userId)) return it;
          // Mostly back the wishlist favourite or your pick, sometimes go their own way.
          const r = Math.random();
          const pick = r < 0.45 && hint ? hint : r < 0.8 ? it.candidates[0]?.characterId : it.candidates[Math.floor(Math.random() * it.candidates.length)]?.characterId;
          return pick ? { ...it, votes: [...it.votes, { voterUserId: b.userId, characterId: pick }] } : it;
        }));
      }, 700 + i * 650 + Math.random() * 400));
    });
  };
  const resetPractice = () => { timers.current.forEach(clearTimeout); timers.current = []; setItems(initial); setAwarded({}); setOverride(null); setConfirm(null); };

  const item = items.find((i) => i.id === sel) ?? items[0];
  if (!item) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <ChamberHead practice={practice} />
        <div className="empty">No contested loot right now. Items appear here once raiders put them on their wishlists.{!practice && <> <Link href="/loot/council/overview">See the last council session</Link>.</>}</div>
      </main>
    );
  }

  const tally = (cid: string) => item.votes.filter((v) => v.characterId === cid).length;
  // Observer pool for this item
  const itemPool = pool.filter((p) => p.itemId === item.id);
  const pot = itemPool.reduce((a, p) => a + p.stake, 0);
  const myPick = itemPool.find((p) => p.mine);
  const showPool = !practice && (canObserve || itemPool.length > 0);
  const back = (c: CouncilCandidate) => {
    const it = item;
    run(() => backContender({ itemId: it.id, characterId: c.characterId, stake }).then((r) => {
      if (r.ok) {
        setMarks(r.balance);
        setPool((ps) => [...ps, { itemId: it.id, characterId: c.characterId, stake, mine: true, name: "You", className: "", avatarUrl: null, nameStyle: null }]);
        return { ok: true as const, message: `You backed ${c.name.split(" ")[0]} with ${stake.toLocaleString("en-US")} marks` };
      }
      return r;
    }));
  };
  const maxVotes = Math.max(0, ...item.candidates.map((c) => tally(c.characterId)));
  const myVote = item.votes.find((v) => v.voterUserId === me)?.characterId;
  const leader = maxVotes > 0 ? item.candidates.find((c) => tally(c.characterId) === maxVotes) : item.candidates[0];

  const setVotes = (id: number, votes: CouncilItem["votes"]) => setItems((is) => is.map((i) => (i.id === id ? { ...i, votes } : i)));
  const vote = (c: CouncilCandidate) => {
    const prev = item.votes;
    const others = prev.filter((v) => v.voterUserId !== me);
    setVotes(item.id, myVote === c.characterId ? others : [...others, { voterUserId: me, characterId: c.characterId }]);
    run(() => act.castVote({ itemId: item.id, characterId: c.characterId }).then((r) => { if (!r.ok) setVotes(item.id, prev); return r; }));
    if (practice && myVote !== c.characterId) simulate(item.id, c.characterId);
  };
  const award = (c: CouncilCandidate) => {
    if (confirm !== c.characterId) { setConfirm(c.characterId); setTimeout(() => setConfirm((x) => (x === c.characterId ? null : x)), 4000); return; }
    setConfirm(null);
    const it = item;
    mine.current.add(it.id);
    run(() => act.awardItem({ itemId: it.id, characterId: c.characterId }), () => {
      setAwarded((a) => ({ ...a, [it.id]: c.name }));
      const n = it.votes.filter((v) => v.characterId === c.characterId).length;
      setLog((l) => [...l, { id: it.id, name: it.name, quality: it.quality, iconUrl: it.iconUrl, overruled: false, detail: n ? `Council vote (${n} of ${members.length})` : "Council decision",
        winner: { name: c.name, className: c.className, avatarUrl: c.avatarUrl, slug: c.slug } }]);
      strike(it.id, { key: Date.now(), item: it.name, winner: c.name, color: qualityColor(it.quality), icon: it.iconUrl });
    });
  };

  return (
    <main id="main" tabIndex={-1} className={`container page council${practice ? " practice" : ""}`}>
      <ChamberHead practice={practice} onReset={resetPractice} />

      {items.length > 0 && items.every((i) => awarded[i.id]) && (
        practice
          ? <CouncilRecap practice data={{ date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), remaining: 0, items: log }} />
          : (
            <div className="council-adjourned" role="status">
              <span><strong className="gold">Council adjourned.</strong> Every contested item has been awarded.</span>
              <Link href="/loot/council/overview" className="btn btn-primary">View the council overview</Link>
            </div>
          )
      )}
      <div className="council-layout">
        <nav aria-label="Contested items" className="council-items">
          <span className="eyebrow muted" style={{ padding: "0 4px 6px" }}>Before the council</span>
          {items.map((i) => {
            const v = i.votes.length;
            return (
              <button key={i.id} type="button" className="council-item" data-item-id={i.id} aria-pressed={i.id === item.id} onClick={() => { setSel(i.id); setConfirm(null); }}>
                <ItemIcon slot="" quality={i.quality} iconUrl={i.iconUrl} />
                <span className="stack grow" style={{ gap: 0, lineHeight: 1.25, minWidth: 0, textAlign: "left" }}>
                  <span className="strong council-item-name" style={{ color: qualityColor(i.quality) }}>{i.name}</span>
                  <span className="micro muted">{awarded[i.id] ? `Awarded to ${awarded[i.id]}` : `${i.candidates.length} contender${i.candidates.length === 1 ? "" : "s"} · ${v} vote${v === 1 ? "" : "s"}`}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section ref={hall} className="council-hall" aria-labelledby="council-item-name">
          <GavelSlam moment={slam} onDone={() => setSlam(null)} />
          <div className="council-dais">
            <div className="council-pedestal" aria-hidden="true">
              <svg viewBox="0 0 200 200" className="council-ring"><circle cx="100" cy="100" r="92" fill="none" stroke="#FFD100" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 9" /><circle cx="100" cy="100" r="78" fill="none" stroke="#9B5DFF" strokeOpacity=".45" strokeWidth="1.2" /></svg>
              <div className="council-relic" style={{ ["--c" as string]: qualityColor(item.quality) }}>
                <ItemIcon slot="" quality={item.quality} iconUrl={item.iconUrl} size={88} itemId={item.id} />
              </div>
            </div>
            <div className="stack" style={{ gap: 4, alignItems: "center", textAlign: "center" }}>
              <h2 id="council-item-name" style={{ fontSize: 26, color: qualityColor(item.quality) }}>{item.name}</h2>
              <span className="small muted">{item.slot} · {item.boss}{item.raid ? `, ${item.raid}` : ""}</span>
              {awarded[item.id]
                ? <span className="pill">Awarded to {awarded[item.id]}</span>
                : <span className="small soft">{item.votes.length} of {members.length} council vote{members.length === 1 ? "" : "s"} cast</span>}
              {practice && !awarded[item.id] && item.votes.length < members.length && (
                <button type="button" className="btn btn-sm" onClick={() => simulate(item.id)}>Let the council vote</button>
              )}
              {canOverride && !awarded[item.id] && !override && (
                <button type="button" className="btn btn-sm override-btn" onClick={() => setOverride({ characterId: item.candidates[0]?.characterId ?? "", reason: "" })}>⚖ Overrule the council</button>
              )}
            </div>
          </div>

          {override && !awarded[item.id] && (
            <form className="override-panel" onSubmit={(e) => {
              e.preventDefault();
              const it = item, who = roster.find((r) => r.id === override.characterId);
              if (!who) return;
              mine.current.add(it.id);
              run(() => act.overrideAward({ itemId: it.id, characterId: who.id, reason: override.reason }), () => {
                setOverride(null);
                setAwarded((a) => ({ ...a, [it.id]: who.name }));
                const cand = it.candidates.find((x) => x.characterId === who.id);
                setLog((l) => [...l, { id: it.id, name: it.name, quality: it.quality, iconUrl: it.iconUrl, overruled: true, detail: override.reason,
                  winner: { name: who.name, className: who.className, avatarUrl: cand?.avatarUrl ?? null, slug: cand?.slug } }]);
                strike(it.id, { key: Date.now(), item: it.name, winner: who.name, color: qualityColor(it.quality), icon: it.iconUrl, word: "Overruled" });
              });
            }}>
              <div className="row between baseline"><h3>⚖ Admin override</h3><span className="micro muted">Gives the item directly. Recorded in loot history with your reason.</span></div>
              <div className="grid-auto" style={{ ["--min" as string]: "220px", gap: 10 }}>
                <label className="field">Give {item.name} to
                  <select required value={override.characterId} onChange={(e) => setOverride({ ...override, characterId: e.target.value })}>
                    <option value="" disabled>Choose a guild member</option>
                    {item.candidates.length > 0 && (
                      <optgroup label="Contenders">
                        {item.candidates.map((c) => <option key={c.characterId} value={c.characterId}>{c.name} · wishlist #{c.wishRank}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Whole guild">
                      {roster.filter((r) => !item.candidates.some((c) => c.characterId === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.level} {r.className}</option>)}
                    </optgroup>
                  </select>
                </label>
                <label className="field">Reason (required)
                  <input type="text" required minLength={3} maxLength={300} placeholder="e.g. Decided in officer chat; tank priority for Onyxia" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
                </label>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={pending || !override.characterId || override.reason.trim().length < 3}>Overrule and award</button>
                <button type="button" className="btn" onClick={() => setOverride(null)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="council-candidates" role="list" aria-label="Contenders">
            {item.candidates.map((c) => {
              const t = tally(c.characterId);
              const voters = item.votes.filter((v) => v.characterId === c.characterId).map((v) => memberById.get(v.voterUserId)).filter(Boolean) as CouncilMember[];
              const isLeader = !awarded[item.id] && leader?.characterId === c.characterId && (maxVotes > 0);
              const majority = !awarded[item.id] && members.length > 0 && t > members.length / 2;
              const color = classColor(c.className);
              return (
                <article key={c.characterId} role="listitem" className={`contender${isLeader ? " leading" : ""}${myVote === c.characterId ? " my-vote" : ""}`} style={{ ["--cls" as string]: color }}>
                  {isLeader && <span className="contender-crown" aria-label="Council favourite">♛ Council favourite</span>}
                  {majority && <span className="majority-seal" aria-label="Majority reached: ready to award">Majority<br />reached</span>}
                  <Link href={`/characters/${c.slug}`} className="contender-figure" aria-label={`${c.name}'s character page`}>
                    {c.renderUrl ? <img src={c.renderUrl} alt="" loading="lazy" /> : <span className="contender-initial" style={{ color }}>{c.name.charAt(0)}</span>}
                  </Link>
                  <div className="contender-body">
                    <span className="strong contender-name" style={{ color }}>{c.name}</span>
                    <span className="micro muted">{[c.spec, c.className].filter(Boolean).join(" ")}{c.level ? ` · ${c.level}` : ""}</span>
                    <dl className="contender-stats">
                      <div><dt>Wishlist</dt><dd>#{c.wishRank}</dd></div>
                      <div><dt>Attend.</dt><dd>{c.attendance != null ? `${Math.round(c.attendance)}%` : "—"}</dd></div>
                      <div><dt>Won</dt><dd>{c.won}</dd></div>
                    </dl>
                    <div className="contender-votes" aria-label={`${t} vote${t === 1 ? "" : "s"}`}>
                      <span className="contender-tally">{t}</span>
                      <span className="row" style={{ gap: 4 }}>
                        {voters.map((m) => <span key={m.userId} title={`${m.name} (${m.role})`}><Avatar name={m.name} className={m.className} size={24} url={m.avatarUrl} /></span>)}
                        {t === 0 && <span className="micro muted">No votes yet</span>}
                      </span>
                    </div>
                    {showPool && (() => {
                      const backers = itemPool.filter((p) => p.characterId === c.characterId);
                      const onC = backers.reduce((a, p) => a + p.stake, 0);
                      return (
                        <div className="pool-line">
                          <span className="micro">
                            <span className="mark-coin sm" aria-hidden="true" /> {onC.toLocaleString("en-US")}
                            <span className="muted"> · {onC ? `pays ${(pot / onC).toFixed(2)}× if picked` : "no backers yet"}</span>
                          </span>
                          {backers.length > 0 && <span className="row" style={{ gap: 3 }}>{backers.slice(0, 6).map((b, i) => <span key={i} title={`${b.name}: ${b.stake}`}><Avatar name={b.name} className={b.className} size={20} url={b.avatarUrl} /></span>)}</span>}
                          {canObserve && !awarded[item.id] && !myPick && (
                            <button type="button" className="btn btn-sm" disabled={pending || marks < stake} onClick={() => back(c)}>Back · {stake.toLocaleString("en-US")}</button>
                          )}
                          {myPick?.characterId === c.characterId && <span className="pool-mine">★ Your pick</span>}
                        </div>
                      );
                    })()}
                    {canVote && !awarded[item.id] && (
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-sm grow" aria-pressed={myVote === c.characterId} disabled={pending} onClick={() => vote(c)}>
                          {myVote === c.characterId ? "✓ Your vote" : "Vote"}
                        </button>
                        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => award(c)}>
                          {confirm === c.characterId ? "Confirm" : "Award"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {showPool && (
        <section className="panel observer-pool" aria-label="Observer pool">
          <div className="row between baseline" style={{ gap: 10 }}>
            <h3>Observer pool</h3>
            <span className="small"><span className="mark-coin sm" aria-hidden="true" /> <strong className="gold">{pot.toLocaleString("en-US")}</strong> in the pot · {itemPool.length} observer{itemPool.length === 1 ? "" : "s"}</span>
          </div>
          <p className="small soft" style={{ margin: 0 }}>
            Not on the council? Back the contender you think they&apos;ll pick. When the gavel falls, everyone who called it splits the whole pot by stake.
            If nobody called it, or the item is overruled to someone else, every stake comes back.
          </p>
          {canObserve && !awarded[item.id] && (myPick
            ? <span className="small">You backed <strong>{item.candidates.find((c) => c.characterId === myPick.characterId)?.name ?? "a contender"}</strong> with {myPick.stake.toLocaleString("en-US")} marks.</span>
            : (
              <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
                <label className="field" style={{ maxWidth: 200 }}>Your stake
                  <input type="number" min={10} max={5000} step={10} value={stake} onChange={(e) => setStake(Math.max(10, Math.min(5000, Math.floor(Number(e.target.value)) || 10)))} />
                </label>
                <span className="small muted">You have <span className="mark-coin sm" aria-hidden="true" /> {marks.toLocaleString("en-US")} · <Link href="/arcade">get more in the arcade</Link></span>
              </div>
            ))}
          {itemPool.length > 0 && (
            <ul className="observer-list">
              {itemPool.map((p, i) => {
                const c = item.candidates.find((x) => x.characterId === p.characterId);
                return <li key={i}><PlayerName name={p.name} className={p.className} nameStyle={p.nameStyle} showTitle={false} /> <span className="muted">backed</span> {c?.name.split(" ")[0] ?? "?"} <span className="gold">{p.stake.toLocaleString("en-US")}</span></li>;
              })}
            </ul>
          )}
        </section>
      )}

      <section className="council-bench panel" aria-label="Council members">
        <div className="row between baseline">
          <h3>The council</h3>
          <span className="src">{practice ? "Practice council: you plus four simulated officers drawn from the roster. Vote and they follow." : canVote ? "You sit on the council. Click a contender to vote; click again to withdraw." : "Votes are visible to the whole guild."}</span>
        </div>
        <div className="row" style={{ gap: 14 }}>
          {members.length === 0 && <span className="small muted">No council members yet. Officers and Loot Masters sit on the council.</span>}
          {members.map((m) => {
            const v = item.votes.find((x) => x.voterUserId === m.userId);
            const forC = v ? item.candidates.find((c) => c.characterId === v.characterId) : null;
            return (
              <div key={m.userId} className={`bench-seat${v ? " voted" : ""}`}>
                <Avatar name={m.name} className={m.className} size={44} url={m.avatarUrl} />
                <span className="stack" style={{ gap: 0, lineHeight: 1.25 }}>
                  <span className="small strong" style={{ color: classColor(m.className) }}>{m.name.split(" ")[0]}</span>
                  <span className="micro muted">{m.role}</span>
                  <span className="micro" style={{ color: v ? "#4CD964" : "var(--dw-text-muted)" }}>{forC ? `Voted ${forC.name.split(" ")[0]}` : "Deliberating…"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <Toast toast={toast} />
    </main>
  );
}

function ChamberHead({ practice, onReset }: { practice?: boolean; onReset?: () => void }) {
  if (practice) {
    return (
      <section className="panel-royal page-head practice-head">
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Practice chamber · nothing is saved</span>
          <h1>Practice council</h1>
          <p className="soft" style={{ fontSize: 16 }}>Real guild members and raid loot, a pretend session. Vote, watch the simulated officers weigh in, award or overrule, and see the gavel fall. No loot history, no Discord posts.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onReset && <button type="button" className="btn" onClick={onReset}>Reset session</button>}
          <Link href="/loot/council" className="btn">Real council</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Wishlist priority · council review</span>
        <h1>Loot council</h1>
        <p className="soft" style={{ fontSize: 16 }}>Contenders stand before the council. Officers vote, the favourite glows, and the award goes straight into loot history.</p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Link href="/loot/council/overview" className="btn">Council overview</Link>
        <Link href="/loot/council/practice" className="btn">Practice council</Link>
        <Link href="/loot" className="btn">Back to loot hub</Link>
      </div>
    </section>
  );
}
