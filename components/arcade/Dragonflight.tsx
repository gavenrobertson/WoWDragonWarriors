"use client";
// Dragonflight (crash): the multiplier climbs while the dragon rides the tip of a rising curve; cash out
// before it dives. The curve, dragon, readout, grid and clouds are written straight to the DOM from one rAF
// loop (no React render per frame); React state only changes on real events (launch, milestones, the end).
// After a cash-out the flight carries on as a ghost so you can see where the dragon would have dived.
import { useEffect, useRef, useState } from "react";
import { crashCashout, crashPoll, crashStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play, unlockAudio } from "./sfx";

const K = 0.00011; // same growth as the server: ~2× at 6.3s, ~10× at 21s
const multAt = (ms: number) => Math.floor(Math.exp(K * Math.max(0, ms)) * 100) / 100;
const msAt = (m: number) => Math.log(Math.max(1, m)) / K;
// plot box inside a 1000×1000 viewBox (stretched to the sky; strokes don't scale)
const PL = 50, PR = 860, PT = 150, PB = 900;
const C = 0.6; // log-ish height: ln(1 + (m-1)·C), keeps early growth visible without squashing big flights
const hgt = (m: number) => Math.log(1 + (m - 1) * C);
const LEVELS = [1.5, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000];
const MILESTONES = [2, 5, 10, 25, 50, 100];
type Phase = "idle" | "countdown" | "flying" | "won" | "lost";
type Result = { status: "won" | "lost"; point: number; at: number; won: number; k: number; bet: number; mx?: string; my?: string };
type Burst = { k: number; x: number; y: number; parts: { dx: number; dy: number; r: number; d: number; s: number }[] };

