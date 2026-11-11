"use client";
// Treasure Scratch: the server decides the card; you scratch the gold leaf off with a finger or the mouse.
// Each of the nine panels is gold-leaf foil painted on a canvas; scratching sheds flakes, a panel pops open
// once you have rubbed most of it away, and "Reveal all" sweeps the foil off diagonally. When the whole card
// is open, the three matching treasures glow one after another.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scratchBuy } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

type Sym = { id: string; icon: string; mult?: number };
type Card = { cells: string[]; win: string | null; mult: number; won: number; balance: number };
type Rect = { x: number; y: number; w: number; h: number };
type Flake = { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; rot: number; vr: number; c: string; spark: boolean };
const OPEN_AT = 0.5;   // share of a panel scratched before it pops open
const NONE = Array(9).fill(false) as boolean[];
const GOLDS = ["#ffe9a8", "#f3d27a", "#d9a63a", "#b8862a", "#fff6d0"];
const NAME: Record<string, string> = { dragon: "Onyxias", gem: "gems", sword: "blades", potion: "potions", coin: "coins" };

/** One gold-leaf panel: a metallic gradient, scattered leaf flakes, grain, a sheen and an embossed star. */
function paintTile(g: CanvasRenderingContext2D, { x, y, w, h }: Rect) {
  const r = Math.min(w, h) * 0.12;
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, r); g.clip();
  const base = g.createLinearGradient(x, y, x + w, y + h);
  base.addColorStop(0, "#8a5a14"); base.addColorStop(0.26, "#f0cd72"); base.addColorStop(0.5, "#b8862a"); base.addColorStop(0.74, "#ffe6a0"); base.addColorStop(1, "#7a4e10");
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let k = 0; k < 30; k++) {
    const cx = x + Math.random() * w, cy = y + Math.random() * h, s = w * (0.06 + Math.random() * 0.14);
    g.fillStyle = `hsla(${36 + Math.random() * 12}, ${55 + Math.random() * 35}%, ${42 + Math.random() * 40}%, ${0.25 + Math.random() * 0.3})`;
    g.beginPath();
    const n = 4 + Math.floor(Math.random() * 3);
    for (let p = 0; p < n; p++) { const a = (p / n) * Math.PI * 2 + Math.random() * 0.6, d = s * (0.5 + Math.random() * 0.6); g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
    g.closePath(); g.fill();
  }
  for (let k = 0; k < (w * h) / 60; k++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,252,230,${Math.random() * 0.5})` : `rgba(70,40,0,${Math.random() * 0.35})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 1);
  }
  const sh = g.createLinearGradient(x, y, x + w, y + h);
  sh.addColorStop(0, "rgba(255,255,240,0)"); sh.addColorStop(0.4, "rgba(255,255,240,0)"); sh.addColorStop(0.5, "rgba(255,255,240,.42)"); sh.addColorStop(0.6, "rgba(255,255,240,0)");
  g.fillStyle = sh; g.fillRect(x, y, w, h);
  // embossed four-point star and the word SCRATCH
  const cx = x + w / 2, cy = y + h * 0.44, R = Math.min(w, h) * 0.2;
  const star = (dx: number, dy: number, fill: string) => {
    g.beginPath();
    for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2 - Math.PI / 2, d = p % 2 ? R * 0.34 : R; g.lineTo(cx + dx + Math.cos(a) * d, cy + dy + Math.sin(a) * d); }
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  star(1.2, 1.4, "rgba(70,40,0,.55)"); star(-1, -1, "rgba(255,250,225,.75)"); star(0, 0, "#d4a440");
  g.font = `700 ${Math.max(8, Math.round(w * 0.085))}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const ty = y + h * 0.8;
  g.fillStyle = "rgba(255,250,225,.6)"; g.fillText("SCRATCH", cx - 0.8, ty - 0.8);
  g.fillStyle = "rgba(80,48,6,.75)"; g.fillText("SCRATCH", cx, ty);
  g.restore();
  // bevel
  g.save(); g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, h - 2, r);
  const bv = g.createLinearGradient(x, y, x + w, y + h);
  bv.addColorStop(0, "rgba(255,248,220,.9)"); bv.addColorStop(0.5, "rgba(255,248,220,.1)"); bv.addColorStop(1, "rgba(60,30,0,.85)");
  g.strokeStyle = bv; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.roundRect(x, y, w, h, r); g.strokeStyle = "rgba(40,20,0,.9)"; g.lineWidth = 1; g.stroke();
  g.restore();
}

export function Scratch({ prizes, filler }: { prizes: Sym[]; filler: Sym }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [card, setCard] = useState<Card | null>(null);
  const [opened, setOpened] = useState<boolean[]>(NONE);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [chips, setChips] = useState<Chip[]>([]);
  const all = [...prizes, filler];
  const sym = (id: string) => all.find((s) => s.id === id) ?? filler;

  const field = useRef<HTMLDivElement>(null);
  const foil = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const cellEls = useRef<(HTMLDivElement | null)[]>([]);
  const rects = useRef<Rect[]>([]);
  const dprRef = useRef(1);
  const flakes = useRef<Flake[]>([]);
  const fxRaf = useRef(0);
  const sweepRaf = useRef(0);
  const st = useRef({ card: null as Card | null, opened: [...NONE], revealed: false, down: false, lx: 0, ly: 0, lastCheck: 0, winsOpen: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (f: () => void, ms: number) => timers.current.push(setTimeout(f, ms));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- geometry and painting
  const measure = useCallback(() => {
    const f = field.current; if (!f) return;
    rects.current = cellEls.current.map((el) => (el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 }));
  }, []);
  const ctx = (c: HTMLCanvasElement | null) => { const g = c?.getContext("2d", { willReadFrequently: c === foil.current }) ?? null; g?.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0); return g; };
  const paint = useCallback(() => {
    const f = field.current, c = foil.current, p = fx.current; if (!f || !c || !p) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); dprRef.current = dpr;
    const W = f.clientWidth, H = f.clientHeight;
    for (const cv of [c, p]) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    measure();
    const g = ctx(c); if (!g) return;
    g.clearRect(0, 0, W, H);
    if (st.current.revealed) return;
    rects.current.forEach((r, i) => { if (!st.current.opened[i]) paintTile(g, r); });
  }, [measure]);

  // a new card (or none): repaint the foil before the browser shows the symbols underneath
  useLayoutEffect(() => { paint(); }, [card, paint]);
  useEffect(() => {
    const f = field.current; if (!f) return;
    let w = f.clientWidth;
    const ro = new ResizeObserver(() => { if (f.clientWidth !== w) { w = f.clientWidth; paint(); } });
    ro.observe(f);
    const tm = timers.current;
    return () => { ro.disconnect(); cancelAnimationFrame(fxRaf.current); cancelAnimationFrame(sweepRaf.current); tm.forEach(clearTimeout); };
  }, [paint]);

  // ---------------------------------------------------------------- flakes and sparkles
  const runFx = useCallback(() => {
    if (fxRaf.current) return;
    const loop = () => {
      const c = fx.current, f = field.current; const g = ctx(c); if (!g || !f) { fxRaf.current = 0; return; }
      g.clearRect(0, 0, f.clientWidth, f.clientHeight);
      flakes.current = flakes.current.filter((p) => p.life > 0);
      for (const p of flakes.current) {
        p.vy += p.spark ? 0.02 : 0.28; p.vx *= 0.98; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        const a = Math.min(1, p.life / 18);
        g.globalAlpha = a;
        if (p.spark) {
          const s = p.s * (0.6 + 0.4 * Math.sin(p.life * 0.5));
          g.fillStyle = "#fffbe6"; g.beginPath();
          g.moveTo(p.x, p.y - s * 2); g.lineTo(p.x + s * 0.5, p.y); g.lineTo(p.x, p.y + s * 2); g.lineTo(p.x - s * 0.5, p.y); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(p.x - s * 2, p.y); g.lineTo(p.x, p.y + s * 0.5); g.lineTo(p.x + s * 2, p.y); g.lineTo(p.x, p.y - s * 0.5); g.closePath(); g.fill();
        } else {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.rot * 1.7));
          g.fillStyle = p.c; g.fillRect(-p.s, -p.s * 0.6, p.s * 2, p.s * 1.2); g.restore();
        }
      }
      g.globalAlpha = 1;
      fxRaf.current = flakes.current.length ? requestAnimationFrame(loop) : 0;
      if (!fxRaf.current) g.clearRect(0, 0, f.clientWidth, f.clientHeight);
    };
    fxRaf.current = requestAnimationFrame(loop);
  }, []);
  const shed = useCallback((x: number, y: number, n: number, spread = 1, sparks = 0) => {
    if (reduced()) return;
    for (let i = 0; i < n; i++) flakes.current.push({ x: x + (Math.random() - 0.5) * 10 * spread, y: y + (Math.random() - 0.5) * 10 * spread, vx: (Math.random() - 0.5) * 3 * spread, vy: -Math.random() * 2.2 * spread,
      life: 30 + Math.random() * 30, max: 60, s: 1.2 + Math.random() * 2.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: GOLDS[Math.floor(Math.random() * GOLDS.length)], spark: false });
    for (let i = 0; i < sparks; i++) flakes.current.push({ x: x + (Math.random() - 0.5) * 30 * spread, y: y + (Math.random() - 0.5) * 30 * spread, vx: (Math.random() - 0.5) * 0.6, vy: -0.3 - Math.random() * 0.5,
      life: 24 + Math.random() * 20, max: 44, s: 1.6 + Math.random() * 1.8, rot: 0, vr: 0, c: "#fff", spark: true });
    if (flakes.current.length > 600) flakes.current.splice(0, flakes.current.length - 600);
    runFx();
  }, [runFx]);

  // ---------------------------------------------------------------- the round
  const finish = useCallback(() => {
    const s = st.current, c = s.card; if (!c || s.revealed) return;
    s.revealed = true;
    setRevealed(true);
    const g = ctx(foil.current), f = field.current;
    if (g && f) g.clearRect(0, 0, f.clientWidth, f.clientHeight);
    const seq = reduced() ? 0 : 220;
    if (c.won > 0) [0, 1, 2].forEach((k) => later(() => { play("gem", { pitch: ladder(4 + k * 3) }); buzz("tap"); }, 120 + k * seq));
    later(() => {
      setBalance(c.balance); if (c.won) flash(c.won); setLastWin(c.won);
      celebrate({ mult: c.won > 0 ? c.won / bet : 0, won: c.won });
      setChips((x) => [{ k: `${Date.now()}`, label: c.won ? `${c.mult}×` : "—", tone: (c.mult >= 10 ? "big" : c.mult > 1 ? "win" : c.won ? "neutral" : "lose") as Chip["tone"] }, ...x].slice(0, 14));
    }, c.won > 0 ? 160 + 3 * seq : 200);
  }, [bet, flash, setBalance]);

  const openCell = useCallback((i: number, quiet = false) => {
    const s = st.current, c = s.card; if (!c || s.opened[i] || s.revealed) return;
    s.opened[i] = true;
    const r = rects.current[i], g = ctx(foil.current);
    if (g && r) g.clearRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    if (r) shed(r.x + r.w / 2, r.y + r.h / 2, quiet ? 6 : 22, 2.2, quiet ? 2 : 6);
    const isWin = c.win !== null && c.cells[i] === c.win;
    if (isWin) { s.winsOpen++; play("reveal", { pitch: ladder(s.winsOpen * 2) }); }
    else if (!quiet) play("flip", { pitch: 0.9 + Math.random() * 0.3 });
    setOpened([...s.opened]);
    if (s.opened.every(Boolean)) finish();
  }, [finish, shed]);

  const checkCoverage = useCallback(() => {
    const s = st.current, c = foil.current; if (!c || !s.card || s.revealed) return;
    const g = c.getContext("2d", { willReadFrequently: true }); if (!g) return;
    const dpr = dprRef.current;
    rects.current.forEach((r, i) => {
      if (s.opened[i] || !r.w) return;
      const x = Math.round(r.x * dpr), y = Math.round(r.y * dpr), w = Math.max(1, Math.round(r.w * dpr)), h = Math.max(1, Math.round(r.h * dpr));
      const d = g.getImageData(x, y, w, h).data;
      let clear = 0, n = 0;
      for (let k = 3; k < d.length; k += 4 * 7) { n++; if (d[k] < 40) clear++; }
      if (n && clear / n > OPEN_AT) openCell(i);
    });
  }, [openCell]);

  const scratchTo = (x: number, y: number, first: boolean) => {
    const s = st.current, g = ctx(foil.current); if (!g || !s.card || s.revealed) return;
    const w = (rects.current[0]?.w || 90) * 0.3;
    g.globalCompositeOperation = "destination-out";
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = w; g.strokeStyle = "#000";
    g.beginPath(); g.moveTo(first ? x - 0.1 : s.lx, first ? y : s.ly); g.lineTo(x, y); g.stroke();
    g.globalCompositeOperation = "source-over";
    const dist = Math.hypot(x - s.lx, y - s.ly);
    if (first || dist > 2) { shed(x, y, Math.min(6, 1 + Math.round(dist / 6)), 1, Math.random() < 0.25 ? 1 : 0); play("key", { pitch: 0.7 + Math.random() * 0.5, vol: 0.7 }); }
    s.lx = x; s.ly = y;
    const now = performance.now();
    if (now - s.lastCheck > 110) { s.lastCheck = now; checkCoverage(); }
  };
  const local = (e: React.PointerEvent) => { const r = field.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };

  const revealAll = () => {
    const s = st.current, c = s.card; if (!c || s.revealed) return;
    const f = field.current, g = ctx(foil.current);
    if (reduced() || !f || !g) { c.cells.forEach((_, i) => openCell(i, true)); finish(); return; }
    play("whoosh");
    const W = f.clientWidth, H = f.clientHeight, D = W + H, t0 = performance.now(), dur = 760;
    cancelAnimationFrame(sweepRaf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = k * k * (3 - 2 * k), at = -0.08 * D + e * 1.16 * D;
      g.globalCompositeOperation = "destination-out";
      g.beginPath(); g.moveTo(-2, -2); g.lineTo(at, -2); g.lineTo(-2, at); g.closePath(); g.fill();
      g.globalCompositeOperation = "source-over";
      for (let n = 0; n < 3; n++) { const u = Math.random(), px = at * u, py = at * (1 - u); if (px <= W && py <= H) shed(px, py, 1, 1.2, Math.random() < 0.5 ? 1 : 0); }
      rects.current.forEach((r, i) => { if (!s.opened[i] && r.x + r.w / 2 + r.y + r.h / 2 < at) openCell(i, true); });
      if (k < 1 && !s.revealed) sweepRaf.current = requestAnimationFrame(step);
      else { s.card?.cells.forEach((_, i) => openCell(i, true)); finish(); }
    };
    sweepRaf.current = requestAnimationFrame(step);
  };

  const buy = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    play("deal");
    const r = await scratchBuy({ bet });
    setBusy(false);
    if (!r.ok) { play("error"); return setErr(r.error); }
    setBalance(r.balance - r.won); flash(-bet); // the price leaves now; any prize lands when the card is revealed
    const c = { cells: r.cells, win: r.win, mult: r.mult, won: r.won, balance: r.balance };
    st.current = { ...st.current, card: c, opened: [...NONE], revealed: false, down: false, winsOpen: 0 };
    setOpened([...NONE]); setRevealed(false); setCard(c);
  };

  const live = !!card && !revealed;
  const openCount = opened.filter(Boolean).length;
  let winSeq = 0;
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="hoard" label="Treasure Scratch" hud={<>
          <Readout label="Card" tone="gold">{fmt(bet)}</Readout>
          <Readout label="Revealed">{card ? `${openCount}/9` : "—"}</Readout>
          <Readout label="Last prize" tone={lastWin ? "win" : undefined}><CountUp value={lastWin} /></Readout>
          <ResultStrip items={chips} label="Recent cards" />
        </>}>
          <div className={`sc-card${live ? " live" : ""}${revealed && card ? (card.won > 0 ? " won" : " lost") : ""}`}>
            <div className="sc-head">
              <span className="sc-title">Treasure Scratch</span>
              <span className="sc-tag">Match three treasures to win</span>
            </div>
            <div ref={field} className="sc-field">
              <div className="sc-grid">
                {Array.from({ length: 9 }, (_, i) => {
                  const id = card?.cells[i], s = id ? sym(id) : null;
                  const isWin = !!card && revealed && card.win !== null && id === card.win;
                  const seq = isWin ? winSeq++ : 0;
                  return (
                    <div key={i} ref={(el) => { cellEls.current[i] = el; }} className={`sc-cell${opened[i] ? " open" : ""}${isWin ? " win" : ""}${revealed && card && !isWin ? " dim" : ""}`} style={{ ["--seq" as string]: seq }}>
                      {s ? <>
                        <span className="sc-gem"><img src={wowIconUrl(s.icon)} alt="" width={56} height={56} /></span>
                        <span className="sc-val">{s.mult ? `${s.mult}×` : "Rune"}</span>
                      </> : <span className="sc-blank" aria-hidden="true">?</span>}
                    </div>
                  );
                })}
              </div>
              <canvas ref={foil} className="sc-foil" aria-label={live ? "Gold foil: scratch to reveal" : undefined} role={live ? "img" : undefined}
                onPointerDown={(e) => { if (!live) return; const [x, y] = local(e); st.current.down = true; e.currentTarget.setPointerCapture(e.pointerId); scratchTo(x, y, true); }}
                onPointerMove={(e) => { if (!st.current.down) return; const [x, y] = local(e); scratchTo(x, y, false); }}
                onPointerUp={() => { st.current.down = false; checkCoverage(); }}
                onPointerCancel={() => { st.current.down = false; checkCoverage(); }} />
              <canvas ref={fx} className="sc-fx" aria-hidden="true" />
              {!card && <div className="sc-prompt"><strong>Buy a card</strong><span>then scratch the gold leaf away</span></div>}
            </div>
            <div className="sc-foot" aria-live="polite">
              {revealed && card
                ? (card.won > 0 ? <span className="sc-result win"><strong>+{fmt(card.won)}</strong> Three {NAME[card.win!] ?? card.win} · {card.mult}×</span> : <span className="sc-result lose">No match this time</span>)
                : <span className="sc-legend" aria-hidden="true">{prizes.map((p) => <span key={p.id}><img src={wowIconUrl(p.icon, 36)} alt="" width={18} height={18} />{p.mult}×</span>)}</span>}
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy || live} />
        {live
          ? <button type="button" className="btn btn-primary btn-lg" onClick={revealAll}>Reveal all</button>
          : <button type="button" className="btn btn-primary btn-lg" onClick={buy} disabled={!signedIn || busy}>{busy ? "…" : `Buy a card · ${fmt(bet)}`}</button>}
        {err && <p className="game-err" role="alert">{err}</p>}
        <div className="sc-pays" role="table" aria-label="Prizes">
          {prizes.map((p) => (
            <div key={p.id} role="row" className={`sc-pay${revealed && card?.win === p.id ? " lit" : ""}`}>
              <span role="cell" className="sc-pay-icons">{[0, 1, 2].map((k) => <img key={k} src={wowIconUrl(p.icon, 36)} alt="" width={22} height={22} />)}</span>
              <strong role="cell">{p.mult}×</strong>
            </div>
          ))}
        </div>
        <p className="micro muted">Scratch with your finger or mouse. Three of the same treasure wins.</p>
      </div>
    </div>
  );
}
