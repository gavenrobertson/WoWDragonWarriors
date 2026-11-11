"use client";
// Gryphon Flight: flap through the gaps between Stormwind-grey towers. Score = towers passed.
// Drawn on a canvas inside the arcade cabinet: parallax dusk layers are painted once to offscreen canvases
// and copied each frame; the simulation runs at a fixed 60 steps a second.
import { useCallback, useEffect, useRef, useState } from "react";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const VW = 480, VH = 640; // virtual canvas size; scaled to fit
const GAP0 = 190, TOWER_W = 74, SPEED0 = 2.6;
const GX = 120, GROUND = 40;
const TITLE_FONT = '700 58px "Alegreya Sans", system-ui, sans-serif', BODY_FONT = '700 18px "Alegreya Sans", system-ui, sans-serif';
type Phase = "ready" | "on" | "dying" | "done";
type Feather = { x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; c: string };
type Layers = { ps: number; sky: HTMLCanvasElement; far: HTMLCanvasElement; clouds: HTMLCanvasElement; mid: HTMLCanvasElement; near: HTMLCanvasElement; ground: HTMLCanvasElement; tower: HTMLCanvasElement };

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** An offscreen canvas at device resolution, drawn in virtual units. */
function layer(w: number, h: number, ps: number, paint: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * ps)); c.height = Math.max(1, Math.round(h * ps));
  const x = c.getContext("2d")!; x.scale(ps, ps); paint(x);
  return c;
}

/** A ridge line that repeats every VW units, so the strip tiles without a seam. */
function ridge(base: number, amp: number, freqs: number[]) {
  const ph = freqs.map(() => Math.random() * Math.PI * 2), am = freqs.map((_, i) => amp / (i + 1));
  return (x: number) => base - freqs.reduce((s, f, i) => s + am[i] * (0.5 + 0.5 * Math.sin((x / VW) * Math.PI * 2 * f + ph[i])), 0);
}

/** Sharp-peaked mountains, also repeating every VW units. */
function peaks(base: number, amp: number, freqs: number[]) {
  const ph = freqs.map(() => Math.random() * Math.PI), am = freqs.map((_, i) => amp / (i * .8 + 1));
  return (x: number) => base - freqs.reduce((s, f, i) => s + am[i] * Math.pow(1 - Math.abs(Math.sin((x / VW) * Math.PI * f + ph[i])), 1.7), 0);
}

