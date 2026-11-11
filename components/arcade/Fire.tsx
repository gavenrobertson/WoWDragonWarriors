"use client";
// Don't Stand in the Fire: fire zones mark the ground, then ignite. Keep your hero out of them.
// Score = tenths of a second survived. Move with the mouse, a finger, or WASD/arrows.
// The raid floor is painted once to an offscreen canvas; zones, the hero and effects are drawn each frame.
import { useCallback, useEffect, useRef, useState } from "react";
import { CLASS_COLOR, CLASS_ICON } from "@/lib/ui";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const AW = 600, AH = 600, HERO = 11, WARN = 900, BURN = 1300;
type Zone = { x: number; y: number; r: number; born: number; kind: "fire" | "void" | "line"; a?: number; lit?: boolean; seed?: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number };
const CLASSES = Object.keys(CLASS_COLOR);
const CLS_KEY = "dw-fire-class";
const BODY = '"Alegreya Sans", system-ui, sans-serif';

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The raid floor: worn flagstones, a rune circle in the middle and braziers in the corners. */
function paintFloor(ps: number) {
  const c = document.createElement("canvas"); c.width = Math.round(AW * ps); c.height = Math.round(AH * ps);
  const x = c.getContext("2d")!; x.scale(ps, ps);
  x.fillStyle = "#1d1813"; x.fillRect(0, 0, AW, AH);
  const T = 60;
  for (let ty = 0; ty < AH; ty += T) for (let tx = 0; tx < AW; tx += T) {
    const off = (ty / T) % 2 ? T / 2 : 0;
    for (const ox of [tx + off - (off ? T : 0), tx + off]) {
      if (ox >= AW) continue;
      const l = 11 + Math.random() * 8;
      x.fillStyle = `hsl(${28 + Math.random() * 10} ${10 + Math.random() * 8}% ${l}%)`;
      x.fillRect(ox + 1.5, ty + 1.5, T - 3, T - 3);
      x.fillStyle = "rgba(255,240,210,.06)"; x.fillRect(ox + 1.5, ty + 1.5, T - 3, 2);
      x.fillStyle = "rgba(0,0,0,.3)"; x.fillRect(ox + 1.5, ty + T - 3.5, T - 3, 2);
      if (Math.random() < .25) { // a crack
        x.strokeStyle = "rgba(0,0,0,.35)"; x.lineWidth = 1; x.beginPath();
        let cx = ox + Math.random() * T, cy = ty + Math.random() * T; x.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) { cx += (Math.random() - .5) * 18; cy += (Math.random() - .5) * 18; x.lineTo(cx, cy); }
        x.stroke();
      }
    }
  }
  // old scorch marks
  for (let i = 0; i < 7; i++) {
    const sx = Math.random() * AW, sy = Math.random() * AH, r = 30 + Math.random() * 50;
    const g = x.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, "rgba(0,0,0,.4)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  // the rune circle
  const cx = AW / 2, cy = AH / 2;
  const glow = x.createRadialGradient(cx, cy, 40, cx, cy, 220); glow.addColorStop(0, "rgba(155,93,255,.12)"); glow.addColorStop(1, "rgba(155,93,255,0)");
  x.fillStyle = glow; x.fillRect(0, 0, AW, AH);
  x.strokeStyle = "rgba(192,140,255,.28)"; x.lineWidth = 2;
  for (const r of [190, 172, 96]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
  x.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) { // rune glyphs round the ring
    const a = (i / 24) * Math.PI * 2, rx = cx + Math.cos(a) * 181, ry = cy + Math.sin(a) * 181;
    x.save(); x.translate(rx, ry); x.rotate(a + Math.PI / 2); x.beginPath();
    const k = i % 4;
    if (k === 0) { x.moveTo(-4, -5); x.lineTo(0, 5); x.lineTo(4, -5); }
    else if (k === 1) { x.moveTo(0, -5); x.lineTo(0, 5); x.moveTo(-4, 0); x.lineTo(4, -3); }
    else if (k === 2) { x.moveTo(-4, 5); x.lineTo(0, -5); x.lineTo(4, 5); x.moveTo(-2, 1); x.lineTo(2, 1); }
    else { x.arc(0, 0, 3.5, 0, Math.PI * 1.5); }
    x.stroke(); x.restore();
  }
  // a six-pointed star in the centre
  x.strokeStyle = "rgba(192,140,255,.2)"; x.lineWidth = 2;
  for (const rot of [0, Math.PI / 3]) {
    x.beginPath();
    for (let i = 0; i <= 3; i++) { const a = rot + (i / 3) * Math.PI * 2 - Math.PI / 2; if (i) x.lineTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96); else x.moveTo(cx + Math.cos(a) * 96, cy + Math.sin(a) * 96); }
    x.stroke();
  }
  // brazier bowls in the corners
  for (const [bx, by] of [[34, 34], [AW - 34, 34], [34, AH - 34], [AW - 34, AH - 34]]) {
    x.fillStyle = "#0d0a08"; x.beginPath(); x.arc(bx, by, 17, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#8a6a2c"; x.lineWidth = 3; x.stroke();
    x.strokeStyle = "#3a2a10"; x.lineWidth = 1; x.beginPath(); x.arc(bx, by, 12, 0, Math.PI * 2); x.stroke();
  }
  // edge vignette
  const v = x.createRadialGradient(cx, cy, AW * .35, cx, cy, AW * .78); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.6)");
  x.fillStyle = v; x.fillRect(0, 0, AW, AH);
  return c;
}

