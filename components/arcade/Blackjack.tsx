"use client";
// Blackjack at the tavern table. The server deals and settles; the client stages what it sends back:
// cards slide out of the shoe 150ms apart and flip mid-slide, the dealer's hole card turns over at the
// reveal, extra dealer cards follow one by one, then a result stamp springs in and celebrate() fires.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { blackjackAct, blackjackDeal } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { PlayingCard } from "./PlayingCard";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play } from "./sfx";

type Card = { r: number; s: number };
type Round = { id: string; bet: number; status: string; outcome?: string; doubled: boolean; player: Card[]; playerValue: number; dealer: Card[]; dealerValue: number; hidden: boolean; payout: number };
type Slot = { k: string; c: Card | null; dbl?: boolean }; // c null = face down
type Verdict = { kind: "bj" | "win" | "push" | "lose" | "bust"; title: string; sub: string };

const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const handValue = (h: Card[]) => {
  let t = 0, a = 0;
  for (const c of h) { t += c.r === 1 ? 11 : Math.min(10, c.r); if (c.r === 1) a++; }
  while (t > 21 && a) { t -= 10; a--; }
  return t;
};
const stakeOf = (r: Round) => (r.doubled ? r.bet * 2 : r.bet);
function verdictOf(r: Round): Verdict {
  const o = r.outcome ?? "";
  if (o === "Blackjack!") return { kind: "bj", title: "Blackjack", sub: "Pays 3 to 2" };
  if (o.startsWith("Push")) return { kind: "push", title: "Push", sub: o.includes("both") ? "Both blackjack" : "Bet returned" };
  if (o === "Bust") return { kind: "bust", title: "Bust", sub: "Over 21" };
  if (o === "Dealer busts") return { kind: "win", title: "Win", sub: "Dealer busts" };
  if (o === "You win") return { kind: "win", title: "Win", sub: "You beat the dealer" };
  if (o === "Dealer blackjack") return { kind: "lose", title: "Lose", sub: "Dealer blackjack" };
  return { kind: "lose", title: "Lose", sub: o || "Dealer wins" };
}

