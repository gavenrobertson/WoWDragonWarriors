"use client";
import { useState } from "react";
import { diceRoll } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";

export function Dice() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [roll, setRoll] = useState<{ v: number; win: boolean; k: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chance = over ? 100 - target : target;
  const mult = Math.floor((0.97 / (chance / 100)) * 10000) / 10000;

  const go = async () => {
    setBusy(true); setErr(null);
    const r = await diceRoll({ bet, target, over });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setRoll({ v: r.roll, win: r.win, k: Date.now() }); setBalance(r.balance); flash(r.won - bet);
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} />
        <div className="seg"><button type="button" aria-pressed={over} onClick={() => setOver(true)}>Roll over</button><button type="button" aria-pressed={!over} onClick={() => setOver(false)}>Roll under</button></div>
        <div className="dice-stats">
          <div><span className="micro muted">Win chance</span><strong>{chance.toFixed(0)}%</strong></div>
          <div><span className="micro muted">Payout</span><strong className="gold">{mult.toFixed(2)}×</strong></div>
          <div><span className="micro muted">Win</span><strong>{fmt(Math.floor(bet * mult))}</strong></div>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={go} disabled={!signedIn || busy}>Roll</button>
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>
      <div className="game-stage dice-stage">
        <div className={`dice-result${roll ? (roll.win ? " win" : " lose") : ""}`} key={roll?.k}>{roll ? roll.v.toFixed(2) : "—"}</div>
        <div className="dice-track">
          <div className="dice-zone" style={over ? { left: `${target}%`, right: 0 } : { left: 0, right: `${100 - target}%` }} />
          {roll && <span key={roll.k} className={`dice-marker${roll.win ? " win" : ""}`} style={{ left: `${roll.v}%` }}>{roll.v.toFixed(0)}</span>}
          <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target" />
        </div>
        <div className="dice-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      </div>
    </div>
  );
}
