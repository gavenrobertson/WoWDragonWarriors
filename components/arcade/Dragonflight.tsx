"use client";
// Crash-style game: the multiplier climbs while the dragon rises; cash out before it dives.
import { useEffect, useRef, useState } from "react";
import { crashCashout, crashPoll, crashStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

const multAt = (ms: number) => Math.floor(Math.exp(0.00011 * Math.max(0, ms)) * 100) / 100;
type Phase = "idle" | "countdown" | "flying" | "won" | "lost";

export function Dragonflight() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [auto, setAuto] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [mult, setMult] = useState(1);
  const [result, setResult] = useState<{ point: number; won: number; at: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const round = useRef<{ id: string; start: number; offset: number } | null>(null);
  const pts = useRef<{ t: number; m: number }[]>([]);
  const busy = useRef(false);

  const finish = (status: string, point: number, at: number, won: number, balance: number) => {
    round.current = null;
    setPhase(status === "won" ? "won" : "lost");
    setResult({ point, won, at });
    setBalance(balance); if (won) flash(won);
    setHistory((h) => [point, ...h].slice(0, 14));
  };

  // Animation + polling loop.
  useEffect(() => {
    if (phase !== "countdown" && phase !== "flying") return;
    let raf = 0, alive = true;
    const tick = () => {
      const r = round.current; if (!r || !alive) return;
      const el = Date.now() + r.offset - r.start;
      if (el < 0) { if (phase !== "countdown") setPhase("countdown"); }
      else {
        if (phase !== "flying") setPhase("flying");
        const m = multAt(el); setMult(m);
        pts.current.push({ t: el, m });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const poll = setInterval(async () => {
      const r = round.current; if (!r || busy.current) return;
      busy.current = true;
      const p = await crashPoll({ id: r.id }); busy.current = false;
      if (!alive || !p.ok || round.current?.id !== r.id) return;
      if (p.status !== "active") finish(p.status, p.point ?? p.mult, p.mult, p.won ?? 0, p.balance ?? 0);
    }, 450);
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = async () => {
    setErr(null); setResult(null); pts.current = []; setMult(1);
    const a = Number(auto);
    const r = await crashStart({ bet, auto: a >= 1.01 ? a : null });
    if (!r.ok) return setErr(r.error);
    setBalance(r.balance);
    round.current = { id: r.id, start: r.start, offset: r.now - Date.now() };
    setPhase("countdown");
  };
  const cashout = async () => {
    const r = round.current; if (!r) return;
    busy.current = true;
    const p = await crashCashout({ id: r.id }); busy.current = false;
    if (!p.ok) return setErr(p.error);
    if (p.status !== "active") finish(p.status, p.point ?? p.mult, p.mult, p.won ?? 0, p.balance ?? 0);
  };

  // Curve drawing: scale grows with the flight.
  const maxT = Math.max(8000, ...pts.current.map((p) => p.t)), maxM = Math.max(2, mult * 1.15);
  const X = (t: number) => 20 + (t / maxT) * 560, Y = (m: number) => 280 - ((m - 1) / (maxM - 1)) * 250;
  const d = pts.current.filter((_, i, a) => i % 3 === 0 || i === a.length - 1).map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.m).toFixed(1)}`).join(" ");
  const tip = pts.current[pts.current.length - 1];
  const flying = phase === "flying" || phase === "countdown";

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={flying} />
        <label className="field">Auto cash-out at (optional)
          <input type="number" min={1.01} step={0.01} placeholder="e.g. 2.00" value={auto} disabled={flying} onChange={(e) => setAuto(e.target.value)} />
        </label>
        {flying ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={cashout} disabled={phase !== "flying"}>
            {phase === "countdown" ? "Taking off…" : `Cash out ${fmt(Math.floor(bet * mult))}`}
          </button>
        ) : <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn}>Launch</button>}
        {err && <p className="game-err" role="alert">{err}</p>}
        {result && <p className={result.won ? "game-win" : "game-err"} role="status">{result.won ? `Cashed out at ${result.at}× for ${fmt(result.won)}` : `The dragon dove at ${result.point}×`}</p>}
        <p className="micro muted">The dragon can dive at any moment, sometimes right away. ~3% of flights never leave the ground.</p>
      </div>
      <div className="game-stage">
        <div className={`crash-sky ${phase}`}>
          <svg viewBox="0 0 600 300" className="crash-graph" aria-hidden="true">
            {[1.5, 2, 3, 5, 10, 25, 50, 100].filter((m) => m < maxM).map((m) => (
              <g key={m}><line x1="20" x2="580" y1={Y(m)} y2={Y(m)} stroke="#3b2f17" strokeDasharray="3 6" /><text x="584" y={Y(m) + 4} fill="#8f846e" fontSize="10">{m}×</text></g>
            ))}
            {d && <path d={`${d} L${X(tip?.t ?? 0)} 280 L20 280 Z`} fill="url(#crashFill)" opacity=".5" />}
            {d && <path d={d} fill="none" stroke={phase === "lost" ? "#ff4d2e" : "#FFD100"} strokeWidth="3" strokeLinecap="round" />}
            <defs><linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD100" stopOpacity=".45" /><stop offset="1" stopColor="#FFD100" stopOpacity="0" /></linearGradient></defs>
          </svg>
          {tip && <img className={`crash-dragon ${phase}`} src={wowIconUrl("achievement_boss_onyxia")} alt="" style={{ left: `${(X(tip.t) / 600) * 100}%`, top: `${(Y(tip.m) / 300) * 100}%` }} />}
          <div className="crash-mult" aria-live="off">
            {phase === "countdown" ? "Get ready…" : phase === "idle" ? "1.00×" : phase === "lost" ? <span className="lost">DOVE {result?.point}×</span> : `${mult.toFixed(2)}×`}
          </div>
        </div>
        <div className="game-history" aria-label="Recent flights">
          {history.map((h, i) => <span key={i} style={{ background: h >= 10 ? "#ff8a2e" : h >= 2 ? "#c9a13b" : "#5a4a2e" }}>{h}×</span>)}
        </div>
      </div>
    </div>
  );
}
