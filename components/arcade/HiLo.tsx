"use client";
import { useState } from "react";
import { hiloCashout, hiloGuess, hiloStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";

import { PlayingCard as Card, rankLabel } from "./PlayingCard";
type Round = { id: string; bet: number; status: string; card: number; mult: number; history: number[]; odds: { higher: number; lower: number } };

export function HiLo() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState<Round | null>(null);
  const [flip, setFlip] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const active = round?.status === "active";
  const next = (p: number) => (round ? Math.floor(round.mult * (0.97 / p) * 100) / 100 : 0);

  const start = async () => {
    setBusy(true); setMsg(null);
    const r = await hiloStart({ bet });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance); setFlip((f) => f + 1);
  };
  const guess = async (g: "higher" | "lower" | "skip") => {
    if (!round || busy) return;
    setBusy(true);
    const r = await hiloGuess({ id: round.id, guess: g });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance); setFlip((f) => f + 1);
    setMsg(g === "skip" ? null : r.win ? { text: `Correct! Now ${r.round.mult}×`, good: true } : { text: `It was ${rankLabel(r.next)}. Lost ${fmt(round.bet)}.` });
  };
  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await hiloCashout({ id: round.id });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance); flash(r.won);
    setMsg({ text: `Cashed out ${r.round.mult}× for ${fmt(r.won)}`, good: true });
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active} />
        {active ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn grow" disabled={busy || round.card === 1} onClick={() => guess("higher")}>▲ Higher or same<br /><span className="micro">{Math.round(round.odds.higher * 100)}% · {next(round.odds.higher)}×</span></button>
              <button type="button" className="btn grow" disabled={busy || round.card === 13} onClick={() => guess("lower")}>▼ Lower or same<br /><span className="micro">{Math.round(round.odds.lower * 100)}% · {next(round.odds.lower)}×</span></button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => guess("skip")}>Skip card</button>
              <button type="button" className="btn btn-primary grow" disabled={busy || round.mult <= 1} onClick={cashout}>Cash out {fmt(Math.floor(round.bet * round.mult))}</button>
            </div>
          </>
        ) : <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Deal</button>}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <p className="micro muted">Ace is low, King is high. Up to 3 skips per round.</p>
      </div>
      <div className="game-stage hl-stage">
        {round ? <Card rank={round.card} flip={flip} /> : <div className="hl-card back" aria-label="Deck" />}
        {round && <div className="hl-mult">{round.mult.toFixed(2)}×</div>}
        {round && round.history.length > 0 && (
          <div className="hl-history" aria-label="Previous cards">{round.history.slice(-8).map((c, i) => <Card key={i} rank={c} flip={i} small />)}</div>
        )}
      </div>
    </div>
  );
}
