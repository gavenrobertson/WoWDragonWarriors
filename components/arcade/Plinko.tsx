"use client";
// Plinko: an arcane orb drops through a tower of gold pegs. The orb appears in the spout the moment you
// click, falls as soon as the server has decided its path, hops peg to peg on a parabola (squash on each
// hit, the peg flashes and ticks a little higher each row) and lands in a slot that lights up.
// Several orbs can be in flight at once. Per-frame motion is written straight to the SVG in one rAF loop.
import { useCallback, useEffect, useRef, useState } from "react";
import { plinkoDrop } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play, unlockAudio } from "./sfx";

const W = 400;
const FALL = 230; // spout to the first peg, ms
const MIN_CHARGE = 110; // the orb glows in the spout at least this long

type Res = { path: number[]; slot: number; mult: number; won: number; balance: number; seq: number };
type Ball = {
  id: number; bet: number; born: number; fallAt: number | null; res: Res | null;
  hops: number[]; ends: number[]; lastSeg: number; trail: [number, number, number][];
};
type Pop = { k: number; slot: number; mult: number };

// heat tier of a multiplier: cold violet below 1×, gold, orange, red, fel-magenta at the edges
const tier = (m: number) => (m >= 50 ? 6 : m >= 15 ? 5 : m >= 5 ? 4 : m >= 2 ? 3 : m >= 1 ? 2 : m >= 0.5 ? 1 : 0);
const HEAT: [string, string, string][] = [ // top, bottom, text
  ["#3d2d5c", "#1c1330", "#a99bc9"], ["#5a4380", "#2b1d45", "#d6c8f5"], ["#e2b54a", "#8a5d12", "#1a1206"],
  ["#ffd65a", "#c98a00", "#1a1206"], ["#ffaa4a", "#c4560e", "#1a0d04"], ["#ff6a48", "#a8200e", "#fff1e6"], ["#ff5fd0", "#8a1a9a", "#fff"],
];
const label = (m: number) => (m >= 100 ? `${Math.round(m)}` : m >= 10 ? `${Math.round(m * 10) / 10}` : m < 1 ? `${m}`.replace(/^0/, "") : `${m}`);
const chipTone = (m: number): Chip["tone"] => (m >= 5 ? "big" : m > 1 ? "win" : m === 1 ? "neutral" : "lose");

