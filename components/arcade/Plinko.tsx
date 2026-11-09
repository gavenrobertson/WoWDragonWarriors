"use client";
import { useEffect, useRef, useState } from "react";
import { plinkoDrop } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";

type Ball = { id: number; path: number[]; t0: number; slot: number; mult: number; won: number; balance: number; seq: number; rows: number };
const STEP = 115; // ms per peg row
const W = 400;

const heat = (m: number) => (m >= 50 ? "#ff4d2e" : m >= 10 ? "#ff8a2e" : m >= 3 ? "#f0b21c" : m >= 1 ? "#c9a13b" : "#5a4a2e");

export function Plinko({ tables }: { tables: Record<string, number[]> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [balls, setBalls] = useState<Ball[]>([]);
  const [, setTick] = useState(0);
  const [hit, setHit] = useState<{ slot: number; k: number } | null>(null);
  const [log, setLog] = useState<{ mult: number; k: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0), applied = useRef(0), idc = useRef(0);
  const table = tables[`${rows}-${risk}`];
  const s = W / (rows + 2), H = s * (rows + 2.2);

  // Animate while balls are in flight; settle each on landing.
  useEffect(() => {
    if (!balls.length) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const landed = balls.filter((b) => now - b.t0 >= b.path.length * STEP + 60);
      if (landed.length) {
        for (const b of landed) {
          if (b.seq > applied.current) { applied.current = b.seq; setBalance(b.balance); }
          flash(b.won);
          setHit({ slot: b.slot, k: b.id });
          setLog((l) => [{ mult: b.mult, k: b.id }, ...l].slice(0, 12));
        }
        setBalls((bs) => bs.filter((b) => !landed.includes(b)));
        return;
      }
      setTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [balls, setBalance, flash]);

  const drop = async () => {
    setErr(null);
    const my = ++seq.current, r0 = rows;
    const r = await plinkoDrop({ bet, rows, risk });
    if (!r.ok) { setErr(r.error); return; }
    setBalls((bs) => [...bs, { id: ++idc.current, path: r.path, t0: performance.now(), slot: r.slot, mult: r.mult, won: r.won, balance: r.balance, seq: my, rows: r0 }]);
  };

  const pos = (b: Ball) => {
    const el = Math.min((performance.now() - b.t0) / STEP, b.path.length);
    const i = Math.floor(el), f = el - i;
    let x = 0;
    for (let k = 0; k < i; k++) x += b.path[k] ? 0.5 : -0.5;
    const dx = i < b.path.length ? (b.path[i] ? 0.5 : -0.5) * f : 0;
    const ss = W / (b.rows + 2);
    const y = ss * (i + 0.55 + f) - (i < b.path.length ? Math.sin(f * Math.PI) * ss * 0.35 : 0);
    return { x: W / 2 + (x + dx) * ss, y };
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} />
        <label className="field">Risk
          <div className="seg">{(["low", "medium", "high"] as const).map((k) => <button key={k} type="button" aria-pressed={risk === k} disabled={balls.length > 0} onClick={() => setRisk(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </label>
        <label className="field">Rows
          <div className="seg">{[8, 12, 16].map((n) => <button key={n} type="button" aria-pressed={rows === n} disabled={balls.length > 0} onClick={() => setRows(n)}>{n}</button>)}</div>
        </label>
        <button type="button" className="btn btn-primary btn-lg" onClick={drop} disabled={!signedIn}>Drop</button>
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Edges pay up to <strong className="gold">{fmt(Math.max(...table))}×</strong>. Click Drop as fast as you like.</p>
      </div>
      <div className="game-stage plinko-stage">
        <svg viewBox={`0 0 ${W} ${H}`} className="plinko-board" role="img" aria-label="Plinko board">
          <defs>
            <radialGradient id="pkBall" cx=".35" cy=".35" r=".7"><stop offset="0" stopColor="#fff6c8" /><stop offset=".5" stopColor="#FFD100" /><stop offset="1" stopColor="#a86b00" /></radialGradient>
            <radialGradient id="pkPeg" cx=".35" cy=".35" r=".7"><stop offset="0" stopColor="#efe2ff" /><stop offset="1" stopColor="#6a3fbf" /></radialGradient>
          </defs>
          {Array.from({ length: rows }, (_, r) => Array.from({ length: r + 3 }, (_, j) => (
            <circle key={`${r}-${j}`} cx={W / 2 + (j - (r + 2) / 2) * s} cy={s * (r + 1)} r={Math.max(2.2, s * 0.09)} fill="url(#pkPeg)" />
          )))}
          {table.map((m, k) => {
            const x = W / 2 + (k - rows / 2) * s;
            const lit = hit?.slot === k;
            return (
              <g key={`${k}-${hit?.k ?? 0}`} className={lit ? "pk-slot hit" : "pk-slot"}>
                <rect x={x - s * 0.46} y={s * (rows + 0.95)} width={s * 0.92} height={s * 0.95} rx={3} fill={heat(m)} stroke="#000" />
                <text x={x} y={s * (rows + 1.55)} textAnchor="middle" fontSize={Math.min(11, s * 0.36)} fill={m >= 1 ? "#1a1206" : "#d8cdb4"} fontWeight="700">{m >= 100 ? m : `${m}`}</text>
              </g>
            );
          })}
          {balls.map((b) => { const p = pos(b); return <circle key={b.id} cx={p.x} cy={p.y} r={Math.max(3.4, s * 0.17)} fill="url(#pkBall)" stroke="#5a3a00" strokeWidth=".6" />; })}
        </svg>
        <div className="game-history" aria-label="Recent results">
          {log.map((l) => <span key={l.k} style={{ background: heat(l.mult) }}>{l.mult}×</span>)}
        </div>
      </div>
    </div>
  );
}
