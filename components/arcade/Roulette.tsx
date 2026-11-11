"use client";
// Roulette (single zero) on a felt table. The wheel idles, then spins one way while the ball runs the other;
// the ball's lead over its planned pocket shrinks smoothly to nothing, it drops off the track, hops over the
// frets and settles. Chips are real stacks on the layout: winners glow, losers are swept away.
// The server picks the number; the wheel only plans a landing on it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rouletteSpin } from "@/app/arcade/actions";
import { fmt, useArcade } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play } from "./sfx";

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n: number) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
type Kind = "straight" | "red" | "black" | "odd" | "even" | "low" | "high" | "dozen" | "column";
type Spot = { kind: Kind; value?: number };
type Placement = Spot & { amount: number };
const key = (b: Spot) => `${b.kind}:${b.value ?? ""}`;
const CHIPS = [10, 50, 100, 500, 1000];
const PAYS: Record<Kind, number> = { straight: 36, red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, dozen: 3, column: 3 };
const SEG = 360 / 37;
const R_TRACK = 101, R_NUM = 76, R_POCKET = 60;
const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n));

/** The same rule the server uses, for showing which chips won. */
function wins(b: Spot, n: number) {
  if (b.kind === "straight") return n === b.value;
  if (n === 0) return false;
  switch (b.kind) {
    case "red": return RED.has(n);
    case "black": return !RED.has(n);
    case "odd": return n % 2 === 1;
    case "even": return n % 2 === 0;
    case "low": return n <= 18;
    case "high": return n >= 19;
    case "dozen": return Math.ceil(n / 12) === b.value;
    case "column": return ((n - 1) % 3) + 1 === b.value;
  }
}

