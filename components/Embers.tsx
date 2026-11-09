"use client";
// Drifting dragonfire embers behind the page. Canvas, ~50 particles, paused when the tab is hidden,
// skipped entirely under prefers-reduced-motion.
import { useEffect, useRef } from "react";

type P = { x: number; y: number; r: number; vy: number; vx: number; life: number; max: number; hue: string; phase: number };
const HUES = ["255,196,92", "255,150,60", "227,179,65", "176,120,255"];

export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, last = performance.now(), started = false, stop = false;
    const small = window.innerWidth < 760 || matchMedia("(pointer: coarse)").matches;
    const dpr = small ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const frameMs = small ? 1000 / 30 : 0; // phones: 30fps is plenty for slow embers
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    // One pre-drawn glow per colour, so each frame is just cheap drawImage calls.
    const sprites = HUES.map((hue) => {
      const c = document.createElement("canvas"); c.width = c.height = 48;
      const g = c.getContext("2d")!, grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      grad.addColorStop(0, `rgba(${hue},1)`); grad.addColorStop(1, `rgba(${hue},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, 48, 48);
      return c;
    });
    const count = Math.round(small ? Math.min(18, Math.max(10, (w * h) / 40000)) : Math.min(50, Math.max(24, (w * h) / 32000)));
    const spawn = (initial = false): P => ({
      x: Math.random() * w, y: initial ? Math.random() * h : h + 10, r: 0.6 + Math.random() * 1.8,
      vy: 12 + Math.random() * 28, vx: -6 + Math.random() * 12, life: 0, max: 6 + Math.random() * 9,
      hue: String((Math.random() * HUES.length) | 0), phase: Math.random() * Math.PI * 2,
    });
    const ps: P[] = Array.from({ length: count }, () => spawn(true));
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (frameMs && t - last < frameMs) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(t / 900 + p.phase) * 8) * dt;
        if (p.life > p.max || p.y < -10) { ps[i] = spawn(); continue; }
        const fade = Math.min(1, p.life / 1.2) * Math.max(0, 1 - p.life / p.max);
        const flicker = 0.75 + 0.25 * Math.sin(t / 120 + p.phase * 3);
        ctx.globalAlpha = 0.55 * fade * flicker;
        const size = p.r * 12;
        ctx.drawImage(sprites[Number(p.hue)], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };
    const run = () => { if (stop || started) return; started = true; last = performance.now(); raf = requestAnimationFrame(frame); };
    // Start only once the page has loaded and gone idle, so embers never compete with the first paint.
    const begin = () => ("requestIdleCallback" in window ? (window as unknown as { requestIdleCallback: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1200));
    if (document.readyState === "complete") begin(); else window.addEventListener("load", begin, { once: true });
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && started) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("load", begin); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return <canvas ref={ref} className="embers" aria-hidden="true" />;
}
