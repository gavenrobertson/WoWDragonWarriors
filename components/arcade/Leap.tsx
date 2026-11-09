"use client";
import { useRef, useState } from "react";
import { limboLeap } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";

export function Leap() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(2);
  const [shown, setShown] = useState<number | null>(null);
  const [res, setRes] = useState<{ win: boolean; won: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<{ roll: number; win: boolean }[]>([]);
  const raf = useRef(0);
  const chance = Math.min(99, (0.97 / Math.max(1.01, target)) * 100);

  const leap = async () => {
    setBusy(true); setErr(null); setRes(null);
    const r = await limboLeap({ bet, target });
    if (!r.ok) { setBusy(false); return setErr(r.error); }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now(), dur = reduced ? 1 : 700, end = r.roll;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setShown(1 + (end - 1) * e);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else { setBusy(false); setRes({ win: r.win, won: r.won }); setBalance(r.balance); flash(r.won - bet); setLog((l) => [{ roll: r.roll, win: r.win }, ...l].slice(0, 14)); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <div className="game-layout">
      <div className="game-stage leap-stage">
        <div className={`leap-number${res ? (res.win ? " win" : " lose") : ""}`} aria-live="polite">{shown == null ? "1.00×" : `${shown >= 100 ? Math.floor(shown).toLocaleString("en-US") : shown.toFixed(2)}×`}</div>
        <div className="leap-target">Target <strong className="gold">{target.toFixed(2)}×</strong></div>
        <div className="game-history" aria-label="Recent leaps">{log.map((l, i) => <span key={i} style={{ background: l.win ? "#4CD964" : "#5a4a2e" }}>{l.roll >= 100 ? Math.floor(l.roll) : l.roll.toFixed(2)}×</span>)}</div>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <label className="field">Target multiplier
          <input type="number" min={1.01} max={1000} step={0.01} value={target} disabled={busy} onChange={(e) => setTarget(Math.max(1.01, Math.min(1000, Number(e.target.value) || 1.01)))} />
        </label>
        <div className="seg">{[1.5, 2, 5, 10, 100].map((t) => <button key={t} type="button" aria-pressed={target === t} disabled={busy} onClick={() => setTarget(t)}>{t}×</button>)}</div>
        <div className="dice-stats">
          <div><span className="micro muted">Chance</span><strong>{chance.toFixed(chance < 1 ? 2 : 1)}%</strong></div>
          <div><span className="micro muted">Payout</span><strong className="gold">{target.toFixed(2)}×</strong></div>
          <div><span className="micro muted">Win</span><strong>{fmt(Math.floor(bet * target))}</strong></div>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={leap} disabled={!signedIn || busy}>Leap</button>
        {res && <p className={res.win ? "game-win" : "game-err"} role="status">{res.win ? `Made it! Won ${fmt(res.won)}` : "Fell short."}</p>}
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
