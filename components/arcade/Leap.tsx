"use client";
// Leap of Faith (limbo): name a multiplier, then leap. The altitude climbs in log space and either clears
// your target (win) or falls short. The reference implementation of the arcade overhaul kit:
// Machine cabinet + HUD readouts + ResultStrip, sounds from sfx.ts, wins via celebrate().
import { useEffect, useRef, useState } from "react";
import { limboLeap } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { play } from "./sfx";

const fmtX = (n: number) => (n >= 1000 ? `${Math.floor(n).toLocaleString("en-US")}×` : n >= 100 ? `${Math.floor(n)}×` : `${n.toFixed(2)}×`);
// altitude on the screen: log scale from 1× (bottom) to 100× (top)
const alt = (m: number) => Math.min(1, Math.log(Math.max(1, m)) / Math.log(100));

export function Leap() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(2);
  const [shown, setShown] = useState(1);
  const [res, setRes] = useState<{ win: boolean; won: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [crossed, setCrossed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const chance = Math.min(99, (0.97 / Math.max(1.01, target)) * 100);

  const leap = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setRes(null); setCrossed(false); setShown(1);
    play("launch");
    const r = await limboLeap({ bet, target });
    if (!r.ok) { setBusy(false); play("error"); return setErr(r.error); }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const end = r.roll, dur = reduced ? 1 : 650 + Math.log10(Math.max(1, end)) * 520;
    const t0 = performance.now();
    let passed = false, lastMilestone = 1;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = Math.pow(end, e); // climb in log space
      setShown(v);
      if (!passed && v >= target) { passed = true; setCrossed(true); play("coin"); }
      const m = v >= 10 ? 10 : v >= 5 ? 5 : v >= 2 ? 2 : 1;
      if (m > lastMilestone) { lastMilestone = m; play("tick", { pitch: 1 + m / 10 }); }
      if (k < 1) { raf.current = requestAnimationFrame(tick); return; }
      setBusy(false); setRes({ win: r.win, won: r.won }); setBalance(r.balance); flash(r.won - bet);
      celebrate({ mult: r.win ? r.won / bet : 0, won: r.won });
      setChips((c) => [{ k: t, label: fmtX(r.roll), tone: (r.win ? (r.roll >= 10 ? "big" : "win") : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    };
    raf.current = requestAnimationFrame(tick);
  };

  const y = alt(shown), ty = alt(target);
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="sky" label="Leap of Faith" hud={<>
          <Readout label="Target" tone="gold">{fmtX(target)}</Readout>
          <Readout label="Chance">{chance.toFixed(chance < 1 ? 2 : 1)}%</Readout>
          <ResultStrip items={chips} label="Recent leaps" />
        </>}>
          <div className={`lp-sky${res ? (res.win ? " win" : " lose") : ""}${busy ? " flying" : ""}`}>
            {[2, 5, 10, 50].map((m) => <span key={m} className="lp-tick" style={{ bottom: `${alt(m) * 82 + 6}%` }}>{m}×</span>)}
            <span className={`lp-target${crossed ? " crossed" : ""}`} style={{ bottom: `${ty * 82 + 6}%` }}><span>Target {fmtX(target)}</span></span>
            <span className="lp-rider" style={{ bottom: `${y * 82 + 6}%` }} aria-hidden="true">
              <img src="https://render.worldofwarcraft.com/us/icons/56/ability_mount_gryphon_01.jpg" alt="" width={46} height={46} />
            </span>
            <div className="lp-number" aria-live="polite">{fmtX(shown)}</div>
            {res && <div className={`lp-verdict ${res.win ? "win" : "lose"}`}>{res.win ? `Cleared! +${fmt(res.won)}` : "Fell short"}</div>}
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <label className="field">Target multiplier
          <input type="number" min={1.01} max={1000} step={0.01} value={target} disabled={busy} onChange={(e) => setTarget(Math.max(1.01, Math.min(1000, Number(e.target.value) || 1.01)))} />
        </label>
        <div className="seg">{[1.5, 2, 5, 10, 100].map((t) => <button key={t} type="button" aria-pressed={target === t} disabled={busy} onClick={() => { setTarget(t); play("click"); }}>{t}×</button>)}</div>
        <div className="dice-stats">
          <div><span className="micro muted">Chance</span><strong>{chance.toFixed(chance < 1 ? 2 : 1)}%</strong></div>
          <div><span className="micro muted">Payout</span><strong className="gold">{target.toFixed(2)}×</strong></div>
          <div><span className="micro muted">Win</span><strong>{fmt(Math.floor(bet * target))}</strong></div>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={leap} disabled={!signedIn || busy}>{busy ? "Leaping…" : "Leap"}</button>
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}