export function Fire({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("fire", best0, leftToday0);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(480);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [final, setFinal] = useState(0);
  const [cls, setCls] = useState("mage");
  const [chips, setChips] = useState<Chip[]>([]);
  const g = useRef({
    x: AW / 2, y: AH / 2, tx: AW / 2, ty: AH / 2, zones: [] as Zone[], t0: 0, next: 0, keys: new Set<string>(), state: "ready" as "ready" | "on" | "done", deadAt: 0,
    trail: [] as { x: number; y: number }[], sparks: [] as Spark[], shakeAt: -1e9, shakeAmp: 0, close: [] as { x: number; y: number; t: number }[], mile: 0, mileAt: -1e9, lastIgnite: 0, seed: 0,
  });
  const cls0 = useRef("mage");
  const icons = useRef<Record<string, HTMLImageElement>>({});
  const bestAtStart = useRef(best0);

  // remember the chosen class in this browser
  useEffect(() => {
    try { const c = localStorage.getItem(CLS_KEY); if (c && CLASS_COLOR[c]) setCls(c); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => {
    cls0.current = cls;
    if (!icons.current[cls]) { const i = new Image(); i.src = CLASS_ICON[cls]; icons.current[cls] = i; }
  }, [cls]);
  const pick = (c: string) => { setCls(c); play("click"); try { localStorage.setItem(CLS_KEY, c); } catch { /* ignore */ } };

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setW(Math.max(260, Math.min(el.clientWidth, window.innerHeight - 330, 600)));
    const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  useEffect(() => { if (sk.result && sk.result.earned > 0) celebrate({ mult: 2, won: sk.result.earned }); }, [sk.result]);

  const start = () => {
    const s = g.current;
    bestAtStart.current = sk.best;
    Object.assign(s, { x: AW / 2, y: AH / 2, tx: AW / 2, ty: AH / 2, zones: [], t0: performance.now(), next: performance.now() + 500, state: "on", trail: [], sparks: [], close: [], mile: 0, deadAt: 0 });
    if (timeEl.current) timeEl.current.textContent = "0.0s";
    setState("on"); sk.begin(); play("launch", { vol: .5 });
  };

  const toArena = useCallback((cx: number, cy: number) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * AW, y: ((cy - r.top) / r.height) * AH };
  }, []);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const move = (e: PointerEvent) => { const p = toArena(e.clientX, e.clientY); g.current.tx = p.x; g.current.ty = p.y; };
    c.addEventListener("pointermove", move); c.addEventListener("pointerdown", move);
    const kd = (e: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key) && g.current.state === "on") { e.preventDefault(); g.current.keys.add(e.key); } };
    const ku = (e: KeyboardEvent) => g.current.keys.delete(e.key);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { c.removeEventListener("pointermove", move); c.removeEventListener("pointerdown", move); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [toArena]);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1), k = w / AW, ps = dpr * k;
    c.width = Math.round(w * dpr); c.height = Math.round(w * dpr); c.style.width = `${w}px`; c.style.height = `${w}px`;
    const floor = paintFloor(ps);
    const reduced = reducedMotion();
    let raf = 0, lastT = performance.now(), lastShown = -1;
    const lit = (z: Zone, now: number) => now - z.born > WARN && now - z.born < WARN + BURN;
    const inside = (z: Zone, x: number, y: number) => {
      if (z.kind !== "line") return Math.hypot(x - z.x, y - z.y) < z.r + HERO * 0.6;
      // a beam through (z.x, z.y) at angle a, half-width r
      const dx = x - z.x, dy = y - z.y, ca = Math.cos(z.a!), sa = Math.sin(z.a!);
      return Math.abs(-dx * sa + dy * ca) < z.r + HERO * 0.6;
    };
    const gap = (z: Zone, x: number, y: number) => {
      if (z.kind !== "line") return Math.hypot(x - z.x, y - z.y) - z.r;
      const dx = x - z.x, dy = y - z.y; return Math.abs(-dx * Math.sin(z.a!) + dy * Math.cos(z.a!)) - z.r;
    };
    const burst = (x: number, y: number, n: number, cols: string[], sp = 3) => {
      if (reduced) return;
      const s = g.current;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = .5 + Math.random() * sp; s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .6, life: 1, c: cols[i % cols.length], s: 1 + Math.random() * 2 }); }
    };

    const frame = (now: number) => {
      const s = g.current, dt = Math.min(50, now - lastT) / 16.67; lastT = now;
      // a 60ms hit-stop on death freezes everything for a beat
      const frozen = s.state === "done" && now - s.deadAt < 60;
      if (s.state === "on") {
        const el = (now - s.t0) / 1000;
        const tenths = Math.floor(el * 10);
        if (tenths !== lastShown && timeEl.current) { lastShown = tenths; timeEl.current.textContent = `${(tenths / 10).toFixed(1)}s`; }
        const m = Math.floor(el / 10);
        if (m > s.mile) { s.mile = m; s.mileAt = now; play("reveal", { pitch: ladder(m * 2) }); play("coin"); buzz("tap"); }
        // keys steer the target, the pointer sets it directly
        const kx = (s.keys.has("ArrowRight") || s.keys.has("d") ? 1 : 0) - (s.keys.has("ArrowLeft") || s.keys.has("a") ? 1 : 0);
        const ky = (s.keys.has("ArrowDown") || s.keys.has("s") ? 1 : 0) - (s.keys.has("ArrowUp") || s.keys.has("w") ? 1 : 0);
        if (kx || ky) { s.tx = s.x + kx * 40; s.ty = s.y + ky * 40; }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), sp = 5.2 * dt;
        if (d > 0.5) { s.x += (dx / d) * Math.min(d, sp); s.y += (dy / d) * Math.min(d, sp); }
        s.x = Math.max(HERO, Math.min(AW - HERO, s.x)); s.y = Math.max(HERO, Math.min(AH - HERO, s.y));
        if (now >= s.next) {
          const level = Math.min(1, el / 60), r = Math.random();
          if (r < 0.18 + level * 0.12 && el > 8) s.zones.push({ x: AW / 2, y: AH / 2, r: 16, born: now, kind: "line", a: Math.random() * Math.PI });
          else if (r < 0.4) s.zones.push({ x: s.x + (Math.random() - 0.5) * 60, y: s.y + (Math.random() - 0.5) * 60, r: 52 + Math.random() * 30, born: now, kind: "void" }); // drops on you
          else s.zones.push({ x: 40 + Math.random() * (AW - 80), y: 40 + Math.random() * (AH - 80), r: 40 + Math.random() * 50 + level * 30, born: now, kind: "fire" });
          s.zones[s.zones.length - 1].seed = ++s.seed;
          play("tick", { pitch: .7, vol: .6 });
          s.next = now + Math.max(260, 900 - el * 14);
        }
        s.zones = s.zones.filter((z) => now - z.born < WARN + BURN);
        // ignition: a flash, a sound, and a shake if it was a close call
        for (const z of s.zones) {
          if (z.lit || now - z.born < WARN) continue;
          z.lit = true;
          const near = gap(z, s.x, s.y);
          if (near > 0 && near < HERO + 24) {
            s.close.push({ x: s.x, y: s.y, t: now }); play("whoosh", { vol: .5 }); buzz("tick");
            if (!reduced) { s.shakeAt = now; s.shakeAmp = 3; }
          } else if (now - s.lastIgnite > 120) { s.lastIgnite = now; play("thud", { pitch: z.kind === "void" ? .55 : .8, vol: .35 }); }
          if (z.kind !== "line") burst(z.x, z.y, 6, z.kind === "void" ? ["#d9b8ff", "#9b5dff"] : ["#ffd36b", "#ff8a2a"], 2);
        }
        if (s.zones.some((z) => lit(z, now) && inside(z, s.x, s.y))) {
          s.state = "done"; s.deadAt = now;
          const score = Math.floor(((now - s.t0) / 1000) * 10);
          if (timeEl.current) timeEl.current.textContent = `${(score / 10).toFixed(1)}s`;
          play("bomb", { vol: .55 }); buzz("fail");
          if (!reduced) { s.shakeAt = now; s.shakeAmp = 5; }
          burst(s.x, s.y, 22, ["#ffd36b", "#ff6a1a", "#555", "#999"], 3.5);
          setFinal(score);
          setChips((cs) => [{ k: now, label: `${(score / 10).toFixed(1)}s`, tone: (score > bestAtStart.current && score > 0 ? "big" : score >= 300 ? "win" : "neutral") as Chip["tone"] }, ...cs].slice(0, 14));
          setTimeout(() => setState("done"), reduced ? 0 : 750);
          void sk.end(score);
        }
      }

      // ---------------------------------------------------------------- draw
      ctx.setTransform(ps, 0, 0, ps, 0, 0);
      const shk = now - s.shakeAt;
      if (shk < 180 && !reduced) { const a = s.shakeAmp * (1 - shk / 180); ctx.translate((Math.random() - .5) * a * 2, (Math.random() - .5) * a * 2); }
      ctx.drawImage(floor, 0, 0, AW, AH);
      // brazier flames
      ctx.globalCompositeOperation = "lighter";
      for (const [bx, by] of [[34, 34], [AW - 34, 34], [34, AH - 34], [AW - 34, AH - 34]]) {
        const f = 1 + Math.sin(now / 90 + bx) * .12 + Math.sin(now / 37 + by) * .06;
        const fg = ctx.createRadialGradient(bx, by, 0, bx, by, 34 * f); fg.addColorStop(0, "rgba(255,220,140,.9)"); fg.addColorStop(.3, "rgba(255,120,30,.45)"); fg.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = fg; ctx.fillRect(bx - 40, by - 40, 80, 80);
      }
      ctx.globalCompositeOperation = "source-over";

      for (const z of s.zones) {
        const age = now - z.born, on = age > WARN, pk = Math.min(1, age / WARN);
        const col = z.kind === "void" ? "155,93,255" : "255,110,30", hot = z.kind === "void" ? "235,215,255" : "255,236,150";
        const fade = on ? Math.min(1, (WARN + BURN - age) / 260) : 1;
        ctx.save();
        if (z.kind === "line") {
          ctx.translate(z.x, z.y); ctx.rotate(z.a!);
          if (!on) {
            ctx.fillStyle = `rgba(${col},${0.1 + 0.15 * pk})`; ctx.fillRect(-AW, -z.r, AW * 2, z.r * 2);
            ctx.fillStyle = `rgba(${col},.45)`; ctx.fillRect(-AW, -z.r * pk, AW * 2, z.r * 2 * pk); // fills from the centre line out
            ctx.strokeStyle = `rgba(${col},.9)`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now / 30;
            ctx.beginPath(); ctx.moveTo(-AW, -z.r); ctx.lineTo(AW, -z.r); ctx.moveTo(-AW, z.r); ctx.lineTo(AW, z.r); ctx.stroke(); ctx.setLineDash([]);
          } else {
            ctx.globalAlpha = fade; ctx.globalCompositeOperation = "lighter";
            const fl = 1 + Math.sin(now / 40 + z.seed!) * .1;
            const bg = ctx.createLinearGradient(0, -z.r * 1.8, 0, z.r * 1.8);
            bg.addColorStop(0, `rgba(${col},0)`); bg.addColorStop(.3, `rgba(${col},.55)`); bg.addColorStop(.5, `rgba(${hot},.95)`); bg.addColorStop(.7, `rgba(${col},.55)`); bg.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = bg; ctx.fillRect(-AW, -z.r * 1.8 * fl, AW * 2, z.r * 3.6 * fl);
            if (age - WARN < 160) { ctx.fillStyle = `rgba(255,255,255,${.7 * (1 - (age - WARN) / 160)})`; ctx.fillRect(-AW, -z.r, AW * 2, z.r * 2); }
          }
        } else if (!on) {
          // telegraph: a filling disc, a marching dashed rim and a clear countdown ring
          ctx.fillStyle = `rgba(${col},${0.08 + 0.14 * pk})`; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(${col},.22)`; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * pk, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(${col},.55)`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now / 40;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(${hot},.95)`; ctx.lineWidth = 4; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pk); ctx.stroke();
          if (z.kind === "void") { // a falling-orb marker on the target
            ctx.fillStyle = `rgba(${hot},${.4 + .4 * pk})`; ctx.beginPath(); ctx.arc(z.x, z.y, 4 + pk * 4, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.globalAlpha = fade; ctx.globalCompositeOperation = "lighter";
          const fl = 1 + Math.sin(now / 55 + z.seed!) * .04;
          const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r * fl);
          gr.addColorStop(0, `rgba(${hot},.95)`); gr.addColorStop(.45, `rgba(${col},.8)`); gr.addColorStop(.85, `rgba(${col},.35)`); gr.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * fl, 0, Math.PI * 2); ctx.fill();
          // licking flames (fire) or swirling arms (void)
          if (z.kind === "fire") {
            for (let i = 0; i < 9; i++) {
              const a = (i / 9) * Math.PI * 2 + z.seed!, ph = ((now / 420 + i * .37 + z.seed! * .1) % 1);
              const rr = z.r * (.25 + .5 * ((i * 37) % 10) / 10), fx = z.x + Math.cos(a) * rr, fy = z.y + Math.sin(a) * rr - ph * 18;
              const fs = (1 - ph) * z.r * .22;
              ctx.fillStyle = `rgba(255,${120 + Math.round(100 * (1 - ph))},50,${.38 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(fx, fy, fs * .55, fs * 1.4, 0, 0, Math.PI * 2); ctx.fill();
            }
          } else {
            ctx.strokeStyle = `rgba(${hot},.55)`; ctx.lineWidth = 3;
            for (let i = 0; i < 3; i++) { const a0 = now / 260 + (i / 3) * Math.PI * 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * .62, a0, a0 + 1.4); ctx.stroke(); }
          }
          const ik = (age - WARN) / 200;
          if (ik < 1) { // ignition flash
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = `rgba(255,255,255,${.85 * (1 - ik)})`; ctx.lineWidth = 6 * (1 - ik) + 1;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1 + ik * .35), 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // the hero: a class-coloured glow, a short trail and the class crest in a gold ring
      const dead = s.state === "done" && s.deadAt > 0;
      const hc = CLASS_COLOR[cls0.current] ?? "#D9CCAE";
      if (s.state === "on" && !reduced) { s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 12) s.trail.shift(); }
      if (!dead) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < s.trail.length; i++) {
          const p = s.trail[i], a = (i / s.trail.length) * .28;
          ctx.globalAlpha = a; ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(p.x, p.y, HERO * (.4 + .6 * i / s.trail.length), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const hg = ctx.createRadialGradient(s.x, s.y, HERO * .6, s.x, s.y, HERO * 3.2);
        hg.addColorStop(0, hc + "aa"); hg.addColorStop(1, hc + "00");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(s.x, s.y, HERO * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(s.x + 2, s.y + 5, HERO * 1.05, HERO * .55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(s.x, s.y, HERO + 2, 0, Math.PI * 2); ctx.clip();
      const icon = icons.current[cls0.current];
      if (icon?.complete && icon.naturalWidth) ctx.drawImage(icon, s.x - HERO - 2, s.y - HERO - 2, (HERO + 2) * 2, (HERO + 2) * 2);
      else { ctx.fillStyle = hc; ctx.fillRect(s.x - HERO - 2, s.y - HERO - 2, (HERO + 2) * 2, (HERO + 2) * 2); }
      if (dead) { ctx.fillStyle = "rgba(30,25,20,.75)"; ctx.fillRect(s.x - HERO - 2, s.y - HERO - 2, (HERO + 2) * 2, (HERO + 2) * 2); }
      ctx.restore();
      ctx.strokeStyle = dead ? "#666" : "#FFD100"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, HERO + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, HERO + 3.5, 0, Math.PI * 2); ctx.stroke();

      // sparks and embers
      if (!frozen) for (const p of s.sparks) { p.x += p.vx; p.y += p.vy; p.vx *= .95; p.vy = p.vy * .95 - .02; p.life -= .03; }
      for (const p of s.sparks) { if (p.life <= 0) continue; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; s.sparks = s.sparks.filter((p) => p.life > 0);

      // "Close!" call-outs
      for (const cl of s.close) {
        const ck = (now - cl.t) / 700; if (ck > 1) continue;
        ctx.globalAlpha = 1 - ck; ctx.font = `700 16px ${BODY}`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#ffe27a";
        ctx.strokeText("Close!", cl.x, cl.y - 22 - ck * 18); ctx.fillText("Close!", cl.x, cl.y - 22 - ck * 18);
      }
      ctx.globalAlpha = 1; s.close = s.close.filter((cl) => now - cl.t < 700);

      // the survival clock, popping at every 10 seconds
      if (s.state !== "ready") {
        const t = s.state === "on" ? (now - s.t0) / 1000 : (s.deadAt - s.t0) / 1000;
        const mk = Math.min(1, (now - s.mileAt) / 600), pop = reduced ? 1 : 1 + (mk < 1 ? .3 * Math.sin(mk * Math.PI) : 0);
        ctx.save(); ctx.translate(AW / 2, 46); ctx.scale(pop, pop);
        ctx.font = `700 40px ${BODY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
        ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(`${t.toFixed(1)}s`, 0, 0);
        ctx.fillStyle = dead ? "#ff8a7a" : mk < 1 ? "#FFD100" : "#fff"; ctx.fillText(`${t.toFixed(1)}s`, 0, 0);
        ctx.restore();
        if (mk < 1 && s.mile > 0) {
          ctx.globalAlpha = 1 - mk; ctx.font = `700 16px ${BODY}`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#FFD100";
          ctx.strokeText(`${s.mile * 10} seconds!`, AW / 2, 84 + mk * 10); ctx.fillText(`${s.mile * 10} seconds!`, AW / 2, 84 + mk * 10); ctx.globalAlpha = 1;
        }
      }
      // white flash on death
      const fk = (now - s.deadAt) / 260;
      if (dead && fk < 1 && !reduced) { ctx.fillStyle = `rgba(255,240,220,${.6 * (1 - fk)})`; ctx.fillRect(-10, -10, AW + 20, AH + 20); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  const classPicker = (
    <div className="fr-classes" role="group" aria-label="Your hero's class">
      {CLASSES.map((c) => (
        <button key={c} type="button" className="fr-class" aria-pressed={cls === c} aria-label={c[0].toUpperCase() + c.slice(1)} title={c[0].toUpperCase() + c.slice(1)}
          style={{ ["--cc" as string]: CLASS_COLOR[c] }} onClick={() => pick(c)}>
          <img src={CLASS_ICON[c]} alt="" width={30} height={30} />
        </button>
      ))}
    </div>
  );
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <Machine theme="fire" label="Don't Stand in the Fire" className="fr-machine" hud={<>
          <Readout label="Survived" tone="gold"><span ref={timeEl}>0.0s</span></Readout>
          <Readout label="Best">{sk.best ? `${(sk.best / 10).toFixed(1)}s` : "—"}</Readout>
          <ResultStrip items={chips} label="Recent pulls" />
        </>}>
          <div ref={wrap} className="fr-wrap">
            <div className={`fr-frame fr-${state}`}>
              <canvas ref={cv} className="fr-canvas" aria-label="Arena. Move your hero out of the marked zones before they ignite." />
              {state === "ready" && (
                <SkillOverlay>
                  <strong className="snake-big">Don&apos;t Stand in the Fire</strong>
                  <span className="soft">Zones are marked, then they burn. Be somewhere else when they do.</span>
                  {classPicker}
                  <button type="button" className="btn btn-primary btn-lg" onClick={start}>Pull the boss</button>
                </SkillOverlay>
              )}
              {state === "done" && (
                <SkillOverlay>
                  <strong className="snake-big">{final > bestAtStart.current && final > 0 ? "New best!" : "You stood in the fire"}</strong>
                  <span className="fr-final">{(final / 10).toFixed(1)}<small>s</small></span>
                  <SkillResultLine game="fire" result={sk.result} />
                  {classPicker}
                  <button type="button" className="btn btn-primary btn-lg" onClick={start}>Run it back</button>
                </SkillOverlay>
              )}
            </div>
          </div>
        </Machine>
      </div>
      <SkillPanel game="fire" how={<>Your hero follows your mouse or finger (or use WASD / arrows). Dashed rings fill up, then ignite: orange fire anywhere, purple void right where you stand, and beams across the room after a while. Survive as long as you can.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
