"use client";
import { useState } from "react";
import { blackjackAct, blackjackDeal } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { PlayingCard } from "./PlayingCard";

type Card = { r: number; s: number };
type Round = { id: string; bet: number; status: string; outcome?: string; doubled: boolean; player: Card[]; playerValue: number; dealer: Card[]; dealerValue: number; hidden: boolean; payout: number };

export function Blackjack() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = round?.status === "active";

  const apply = (r: { round: Round; balance: number; won?: number }) => {
    setRound(r.round); setBalance(r.balance);
    if (r.round.status !== "active" && r.won) flash(r.won);
  };
  const deal = async () => {
    setBusy(true); setErr(null);
    const r = await blackjackDeal({ bet });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    apply(r);
  };
  const act = async (action: "hit" | "stand" | "double") => {
    if (!round) return;
    setBusy(true); setErr(null);
    const r = await blackjackAct({ id: round.id, action });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    apply(r);
  };
  const result = round && !active ? round.outcome : null;
  const good = round && round.status === "won" && round.payout > (round.doubled ? round.bet * 2 : round.bet);

  return (
    <div className="game-layout">
      <div className="game-stage bj-table">
        <div className="bj-row">
          <span className="bj-label">Dealer{round ? ` · ${round.hidden ? `${round.dealerValue} + ?` : round.dealerValue}` : ""}</span>
          <div className="bj-hand">
            {round ? <>{round.dealer.map((c, i) => <PlayingCard key={`d${i}-${c.r}-${c.s}`} rank={c.r} suit={c.s} small />)}{round.hidden && <PlayingCard rank={1} back small />}</>
              : <><PlayingCard rank={1} back small /><PlayingCard rank={1} back small /></>}
          </div>
        </div>
        <div className={`bj-result${result ? (good ? " win" : round?.payout ? " push" : " lose") : ""}`} aria-live="polite">
          {result ? `${result}${round!.payout ? ` · +${fmt(round!.payout)}` : ""}` : active ? "Hit, stand or double?" : "Place a bet and deal"}
        </div>
        <div className="bj-row">
          <div className="bj-hand">
            {round ? round.player.map((c, i) => <PlayingCard key={`p${i}-${c.r}-${c.s}`} rank={c.r} suit={c.s} small />) : <><PlayingCard rank={1} back small /><PlayingCard rank={1} back small /></>}
          </div>
          <span className="bj-label">You{round ? ` · ${round.playerValue}` : ""}{round?.doubled ? " · doubled" : ""}</span>
        </div>
      </div>
      <div className="game-controls panel">
        {active ? (
          <div className="bj-actions">
            <button type="button" className="btn btn-lg" disabled={busy} onClick={() => act("hit")}>Hit</button>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => act("stand")}>Stand</button>
            <button type="button" className="btn btn-lg" disabled={busy || round.player.length !== 2} onClick={() => act("double")}>Double</button>
          </div>
        ) : (
          <>
            <BetInput value={bet} onChange={setBet} disabled={busy} />
            <button type="button" className="btn btn-primary btn-lg" onClick={deal} disabled={!signedIn || busy}>Deal</button>
          </>
        )}
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Dealer stands on 17. Blackjack pays 3 to 2. Double on your first two cards.</p>
      </div>
    </div>
  );
}