// ---------------------------------------------------------------- wheel geometry (rounded, so server and browser agree)
const P = (r: number, deg: number) => { const a = (deg * Math.PI) / 180; return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`; };
const ring = (r0: number, r1: number, a0: number, a1: number) => `M${P(r1, a0)} A${r1} ${r1} 0 0 1 ${P(r1, a1)} L${P(r0, a1)} A${r0} ${r0} 0 0 0 ${P(r0, a0)} Z`;
const WEDGES = ORDER.map((n, i) => ({ n, i, num: ring(66, 89, i * SEG - SEG / 2, i * SEG + SEG / 2), pocket: ring(52, 66, i * SEG - SEG / 2, i * SEG + SEG / 2), fret: `M${P(52, i * SEG - SEG / 2)} L${P(89, i * SEG - SEG / 2)}` }));
const DEFLECTORS = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

// ---------------------------------------------------------------- the betting layout: placement on a wide (h) and a tall (v) table
type Cell = Spot & { label: string; cls: string; h: [string, string]; v: [string, string] };
const CELLS: Cell[] = [
  { kind: "straight", value: 0, label: "0", cls: "num green zero", h: ["1", "1 / span 3"], v: ["3 / span 3", "1"] },
  ...Array.from({ length: 36 }, (_, k): Cell => {
    const n = k + 1, c = Math.ceil(n / 3), m = (n - 1) % 3;
    return { kind: "straight", value: n, label: String(n), cls: `num ${color(n)}`, h: [String(c + 1), String(3 - m)], v: [String(3 + m), String(c + 1)] };
  }),
  ...[1, 2, 3].map((c): Cell => ({ kind: "column", value: c, label: "2:1", cls: "col", h: ["14", String(4 - c)], v: [String(2 + c), "14"] })),
  ...[1, 2, 3].map((d): Cell => ({ kind: "dozen", value: d, label: ["1st 12", "2nd 12", "3rd 12"][d - 1], cls: "out dozen", h: [`${2 + (d - 1) * 4} / span 4`, "4"], v: ["2", `${2 + (d - 1) * 4} / span 4`] })),
  ...([["low", "1–18"], ["even", "Even"], ["red", "Red"], ["black", "Black"], ["odd", "Odd"], ["high", "19–36"]] as const).map(([kind, label], j): Cell => ({
    kind, label, cls: `out even-money ${kind}`, h: [`${2 + j * 2} / span 2`, "5"], v: ["1", `${2 + j * 2} / span 2`],
  })),
];

function Stack({ amount }: { amount: number }) {
  const discs: number[] = [];
  let left = amount;
  for (const c of [...CHIPS].reverse()) while (left >= c && discs.length < 6) { discs.push(c); left -= c; }
  return (
    <span className="rw-stack" aria-hidden="true">
      {discs.map((c, i) => <span key={i === discs.length - 1 ? `top-${amount}` : i} className={`rw-chip c${c}${i === discs.length - 1 ? " top" : ""}`} style={{ ["--i" as string]: i }} />)}
      <span className="rw-stack-amt" style={{ ["--i" as string]: discs.length - 1 }}>{short(amount)}</span>
    </span>
  );
}

type Spin = { t0: number; T: number; Tw: number; th0: number; wMax: number; D: number; a: number; r0: number; pocket: number; contact: number; dropTick: boolean; done: boolean };
type Settled = { n: number; won: number; total: number; bets: Placement[] };

export function Roulette() {
  const { signedIn, setBalance, flash } = useArcade();
  const [chip, setChip] = useState(50);
  const [placed, setPlaced] = useState<Placement[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState<number | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [lastWin, setLastWin] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const bets = useMemo(() => {
    const m = new Map<string, Placement>();
    for (const p of placed) { const k = key(p), b = m.get(k); m.set(k, b ? { ...b, amount: b.amount + p.amount } : { ...p }); }
    return [...m.values()];
  }, [placed]);
  const on = useMemo(() => new Map(bets.map((b) => [key(b), b.amount])), [bets]);
  const total = bets.reduce((a, b) => a + b.amount, 0);

  const rotor = useRef<SVGGElement>(null);
  const ball = useRef<SVGGElement>(null);
  const sim = useRef({ th: 0, psi: 0, r: R_POCKET, spin: null as Spin | null, last: 0 });
  const onLand = useRef<() => void>(() => {});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ---------------------------------------------------------------- the wheel loop (idles slowly; runs the spin when there is one)
  useEffect(() => {
    const s = sim.current;
    const write = () => {
      rotor.current?.setAttribute("transform", `rotate(${(s.th % 360).toFixed(3)})`);
      const a = ((s.th + s.psi) * Math.PI) / 180;
      ball.current?.setAttribute("transform", `translate(${(s.r * Math.sin(a)).toFixed(2)} ${(-s.r * Math.cos(a)).toFixed(2)})`);
    };
    write();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    s.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000); s.last = now;
      const sp = s.spin;
      if (!sp) { s.th += 10 * dt; }
      else {
        const t = now - sp.t0, k = Math.min(1, t / sp.Tw);
        s.th = sp.th0 + (10 * t) / 1000 + ((sp.wMax - 10) * (sp.Tw / 1000) / 3) * (1 - Math.pow(1 - k, 3));
        const u = Math.min(1, t / sp.T);
        let psi = sp.a + sp.D * Math.pow(1 - u, 3), r: number;
        if (u < 0.07) r = sp.r0 + (R_TRACK - sp.r0) * (1 - Math.pow(1 - u / 0.07, 2));
        else if (u < 0.58) r = R_TRACK - 0.6 * Math.sin(u * 40);
        else if (u < 0.8) {
          const v = (u - 0.58) / 0.22;
          r = R_TRACK - (R_TRACK - R_NUM) * v * v;
          if (v > 0.4 && v < 0.62) { r += 5 * Math.sin((Math.PI * (v - 0.4)) / 0.22); if (!sp.dropTick) { sp.dropTick = true; play("tick", { pitch: 1.3 }); } }
        } else {
          const v = (u - 0.8) / 0.2, env = Math.pow(1 - v, 1.6), c = Math.cos(2.5 * Math.PI * v);
          r = R_POCKET + (R_NUM - R_POCKET) * env * Math.abs(c);
          psi += SEG * 1.1 * Math.pow(1 - v, 2) * Math.sin(2.5 * Math.PI * v);
          const contact = Math.floor(v * 2.5 + 0.5);
          if (contact !== sp.contact && v < 0.98) { sp.contact = contact; play("tick", { pitch: 1.15 - contact * 0.12 }); buzz("tick"); }
        }
        const pocket = Math.floor((psi - sp.a) / SEG + 0.5);
        if (pocket !== sp.pocket) { sp.pocket = pocket; if (u > 0.79) play("peg", { vol: 0.4, pitch: 1.4 }); }
        if (u >= 1) { psi = sp.a; r = R_POCKET; if (!sp.done) { sp.done = true; onLand.current(); } }
        s.psi = psi; s.r = r;
      }
      write();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tm = timers.current;
    return () => { cancelAnimationFrame(raf); tm.forEach(clearTimeout); };
  }, []);

  const place = (spot: Spot) => {
    if (spinning) return;
    if (!bets.some((b) => key(b) === key(spot)) && bets.length >= 40) { setErr("That's the most spots you can cover in one spin."); play("error"); return; }
    if (total + chip > 25000) { setErr("Total bet is at most 25,000 marks."); play("error"); return; }
    setErr(null); setSettled(null);
    setPlaced((p) => [...p, { ...spot, amount: chip }]);
    play("chip", { pitch: 0.85 + CHIPS.indexOf(chip) * 0.08 });
  };
  const undo = () => { if (spinning || !placed.length) return; setSettled(null); setPlaced((p) => p.slice(0, -1)); play("click"); };
  const clear = () => { if (spinning) return; setSettled(null); setPlaced([]); play("whoosh", { vol: 0.5 }); };

  const finish = useCallback((n: number, won: number, tot: number, balance: number, bs: Placement[]) => {
    setLanded(n); play("stop", { pitch: 0.8 }); buzz("tap");
    const mult = tot ? won / tot : 0;
    timers.current.push(setTimeout(() => {
      setSpinning(false);
      setSettled({ n, won, total: tot, bets: bs });
      setHistory((h) => [n, ...h].slice(0, 16));
      setBalance(balance); flash(won - tot); setLastWin(won);
      if (won > 0) bs.filter((b) => wins(b, n)).forEach((_, i) => timers.current.push(setTimeout(() => play("coin", { pitch: 1 + i * 0.1 }), 120 + i * 90)));
      else play("whoosh", { vol: 0.6 });
      celebrate({ mult: won > 0 ? mult : 0, won });
      setChips((c) => [{ k: `${Date.now()}`, label: String(n), tone: (mult >= 3 ? "big" : won > tot ? "win" : won > 0 ? "neutral" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    }, 420));
  }, [flash, setBalance]);

  const spin = async () => {
    if (!bets.length || spinning) return;
    setSpinning(true); setErr(null); setSettled(null); setLanded(null);
    play("chip"); buzz("tap");
    const bs = bets;
    const r = await rouletteSpin({ bets: bs });
    if (!r.ok) { setSpinning(false); play("error"); return setErr(r.error); }
    const s = sim.current;
    const idx = ORDER.indexOf(r.number), a = idx * SEG;
    onLand.current = () => finish(r.number, r.won, r.total, r.balance, bs);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      s.psi = a; s.r = R_POCKET; s.spin = null;
      const ang = ((s.th + a) * Math.PI) / 180;
      ball.current?.setAttribute("transform", `translate(${(R_POCKET * Math.sin(ang)).toFixed(2)} ${(-R_POCKET * Math.cos(ang)).toFixed(2)})`);
      play("stop"); finish(r.number, r.won, r.total, r.balance, bs);
      return;
    }
    play("spin"); timers.current.push(setTimeout(() => play("whoosh"), 160));
    const now = performance.now(), cur = s.th + s.psi;
    const D = ((((cur - s.th - a) % 360) + 360) % 360) + 360 * 5;
    s.spin = { t0: now, T: 4900, Tw: 6800, th0: s.th, wMax: 300, D, a, r0: s.r, pocket: 0, contact: 0, dropTick: false, done: false };
  };

  const shownBets = settled ? settled.bets : bets;
  const shownOn = settled ? new Map(settled.bets.map((b) => [key(b), b.amount])) : on;
  const res = settled?.n ?? null;
  const facts = (n: number) => (n === 0 ? ["Zero"] : [RED.has(n) ? "Red" : "Black", n % 2 ? "Odd" : "Even", n <= 18 ? "1–18" : "19–36"]);
  const payout = (b: Spot, amt: number) => amt * PAYS[b.kind];

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="felt" label="Roulette" hud={<>
          <Readout label="Total bet" tone="gold">{fmt(total)}</Readout>
          <Readout label="Last win" tone={lastWin ? "win" : undefined}><CountUp value={lastWin} /></Readout>
          <ResultStrip items={chips} label="Recent spins" />
        </>}>
          <div className={`rw-felt${spinning ? " spinning" : ""}${settled ? (settled.won > 0 ? " won" : " lost") : ""}`}>
            <div className="rw-top">
              <div className="rw-wheel-wrap">
                <svg viewBox="-120 -120 240 240" className="rw-wheel" aria-hidden="true">
                  <defs>
                    <radialGradient id="rw-wood" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#7a4a22" /><stop offset=".75" stopColor="#4a2a12" /><stop offset="1" stopColor="#1e1006" /></radialGradient>
                    <radialGradient id="rw-track" r="50%"><stop offset=".78" stopColor="#0c0703" /><stop offset=".9" stopColor="#3a2410" /><stop offset="1" stopColor="#120a04" /></radialGradient>
                    <radialGradient id="rw-cone" cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#f6d77a" /><stop offset=".35" stopColor="#a8741f" /><stop offset=".8" stopColor="#4a2c0a" /><stop offset="1" stopColor="#1e1004" /></radialGradient>
                    <radialGradient id="rw-crest" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#d9b8ff" /><stop offset=".5" stopColor="#9B5DFF" /><stop offset="1" stopColor="#3a1a70" /></radialGradient>
                    <radialGradient id="rw-ball" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" /><stop offset=".55" stopColor="#e8e4dc" /><stop offset="1" stopColor="#8a8478" /></radialGradient>
                  </defs>
                  <circle r="119" fill="url(#rw-wood)" stroke="#000" strokeWidth="1" />
                  <circle r="113.5" fill="none" stroke="#d6a742" strokeWidth="1.6" />
                  <circle r="112" fill="url(#rw-track)" />
                  <circle r="91" fill="none" stroke="#000" strokeWidth="2.5" opacity=".6" />
                  {DEFLECTORS.map((d) => <path key={d} d={`M${P(97, d - 2.2)} L${P(100.5, d)} L${P(97, d + 2.2)} L${P(93.5, d)} Z`} fill="#e6c068" stroke="#4a3410" strokeWidth=".5" />)}
                  <g ref={rotor}>
                    <circle r="90" fill="#1a0f05" stroke="#d6a742" strokeWidth="1.2" />
                    {WEDGES.map((w) => (
                      <g key={w.n}>
                        <path d={w.num} fill={w.n === 0 ? "#1f7a3a" : RED.has(w.n) ? "#a3221a" : "#15100a"} />
                        <path d={w.pocket} fill={w.n === 0 ? "#0f3d1d" : RED.has(w.n) ? "#4a0f0b" : "#0a0704"} />
                        <text transform={`rotate(${(w.i * SEG).toFixed(3)}) translate(0 -78)`} textAnchor="middle" dominantBaseline="central" fontSize="8.2" fill="#F2E8D0">{w.n}</text>
                      </g>
                    ))}
                    {WEDGES.map((w) => <path key={`f${w.n}`} d={w.fret} stroke="#d6a742" strokeWidth=".7" />)}
                    <circle r="66" fill="none" stroke="#d6a742" strokeWidth=".8" />
                    {landed !== null && <path className="rw-hl" d={WEDGES[ORDER.indexOf(landed)].num} />}
                    {landed !== null && <path className="rw-hl pocket" d={WEDGES[ORDER.indexOf(landed)].pocket} />}
                    <circle r="52" fill="url(#rw-cone)" stroke="#000" strokeWidth=".8" />
                    <circle r="38" fill="none" stroke="rgba(255,230,160,.35)" strokeWidth=".8" />
                    {[0, 90, 180, 270].map((d) => (
                      <g key={d} transform={`rotate(${d})`}>
                        <rect x="-2.2" y="-34" width="4.4" height="26" rx="2" fill="#e6c068" stroke="#4a3410" strokeWidth=".6" />
                        <circle cy="-35" r="4" fill="#f6d77a" stroke="#4a3410" strokeWidth=".6" />
                      </g>
                    ))}
                    <circle r="12" fill="url(#rw-crest)" stroke="#f6d77a" strokeWidth="1.6" />
                    <path d="M0 -6 L5 0 L0 6 L-5 0 Z" fill="#f6e7ff" opacity=".85" />
                  </g>
                  <g ref={ball}>
                    <circle cx="1" cy="1.6" r="4.4" fill="#000" opacity=".45" />
                    <circle r="4.4" fill="url(#rw-ball)" />
                  </g>
                </svg>
              </div>
              <div className="rw-info">
                <div key={res ?? "none"} className={`rw-result ${res !== null ? color(res) : ""}`} aria-live="polite">
                  <span className="rw-result-n">{res !== null ? res : spinning ? "…" : "?"}</span>
                  <span className="rw-result-facts">{res !== null ? facts(res).join(" · ") : spinning ? "No more bets" : "Place your bets"}</span>
                </div>
                {settled && (
                  <div className={`rw-verdict ${settled.won > settled.total ? "win" : settled.won > 0 ? "even" : "lose"}`} role="status">
                    {settled.won > 0 ? <><strong>+{fmt(settled.won)}</strong><span>{settled.won > settled.total ? `profit ${fmt(settled.won - settled.total)}` : settled.won === settled.total ? "broke even" : `net −${fmt(settled.total - settled.won)}`}</span></> : <span>The house takes {fmt(settled.total)}</span>}
                  </div>
                )}
                <div className="rw-last" role="group" aria-label="Last numbers">
                  <span className="rw-last-l">Last numbers</span>
                  <div className="rw-last-row">
                    {history.length ? history.map((n, i) => <span key={history.length - i} className={`rw-ball-h ${color(n)}${i === 0 ? " fresh" : ""}`}>{n}</span>) : <span className="rw-last-none">None yet</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="rw-table-wrap">
              <div className="rw-table" role="group" aria-label="Betting table">
                <span className="rw-fill a" aria-hidden="true" /><span className="rw-fill b" aria-hidden="true" />
                {CELLS.map((c) => {
                  const k = key(c), amt = shownOn.get(k);
                  const hitNum = res !== null && c.kind === "straight" && c.value === res;
                  const winSpot = res !== null && wins(c, res);
                  const st = settled && amt ? (wins(c, settled.n) ? " won" : " swept") : "";
                  return (
                    <button key={k} type="button" className={`rw-spot ${c.cls}${winSpot ? " hit" : ""}${st}`} disabled={spinning}
                      style={{ ["--hc" as string]: c.h[0], ["--hr" as string]: c.h[1], ["--vc" as string]: c.v[0], ["--vr" as string]: c.v[1] }}
                      onClick={() => place(c)} aria-label={`${c.kind === "column" ? `Column ${c.value} (2 to 1)` : c.label}${amt ? `, ${fmt(amt)} on it` : ""}. Add ${fmt(chip)}`}>
                      <span className="rw-spot-l">{c.label}</span>
                      {hitNum && <span className="rw-dolly" aria-hidden="true" />}
                      {amt ? <Stack amount={amt} /> : null}
                      {st === " won" && amt ? <span className="rw-pay" aria-hidden="true">+{short(payout(c, amt))}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <div className="field">Chip
          <div className="rw-chip-pick" role="group" aria-label="Chip value">
            {CHIPS.map((c) => (
              <button key={c} type="button" className={`rw-pick c${c}`} aria-pressed={chip === c} aria-label={`${c} mark chip`} onClick={() => { setChip(c); play("chip", { pitch: 0.85 + CHIPS.indexOf(c) * 0.08 }); }}>
                <span>{short(c)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rw-bet-row">
          <span className="small">Total bet <strong className="gold">{fmt(total)}</strong>{shownBets.length ? <span className="micro muted"> · {shownBets.length} spot{shownBets.length === 1 ? "" : "s"}</span> : null}</span>
          <span className="rw-bet-btns">
            <button type="button" className="btn btn-sm" onClick={undo} disabled={spinning || !placed.length}>Undo</button>
            <button type="button" className="btn btn-sm" onClick={clear} disabled={spinning || !placed.length}>Clear</button>
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={spin} disabled={!signedIn || spinning || !bets.length}>
          {spinning ? "No more bets…" : !bets.length ? "Place a chip" : settled ? `Spin again · ${fmt(total)}` : `Spin · ${fmt(total)}`}
        </button>
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Tap the table to place the chip you picked. Single zero. Numbers pay 35 to 1, dozens and columns 2 to 1, colours and halves 1 to 1. Your chips stay on the table for the next spin.</p>
      </div>
    </div>
  );
}
