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
    let w = 0, h = 0, raf = 0, last = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const count = Math.round(Math.min(60, Math.max(24, (w * h) / 32000)));
    const spawn = (initial = false): P => ({
      x: Math.random() * w, y: initial ? Math.random() * h : h + 10, r: 0.6 + Math.random() * 1.8,
      vy: 12 + Math.random() * 28, vx: -6 + Math.random() * 12, life: 0, max: 6 + Math.random() * 9,
      hue: HUES[(Math.random() * HUES.length) | 0], phase: Math.random() * Math.PI * 2,
    });
    const ps: P[] = Array.from({ length: count }, () => spawn(true));
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(t / 900 + p.phase) * 8) * dt;
        if (p.life > p.max || p.y < -10) { ps[i] = spawn(); continue; }
        const fade = Math.min(1, p.life / 1.2) * Math.max(0, 1 - p.life / p.max);
        const flicker = 0.75 + 0.25 * Math.sin(t / 120 + p.phase * 3);
        const a = 0.55 * fade * flicker;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `rgba(${p.hue},${a})`); g.addColorStop(1, `rgba(${p.hue},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return <canvas ref={ref} className="embers" aria-hidden="true" />;
}
