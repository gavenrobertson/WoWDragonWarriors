"use client";
// Higher or Lower. Each new card slides off the deck and flips; a correct call stamps a gold ring on it and
// raises the pitch ladder, a wrong one dims it. The trail of past cards (with the call made on each) slides
// along the top, and a rank scale shows how the odds split around the current card.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hiloCashout, hiloGuess, hiloStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { PlayingCard as Card, rankLabel } from "./PlayingCard";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

type Round = { id: string; bet: number; status: string; card: number; mult: number; history: number[]; odds: { higher: number; lower: number } };
type Call = "higher" | "lower" | "skip";
type Past = { k: number; rank: number; flip: number; call?: Call; ok?: boolean };
type Fx = "good" | "lost" | "cashed" | "skip" | null;

const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtX = (n: number) => `${n.toFixed(2)}×`;
const CALL_MARK: Record<Call, string> = { higher: "▲", lower: "▼", skip: "↷" };

/** The big current card: slides from the deck and flips face up mid-slide. */
function BigCard({ rank, flip, deck }: { rank: number; flip: number; deck: React.RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const e = el.current, d = deck.current;
    if (!e || !d || reduced()) return;
    const a = e.getBoundingClientRect(), b = d.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const s = Math.min(1, b.width / a.width);
    e.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(${Math.max(0.5, s * 0.95)})`, opacity: 0.2 }, { transform: "none", opacity: 1 }],
      { duration: 360, easing: "cubic-bezier(.15,.8,.25,1)" });
    inner.current?.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: 0.4 }, { transform: "rotateY(0deg)" }],
      { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" });
  }, [deck]);
  return (
    <div ref={el} className="hl2-big">
      <div ref={inner} className="hl2-flip">
        <div className="hl2-face"><Card rank={rank} flip={flip} /></div>
        <div className="hl2-face hl2-back"><div className="hl-card back" aria-hidden="true" /></div>
      </div>
    </div>
  );
}

export function HiLo() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState<Round | null>(null);
  const [n, setN] = useState(0);
  const [trail, setTrail] = useState<Past[]>([]);
  const [streak, setStreak] = useState(0);
  const [fx, setFx] = useState<Fx>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const deck = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, reduced() ? 0 : ms)); };

  const active = round?.status === "active";
  const next = (p: number) => (round ? Math.floor(round.mult * (0.97 / p) * 100) / 100 : 0);
  const skipsLeft = Math.max(0, 3 - trail.filter((t) => t.call === "skip").length);

  const start = async () => {
    if (busy) return;
    setBusy(true); setMsg(null); play("chip");
    const r = await hiloStart({ bet });
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); setBalance(r.balance); setFx(null); setStreak(0);
    setTrail(r.round.history.map((rank, i) => ({ k: -i - 1, rank, flip: i })));
    setN((x) => x + 1); play("deal");
    if (r.resumed) setMsg({ text: "Picked up your unfinished round." });
    later(380, () => { play("flip"); setBusy(false); });
  };

  const guess = async (g: Call) => {
    if (!round || !active || busy) return;
    if (g === "higher" && round.card === 1) return;
    if (g === "lower" && round.card === 13) return;
    setBusy(true); setMsg(null); setFx(null); play("click");
    const r = await hiloGuess({ id: round.id, guess: g });
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    const prev = round, k = n;
    setTrail((t) => [...t, { k, rank: prev.card, flip: k, call: g, ok: r.win }].slice(-14));
    setRound(r.round); setN(k + 1); play("deal");
    later(360, () => {
      setBusy(false); setBalance(r.balance);
      if (g === "skip") { setFx("skip"); play("flip"); return; }
      if (r.win) {
        setFx("good"); setStreak((s) => s + 1);
        play("gem", { pitch: ladder(streak) }); buzz("tap");
        return;
      }
      setFx("lost");
      setMsg({ text: `It was ${rankLabel(r.next)}. Lost ${fmt(prev.bet)}.` });
      celebrate({ mult: 0, won: 0 });
      setChips((c) => [{ k: prev.id, label: streak ? `✕ ${streak}` : "✕", tone: "lose" as const }, ...c].slice(0, 14));
    });
  };

  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await hiloCashout({ id: round.id });
    setBusy(false);
    if (!r.ok) { play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); setBalance(r.balance); flash(r.won); setFx("cashed");
    play("cashout");
    setMsg({ text: `Cashed out ${fmtX(r.round.mult)} for ${fmt(r.won)}`, good: true });
    celebrate({ mult: r.won / round.bet, won: r.won });
    setChips((c) => [{ k: round.id, label: fmtX(r.round.mult), tone: (r.round.mult >= 5 ? "big" : "win") as Chip["tone"] }, ...c].slice(0, 14));
  };

  // keyboard: ↑ higher, ↓ lower (Enter/Space on the focused button as usual)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!active || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowUp") { e.preventDefault(); guess("higher"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); guess("lower"); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const cur = round?.card ?? 0;
  const pHi = round?.odds.higher ?? 0, pLo = round?.odds.lower ?? 0;
  const canHi = active && cur !== 1, canLo = active && cur !== 13;
  const cashValue = round ? Math.floor(round.bet * round.mult) : 0;

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="arcane" label="Higher or Lower" className="hl2-machine" hud={<>
          <Readout label="Multiplier" tone={round?.status === "lost" ? "lose" : "gold"}><CountUp value={round?.mult ?? 1} format={fmtX} duration={500} /></Readout>
          <Readout label="Streak">{streak}</Readout>
          <Readout label="Cash out" tone={active && round.mult > 1 ? "win" : undefined}>{active && round.mult > 1 ? <CountUp value={cashValue} /> : "—"}</Readout>
          <ResultStrip items={chips} label="Recent rounds" />
        </>}>
          <div className={`hl2${fx ? ` fx-${fx}` : ""}${round ? "" : " idle"}`}>
            <div className="hl2-trail" aria-label="Previous cards">
              {trail.map((t) => (
                <div key={t.k} className={`hl2-past${t.call ? ` c-${t.call}` : ""}${t.ok === false ? " bad" : ""}`}>
                  <Card rank={t.rank} flip={t.flip} small />
                  {t.call && <span className="hl2-call" aria-label={`${t.call}${t.call !== "skip" ? (t.ok ? ", correct" : ", wrong") : ""}`}>{CALL_MARK[t.call]}</span>}
                </div>
              ))}
              {!trail.length && <span className="hl2-trail-hint">{round ? "Call the next card" : "Ace is low, King is high"}</span>}
            </div>

            <div className="hl2-table">
              <div ref={deck} className="hl2-deck" aria-hidden="true"><span /><span /><span /></div>
              <div className="hl2-spot">
                {round ? <BigCard key={n} rank={cur} flip={n} deck={deck} /> : <div className="hl2-big ghost"><div className="hl-card back" aria-label="Deck" /></div>}
                {fx === "good" && <span key={`r${n}`} className="hl2-ring" aria-hidden="true" />}
                {fx === "good" && <span key={`s${n}`} className="hl2-stamp ok">✓ {fmtX(round?.mult ?? 1)}</span>}
                {fx === "lost" && <span className="hl2-stamp bad">✕</span>}
                {fx === "cashed" && <span className="hl2-stamp cash">Cashed out</span>}
              </div>
              <div className={`hl2-scale${active ? "" : " off"}`} aria-hidden="true">
                <div className={`hl2-odd up${canHi ? "" : " na"}`}><b>▲ {canHi ? `${Math.round(pHi * 100)}%` : "—"}</b><span>{canHi ? fmtX(next(pHi)) : ""}</span></div>
                <div className="hl2-rungs">
                  {Array.from({ length: 13 }, (_, i) => 13 - i).map((r) => <i key={r} className={r > cur ? "hi" : r < cur ? "lo" : "cur"}>{rankLabel(r)}</i>)}
                </div>
                <div className={`hl2-odd down${canLo ? "" : " na"}`}><b>▼ {canLo ? `${Math.round(pLo * 100)}%` : "—"}</b><span>{canLo ? fmtX(next(pLo)) : ""}</span></div>
              </div>
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active || busy} />
        {active ? (
          <div className="hl2-calls">
            <button type="button" className="btn btn-lg hl2-btn up" disabled={busy || !canHi} onClick={() => guess("higher")}>
              <span className="hl2-btn-l">▲ Higher or same</span><span className="hl2-btn-s">{canHi ? `${Math.round(pHi * 100)}% · ${fmtX(next(pHi))}` : "Every card is an Ace or higher"}</span>
            </button>
            <button type="button" className="btn btn-lg hl2-btn down" disabled={busy || !canLo} onClick={() => guess("lower")}>
              <span className="hl2-btn-l">▼ Lower or same</span><span className="hl2-btn-s">{canLo ? `${Math.round(pLo * 100)}% · ${fmtX(next(pLo))}` : "Every card is a King or lower"}</span>
            </button>
            <div className="hl2-row">
              <button type="button" className="btn btn-ghost" disabled={busy || skipsLeft === 0} onClick={() => guess("skip")}>Skip ({skipsLeft})</button>
              <button type="button" className="btn btn-primary grow" disabled={busy || round.mult <= 1} onClick={cashout}>Cash out {fmt(cashValue)}</button>
            </div>
          </div>
        ) : <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Deal</button>}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <p className="micro muted">Ace is low, King is high. Up to 3 skips per round. Keys: ↑ higher, ↓ lower.</p>
      </div>
    </div>
  );
}