function buildLayers(ps: number): Layers {
  const sky = layer(VW, VH, ps, (x) => {
    const g = x.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, "#0b1238"); g.addColorStop(.38, "#2b2462"); g.addColorStop(.62, "#7a4a86"); g.addColorStop(.8, "#d77d5c"); g.addColorStop(1, "#f6b26b");
    x.fillStyle = g; x.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 90; i++) {
      const sy = Math.random() * VH * .45;
      x.globalAlpha = (1 - sy / (VH * .45)) * (.3 + Math.random() * .7);
      x.fillStyle = Math.random() < .2 ? "#ffe9b0" : "#fff";
      x.fillRect(Math.random() * VW, sy, Math.random() < .1 ? 2 : 1, Math.random() < .1 ? 2 : 1);
    }
    x.globalAlpha = 1;
    // a low sun behind the far range
    const sun = x.createRadialGradient(VW * .7, VH * .66, 4, VW * .7, VH * .66, 210);
    sun.addColorStop(0, "rgba(255,240,190,.95)"); sun.addColorStop(.12, "rgba(255,200,120,.75)"); sun.addColorStop(.4, "rgba(255,140,90,.22)"); sun.addColorStop(1, "rgba(255,120,80,0)");
    x.fillStyle = sun; x.fillRect(0, 0, VW, VH);
  });
  const far = layer(VW, VH, ps, (x) => {
    const h = peaks(VH * .74, 120, [2, 3, 5]);
    const g = x.createLinearGradient(0, VH * .45, 0, VH); g.addColorStop(0, "#6b4f8f"); g.addColorStop(1, "#3a2b5c");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, VH);
    for (let i = 0; i <= VW; i += 4) x.lineTo(i, h(i));
    x.lineTo(VW, VH); x.closePath(); x.fill();
    // a rim of sunset light on the ridge
    x.strokeStyle = "rgba(255,190,140,.35)"; x.lineWidth = 1.5; x.beginPath();
    x.moveTo(0, h(0) + 1);
    for (let i = 4; i <= VW; i += 4) x.lineTo(i, h(i) + 1);
    x.stroke();
  });
  const clouds = layer(VW, VH, ps, (x) => {
    for (let i = 0; i < 7; i++) {
      const cx = (i / 7) * VW + Math.random() * 40, cy = 60 + Math.random() * VH * .38, s = .5 + Math.random() * .8;
      for (const dx of [-VW, 0, VW]) {
        const g = x.createLinearGradient(0, cy - 24 * s, 0, cy + 16 * s);
        g.addColorStop(0, "rgba(255,214,190,.22)"); g.addColorStop(1, "rgba(150,110,170,.08)");
        x.fillStyle = g; x.beginPath();
        for (const [ex, ey, rx, ry] of [[0, 0, 64, 15], [26, -10, 38, 15], [-30, -4, 30, 11]]) {
          x.moveTo(cx + dx + (ex + rx) * s, cy + ey * s); x.ellipse(cx + dx + ex * s, cy + ey * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        }
        x.fill();
      }
    }
  });
  const mid = layer(VW, VH, ps, (x) => {
    const h = ridge(VH * .8, 40, [1, 4, 9]);
    x.fillStyle = "#2a1f45"; x.beginPath(); x.moveTo(0, VH);
    for (let i = 0; i <= VW; i += 4) x.lineTo(i, h(i));
    x.lineTo(VW, VH); x.fill();
    // a distant city: spires with blue roofs and lit windows
    for (const cx of [70, 96, 118, 300, 330, 352, 372]) {
      const tw = 10 + (cx % 7), th = 40 + ((cx * 7) % 50), by = h(cx) + 6;
      x.fillStyle = "#231a3d"; x.fillRect(cx - tw / 2, by - th, tw, th);
      x.fillStyle = "#1e2a5c"; x.beginPath(); x.moveTo(cx - tw / 2 - 3, by - th); x.lineTo(cx, by - th - tw * 1.8); x.lineTo(cx + tw / 2 + 3, by - th); x.fill();
      x.fillStyle = "rgba(255,200,110,.85)";
      for (let wy = by - th + 8; wy < by - 6; wy += 11) if ((wy + cx) % 3 !== 0) x.fillRect(cx - 1, wy, 2, 4);
    }
  });
  const near = layer(VW, VH, ps, (x) => {
    const h = ridge(VH - GROUND - 6, 46, [2, 5, 11]);
    const g = x.createLinearGradient(0, VH - 150, 0, VH); g.addColorStop(0, "#1c2236"); g.addColorStop(1, "#0f131f");
    x.fillStyle = g; x.beginPath(); x.moveTo(0, VH);
    for (let i = 0; i <= VW; i += 4) x.lineTo(i, h(i));
    x.lineTo(VW, VH); x.fill();
    // pines along the hills (drawn three times so the ones on the seam wrap)
    const pines = Array.from({ length: 16 }, () => ({ px: Math.random() * VW, s: .6 + Math.random() * .8 }));
    x.fillStyle = "#121827";
    for (const p of pines) for (const dx of [-VW, 0, VW]) {
      const bx = p.px + dx, by = h(((p.px % VW) + VW) % VW) + 4, ph = 34 * p.s;
      x.beginPath(); x.moveTo(bx, by - ph); x.lineTo(bx + 9 * p.s, by); x.lineTo(bx - 9 * p.s, by); x.fill();
    }
  });
  const ground = layer(VW, GROUND, ps, (x) => {
    const g = x.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, "#4a3220"); g.addColorStop(1, "#24170c");
    x.fillStyle = g; x.fillRect(0, 0, VW, GROUND);
    x.fillStyle = "#4f7a2a"; x.fillRect(0, 0, VW, 7);
    x.fillStyle = "#6d9c38"; x.fillRect(0, 0, VW, 2);
    for (let i = 0; i < VW; i += 24) { // grass tufts and stones; the tile repeats every VW
      x.fillStyle = "#3e6421"; x.beginPath(); x.moveTo(i, 7); x.lineTo(i + 6, 12); x.lineTo(i + 12, 7); x.fill();
      x.fillStyle = "rgba(0,0,0,.25)"; x.fillRect(i + 4, 18 + ((i / 24) % 3) * 6, 9, 3);
    }
  });
  const tower = layer(TOWER_W, VH, ps, (x) => {
    const st = x.createLinearGradient(0, 0, TOWER_W, 0);
    st.addColorStop(0, "#4a4f5e"); st.addColorStop(.35, "#a6adbd"); st.addColorStop(.6, "#8a91a2"); st.addColorStop(1, "#3c404c");
    x.fillStyle = st; x.fillRect(0, 0, TOWER_W, VH);
    for (let row = 0, y = 0; y < VH; row++, y += 18) {
      x.fillStyle = "rgba(0,0,0,.28)"; x.fillRect(0, y, TOWER_W, 1.5);
      x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(0, y + 1.5, TOWER_W, 1);
      for (let bx = row % 2 ? 12 : 0; bx < TOWER_W; bx += 25) { x.fillStyle = "rgba(0,0,0,.24)"; x.fillRect(bx, y, 1.5, 18); }
      if (Math.random() < .25) { x.fillStyle = "rgba(60,90,40,.25)"; x.fillRect(Math.random() * TOWER_W, y + 3, 10, 6); }
    }
    // arrow-slit windows, some lit
    for (let y = 60; y < VH; y += 130) {
      const lit = Math.random() < .6;
      x.fillStyle = "#1a1620"; x.fillRect(TOWER_W / 2 - 3, y, 6, 16);
      if (lit) { x.fillStyle = "rgba(255,190,90,.9)"; x.fillRect(TOWER_W / 2 - 2, y + 2, 4, 12); }
    }
  });
  return { ps, sky, far, clouds, mid, near, ground, tower };
}