export function Plinko({ tables }: { tables: Record<string, number[]> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [ids, setIds] = useState<number[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const table = tables[`${rows}-${risk}`];
  const s = W / (rows + 2), H = s * (rows + 2.2);
  const pegR = Math.max(2.6, s * 0.105), ballR = Math.max(4.2, s * 0.2);
  const spoutY = s * 0.32, slotTop = s * (rows + 0.95);
  const pegY = (r: number) => s * (r + 1);

  const balls = useRef<Map<number, Ball>>(new Map());
  const ballEls = useRef<Map<number, SVGGElement>>(new Map());
  const trailEls = useRef<Map<number, SVGPolylineElement>>(new Map());
  const pegEls = useRef<Map<string, SVGCircleElement>>(new Map());
  const slotEls = useRef<Map<number, SVGGElement>>(new Map());
  const boardEl = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const seq = useRef(0), applied = useRef(0), idc = useRef(0);
  const geo = useRef({ s, rows, pegR, ballR, spoutY, slotTop });
  geo.current = { s, rows, pegR, ballR, spoutY, slotTop };

  const land = useCallback((b: Ball) => {
    const r = b.res!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (r.seq > applied.current) { applied.current = r.seq; setBalance(r.balance); }
    flash(r.won - b.bet);
    setLast(r.mult);
    setChips((c) => [{ k: b.id, label: `${label(r.mult)}×`, tone: chipTone(r.mult) }, ...c].slice(0, 14));
    setPops((p) => [...p.slice(-5), { k: b.id, slot: r.slot, mult: r.mult }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.k !== b.id)), 950);
    play("thud", { pitch: 1.4, vol: 0.5 });
    if (!reduced) {
      slotEls.current.get(r.slot)?.animate(
        [{ transform: "translateY(0)" }, { transform: `translateY(${geo.current.s * 0.16}px)`, offset: 0.3 }, { transform: "translateY(0)" }],
        { duration: 420, easing: "cubic-bezier(.2,1.5,.4,1)" });
      if (r.mult >= 2 && boardEl.current) {
        const a = Math.min(5, 1.2 + 2.4 * Math.log10(r.mult));
        boardEl.current.animate([{ transform: "none" }, { transform: `translate(${a}px, ${-a * 0.6}px)` }, { transform: `translate(${-a}px, ${a * 0.5}px)` },
          { transform: `translate(${a * 0.5}px, 0)` }, { transform: "none" }], { duration: 200 + Math.log10(r.mult) * 80, easing: "ease-out" });
      }
    }
    const lit = slotEls.current.get(r.slot)?.querySelector(".pk-lit") as SVGRectElement | null;
    lit?.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }], { duration: reduced ? 600 : 900, easing: "ease-out" });
    celebrate(r.mult >= 1 ? { mult: r.mult, won: r.won } : { mult: 0, won: 0 });
  }, [flash, setBalance]);

  // a peg hit: flash its halo, tick with a pitch that climbs down the tower
  const strike = useCallback((row: number, path: number[]) => {
    let o = 0; for (let k = 0; k < row; k++) o += path[k] ? 0.5 : -0.5;
    const j = o + (row + 2) / 2;
    const halo = pegEls.current.get(`${row}-${j}`);
    halo?.animate([{ opacity: 1, transform: "scale(.7)" }, { opacity: 0, transform: "scale(1.9)" }], { duration: 260, easing: "cubic-bezier(.15,.8,.25,1)" });
    const rr = geo.current.rows;
    play("peg", { pitch: 0.8 + (row / Math.max(1, rr - 1)) * 0.75, vol: 0.85 });
    if (row === 0) buzz("tick");
  }, []);
  const loop = useCallback(() => {
    const now = performance.now();
    const g = geo.current, cx = W / 2;
    const done: Ball[] = [];
    for (const b of balls.current.values()) {
      const el = ballEls.current.get(b.id);
      if (!el) continue;
      let x = cx, y = g.spoutY, sx = 1, sy = 1;
      if (b.fallAt === null && b.res && now - b.born >= MIN_CHARGE) b.fallAt = now;
      if (b.fallAt === null) {
        // charging in the spout: a gentle pulse
        const k = (now - b.born) / 1000;
        sx = sy = Math.min(1, 0.3 + k * 6) * (1 + Math.sin(k * 18) * 0.06);
      } else {
        const e = now - b.fallAt, path = b.res!.path;
        let seg = b.ends.findIndex((t) => e < t);
        if (seg === -1) { done.push(b); continue; }
        const xAt = (i: number) => { let o = 0; for (let k = 0; k < i; k++) o += path[k] ? 0.5 : -0.5; return cx + o * g.s; };
        // where the orb sits when it touches the peg in row i (or rests in its slot)
        const yAt = (i: number) => (i >= g.rows ? g.slotTop + g.s * 0.28 : g.s * (i + 1) - g.pegR - g.ballR * 0.92);
        if (seg === 0) {
          const f = e / FALL;
          y = g.spoutY + (yAt(0) - g.spoutY) * f * f;
          sy = 1 + f * 0.12; sx = 1 - f * 0.08;
        } else {
          // entering hop `seg` means the orb just struck the peg in row seg-1
          if (seg > b.lastSeg) {
            for (let r = Math.max(1, b.lastSeg + 1); r <= seg; r++) strike(r - 1, path);
            b.lastSeg = seg;
          }
          const f = (e - b.ends[seg - 1]) / b.hops[seg];
          const x0 = xAt(seg - 1), x1 = xAt(seg), y0 = yAt(seg - 1), y1 = yAt(seg), a = g.s * 0.9;
          x = x0 + (x1 - x0) * (1 - Math.pow(1 - f, 1.6));
          y = y0 - a * f + (y1 - y0 + a) * f * f;
          const q = Math.max(0, 1 - f / 0.22); // squash just after the hit
          sy = 1 - 0.26 * q; sx = 1 + 0.2 * q;
        }
      }
      el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
      b.trail.push([x, y, now]); while (b.trail.length > 2 && now - b.trail[0][2] > 75) b.trail.shift();
      trailEls.current.get(b.id)?.setAttribute("points", b.fallAt === null ? "" : b.trail.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
    }
    for (const b of done) { balls.current.delete(b.id); land(b); }
    if (done.length) setIds((v) => v.filter((id) => !done.some((b) => b.id === id)));
    raf.current = balls.current.size ? requestAnimationFrame(loop) : 0;
  }, [land, strike]);


  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const kick = () => { if (!raf.current) raf.current = requestAnimationFrame(loop); };

  const drop = async () => {
    if (!signedIn) return;
    unlockAudio();
    setErr(null);
    const id = ++idc.current, my = ++seq.current, rws = rows;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // hop times: ~178ms, a few ms quicker each row, with a little jitter (randomness lives in the handler)
    const hops = [FALL, ...Array.from({ length: rws }, (_, i) => Math.max(118, 178 - i * 3.4) + (Math.random() - 0.5) * 16)];
    const ends: number[] = []; hops.reduce((acc, d) => { ends.push(acc + d); return acc + d; }, 0);
    const b: Ball = { id, bet, born: performance.now(), fallAt: null, res: null, hops, ends, lastSeg: 0, trail: [] };
    if (!reduced) { balls.current.set(id, b); setIds((v) => [...v, id]); play("whoosh", { vol: 0.35 }); kick(); }
    else play("click");
    const r = await plinkoDrop({ bet, rows: rws, risk });
    if (!r.ok) {
      balls.current.delete(id); setIds((v) => v.filter((x) => x !== id));
      play("error"); setErr(r.error); return;
    }
    b.res = { path: r.path, slot: r.slot, mult: r.mult, won: r.won, balance: r.balance, seq: my };
    if (reduced) land(b);
  };

  const inFlight = ids.length > 0;
  const top = Math.max(...table);
  const cx = W / 2;
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="arcane" label="Plinko" className="pk-machine" hud={<>
          <Readout label="Risk">{risk[0].toUpperCase() + risk.slice(1)} · {rows}</Readout>
          <Readout label="Edges pay" tone="gold">{label(top)}×</Readout>
          <Readout label="Last" tone={last === null ? undefined : last > 1 ? "win" : last < 1 ? "lose" : undefined}>{last === null ? "—" : `${label(last)}×`}</Readout>
          <ResultStrip items={chips} label="Recent drops" />
        </>}>
          <div className="pk-board" ref={boardEl}>
            <svg viewBox={`0 0 ${W} ${H}`} className="pk-svg" role="img" aria-label={`Plinko board, ${rows} rows, ${risk} risk`}>
              <defs>
                <radialGradient id="pkPeg" cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#fff8d6" /><stop offset=".45" stopColor="#e9b93e" /><stop offset="1" stopColor="#6b4510" /></radialGradient>
                <radialGradient id="pkHalo"><stop offset="0" stopColor="#fff3b0" stopOpacity="1" /><stop offset=".45" stopColor="#ffd100" stopOpacity=".7" /><stop offset="1" stopColor="#ffd100" stopOpacity="0" /></radialGradient>
                <radialGradient id="pkOrb" cx=".38" cy=".34" r=".7"><stop offset="0" stopColor="#ffffff" /><stop offset=".35" stopColor="#e8d8ff" /><stop offset=".75" stopColor="#a777ff" /><stop offset="1" stopColor="#5a26c4" /></radialGradient>
                <radialGradient id="pkOrbGlow"><stop offset="0" stopColor="#c9a6ff" stopOpacity=".75" /><stop offset="1" stopColor="#9B5DFF" stopOpacity="0" /></radialGradient>
                <radialGradient id="pkSpout" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#d9c2ff" stopOpacity=".55" /><stop offset="1" stopColor="#9B5DFF" stopOpacity="0" /></radialGradient>
                <linearGradient id="pkTower" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9B5DFF" stopOpacity=".16" /><stop offset="1" stopColor="#9B5DFF" stopOpacity=".02" /></linearGradient>
                {HEAT.map(([a, b2], i) => <linearGradient key={i} id={`pkH${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b2} /></linearGradient>)}
              </defs>
              {/* the tower's glow behind the pegs */}
              <path d={`M${cx - s * 0.9} ${s * 0.55} L${cx + s * 0.9} ${s * 0.55} L${cx + (rows / 2 + 0.8) * s} ${pegY(rows - 1) + s * 0.5} L${cx - (rows / 2 + 0.8) * s} ${pegY(rows - 1) + s * 0.5} Z`} fill="url(#pkTower)" />
              <ellipse cx={cx} cy={spoutY} rx={s * 0.75} ry={s * 0.42} fill="url(#pkSpout)" className="pk-spout" />
              <path d={`M${cx - s * 0.55} ${spoutY - s * 0.3} q${s * 0.55} ${s * 0.36} ${s * 1.1} 0`} fill="none" stroke="#c9a253" strokeWidth={Math.max(1.4, s * 0.06)} strokeLinecap="round" opacity=".85" />
              {Array.from({ length: rows }, (_, r) => Array.from({ length: r + 3 }, (_, j) => {
                const x = cx + (j - (r + 2) / 2) * s, y = pegY(r);
                return (
                  <g key={`${rows}-${r}-${j}`}>
                    <circle ref={(el) => { const k = `${r}-${j}`; if (el) pegEls.current.set(k, el); else pegEls.current.delete(k); }}
                      className="pk-halo" cx={x} cy={y} r={pegR * 3.2} fill="url(#pkHalo)" opacity="0" />
                    <circle cx={x} cy={y + pegR * 0.35} r={pegR} fill="#000" opacity=".45" />
                    <circle cx={x} cy={y} r={pegR} fill="url(#pkPeg)" />
                  </g>
                );
              }))}
              {table.map((m, k) => {
                const x = cx + (k - rows / 2) * s, w = s * 0.9, h = s * 0.92, t = tier(m), txt = label(m);
                const fs = Math.min(s * 0.4, 12.5, (w * 0.9) / (txt.length * 0.56));
                return (
                  <g key={`${rows}-${risk}-${k}`} className={`pk-slot t${t}`} ref={(el) => { if (el) slotEls.current.set(k, el); else slotEls.current.delete(k); }}>
                    <rect x={x - w / 2} y={slotTop} width={w} height={h} rx={Math.min(5, s * 0.16)} fill={`url(#pkH${t})`} stroke="#000" strokeWidth=".8" />
                    <rect x={x - w / 2 + 1.2} y={slotTop + 1.2} width={w - 2.4} height={h * 0.32} rx={Math.min(4, s * 0.12)} fill="#fff" opacity=".16" />
                    <rect className="pk-lit" x={x - w / 2 - 1.5} y={slotTop - 1.5} width={w + 3} height={h + 3} rx={Math.min(6, s * 0.18)} fill="#fff6c8" opacity="0" />
                    <text x={x} y={slotTop + h * 0.5 + fs * 0.36} textAnchor="middle" fontSize={fs} fill={HEAT[t][2]} fontWeight="800" className="pk-mult">{txt}</text>
                  </g>
                );
              })}
              {ids.map((id) => (
                <g key={id}>
                  <polyline ref={(el) => { if (el) trailEls.current.set(id, el); else trailEls.current.delete(id); }} className="pk-trail" fill="none" stroke="#b98cff" strokeWidth={ballR * 1.3} strokeLinecap="round" strokeLinejoin="round" opacity=".28" />
                  <g ref={(el) => { if (el) ballEls.current.set(id, el); else ballEls.current.delete(id); }} transform={`translate(${cx} ${spoutY}) scale(.3)`}>
                    <circle r={ballR * 2.3} fill="url(#pkOrbGlow)" />
                    <circle r={ballR} fill="url(#pkOrb)" stroke="#2a0f5c" strokeWidth=".7" />
                    <circle cx={-ballR * 0.32} cy={-ballR * 0.36} r={ballR * 0.26} fill="#fff" opacity=".85" />
                  </g>
                </g>
              ))}
              {pops.map((p) => {
                const x = cx + (p.slot - rows / 2) * s;
                return <text key={p.k} x={x} y={slotTop - s * 0.25} textAnchor="middle" className={`pk-pop t${tier(p.mult)}`} fontSize={Math.max(11, s * 0.5)}>{label(p.mult)}×</text>;
              })}
            </svg>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} />
        <label className="field">Risk
          <div className="seg">{(["low", "medium", "high"] as const).map((k) => <button key={k} type="button" aria-pressed={risk === k} disabled={inFlight} onClick={() => { setRisk(k); play("click"); }}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </label>
        <label className="field">Rows
          <div className="seg">{[8, 12, 16].map((n) => <button key={n} type="button" aria-pressed={rows === n} disabled={inFlight} onClick={() => { setRows(n); play("click"); }}>{n}</button>)}</div>
        </label>
        <button type="button" className="btn btn-primary btn-lg pk-drop" onClick={drop} disabled={!signedIn}>Drop orb</button>
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Edges pay up to <strong className="gold">{fmt(top)}×</strong>. Drop as many orbs as you like; risk and rows lock while orbs are falling.</p>
      </div>
    </div>
  );
}
