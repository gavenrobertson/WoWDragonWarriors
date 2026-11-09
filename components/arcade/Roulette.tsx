"use client";
import { useMemo, useState } from "react";
import { rouletteSpin } from "@/app/arcade/actions";
import { fmt, useArcade } from "./ArcadeShell";

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n: number) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
type Kind = "straight" | "red" | "black" | "odd" | "even" | "low" | "high" | "dozen" | "column";
type Bet = { kind: Kind; value?: number; amount: number };
const key = (b: { kind: Kind; value?: number }) => `${b.kind}:${b.value ?? ""}`;
const CHIPS = [10, 50, 100, 500, 1000];

export function Roulette() {
  const { signedIn, setBalance, flash } = useArcade();
  const [chip, setChip] = useState(50);
  const [bets, setBets] = useState<Bet[]>([]);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ n: number; won: number; total: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const total = bets.reduce((a, b) => a + b.amount, 0);
  const on = useMemo(() => new Map(bets.map((b) => [key(b), b.amount])), [bets]);

  const place = (kind: Kind, value?: number) => {
    if (spinning) return;
    setLast(null);
    setBets((bs) => {
      const k = key({ kind, value }), i = bs.findIndex((b) => key(b) === k);
      if (i >= 0) return bs.map((b, j) => (j === i ? { ...b, amount: b.amount + chip } : b));
      return [...bs, { kind, value, amount: chip }];
    });
  };
  const spin = async () => {
    if (!bets.length || spinning) return;
    setSpinning(true); setErr(null);
    const r = await rouletteSpin({ bets });
    if (!r.ok) { setSpinning(false); return setErr(r.error); }
    const seg = 360 / 37, idx = ORDER.indexOf(r.number);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAngle((a) => a - (a % 360) + 360 * (reduced ? 1 : 6) + (360 - idx * seg));
    setTimeout(() => {
      setSpinning(false); setBalance(r.balance); flash(r.won - r.total);
      setLast({ n: r.number, won: r.won, total: r.total }); setHistory((h) => [r.number, ...h].slice(0, 14));
    }, reduced ? 400 : 4200);
  };
  const Cell = ({ kind, value, label, className }: { kind: Kind; value?: number; label: string; className?: string }) => {
    const amt = on.get(key({ kind, value }));
    const hit = last && !spinning && (kind === "straight" ? last.n === value : false);
    return (
      <button type="button" className={`rl-cell ${className ?? ""}${hit ? " hit" : ""}`} onClick={() => place(kind, value)} disabled={spinning} aria-label={`Bet ${chip} on ${label}`}>
        <span>{label}</span>{amt ? <span className="rl-chip">{amt >= 1000 ? `${amt / 1000}k` : amt}</span> : null}
      </button>
    );
  };

  return (
    <div className="game-layout">
      <div className="game-stage rl-stage">
        <div className="rl-wheel-wrap">
          <span className="rl-pointer" aria-hidden="true" />
          <svg viewBox="-110 -110 220 220" className="rl-wheel" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
            {ORDER.map((n, i) => {
              const seg = 360 / 37, a0 = ((i * seg - seg / 2 - 90) * Math.PI) / 180, a1 = ((i * seg + seg / 2 - 90) * Math.PI) / 180;
              const pt = (a: number) => `${(100 * Math.cos(a)).toFixed(2)} ${(100 * Math.sin(a)).toFixed(2)}`; // rounded so server and browser render identically
              return (
                <g key={n}>
                  <path d={`M0 0 L${pt(a0)} A100 100 0 0 1 ${pt(a1)} Z`} fill={color(n) === "green" ? "#1f7a3a" : color(n) === "red" ? "#a3221a" : "#15100a"} stroke="#8a6a2c" strokeWidth=".6" />
                  <text transform={`rotate(${i * seg}) translate(0 -86)`} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#F2E8D0" fontFamily="Marcellus, serif">{n}</text>
                </g>
              );
            })}
            <circle r="70" fill="#1a1206" stroke="#FFD100" strokeWidth="2" />
            <circle r="100" fill="none" stroke="#FFD100" strokeWidth="2.5" />
            <circle r="16" fill="#9B5DFF" stroke="#FFD100" strokeWidth="2" />
          </svg>
          <div className={`rl-result ${last ? color(last.n) : ""}`} aria-live="polite">{spinning ? "…" : last ? last.n : "—"}</div>
        </div>
        <div className="game-history" role="group" aria-label="Recent numbers">{history.map((n, i) => <span key={i} className={`rl-h ${color(n)}`}>{n}</span>)}</div>
      </div>
      <div className="game-controls panel">
        <div className="field">Chip
          <div className="seg rl-chips">{CHIPS.map((c) => <button key={c} type="button" aria-pressed={chip === c} onClick={() => setChip(c)}>{c >= 1000 ? `${c / 1000}k` : c}</button>)}</div>
        </div>
        <div className="rl-board" aria-label="Betting board">
          <Cell kind="straight" value={0} label="0" className="green zero" />
          <div className="rl-numbers">
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => <Cell key={n} kind="straight" value={n} label={String(n)} className={color(n)} />)}
          </div>
          <div className="rl-outside">
            {[1, 2, 3].map((d) => <Cell key={`d${d}`} kind="dozen" value={d} label={`${d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} 12`} />)}
            <Cell kind="low" label="1-18" /><Cell kind="even" label="Even" /><Cell kind="red" label="Red" className="red" />
            <Cell kind="black" label="Black" className="black" /><Cell kind="odd" label="Odd" /><Cell kind="high" label="19-36" />
          </div>
        </div>
        <div className="row between" style={{ gap: 8 }}>
          <span className="small">Total bet <strong className="gold">{fmt(total)}</strong></span>
          <button type="button" className="btn btn-sm" onClick={() => setBets([])} disabled={spinning || !bets.length}>Clear</button>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={spin} disabled={!signedIn || spinning || !bets.length}>{spinning ? "Spinning…" : "Spin"}</button>
        {last && !spinning && <p className={last.won > last.total ? "game-win" : last.won === last.total ? "game-even" : "game-err"} role="status">{last.won > last.total ? `Won ${fmt(last.won)} (+${fmt(last.won - last.total)})` : last.won === last.total ? `Broke even · ${fmt(last.won)} back` : last.won ? `Won ${fmt(last.won)} back of ${fmt(last.total)}` : "No luck this spin"}</p>}
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Single zero. Numbers pay 35 to 1, dozens 2 to 1, colours and halves 1 to 1.</p>
      </div>
    </div>
  );
}