/** The gryphon, facing right, around (0, 0). `wing` runs -1 (up) to 1 (down). */
function drawGryphon(x: CanvasRenderingContext2D, wing: number, dead: boolean) {
  const wingPath = (spread: number, col: string, edge: string) => {
    x.save(); x.rotate(-0.25 + wing * 0.85);
    x.fillStyle = col; x.beginPath(); x.moveTo(4, 0);
    x.quadraticCurveTo(-6, -22 * spread, -30, -30 * spread);
    for (let i = 0; i < 4; i++) { x.lineTo(-30 + i * 7, -22 * spread + i * 4 * spread); x.lineTo(-24 + i * 7, -26 * spread + i * 6 * spread); }
    x.lineTo(2, -4); x.closePath(); x.fill();
    x.strokeStyle = edge; x.lineWidth = 1; x.stroke();
    x.restore();
  };
  // far wing
  x.save(); x.translate(-2, -4); wingPath(.9, dead ? "#555" : "#8a5a1c", "rgba(0,0,0,.3)"); x.restore();
  // tail tuft
  x.fillStyle = dead ? "#4a4a4a" : "#8a5a1c"; x.beginPath(); x.moveTo(-20, 2); x.quadraticCurveTo(-34, -2, -40, -10); x.quadraticCurveTo(-36, 4, -42, 8); x.quadraticCurveTo(-32, 8, -20, 7); x.fill();
  // legs
  x.fillStyle = dead ? "#444" : "#a8742a";
  x.beginPath(); x.ellipse(-12, 11, 5, 4, .4, 0, Math.PI * 2); x.fill();
  x.fillStyle = dead ? "#666" : "#e0b04a"; x.fillRect(8, 9, 3, 7); x.fillRect(12, 9, 3, 6);
  // body: a lion's barrel, lit from the sunset
  const bg = x.createLinearGradient(0, -12, 0, 14);
  bg.addColorStop(0, dead ? "#888" : "#e8a84a"); bg.addColorStop(1, dead ? "#444" : "#9a5f1e");
  x.fillStyle = bg; x.beginPath(); x.ellipse(-4, 2, 22, 12, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "rgba(0,0,0,.35)"; x.lineWidth = 1; x.stroke();
  // Alliance saddle cloth
  x.fillStyle = dead ? "#555" : "#2a4fb0"; x.beginPath(); x.moveTo(-14, -9); x.lineTo(4, -10); x.lineTo(2, 4); x.lineTo(-12, 5); x.closePath(); x.fill();
  x.fillStyle = dead ? "#777" : "#ffd100"; x.fillRect(-13, 3, 14, 2);
  // head: white feathers, golden beak
  x.fillStyle = dead ? "#aaa" : "#f4ecd8"; x.beginPath(); x.arc(15, -6, 10, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(6, -12); x.lineTo(2, -20); x.lineTo(11, -14); x.fill(); // ear tuft
  x.fillStyle = dead ? "#888" : "#ffc21a"; x.beginPath(); x.moveTo(23, -9); x.quadraticCurveTo(34, -7, 31, -1); x.lineTo(23, -3); x.fill();
  if (dead) {
    x.strokeStyle = "#111"; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(15, -11); x.lineTo(20, -6); x.moveTo(20, -11); x.lineTo(15, -6); x.stroke();
  } else {
    x.fillStyle = "#111"; x.beginPath(); x.arc(18, -8, 2, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#fff"; x.fillRect(18.4, -9.2, 1, 1);
  }
  // near wing, over the body
  x.save(); x.translate(-4, -6); wingPath(1.1, dead ? "#777" : "#c98a2e", "rgba(60,30,0,.55)"); x.restore();
}

export function Gryphon({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("gryphon", best0, leftToday0);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [score, setScore] = useState(0);
  const [w, setW] = useState(400);
  const [chips, setChips] = useState<Chip[]>([]);
  const g = useRef({
    y: VH / 2, vy: 0, towers: [] as { x: number; gap: number; size: number; passed: boolean }[], score: 0, t: 0, flap: -1e9, state: "ready" as Phase,
    dist: 0, tilt: 0, popAt: -1e9, mileAt: -1e9, deadAt: 0, dieSteps: 0, landed: false, feathers: [] as Feather[], shakeAt: -1e9, rings: [] as { x: number; y: number; t: number }[],
  });
  const layers = useRef<Layers | null>(null);
  const bestAtStart = useRef(best0);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setW(Math.max(240, Math.min(el.clientWidth, Math.round((window.innerHeight - 380) * VW / VH), 480)));
    const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // a run that earned marks gets the arcade's coin burst
  useEffect(() => { if (sk.result && sk.result.earned > 0) celebrate({ mult: 2, won: sk.result.earned }); }, [sk.result]);

  const reset = () => {
    const s = g.current;
    s.y = VH / 2; s.vy = 0; s.towers = []; s.score = 0; s.t = 0; s.tilt = 0; s.feathers = []; s.rings = []; s.landed = false; s.popAt = -1e9; s.mileAt = -1e9;
    setScore(0);
  };
  const flap = useCallback(() => {
    const s = g.current;
    if (s.state === "on") { s.vy = -7.2; s.flap = performance.now(); play("whoosh", { vol: .28, pitch: 1.2 }); }
  }, []);
  const start = () => {
    bestAtStart.current = sk.best;
    reset(); g.current.state = "on"; setState("on"); sk.begin(); play("launch", { vol: .5 }); flap();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") {
        if (g.current.state === "on") { e.preventDefault(); flap(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1), k = w / VW, ps = dpr * k;
    c.width = Math.round(w * dpr); c.height = Math.round(VH * k * dpr); c.style.width = `${w}px`; c.style.height = `${VH * k}px`;
    if (!layers.current || Math.abs(layers.current.ps - ps) > .01) layers.current = buildLayers(ps);
    const L = layers.current;
    let raf = 0, last = performance.now(), acc = 0;
    const reduced = reducedMotion();

    const end = () => {
      const s = g.current, now = performance.now();
      s.deadAt = now; s.shakeAt = now; s.dieSteps = 0;
      play("crash", { vol: .55 }); buzz("fail");
      const final = s.score, best = bestAtStart.current;
      setChips((cs) => [{ k: now, label: String(final), tone: (final > 0 && final > best ? "big" : final >= 10 ? "win" : final > 0 ? "neutral" : "lose") as Chip["tone"] }, ...cs].slice(0, 14));
      void sk.end(final);
      if (reduced) { s.state = "done"; setState("done"); return; }
      s.state = "dying";
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
        s.feathers.push({ x: GX, y: s.y, vx: Math.cos(a) * v - 1, vy: Math.sin(a) * v - 1.5, r: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 1, c: Math.random() < .5 ? "#f4ecd8" : "#c98a2e" });
      }
    };
    const tick = () => {
      const s = g.current;
      if (s.state !== "on") return;
      s.t++;
      s.vy = Math.min(11, s.vy + 0.42); s.y += s.vy;
      const speed = SPEED0 + Math.min(2.4, s.score * 0.06), gap = Math.max(130, GAP0 - s.score * 2.5);
      s.dist += speed;
      const lastT = s.towers[s.towers.length - 1];
      if (!lastT || lastT.x < VW - 240) s.towers.push({ x: VW + 20, gap: 90 + Math.random() * (VH - 180 - gap), size: gap, passed: false });
      for (const t of s.towers) {
        t.x -= speed;
        if (!t.passed && t.x + TOWER_W < 120) {
          t.passed = true; s.score++; setScore(s.score);
          const now = performance.now(); s.popAt = now;
          if (s.score % 10 === 0) { s.mileAt = now; play("win"); buzz("win"); if (!reduced) s.rings.push({ x: GX, y: s.y, t: now }); }
          else play("reveal", { pitch: ladder(s.score % 10), vol: .8 });
        }
      }
      s.towers = s.towers.filter((t) => t.x > -TOWER_W - 10);
      // collisions (gryphon ~ circle r 18 at x 120)
      if (s.y < 14) { s.y = 14; s.vy = Math.max(0, s.vy); }
      if (s.y > VH - 40) return end();
      for (const t of s.towers) if (120 + 18 > t.x && 120 - 18 < t.x + TOWER_W && (s.y - 16 < t.gap || s.y + 16 > t.gap + t.size)) return end();
    };
    // after a crash: a short hit-stop, then the gryphon tumbles to the ground
    const fall = () => {
      const s = g.current;
      if (++s.dieSteps <= 4) return; // ~60ms hit-stop
      if (!s.landed) {
        s.vy = Math.min(12, s.vy + 0.6); s.y += s.vy; s.tilt += (1.5 - s.tilt) * .08;
        if (s.y >= VH - GROUND - 10) { s.y = VH - GROUND - 10; s.landed = true; play("thud"); }
      }
      if (s.dieSteps > 56) { s.state = "done"; setState("done"); }
    };
    const tile = (img: HTMLCanvasElement, f: number, y = 0, h = VH) => {
      const off = -((g.current.dist * f) % VW);
      ctx.drawImage(img, off, y, VW, h); ctx.drawImage(img, off + VW, y, VW, h);
    };

    const draw = (now: number) => {
      const s = g.current;
      acc += Math.min(100, now - last); last = now;
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60;
        if (s.state === "on") tick();
        else if (s.state === "dying") fall();
        else if (s.state === "ready") s.dist += 1.4; // the attract screen keeps the world drifting by
      }
      ctx.setTransform(ps, 0, 0, ps, 0, 0);
      // a small shake on the crash
      const sk2 = now - s.shakeAt;
      if (sk2 < 180 && !reduced) { const a = 4 * (1 - sk2 / 180); ctx.translate((Math.random() - .5) * a * 2, (Math.random() - .5) * a * 2); }
      ctx.drawImage(L.sky, 0, 0, VW, VH);
      tile(L.far, .08); tile(L.clouds, .18); tile(L.mid, .3); tile(L.near, .55);

      // towers: brick shafts with a blue-and-gold coping at the gap
      const ty = L.tower.height / VH;
      for (const t of s.towers) {
        const botY = t.gap + t.size, botH = VH - GROUND - botY;
        ctx.drawImage(L.tower, 0, (VH - t.gap) * ty, L.tower.width, t.gap * ty, t.x, 0, TOWER_W, t.gap);
        if (botH > 0) ctx.drawImage(L.tower, 0, 0, L.tower.width, botH * ty, t.x, botY, TOWER_W, botH);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(t.x + TOWER_W - 6, 0, 6, t.gap); ctx.fillRect(t.x + TOWER_W - 6, botY, 6, botH);
        // top tower: a pointed blue roof band hanging into the gap edge
        ctx.fillStyle = "#24408f"; ctx.fillRect(t.x - 6, t.gap - 16, TOWER_W + 12, 12);
        ctx.fillStyle = "#3a5fc4"; ctx.fillRect(t.x - 6, t.gap - 16, TOWER_W + 12, 3);
        ctx.fillStyle = "#e0b04a"; ctx.fillRect(t.x - 6, t.gap - 4, TOWER_W + 12, 4);
        for (let i = 0; i < 5; i++) { ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(t.x + 6 + i * 15.5, t.gap - 10, 1.6, 0, Math.PI * 2); ctx.fill(); }
        // bottom tower: battlements
        ctx.fillStyle = "#e0b04a"; ctx.fillRect(t.x - 6, botY + 12, TOWER_W + 12, 4);
        ctx.fillStyle = "#7d8494";
        for (let i = 0; i < 5; i++) ctx.fillRect(t.x - 6 + i * ((TOWER_W + 12) / 5) + 2, botY, (TOWER_W + 12) / 5 - 5, 12);
        ctx.fillStyle = "#24408f"; ctx.fillRect(t.x - 6, botY + 16, TOWER_W + 12, 4);
        // a hanging Alliance banner on the lower shaft
        if (botH > 70) {
          const bx = t.x + TOWER_W / 2 - 11, by = botY + 26;
          ctx.fillStyle = "#1f3f9a"; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 22, by); ctx.lineTo(bx + 22, by + 34); ctx.lineTo(bx + 11, by + 28); ctx.lineTo(bx, by + 34); ctx.fill();
          ctx.strokeStyle = "#e0b04a"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = "#ffd100"; ctx.beginPath(); ctx.arc(bx + 11, by + 12, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // ground scrolls with the towers
      tile(L.ground, 1, VH - GROUND, GROUND);

      // milestone rings
      for (const r of s.rings) {
        const k2 = (now - r.t) / 600; if (k2 > 1) continue;
        ctx.strokeStyle = `rgba(255,209,0,${1 - k2})`; ctx.lineWidth = 4 * (1 - k2) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, 20 + k2 * 70, 0, Math.PI * 2); ctx.stroke();
      }
      s.rings = s.rings.filter((r) => now - r.t < 600);

      // the gryphon: tilt follows velocity, wings beat on a flap and glide between
      const dead = s.state === "dying" || (s.state === "done" && s.deadAt > 0);
      let gy = s.y;
      if (s.state === "ready") gy = VH * .74 + Math.sin(now / 380) * 10;
      if (s.state === "on") s.tilt += (Math.max(-0.5, Math.min(0.9, s.vy / 12)) - s.tilt) * .25;
      const since = now - s.flap;
      const wing = dead ? 0.6 : s.state === "ready" ? Math.sin(now / 120) : since < 260 ? Math.cos((since / 260) * Math.PI * 2) * -1 : Math.sin(now / 160) * .25;
      ctx.save(); ctx.translate(GX, gy); ctx.rotate(s.state === "ready" ? Math.sin(now / 380 + 1) * .08 : s.tilt);
      ctx.scale(1.18, 1.18);
      drawGryphon(ctx, wing, dead);
      ctx.restore();

      // feathers from the crash
      for (const f of s.feathers) {
        f.vy += .08; f.vx *= .98; f.x += f.vx; f.y += f.vy; f.r += f.vr; f.life -= .012;
        if (f.life <= 0) continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, f.life * 1.5); ctx.translate(f.x, f.y); ctx.rotate(f.r);
        ctx.fillStyle = f.c; ctx.beginPath(); ctx.ellipse(0, 0, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      s.feathers = s.feathers.filter((f) => f.life > 0);

      // the score, popping on each tower
      if (s.state !== "ready") {
        const pk = Math.min(1, (now - s.popAt) / 280), mk = Math.min(1, (now - s.mileAt) / 700);
        const pop = reduced ? 1 : 1 + .38 * Math.pow(1 - pk, 2) + (mk < 1 ? .25 * Math.sin(mk * Math.PI) : 0);
        ctx.save(); ctx.translate(VW / 2, 70); ctx.scale(pop, pop);
        ctx.font = TITLE_FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 7; ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.strokeText(String(s.score), 0, 0);
        ctx.fillStyle = mk < 1 ? "#FFD100" : "#fff"; ctx.shadowColor = mk < 1 ? "rgba(255,209,0,.8)" : "rgba(0,0,0,0)"; ctx.shadowBlur = 20;
        ctx.fillText(String(s.score), 0, 0);
        ctx.restore();
        if (mk < 1) {
          ctx.save(); ctx.globalAlpha = 1 - mk; ctx.font = BODY_FONT; ctx.textAlign = "center";
          ctx.fillStyle = "#FFD100"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
          ctx.strokeText(`${s.score} towers!`, VW / 2, 120 - mk * 14); ctx.fillText(`${s.score} towers!`, VW / 2, 120 - mk * 14);
          ctx.restore();
        }
      }
      // the white flash on impact
      const fk = (now - s.deadAt) / 240;
      if (s.deadAt && fk < 1 && fk >= 0 && !reduced && s.state !== "ready") { ctx.fillStyle = `rgba(255,255,255,${.75 * (1 - fk)})`; ctx.fillRect(-10, -10, VW + 20, VH + 20); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  const runMarks = Math.min(rules.maxRun, score * rules.perPoint, sk.left);
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <Machine theme="sky" label="Gryphon Flight" className="gr-machine" hud={<>
          <Readout label="Towers" tone="gold">{score}</Readout>
          <Readout label="Best">{Math.max(sk.best, state === "on" ? score : 0) || "—"}</Readout>
          <Readout label="This run">{sk.signedIn ? `+${runMarks}` : "—"}</Readout>
          <ResultStrip items={chips} label="Recent flights" />
        </>}>
          <div ref={wrap} className="gr-wrap">
            <div className={`gr-frame gr-${state}`} onPointerDown={(e) => { if (state === "on") { e.preventDefault(); flap(); } }}>
              <canvas ref={cv} className="gr-canvas" aria-label={`Gryphon Flight. Score ${score}. Tap, click or press space to flap.`} />
              {state === "ready" && (
                <SkillOverlay>
                  <strong className="snake-big">Gryphon Flight</strong>
                  <span className="soft">Tap, click or press space to flap. Fly through the gaps.</span>
                  <button type="button" className="btn btn-primary btn-lg" onClick={start}>Take off</button>
                </SkillOverlay>
              )}
              {state === "done" && (
                <SkillOverlay>
                  <span className="gr-crest" aria-hidden="true" />
                  <strong className="snake-big">{score > 0 && score > bestAtStart.current ? "New best!" : "Grounded"}</strong>
                  <span className="gr-final"><strong>{score}</strong> <span className="micro muted">tower{score === 1 ? "" : "s"}</span></span>
                  <SkillResultLine game="gryphon" result={sk.result} />
                  <button type="button" className="btn btn-primary btn-lg" onClick={start}>Fly again</button>
                </SkillOverlay>
              )}
            </div>
          </div>
        </Machine>
      </div>
      <SkillPanel game="gryphon" how={<>Each flap lifts your gryphon; gravity does the rest. Pass between the towers without touching them or the ground. The gaps tighten and the wind picks up as you go.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