/** One card on the felt: slides out of the shoe on mount, flips face up (mid-slide, or later for the hole card). */
function TableCard({ slot, i, shoe }: { slot: Slot; i: number; shoe: React.RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);
  const flip = useRef<HTMLDivElement>(null);
  const upAtMount = useRef(!!slot.c);
  useLayoutEffect(() => {
    const e = el.current, s = shoe.current;
    if (!e || !s || reduced()) return;
    const a = e.getBoundingClientRect(), b = s.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    e.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(.82)`, opacity: 0.2 }, { transform: "none", opacity: 1 }],
      { duration: 360, easing: "cubic-bezier(.15,.8,.25,1)" });
    if (upAtMount.current) flip.current?.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: 0.4 }, { transform: "rotateY(0deg)" }],
      { duration: 360, easing: "cubic-bezier(.3,.7,.4,1)" });
  }, [shoe]);
  return (
    <div ref={el} className={`bj-card${slot.c ? " up" : ""}${slot.dbl ? " dbl" : ""}`} style={{ ["--i" as string]: i }}>
      <div className="bj-tilt">
        <div ref={flip} className="bj-flip">
          <div className="bj-face bj-front">{slot.c && <PlayingCard rank={slot.c.r} suit={slot.c.s} small />}</div>
          <div className="bj-face bj-back"><PlayingCard rank={1} back small /></div>
        </div>
      </div>
    </div>
  );
}

export function Blackjack() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState<Round | null>(null);
  const [pHand, setPHand] = useState<Slot[]>([]);
  const [dHand, setDHand] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [anim, setAnim] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [shake, setShake] = useState(false);
  const [settled, setSettled] = useState<{ r: Round; v: Verdict } | null>(null);
  const [last, setLast] = useState<{ net: number } | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const shoe = useRef<HTMLDivElement>(null);
  const shown = useRef({ id: "", p: 0, d: 0, hole: true });
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const active = round?.status === "active";
  const locked = busy || anim;

  /** Stage a server response: deal what's new, flip the hole card, draw the dealer's extra cards, settle. */
  const stage = (res: { round: Round; balance: number; won?: number }) => {
    const r = res.round, k = reduced() ? 0 : 1, sh = shown.current;
    let t = 0;
    const step = (ms: number, f: () => void) => { t += ms * k; timers.current.push(window.setTimeout(f, t)); };
    setRound(r); setAnim(true);
    const dealP = (i: number) => () => { setPHand((h) => [...h, { k: `p${i}`, c: r.player[i], dbl: r.doubled && i === 2 }]); play("deal", { pitch: 1 + i * 0.04 }); };
    let first = true;
    if (sh.id !== r.id) {
      shown.current = { id: r.id, p: 2, d: 2, hole: false };
      step(0, dealP(0));
      step(150, () => { setDHand([{ k: "d0", c: r.dealer[0] }]); play("deal"); });
      step(150, dealP(1));
      step(150, () => { setDHand((h) => [...h, { k: "d1", c: null }]); play("deal", { pitch: 0.92 }); });
      first = false;
    }
    for (let i = shown.current.p; i < r.player.length; i++) { step(first ? 0 : 150, dealP(i)); first = false; }
    shown.current.p = r.player.length;
    if (r.status === "active") { step(380, () => { setAnim(false); setBalance(res.balance); }); return; }
    const v = verdictOf(r);
    if (v.kind === "bust") step(380, () => { setShake(true); play("thud"); buzz("fail"); });
    if (!shown.current.hole) {
      shown.current.hole = true;
      step(first ? 120 : 520, () => { setDHand((h) => h.map((s) => (s.k === "d1" ? { ...s, c: r.dealer[1] } : s))); play("flip"); });
    }
    for (let i = shown.current.d; i < r.dealer.length; i++) {
      step(i === shown.current.d ? 600 : 520, () => { setDHand((h) => [...h, { k: `d${i}`, c: r.dealer[i] }]); play("deal"); });
    }
    shown.current.d = r.dealer.length;
    step(480, () => {
      const won = res.won ?? r.payout ?? 0, stake = stakeOf(r);
      setAnim(false); setSettled({ r, v }); setBalance(res.balance); setLast({ net: won - stake });
      if (won) flash(won);
      play(v.kind === "bj" ? "chip" : v.kind === "push" ? "stop" : v.kind === "win" ? "chip" : "thud");
      celebrate({ mult: won / stake, won, label: v.kind === "bj" ? "Blackjack!" : undefined });
      const label = v.kind === "bj" ? "BJ" : v.kind === "win" ? `+${fmt(won - stake)}` : v.kind === "push" ? "Push" : v.kind === "bust" ? "Bust" : `−${fmt(stake)}`;
      setChips((c) => [{ k: r.id, label, tone: (v.kind === "bj" ? "big" : v.kind === "win" ? "win" : v.kind === "push" ? "neutral" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    });
  };

  const deal = async () => {
    if (locked) return;
    setBusy(true); setErr(null); setShake(false);
    play("chip");
    const hadCards = pHand.length > 0;
    if (hadCards && !reduced()) setSweep(true);
    const [r] = await Promise.all([blackjackDeal({ bet }), new Promise((ok) => setTimeout(ok, hadCards && !reduced() ? 280 : 0))]);
    setBusy(false); setSweep(false);
    if (!r.ok) { play("error"); return setErr(r.error); }
    setSettled(null); setPHand([]); setDHand([]); shown.current = { id: "", p: 0, d: 0, hole: true };
    stage(r);
  };
  const act = async (action: "hit" | "stand" | "double") => {
    if (!round || locked) return;
    setBusy(true); setErr(null);
    play(action === "stand" ? "thud" : "click");
    const r = await blackjackAct({ id: round.id, action });
    setBusy(false);
    if (!r.ok) { play("error"); return setErr(r.error); }
    stage(r);
  };

  // keyboard: H hit, S stand, D double, Enter/Space on the focused button as usual
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!active || locked || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "h") act("hit"); else if (k === "s") act("stand"); else if (k === "d" && round?.player.length === 2) act("double");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const pCards = pHand.filter((s) => s.c).map((s) => s.c!);
  const dCards = dHand.filter((s) => s.c).map((s) => s.c!);
  const pv = pCards.length ? handValue(pCards) : null, dv = dCards.length ? handValue(dCards) : null;
  const holeDown = dHand.some((s) => !s.c);
  const stake = round ? stakeOf(round) : bet;
  const verdict = settled?.v;
  const empty = !pHand.length && !dHand.length;
  const prompt = empty ? (signedIn ? "Place your bet and deal" : "Sign in to take a seat") : active && !anim ? "Hit, stand or double?" : "";
  const badge = (v: number | null, n: number, extra = "") => v == null ? null : (
    <span key={`${v}-${n}`} className={`bj-badge${v > 21 ? " over" : v === 21 ? " tw" : ""}${extra}`} aria-label={`Total ${v}`}>{v}</span>
  );

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="felt" label="Blackjack" className="bj-machine" hud={<>
          <Readout label="Stake" tone="gold">{fmt(stake)}{round?.doubled ? " ×2" : ""}</Readout>
          <Readout label="Last hand" tone={last ? (last.net > 0 ? "win" : last.net < 0 ? "lose" : undefined) : undefined}>
            {last ? <>{last.net > 0 ? "+" : last.net < 0 ? "−" : "±"}<CountUp value={Math.abs(last.net)} /></> : "—"}
          </Readout>
          <ResultStrip items={chips} label="Recent hands" />
        </>}>
          <div className={`bj-felt${sweep ? " sweep" : ""}${verdict ? ` done v-${verdict.kind}` : ""}`}>
            <div ref={shoe} className="bj-shoe" aria-hidden="true"><span /><span /><span /><i /></div>
            <div className="bj-tray" aria-hidden="true" />

            <section className="bj-zone dealer" aria-label="Dealer's hand">
              <div className="bj-plate"><span>Dealer</span>{badge(dv, dCards.length)}{holeDown && dv != null && <span className="bj-q">+ ?</span>}</div>
              <div className="bj-cards">
                {empty ? <><span className="bj-spot" /><span className="bj-spot" /></> : dHand.map((s, i) => <TableCard key={s.k} slot={s} i={i} shoe={shoe} />)}
              </div>
            </section>

            <div className="bj-mid">
              <svg className="bj-arc" viewBox="0 0 600 120" aria-hidden="true">
                <defs><path id="bj-arcpath" d="M40 20 Q300 120 560 20" /></defs>
                <path d="M30 30 Q300 140 570 30" className="bj-arc-line" />
                <text><textPath href="#bj-arcpath" startOffset="50%" textAnchor="middle">Blackjack pays 3 to 2</textPath></text>
              </svg>
              <p className="bj-rule" aria-hidden="true">Dealer must stand on 17</p>
              {verdict && settled && (
                <div key={settled.r.id} className={`bj-stamp ${verdict.kind}`} role="status">
                  <strong>{verdict.title}</strong>
                  <span>{verdict.sub}{settled.r.payout ? ` · +${fmt(settled.r.payout)}` : ""}</span>
                </div>
              )}
              <div className={`bj-prompt${prompt && !verdict ? "" : " off"}`} aria-live="polite">{verdict ? "" : prompt}</div>
            </div>

            <section className={`bj-zone player${shake ? " shake" : ""}`} aria-label="Your hand">
              <div className="bj-cards">
                {empty ? <><span className="bj-spot" /><span className="bj-spot" /></> : pHand.map((s, i) => <TableCard key={s.k} slot={s} i={i} shoe={shoe} />)}
              </div>
              <div className="bj-plate">
                <span className="bj-circle" aria-label={`Bet ${fmt(stake)}`}><i /><i /><i />{round?.doubled && <><i /><i /></>}<b>{fmt(stake)}</b></span>
                <span>You</span>{badge(pv, pCards.length)}{round?.doubled && <span className="bj-tag">Doubled</span>}
              </div>
            </section>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        {active ? (
          <div className="bj-actions">
            <button type="button" className="btn btn-lg bj-act" disabled={locked} onClick={() => act("hit")}>Hit<kbd>H</kbd></button>
            <button type="button" className="btn btn-primary btn-lg bj-act" disabled={locked} onClick={() => act("stand")}>Stand<kbd>S</kbd></button>
            <button type="button" className="btn btn-lg bj-act" disabled={locked || round.player.length !== 2} onClick={() => act("double")}>Double<kbd>D</kbd></button>
          </div>
        ) : (
          <>
            <BetInput value={bet} onChange={setBet} disabled={locked} />
            <button type="button" className="btn btn-primary btn-lg" onClick={deal} disabled={!signedIn || locked}>{busy ? "Shuffling…" : anim ? "Dealing…" : "Deal"}</button>
          </>
        )}
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Dealer stands on 17. Blackjack pays 3 to 2. Double on your first two cards. Keys: H hit, S stand, D double.</p>
      </div>
    </div>
  );
}
