"use client";
// Loot council chamber: the item on a pedestal, candidates standing as their Blizzard renders,
// council members' votes as portraits on each candidate, and an award button.
import Link from "next/link";
import { useMemo, useState } from "react";
import { awardItem, castVote } from "@/app/actions";
import { Avatar, ItemIcon } from "@/components/bits";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { CouncilMember } from "@/lib/store";
import { classColor, qualityColor } from "@/lib/ui";

export interface CouncilCandidate {
  characterId: string; slug: string; name: string; className: string; spec: string; race: string; level: number;
  renderUrl: string | null; avatarUrl: string | null; wishRank: number; approved: boolean; attendance: number | null; won: number;
}
export interface CouncilItem {
  id: number; name: string; quality: string; iconUrl: string | null; slot: string; boss: string; raid: string;
  candidates: CouncilCandidate[]; votes: { voterUserId: string; characterId: string }[];
}

export function CouncilChamber({ items: initial, members, me, canVote }: { items: CouncilItem[]; members: CouncilMember[]; me: string; canVote: boolean }) {
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id ?? 0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [awarded, setAwarded] = useState<Record<number, string>>({});
  const { pending, run, toast } = useAction();
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);

  const item = items.find((i) => i.id === sel) ?? items[0];
  if (!item) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <ChamberHead />
        <div className="empty">No contested loot right now. Items appear here once raiders put them on their wishlists.</div>
      </main>
    );
  }

  const tally = (cid: string) => item.votes.filter((v) => v.characterId === cid).length;
  const maxVotes = Math.max(0, ...item.candidates.map((c) => tally(c.characterId)));
  const myVote = item.votes.find((v) => v.voterUserId === me)?.characterId;
  const leader = maxVotes > 0 ? item.candidates.find((c) => tally(c.characterId) === maxVotes) : item.candidates[0];

  const setVotes = (id: number, votes: CouncilItem["votes"]) => setItems((is) => is.map((i) => (i.id === id ? { ...i, votes } : i)));
  const vote = (c: CouncilCandidate) => {
    const prev = item.votes;
    const others = prev.filter((v) => v.voterUserId !== me);
    setVotes(item.id, myVote === c.characterId ? others : [...others, { voterUserId: me, characterId: c.characterId }]);
    run(() => castVote({ itemId: item.id, characterId: c.characterId }).then((r) => { if (!r.ok) setVotes(item.id, prev); return r; }));
  };
  const award = (c: CouncilCandidate) => {
    if (confirm !== c.characterId) { setConfirm(c.characterId); setTimeout(() => setConfirm((x) => (x === c.characterId ? null : x)), 4000); return; }
    setConfirm(null);
    run(() => awardItem({ itemId: item.id, characterId: c.characterId }), () => setAwarded((a) => ({ ...a, [item.id]: c.name })));
  };

  return (
    <main id="main" tabIndex={-1} className="container page council">
      <ChamberHead />

      <div className="council-layout">
        <nav aria-label="Contested items" className="council-items">
          <span className="eyebrow muted" style={{ padding: "0 4px 6px" }}>Before the council</span>
          {items.map((i) => {
            const v = i.votes.length;
            return (
              <button key={i.id} type="button" className="council-item" aria-pressed={i.id === item.id} onClick={() => { setSel(i.id); setConfirm(null); }}>
                <ItemIcon slot="" quality={i.quality} iconUrl={i.iconUrl} />
                <span className="stack grow" style={{ gap: 0, lineHeight: 1.25, minWidth: 0, textAlign: "left" }}>
                  <span className="strong council-item-name" style={{ color: qualityColor(i.quality) }}>{i.name}</span>
                  <span className="micro muted">{awarded[i.id] ? `Awarded to ${awarded[i.id]}` : `${i.candidates.length} contender${i.candidates.length === 1 ? "" : "s"} · ${v} vote${v === 1 ? "" : "s"}`}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="council-hall" aria-labelledby="council-item-name">
          <div className="council-dais">
            <div className="council-pedestal" aria-hidden="true">
              <svg viewBox="0 0 200 200" className="council-ring"><circle cx="100" cy="100" r="92" fill="none" stroke="#FFD100" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 9" /><circle cx="100" cy="100" r="78" fill="none" stroke="#9B5DFF" strokeOpacity=".45" strokeWidth="1.2" /></svg>
              <div className="council-relic" style={{ ["--c" as string]: qualityColor(item.quality) }}>
                <ItemIcon slot="" quality={item.quality} iconUrl={item.iconUrl} size={88} />
              </div>
            </div>
            <div className="stack" style={{ gap: 4, alignItems: "center", textAlign: "center" }}>
              <h2 id="council-item-name" style={{ fontSize: 26, color: qualityColor(item.quality) }}>{item.name}</h2>
              <span className="small muted">{item.slot} · {item.boss}{item.raid ? `, ${item.raid}` : ""}</span>
              {awarded[item.id]
                ? <span className="pill">Awarded to {awarded[item.id]}</span>
                : <span className="small soft">{item.votes.length} of {members.length} council vote{members.length === 1 ? "" : "s"} cast</span>}
            </div>
          </div>

          <div className="council-candidates" role="list" aria-label="Contenders">
            {item.candidates.map((c) => {
              const t = tally(c.characterId);
              const voters = item.votes.filter((v) => v.characterId === c.characterId).map((v) => memberById.get(v.voterUserId)).filter(Boolean) as CouncilMember[];
              const isLeader = !awarded[item.id] && leader?.characterId === c.characterId && (maxVotes > 0);
              const color = classColor(c.className);
              return (
                <article key={c.characterId} role="listitem" className={`contender${isLeader ? " leading" : ""}${myVote === c.characterId ? " my-vote" : ""}`} style={{ ["--cls" as string]: color }}>
                  {isLeader && <span className="contender-crown" aria-label="Council favourite">♛ Council favourite</span>}
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

      <section className="council-bench panel" aria-label="Council members">
        <div className="row between baseline">
          <h3>The council</h3>
          <span className="src">{canVote ? "You sit on the council. Click a contender to vote; click again to withdraw." : "Votes are visible to the whole guild."}</span>
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

function ChamberHead() {
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Wishlist priority · council review</span>
        <h1>Loot council</h1>
        <p className="soft" style={{ fontSize: 16 }}>Contenders stand before the council. Officers vote, the favourite glows, and the award goes straight into loot history.</p>
      </div>
      <div className="row"><Link href="/loot" className="btn">Back to loot hub</Link></div>
    </section>
  );
}