// teal at 1×, amber at 2×, red from 10×
const mix = (a: number[], b: number[], u: number) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, u))));
const TEAL = [63, 224, 197], AMBER = [255, 182, 39], RED = [255, 77, 46];
const colorAt = (m: number) => { const c = m < 2 ? mix(TEAL, AMBER, Math.log2(m)) : mix(AMBER, RED, Math.log(m / 2) / Math.log(5)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
const fx = (m: number) => `${m.toFixed(2)}×`;

export function Dragonflight() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [auto, setAuto] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [pop, setPop] = useState<{ m: number; k: number } | null>(null);
  const [near, setNear] = useState(false);
  const [ghost, setGhost] = useState<number | null>(null); // where the dragon dove after you cashed out
  const [best, setBest] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [autoAt, setAutoAt] = useState<number | null>(null);
  const [countMs, setCountMs] = useState(1200);

  const sky = useRef<HTMLDivElement>(null);
  const pathEl = useRef<SVGPathElement>(null);
  const glowEl = useRef<SVGPathElement>(null);
  const fillEl = useRef<SVGPathElement>(null);
  const dragonEl = useRef<HTMLDivElement>(null);
  const multEl = useRef<HTMLSpanElement>(null);
  const multWrap = useRef<HTMLDivElement>(null);
  const amtEl = useRef<HTMLSpanElement>(null);
  const potEl = useRef<HTMLSpanElement>(null);
  const autoLine = useRef<HTMLDivElement>(null);
  const clouds = useRef<HTMLDivElement>(null);
  const cashMark = useRef<HTMLDivElement>(null);
  const grid = useRef<(HTMLDivElement | null)[]>([]);
  const round = useRef<{ id: string; start: number; offset: number; auto: number | null; bet: number } | null>(null);
  const mode = useRef<{ kind: "fly" | "ghost" | "frozen"; point?: number }>({ kind: "fly" });
  const raf = useRef(0), pollT = useRef<ReturnType<typeof setInterval> | null>(null), polling = useRef(false);
  const fl = useRef({ cashAt: 0, lastMs: 0, mile: 1, beat: 0, nearTick: 0, launched: false, autoPolled: false, near: false, cloudX: 0, lastT: 0, w: 800, h: 400 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (f: () => void, ms: number) => { timers.current.push(setTimeout(f, ms)); };

  useEffect(() => {
    const el = sky.current; if (!el) return;
    const ro = new ResizeObserver(() => { fl.current.w = el.clientWidth; fl.current.h = el.clientHeight; });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); if (pollT.current) clearInterval(pollT.current); timers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => { if (phase === "idle" && potEl.current) potEl.current.textContent = fmt(bet); }, [bet, phase]);

  /** Draw the flight at `ms` since lift-off. */
  const draw = (ms: number, ghostly = false) => {
    const f = fl.current, r = round.current;
    const m = multAt(ms), mSmooth = Math.exp(K * Math.max(0, ms));
    const maxT = Math.max(9000, ms * 1.16);
    const maxH = Math.max(hgt(2.2), hgt(mSmooth) / 0.8);
    const X = (t: number) => PL + (t / maxT) * (PR - PL), Y = (mm: number) => PB - (hgt(mm) / maxH) * (PB - PT);
    let d = "";
    const n = 48;
    for (let i = 0; i <= n; i++) { const t = (ms * i) / n, mm = Math.exp(K * Math.max(0, t)); d += `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(mm).toFixed(1)}`; }
    const xe = X(Math.max(0, ms)), ye = Y(mSmooth);
    pathEl.current?.setAttribute("d", d);
    glowEl.current?.setAttribute("d", d);
    fillEl.current?.setAttribute("d", `${d}L${xe.toFixed(1)} ${PB}L${PL} ${PB}Z`);
    // the dragon rides the tip, nose along the curve
    if (dragonEl.current) {
      const tp = Math.max(0, ms - 500), xp = X(tp), yp = Y(Math.exp(K * tp));
      const ang = ms > 40 ? Math.atan2(((ye - yp) / 1000) * f.h, ((xe - xp) / 1000) * f.w) * 180 / Math.PI : -8;
      dragonEl.current.style.left = `${xe / 10}%`; dragonEl.current.style.top = `${ye / 10}%`;
      dragonEl.current.style.transform = `translate(-50%, -50%) rotate(${Math.max(-70, Math.min(10, ang)).toFixed(1)}deg)`;
    }
    if (cashMark.current && f.cashAt) {
      cashMark.current.style.left = `${X(msAt(f.cashAt)) / 10}%`; cashMark.current.style.top = `${Y(f.cashAt) / 10}%`;
    }
    const col = colorAt(Math.max(1, mSmooth));
    sky.current?.style.setProperty("--df-c", col);
    if (!ghostly) {
      if (multEl.current) multEl.current.textContent = fx(m);
      if (multWrap.current) multWrap.current.style.transform = `translateX(-50%) scale(${(1 + Math.min(0.55, Math.log10(Math.max(1, m)) * 0.42)).toFixed(3)})`;
      if (r) {
        const amt = fmt(Math.floor(r.bet * m));
        if (amtEl.current) amtEl.current.textContent = amt;
        if (potEl.current) potEl.current.textContent = amt;
      }
    }
    // grid: keep levels that fit and aren't crowded
    let lastTop = 1e9;
    LEVELS.forEach((lv, i) => {
      const g = grid.current[i]; if (!g) return;
      const top = Y(lv) / 10;
      const show = hgt(lv) < maxH * 0.98 && lastTop - top > 7;
      if (show) lastTop = top;
      g.style.top = `${top}%`; g.style.opacity = show ? "1" : "0";
    });
    if (autoLine.current && r?.auto) {
      const inRange = hgt(r.auto) < maxH * 1.02;
      autoLine.current.style.top = `${inRange ? Y(r.auto) / 10 : PT / 10 - 4}%`;
    }
    // clouds drift faster the higher the multiplier
    const now = performance.now(), dt = f.lastT ? Math.min(64, now - f.lastT) : 16;
    f.lastT = now;
    f.cloudX -= dt * (0.025 + 0.05 * Math.log(Math.max(1, mSmooth)));
    if (clouds.current) clouds.current.style.backgroundPosition = `${f.cloudX.toFixed(1)}px 0, ${(f.cloudX * 0.55).toFixed(1)}px 0`;
    return m;
  };

  const stopPolling = () => { if (pollT.current) clearInterval(pollT.current); pollT.current = null; };

  const loop = () => {
    const r = round.current; if (!r) return;
    const f = fl.current, md = mode.current;
    const ms = Date.now() + r.offset - r.start;
    if (md.kind === "frozen") return;
    if (ms < 0) { draw(0); raf.current = requestAnimationFrame(loop); return; }
    if (!f.launched) { f.launched = true; setPhase("flying"); play("launch"); buzz("tap"); }
    if (md.kind === "ghost") {
      const end = msAt(md.point!);
      if (ms >= end) { draw(end, true); dragonEl.current?.classList.add("flew"); play("whoosh", { vol: 0.4 }); setGhost(md.point!); return; }
      draw(ms, true);
      raf.current = requestAnimationFrame(loop); return;
    }
    const m = draw(ms);
    // heartbeat tick every ~5% of growth, pitch rising with the multiplier
    const beat = Math.floor(Math.log(m) * 20);
    if (beat > f.beat) { f.beat = beat; play("tick", { pitch: 1 + Math.log10(m) * 0.6, vol: 0.45 }); }
    const mile = MILESTONES.filter((x) => m >= x).pop() ?? 1;
    if (mile > f.mile) {
      f.mile = mile; setPop({ m: mile, k: performance.now() });
      play("gem", { pitch: ladder(MILESTONES.indexOf(mile) * 2) }); buzz("tick");
    }
    if (r.auto) {
      if (!f.near && m >= 1 + (r.auto - 1) * 0.82) { f.near = true; setNear(true); }
      if (f.near && m < r.auto && performance.now() - f.nearTick > 160) { f.nearTick = performance.now(); play("click", { pitch: 1 + (m / r.auto) * 0.5, vol: 0.6 }); }
      if (m >= r.auto && !f.autoPolled) { f.autoPolled = true; setNear(false); void poll(); }
    }
    raf.current = requestAnimationFrame(loop);
  };

  const finish = (status: string, point: number, at: number, won: number, balance: number) => {
    const r = round.current; if (!r || mode.current.kind !== "fly") return;
    stopPolling();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const k = performance.now();
    setBalance(balance); if (won) flash(won);
    if (status === "won") {
      setPhase("won"); setResult({ status: "won", point, at, won, k, bet: r.bet, mx: dragonEl.current?.style.left, my: dragonEl.current?.style.top });
      setBest((b) => Math.max(b, at));
      setChips((c) => [{ k, label: fx(at), tone: (at >= 10 ? "big" : "win") as Chip["tone"] }, ...c].slice(0, 14));
      if (multEl.current) multEl.current.textContent = fx(at);
      fl.current.cashAt = at;
      if (potEl.current) potEl.current.textContent = fmt(won);
      play("cashout"); buzz("win");
      if (!reduced && dragonEl.current) {
        const parts = Array.from({ length: 14 }, () => { const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, s = 40 + Math.random() * 70;
          return { dx: Math.cos(a) * s, dy: Math.sin(a) * s, r: Math.random() * 720 - 360, d: 600 + Math.random() * 400, s: 7 + Math.random() * 6 }; });
        const left = parseFloat(dragonEl.current.style.left) || 50, top = parseFloat(dragonEl.current.style.top) || 50;
        setBursts((b) => [...b, { k, x: left, y: top, parts }]);
        later(() => setBursts((b) => b.filter((x) => x.k !== k)), 1100);
      }
      later(() => celebrate({ mult: won / r.bet, won }), 260);
      if (point > at && !reduced) { mode.current = { kind: "ghost", point }; cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(loop); }
      else { mode.current = { kind: "frozen" }; cancelAnimationFrame(raf.current); setGhost(point); }
    } else {
      mode.current = { kind: "frozen" };
      cancelAnimationFrame(raf.current);
      draw(msAt(point)); // trim any overshoot back to the real dive point
      if (dragonEl.current) dragonEl.current.style.transform = "translate(-50%, -50%)";
      if (multEl.current) multEl.current.textContent = fx(point);
      if (potEl.current) potEl.current.textContent = "0";
      setPhase("lost"); setResult({ status: "lost", point, at: point, won: 0, k, bet: r.bet });
      setChips((c) => [{ k, label: fx(point), tone: "lose" as Chip["tone"] }, ...c].slice(0, 14));
      play("crash"); buzz("big");
      if (!reduced) sky.current?.animate([{ transform: "none" }, { transform: "translate(4px,-3px)" }, { transform: "translate(-4px,3px)" }, { transform: "translate(3px,2px)" }, { transform: "translate(-2px,-1px)" }, { transform: "none" }], { duration: 200, easing: "ease-out" });
      later(() => celebrate({ mult: 0, won: 0 }), reduced ? 0 : 650);
    }
  };

  const poll = async () => {
    const r = round.current; if (!r || polling.current || mode.current.kind !== "fly") return;
    polling.current = true;
    const p = await crashPoll({ id: r.id });
    polling.current = false;
    if (!p.ok || round.current?.id !== r.id) return;
    if (p.status !== "active") finish(p.status, p.point ?? p.mult, p.mult, p.won ?? 0, p.balance ?? 0);
  };

  const start = async () => {
    if (!signedIn || phase === "countdown" || phase === "flying") return;
    unlockAudio();
    setErr(null);
    const a = Number(auto), bet0 = bet;
    play("click");
    const r = await crashStart({ bet: bet0, auto: a >= 1.01 ? a : null });
    if (!r.ok) { play("error"); return setErr(r.error); }
    // reset the sky for a new flight
    cancelAnimationFrame(raf.current); stopPolling(); timers.current.forEach(clearTimeout); timers.current = [];
    dragonEl.current?.classList.remove("flew");
    fl.current = { ...fl.current, cashAt: 0, lastMs: 0, mile: 1, beat: 0, nearTick: 0, launched: false, autoPolled: false, near: false, lastT: 0 };
    mode.current = { kind: "fly" };
    setResult(null); setPop(null); setNear(false); setGhost(null); setBursts([]); setAutoAt(r.auto ?? null);
    setBalance(r.balance);
    const offset = r.now - Date.now();
    round.current = { id: r.id, start: r.start, offset, auto: r.auto ?? null, bet: bet0 };
    setCountMs(Math.max(0, r.start - r.now));
    setPhase("countdown");
    play("whoosh", { vol: 0.5 });
    raf.current = requestAnimationFrame(loop);
    pollT.current = setInterval(() => { void poll(); }, 400);
  };

  const cashout = async () => {
    const r = round.current; if (!r || phase !== "flying" || mode.current.kind !== "fly") return;
    polling.current = true;
    const p = await crashCashout({ id: r.id });
    polling.current = false;
    if (!p.ok) { play("error"); return setErr(p.error); }
    if (p.status !== "active") finish(p.status, p.point ?? p.mult, p.mult, p.won ?? 0, p.balance ?? 0);
  };

  const live = phase === "countdown" || phase === "flying";
  const autoN = Number(auto);
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="sky" label="Dragonflight" className="df-machine" hud={<>
          <Readout label="Auto cash-out" tone={autoN >= 1.01 ? "gold" : undefined}>{autoN >= 1.01 ? fx(autoN) : "Off"}</Readout>
          <Readout label={phase === "won" ? "Banked" : "Potential"} tone={phase === "won" ? "win" : undefined}><span ref={potEl} /></Readout>
          <Readout label="Best">{best ? fx(best) : "—"}</Readout>
          <ResultStrip items={chips} label="Recent flights" />
        </>}>
          <div ref={sky} className={`df-sky ${phase}${near && phase === "flying" ? " near" : ""}${ghost !== null ? " ghost-done" : ""}`}>
            <div className="df-stars" aria-hidden="true" />
            <div className="df-clouds" ref={clouds} aria-hidden="true" />
            <div className="df-peaks" aria-hidden="true" />
            {LEVELS.map((lv, i) => (
              <div key={lv} className="df-grid" ref={(el) => { grid.current[i] = el; }} style={{ top: "100%", opacity: 0 }} aria-hidden="true"><span>{lv}×</span></div>
            ))}
            {autoAt && <div className="df-auto" ref={autoLine} aria-hidden="true"><span>Auto {fx(autoAt)}</span></div>}
            <svg className="df-graph" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="dfFill" gradientUnits="userSpaceOnUse" x1="0" y1={PT} x2="0" y2={PB}>
                  <stop offset="0" className="df-stop a" /><stop offset="1" className="df-stop b" />
                </linearGradient>
              </defs>
              <line x1={PL} x2={PR + 40} y1={PB} y2={PB} className="df-axis" vectorEffect="non-scaling-stroke" />
              <path ref={fillEl} d="" fill="url(#dfFill)" className="df-fill" />
              <path ref={glowEl} d="" className="df-glow" vectorEffect="non-scaling-stroke" />
              <path ref={pathEl} d="" className="df-line" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="df-dragon" ref={dragonEl} style={{ left: `${PL / 10}%`, top: `${PB / 10}%` }} aria-hidden="true">
              <div className="df-dragon-body"><img src={wowIconUrl("achievement_boss_onyxia")} alt="" width={52} height={52} /></div>
            </div>
            {phase === "won" && <div className="df-cashmark" ref={cashMark} style={{ left: result?.mx, top: result?.my }} aria-hidden="true"><span>{result ? fx(result.at) : ""}</span></div>}
            {bursts.map((b) => (
              <div key={b.k} className="df-burst" style={{ left: `${b.x}%`, top: `${b.y}%` }} aria-hidden="true">
                {b.parts.map((p, i) => <i key={i} style={{ ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, ["--r" as string]: `${p.r}deg`, ["--d" as string]: `${p.d}ms`, width: p.s, height: p.s }} />)}
              </div>
            ))}
            <div className="df-mult" ref={multWrap}>
              <span ref={multEl} className="df-mult-v">1.00×</span>
              {pop && phase === "flying" && <span key={pop.k} className="df-pop">{pop.m}×!</span>}
            </div>
            {phase === "countdown" && (
              <div className="df-count" role="status">
                <span>Lift-off</span>
                <i style={{ ["--cd" as string]: `${countMs}ms` }} />
              </div>
            )}
            {near && phase === "flying" && autoAt && <div className="df-near" role="status">Approaching auto cash-out {fx(autoAt)}</div>}
            {(phase === "won" || phase === "lost") && result && (
              <div key={result.k} className={`df-verdict ${phase}`} role="status">
                {phase === "won" ? <><strong>Cashed out {fx(result.at)}</strong><span>+{fmt(result.won)}</span></> : <><strong>{result.point <= 1 ? "Never left the ground" : "The dragon dove!"}</strong><span>at {fx(result.point)} · lost {fmt(result.bet)}</span></>}
                {phase === "won" && ghost !== null && <em>It flew on to {fx(ghost)}</em>}
              </div>
            )}
            {phase === "lost" && <div className="df-flash" aria-hidden="true" />}
            {phase === "idle" && <div className="df-idle">Set your bet, then launch. Cash out before the dragon dives.</div>}
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={live} />
        <label className="field">Auto cash-out at (optional)
          <input type="number" min={1.01} step={0.01} placeholder="e.g. 2.00" value={auto} disabled={live} onChange={(e) => setAuto(e.target.value)} />
        </label>
        <div className="seg df-autoseg">{[0, 1.5, 2, 3, 5, 10].map((v) => (
          <button key={v} type="button" disabled={live} aria-pressed={v === 0 ? !(autoN >= 1.01) : autoN === v} onClick={() => { setAuto(v ? String(v) : ""); play("click"); }}>{v ? `${v}×` : "Off"}</button>
        ))}</div>
        {live ? (
          <button type="button" className={`btn btn-primary btn-lg df-go cash${phase === "flying" ? " hot" : ""}`} onClick={cashout} disabled={phase !== "flying"}>
            {phase === "countdown" ? "Taking off…" : <>Cash out <span ref={amtEl}>{fmt(bet)}</span></>}
          </button>
        ) : <button type="button" className="btn btn-primary btn-lg df-go" onClick={start} disabled={!signedIn}>{phase === "idle" ? "Launch" : "Launch again"}</button>}
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">The dragon can dive at any moment, sometimes right away. ~3% of flights never leave the ground.</p>
      </div>
    </div>
  );
}
