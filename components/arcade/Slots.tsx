"use client";
// Dragon's Hoard: three reels in a gold-trimmed hoard cabinet. The reels are canvases drawn on a cylinder
// (symbols squash toward the top and bottom), blur along their path at speed, stop left to right with an
// overshoot dip and a rising clunk, and tease the last reel when two dragons are already showing.
// The server decides the symbols; the reels only plan a landing on them.
import { useCallback, useEffect, useRef, useState } from "react";
import { slotsSpin } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play } from "./sfx";

type Sym = { id: string; icon: string; pay3: number };
type Reel = {
  band: number[]; pos: number; v: number; vt: number; t0: number;
  phase: "idle" | "spin" | "stop" | "settle";
  plan: { at: number; sym: number | null } | null;
  stop: { t0: number; from: number; dist: number; dur: number; k: number } | null;
};
type Outcome = { ids: string[]; mult: number; won: number; win: boolean[] };

const BAND = 24;          // symbols on each reel band
const VMAX = 22;          // full spin speed, cells per second
const OVER = 0.26;        // how far a reel runs past its stop before dipping back
const ARC = 0.6;          // radians of cylinder per cell
const NAME: Record<string, string> = { dragon: "Onyxias", gem: "Gems", sword: "Blades", potion: "Potions", rune: "Runes", coin: "Coins" };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const easeOutBack = (u: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const spring = (u: number) => (u >= 1 ? 1 : 1 - Math.exp(-6 * u) * Math.cos(9 * u)); // overshooting pop

function winnersOf(ids: string[]): boolean[] {
  if (ids[0] === ids[1] && ids[1] === ids[2]) return [true, true, true];
  return ids.map((x) => x === "dragon" || ids.filter((y) => y === x).length >= 2);
}
function describe(ids: string[]) {
  if (ids[0] === ids[1] && ids[1] === ids[2]) return `Three ${NAME[ids[0]] ?? ids[0]}`;
  const dragons = ids.filter((x) => x === "dragon").length;
  const pair = ids.some((x, i) => x !== "dragon" && ids.indexOf(x) !== i);
  if (dragons === 2) return "Two dragons";
  if (dragons === 1) return pair ? "Dragon and a pair" : "A dragon";
  return pair ? "A pair" : "";
}

/** One symbol tile (gold frame, icon, gloss) pre-rendered at device size, so blur copies are cheap to draw. */
function makeSprite(img: HTMLImageElement | undefined, size: number, dragon: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const pad = size * 0.07, r = size * 0.16;
  g.beginPath(); g.roundRect(pad, pad, size - 2 * pad, size - 2 * pad, r);
  const fr = g.createLinearGradient(0, pad, 0, size - pad);
  if (dragon) { fr.addColorStop(0, "#ffd0b8"); fr.addColorStop(0.45, "#c2341f"); fr.addColorStop(1, "#3c0805"); }
  else { fr.addColorStop(0, "#fff1b8"); fr.addColorStop(0.45, "#cf9f35"); fr.addColorStop(1, "#5a3a0c"); }
  g.fillStyle = fr; g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = size * 0.06; g.shadowOffsetY = size * 0.03; g.fill();
  g.shadowColor = "transparent"; g.lineWidth = Math.max(1, size * 0.018); g.strokeStyle = "#140c02"; g.stroke();
  const ip = pad + size * 0.075, w = size - 2 * ip;
  g.save(); g.beginPath(); g.roundRect(ip, ip, w, w, r * 0.55); g.clip();
  if (img && img.complete && img.naturalWidth) g.drawImage(img, ip, ip, w, w);
  else { g.fillStyle = dragon ? "#5a1410" : "#2a1d0a"; g.fillRect(ip, ip, w, w); }
  const gl = g.createLinearGradient(0, ip, 0, ip + w * 0.55);
  gl.addColorStop(0, "rgba(255,255,255,.32)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gl; g.beginPath(); g.ellipse(size / 2, ip, w * 0.62, w * 0.42, 0, 0, Math.PI); g.fill();
  g.restore();
  g.beginPath(); g.roundRect(ip, ip, w, w, r * 0.55); g.lineWidth = Math.max(1, size * 0.02); g.strokeStyle = "rgba(0,0,0,.85)"; g.stroke();
  return c;
}

export function Slots({ symbols, pair, one, two, rtp }: { symbols: Sym[]; pair: number; one: number; two: number; rtp: number }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tease, setTease] = useState(false);
  const [pulls, setPulls] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);

  const cab = useRef<HTMLDivElement>(null);
  const cvs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const reels = useRef<Reel[]>([]);
  const sprites = useRef<HTMLCanvasElement[]>([]);
  const imgs = useRef<HTMLImageElement[]>([]);
  const geo = useRef({ cell: 96, dpr: 1 });
  const show = useRef<{ t0: number; win: boolean[]; any: boolean } | null>(null);
  const raf = useRef(0);
  const lastT = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<{ ids: string[]; mult: number; won: number; balance: number; tease: boolean } | null>(null);
  const loopRef = useRef<(t: number) => void>(() => {});

  const rebuildSprites = useCallback(() => {
    const size = Math.round(geo.current.cell * 0.84 * geo.current.dpr);
    sprites.current = symbols.map((s, i) => makeSprite(imgs.current[i], size, s.id === "dragon"));
  }, [symbols]);

  // ---------------------------------------------------------------- drawing
  const draw = useCallback((now: number) => {
    const { cell, dpr } = geo.current;
    const H = cell * 3, R = cell / Math.sin(ARC), cy = H / 2;
    const sh = show.current, st = sh ? now - sh.t0 : 0;
    reels.current.forEach((r, i) => {
      const c = cvs.current[i]; if (!c) return;
      const g = c.getContext("2d"); if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the parchment band, darker toward the cylinder's edges
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#3b2709"); bg.addColorStop(0.22, "#c8a463"); bg.addColorStop(0.5, "#f6e6bd"); bg.addColorStop(0.78, "#c8a463"); bg.addColorStop(1, "#3b2709");
      g.fillStyle = bg; g.fillRect(0, 0, cell, H);
      g.fillStyle = "rgba(120,80,20,.10)";
      for (let x = 4; x < cell; x += 7) g.fillRect(x, 0, 1, H); // paper grain
      const speed = Math.abs(r.v), blur = Math.min(0.9, speed * 0.04), copies = blur > 0.05 ? Math.min(14, 3 + Math.round(blur * 12)) : 1;
      const base = Math.floor(r.pos);
      for (let j = base - 3; j <= base + 3; j++) {
        const sym = r.band[mod(j, BAND)], sp = sprites.current[sym]; if (!sp) continue;
        const winRow = j === Math.round(r.pos) && r.phase === "idle" && sh;
        const isWin = !!(winRow && sh!.win[i]);
        let scale = 1;
        if (isWin) {
          const k = Math.min(1, st / 420);
          scale = st < 420 ? 1 + 0.15 * spring(k) : 1.1 + 0.04 * Math.sin((st - 420) / 150);
          if (st > 2600) scale = 1.08;
        }
        for (let n = 0; n < copies; n++) {
          const d = (r.pos - j) - (copies > 1 ? blur * (n / (copies - 1)) * Math.sign(r.v || 1) : 0);
          const th = d * ARC; if (Math.abs(th) > 1.45) continue;
          const y = cy + R * Math.sin(th), sy = Math.cos(th), w = cell * 0.84 * scale, h = w * sy;
          g.globalAlpha = copies > 1 ? Math.min(0.6, 2.4 / copies) : 1;
          if (isWin) { g.shadowColor = "rgba(255,200,40,.95)"; g.shadowBlur = 14 + 8 * Math.sin(st / 150); }
          g.drawImage(sp, cell / 2 - w / 2, y - h / 2, w, h);
          g.shadowBlur = 0; g.shadowColor = "transparent";
        }
        g.globalAlpha = 1;
      }
      // cylinder shading and a specular stripe
      const sh2 = g.createLinearGradient(0, 0, 0, H);
      sh2.addColorStop(0, "rgba(10,5,0,.92)"); sh2.addColorStop(0.2, "rgba(10,5,0,.25)"); sh2.addColorStop(0.36, "rgba(255,255,255,.10)");
      sh2.addColorStop(0.42, "rgba(255,255,255,0)"); sh2.addColorStop(0.8, "rgba(10,5,0,.25)"); sh2.addColorStop(1, "rgba(10,5,0,.92)");
      g.fillStyle = sh2; g.fillRect(0, 0, cell, H);
      const side = g.createLinearGradient(0, 0, cell, 0);
      side.addColorStop(0, "rgba(0,0,0,.35)"); side.addColorStop(0.12, "rgba(0,0,0,0)"); side.addColorStop(0.88, "rgba(0,0,0,0)"); side.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = side; g.fillRect(0, 0, cell, H);
      // losers dim quietly once the result is in
      if (sh && r.phase === "idle" && !sh.win[i]) { g.fillStyle = `rgba(20,10,0,${Math.min(0.38, st / 900)})`; g.fillRect(0, 0, cell, H); }
    });
  }, []);

  const finish = useCallback((now: number) => {
    const p = pending.current; if (!p) return;
    pending.current = null;
    const win = p.won > 0 ? winnersOf(p.ids) : [false, false, false];
    show.current = { t0: now, win, any: p.won > 0 };
    setOutcome({ ids: p.ids, mult: p.mult, won: p.won, win });
    setTease(false);
    const settle = () => {
      setSpinning(false); setBalance(p.balance); flash(p.won - bet); setLastWin(p.won);
      celebrate({ mult: p.won > 0 ? p.won / bet : 0, won: p.won });
      setChips((c) => [{ k: now, label: p.won ? `${p.mult}×` : "—", tone: (p.mult >= 10 ? "big" : p.mult > 1 ? "win" : p.won ? "neutral" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    };
    if (p.won > 0) { play("reveal", { pitch: 1.2 }); timers.current.push(setTimeout(settle, 460)); } else settle();
  }, [bet, flash, setBalance]);

  const kick = useCallback(() => {
    if (!raf.current) { lastT.current = performance.now(); raf.current = requestAnimationFrame((t) => loopRef.current(t)); }
  }, []);

  // ---------------------------------------------------------------- simulation
  useEffect(() => {
    loopRef.current = (now: number) => {
      const dt = Math.min(0.05, (now - lastT.current) / 1000); lastT.current = now;
      let moving = false;
      reels.current.forEach((r, i) => {
        const before = Math.floor(r.pos);
        if (r.phase === "spin") {
          if (now - r.t0 < 90) r.v = -3.2; // a little kick back before the reel lets go
          else r.v += (r.vt - r.v) * Math.min(1, dt * 5);
          r.pos += r.v * dt;
          if (r.plan && now >= r.plan.at) {
            const v0 = Math.max(7, r.v), want = 0.5 + i * 0.05;
            const k = Math.ceil(r.pos + (v0 * want) / 2 - OVER);
            const dist = k + OVER - r.pos;
            if (r.plan.sym !== null) r.band[mod(k, BAND)] = r.plan.sym;
            r.stop = { t0: now, from: r.pos, dist, dur: (2 * dist) / v0, k };
            r.phase = "stop"; r.plan = null;
          }
        } else if (r.phase === "stop" && r.stop) {
          const u = Math.min(1, (now - r.stop.t0) / 1000 / r.stop.dur);
          r.pos = r.stop.from + r.stop.dist * (1 - (1 - u) * (1 - u));
          r.v = ((2 * r.stop.dist) / r.stop.dur) * (1 - u);
          if (u >= 1) {
            r.phase = "settle"; r.stop.t0 = now; r.v = 0;
            play("stop", { pitch: 1 + i * 0.14 }); buzz("tap");
          }
        } else if (r.phase === "settle" && r.stop) {
          const u = Math.min(1, (now - r.stop.t0) / 210);
          r.pos = r.stop.k + OVER * (1 - easeOutBack(u));
          if (u >= 1) {
            r.pos = r.stop.k; r.phase = "idle"; r.stop = null;
            const p = pending.current;
            if (i === 1 && p?.tease && reels.current[2].phase === "spin") { reels.current[2].vt = 8.5; setTease(true); play("whoosh"); }
            if (reels.current.every((x) => x.phase === "idle")) finish(now);
          }
        }
        if ((r.phase === "stop" || (r.phase === "spin" && r.vt < VMAX)) && Math.floor(r.pos) !== before) play("tick", { pitch: 0.7 + i * 0.15, vol: 0.6 });
        if (r.phase !== "idle") moving = true;
      });
      draw(now);
      const sh = show.current;
      if (moving || (sh && now - sh.t0 < (sh.any ? 2700 : 950))) raf.current = requestAnimationFrame((t) => loopRef.current(t));
      else { raf.current = 0; draw(now); }
    };
  }, [draw, finish]);

  // ---------------------------------------------------------------- setup: bands, icons, sizing
  useEffect(() => {
    reels.current = [0, 1, 2].map(() => ({
      band: Array.from({ length: BAND }, () => Math.floor(Math.random() * symbols.length)),
      pos: Math.floor(Math.random() * BAND), v: 0, vt: VMAX, t0: 0, phase: "idle", plan: null, stop: null,
    }));
    imgs.current = symbols.map((s) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { rebuildSprites(); draw(performance.now()); };
      im.src = wowIconUrl(s.icon);
      return im;
    });
    const el = cab.current; if (!el) return;
    const size = () => {
      const w = el.clientWidth;
      const lever = w < 420 ? 40 : 56;
      const cell = Math.max(62, Math.min(132, Math.floor((w - lever - 52) / 3)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      geo.current = { cell, dpr };
      el.style.setProperty("--cell", `${cell}px`);
      cvs.current.forEach((c) => { if (c) { c.width = Math.round(cell * dpr); c.height = Math.round(cell * 3 * dpr); } });
      rebuildSprites(); draw(performance.now());
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    const tm = timers.current;
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0; tm.forEach(clearTimeout); };
  }, [symbols, rebuildSprites, draw]);

  // ---------------------------------------------------------------- a spin
  const spin = async () => {
    if (spinning || !reels.current.length) return;
    setSpinning(true); setErr(null); setOutcome(null); setTease(false); setPulls((n) => n + 1);
    show.current = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    play("spin"); buzz("tap");
    const t0 = performance.now();
    if (!reduced) {
      reels.current.forEach((r, i) => { r.phase = "spin"; r.t0 = t0 + i * 70; r.vt = VMAX; r.v = 0; r.plan = null; });
      kick();
    }
    const r = await slotsSpin({ bet });
    if (!r.ok) {
      setErr(r.error); play("error");
      reels.current.forEach((x, i) => { if (x.phase === "spin") x.plan = { at: performance.now() + i * 120, sym: null }; });
      pending.current = null;
      timers.current.push(setTimeout(() => setSpinning(false), reduced ? 0 : 900));
      return;
    }
    const ids = r.reels.map((n) => symbols[n].id);
    const teaseIt = ids[0] === "dragon" && ids[1] === "dragon";
    const mildTease = !teaseIt && ids[0] === ids[1];
    pending.current = { ids, mult: r.mult, won: r.won, balance: r.balance, tease: teaseIt };
    if (reduced) {
      reels.current.forEach((x, i) => { x.pos = mod(Math.round(x.pos), BAND); x.band[mod(x.pos, BAND)] = r.reels[i]; x.phase = "idle"; x.v = 0; });
      play("stop"); finish(performance.now()); draw(performance.now());
      return;
    }
    const first = Math.max(performance.now() + 120, t0 + 880);
    reels.current.forEach((x, i) => {
      const extra = i === 2 ? (teaseIt ? 1500 : mildTease ? 520 : 0) : 0;
      x.plan = { at: first + i * 420 + extra, sym: r.reels[i] }; // with two dragons up, reel 3 crawls once reel 2 lands
    });
  };

  const o = outcome;
  const verdict = o ? (o.won > 0 ? `${describe(o.ids)} · ${o.mult}×` : "No luck this spin") : spinning ? "Good luck…" : "Pull the lever or press Spin";
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="hoard" label="Dragon's Hoard" hud={<>
          <Readout label="Bet" tone="gold">{fmt(bet)}</Readout>
          <Readout label="Last win" tone={lastWin ? "win" : undefined}><CountUp value={lastWin} /></Readout>
          <ResultStrip items={chips} label="Recent spins" />
        </>}>
          <div ref={cab} className={`sl-cab${spinning ? " spinning" : ""}${o ? (o.won > 0 ? (o.mult >= 10 ? " won big" : " won") : " lost") : ""}`}>
            <div className="sl-marquee" aria-hidden="true">
              <span className="sl-bulbs top" /><span className="sl-bulbs bottom" />
              <span className="sl-title">Dragon&apos;s Hoard</span>
              <span className="sl-sub">Dragons pay anywhere</span>
            </div>
            <div className="sl-body">
              <div className="sl-window">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`sl-reel${tease && i === 2 ? " tease" : ""}${o && o.win[i] ? " hit" : ""}`}>
                    <canvas ref={(el) => { cvs.current[i] = el; }} aria-hidden="true" />
                  </div>
                ))}
                <span className="sl-pay-mark l" aria-hidden="true" /><span className="sl-pay-mark r" aria-hidden="true" />
                <span className={`sl-winline${o && o.won > 0 ? " on" : ""}`} aria-hidden="true" />
              </div>
              <button type="button" className="sl-lever" onClick={spin} disabled={!signedIn || spinning} aria-label="Pull the lever to spin">
                <span className="sl-lever-slot" aria-hidden="true" />
                <span key={pulls} className={`sl-lever-rig${pulls ? " pull" : ""}`} aria-hidden="true"><span className="sl-lever-rod" /><span className="sl-lever-knob" /></span>
                <span className="sl-lever-base" aria-hidden="true" />
              </button>
            </div>
            <div className={`sl-verdict${o ? (o.won > 0 ? " win" : " lose") : ""}`} role="status" aria-live="polite">
              {o && o.won > 0 ? <><strong>+{fmt(o.won)}</strong><span>{verdict}</span></> : <span>{verdict}</span>}
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={spinning} />
        <button type="button" className="btn btn-primary btn-lg" onClick={spin} disabled={!signedIn || spinning}>{spinning ? "Spinning…" : "Spin"}</button>
        {err && <p className="game-err" role="alert">{err}</p>}
        <div className="sl-pays" role="table" aria-label="Paytable">
          {symbols.map((s) => (
            <div key={s.id} role="row" className={`sl-pay${o && o.won > 0 && o.ids.every((x) => x === s.id) ? " lit" : ""}`}>
              <span role="cell" className="sl-pay-icons" aria-label={`Three ${NAME[s.id] ?? s.id}`}>
                {[0, 1, 2].map((k) => <img key={k} src={wowIconUrl(s.icon, 36)} alt="" width={22} height={22} />)}
              </span>
              <strong role="cell">{s.pay3}×</strong>
            </div>
          ))}
          <div role="row" className="sl-pay wide"><span role="cell">Any two dragons</span><strong role="cell">{two}×</strong></div>
          <div role="row" className="sl-pay wide"><span role="cell">One dragon</span><strong role="cell">{one}×</strong></div>
          <div role="row" className="sl-pay wide"><span role="cell">Any pair adds</span><strong role="cell">+{pair}×</strong></div>
        </div>
        <p className="micro muted">Pays back about {Math.round(rtp * 100)}% over time.</p>
      </div>
    </div>
  );
}
