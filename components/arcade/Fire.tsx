"use client";
// Don't Stand in the Fire: fire zones mark the ground, then ignite. Keep your hero out of them.
// Score = tenths of a second survived. Move with the mouse, a finger, or WASD/arrows.
import { useCallback, useEffect, useRef, useState } from "react";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const AW = 600, AH = 600, HERO = 11, WARN = 900, BURN = 1300;
type Zone = { x: number; y: number; r: number; born: number; kind: "fire" | "void" | "line"; a?: number };

export function Fire({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("fire", best0, leftToday0);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [time, setTime] = useState(0);
  const g = useRef({ x: AW / 2, y: AH / 2, tx: AW / 2, ty: AH / 2, zones: [] as Zone[], t0: 0, next: 0, keys: new Set<string>(), state: "ready" as "ready" | "on" | "done", deadAt: 0 });

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setW(Math.min(el.clientWidth, window.innerHeight - 240, 600));
    const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  const start = () => {
    const s = g.current;
    Object.assign(s, { x: AW / 2, y: AH / 2, tx: AW / 2, ty: AH / 2, zones: [], t0: performance.now(), next: performance.now() + 500, state: "on" });
    setTime(0); setState("on"); sk.begin();
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
    const dpr = Math.min(2, window.devicePixelRatio || 1), k = w / AW;
    c.width = w * dpr; c.height = w * dpr; c.style.width = `${w}px`; c.style.height = `${w}px`;
    let raf = 0, lastT = performance.now();
    const lit = (z: Zone, now: number) => now - z.born > WARN && now - z.born < WARN + BURN;
    const inside = (z: Zone, x: number, y: number) => {
      if (z.kind !== "line") return Math.hypot(x - z.x, y - z.y) < z.r + HERO * 0.6;
      // a beam through (z.x, z.y) at angle a, half-width r
      const dx = x - z.x, dy = y - z.y, ca = Math.cos(z.a!), sa = Math.sin(z.a!);
      return Math.abs(-dx * sa + dy * ca) < z.r + HERO * 0.6;
    };
    const frame = (now: number) => {
      const s = g.current, dt = Math.min(50, now - lastT) / 16.67; lastT = now;
      if (s.state === "on") {
        const el = (now - s.t0) / 1000;
        setTime(Math.floor(el * 10));
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
          s.next = now + Math.max(260, 900 - el * 14);
        }
        s.zones = s.zones.filter((z) => now - z.born < WARN + BURN);
        if (s.zones.some((z) => lit(z, now) && inside(z, s.x, s.y))) {
          s.state = "done"; s.deadAt = now; setState("done");
          void sk.end(Math.floor(((now - s.t0) / 1000) * 10));
        }
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      const fl = ctx.createRadialGradient(AW / 2, AH / 2, 40, AW / 2, AH / 2, AW * .75); fl.addColorStop(0, "#3a3226"); fl.addColorStop(1, "#15110c");
      ctx.fillStyle = fl; ctx.fillRect(0, 0, AW, AH);
      ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1;
      for (let i = 0; i <= AW; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, AH); ctx.moveTo(0, i); ctx.lineTo(AW, i); ctx.stroke(); }
      for (const z of s.zones) {
        const age = now - z.born, on = age > WARN;
        const col = z.kind === "void" ? [155, 93, 255] : [255, 110, 30];
        ctx.save();
        if (z.kind === "line") {
          ctx.translate(z.x, z.y); ctx.rotate(z.a!);
          ctx.fillStyle = on ? `rgba(${col},.75)` : `rgba(${col},${0.12 + 0.18 * (age / WARN)})`;
          ctx.fillRect(-AW, -z.r, AW * 2, z.r * 2);
          if (!on) { ctx.strokeStyle = `rgba(${col},.8)`; ctx.setLineDash([8, 8]); ctx.strokeRect(-AW, -z.r, AW * 2, z.r * 2); }
        } else {
          if (on) {
            const gr = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
            gr.addColorStop(0, z.kind === "void" ? "rgba(230,200,255,.95)" : "rgba(255,230,120,.95)"); gr.addColorStop(.5, `rgba(${col},.85)`); gr.addColorStop(1, `rgba(${col},.2)`);
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1 + Math.sin(now / 60) * 0.03), 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = `rgba(${col},${0.08 + 0.2 * (age / WARN)})`; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(${col},.85)`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (age / WARN), 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // hero: a gold-trimmed shield bearer
      const dead = s.state === "done";
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(s.x + 2, s.y + 4, HERO, HERO * .6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dead ? "#555" : "#2f6fd6"; ctx.beginPath(); ctx.arc(s.x, s.y, HERO, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = dead ? "#888" : "#FFD100"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Survived</span><strong>{(time / 10).toFixed(1)}s</strong></span>
        </div>
        <div ref={wrap} className="fr-wrap">
          <canvas ref={cv} className="fr-canvas" aria-label="Arena. Move your hero out of the marked zones before they ignite." />
          {state === "ready" && (
            <SkillOverlay>
              <strong className="snake-big">Don&apos;t Stand in the Fire</strong>
              <span className="soft">Zones are marked, then they burn. Be somewhere else when they do.</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Pull the boss</button>
            </SkillOverlay>
          )}
          {state === "done" && (
            <SkillOverlay>
              <strong className="snake-big">You stood in the fire</strong>
              <SkillResultLine game="fire" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Run it back</button>
            </SkillOverlay>
          )}
        </div>
      </div>
      <SkillPanel game="fire" how={<>Your hero follows your mouse or finger (or use WASD / arrows). Dashed rings fill up, then ignite: orange fire anywhere, purple void right where you stand, and beams across the room after a while. Survive as long as you can.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
