"use client";
// Gryphon Flight: flap through the gaps between Stormwind-grey towers. Score = towers passed.
import { useCallback, useEffect, useRef, useState } from "react";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const VW = 480, VH = 640; // virtual canvas size; scaled to fit
const GAP0 = 190, TOWER_W = 74, SPEED0 = 2.6;

export function Gryphon({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("gryphon", best0, leftToday0);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [score, setScore] = useState(0);
  const [w, setW] = useState(400);
  const g = useRef({ y: VH / 2, vy: 0, towers: [] as { x: number; gap: number; size: number; passed: boolean }[], score: 0, t: 0, flap: 0, state: "ready" as "ready" | "on" | "done", clouds: [] as { x: number; y: number; s: number }[] });

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => setW(Math.min(el.clientWidth, Math.round((window.innerHeight - 240) * VW / VH), 480));
    const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  const reset = () => {
    const s = g.current;
    s.y = VH / 2; s.vy = 0; s.towers = []; s.score = 0; s.t = 0;
    s.clouds = Array.from({ length: 6 }, () => ({ x: Math.random() * VW, y: Math.random() * VH * 0.6, s: 0.4 + Math.random() * 0.8 }));
    setScore(0);
  };
  const flap = useCallback(() => {
    const s = g.current;
    if (s.state === "on") { s.vy = -7.2; s.flap = performance.now(); }
  }, []);
  const start = () => { reset(); g.current.state = "on"; setState("on"); sk.begin(); flap(); };

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
    const dpr = Math.min(2, window.devicePixelRatio || 1), k = w / VW;
    c.width = w * dpr; c.height = (VH * k) * dpr; c.style.width = `${w}px`; c.style.height = `${VH * k}px`;
    if (!g.current.clouds.length) reset();
    let raf = 0, last = performance.now(), acc = 0;
    const end = () => { const s = g.current; s.state = "done"; setState("done"); void sk.end(s.score); };
    const tick = () => {
      const s = g.current;
      if (s.state !== "on") return;
      s.t++;
      s.vy = Math.min(11, s.vy + 0.42); s.y += s.vy;
      const speed = SPEED0 + Math.min(2.4, s.score * 0.06), gap = Math.max(130, GAP0 - s.score * 2.5);
      const lastT = s.towers[s.towers.length - 1];
      if (!lastT || lastT.x < VW - 240) s.towers.push({ x: VW + 20, gap: 90 + Math.random() * (VH - 180 - gap), size: gap, passed: false });
      for (const t of s.towers) {
        t.x -= speed;
        if (!t.passed && t.x + TOWER_W < 120) { t.passed = true; s.score++; setScore(s.score); }
      }
      s.towers = s.towers.filter((t) => t.x > -TOWER_W - 10);
      for (const cl of s.clouds) { cl.x -= speed * 0.25 * cl.s; if (cl.x < -120) { cl.x = VW + 40; cl.y = Math.random() * VH * 0.6; } }
      // collisions (gryphon ~ circle r 18 at x 120)
      if (s.y < 14) { s.y = 14; s.vy = Math.max(0, s.vy); }
      if (s.y > VH - 40) return end();
      for (const t of s.towers) if (120 + 18 > t.x && 120 - 18 < t.x + TOWER_W && (s.y - 16 < t.gap || s.y + 16 > t.gap + t.size)) return end();
    };
    const draw = (now: number) => {
      acc += Math.min(100, now - last); last = now;
      while (acc >= 1000 / 60) { acc -= 1000 / 60; tick(); }
      const s = g.current;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, "#1c2a5a"); sky.addColorStop(.6, "#6a4a8a"); sky.addColorStop(1, "#e8946a");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      for (const cl of s.clouds) { ctx.beginPath(); ctx.ellipse(cl.x, cl.y, 60 * cl.s, 18 * cl.s, 0, 0, Math.PI * 2); ctx.ellipse(cl.x + 30 * cl.s, cl.y - 10 * cl.s, 40 * cl.s, 16 * cl.s, 0, 0, Math.PI * 2); ctx.fill(); }
      // towers: grey stone with blue-and-gold roofs
      for (const t of s.towers) {
        for (const [y0, h, top] of [[0, t.gap, true], [t.gap + t.size, VH - t.gap - t.size, false]] as const) {
          const st = ctx.createLinearGradient(t.x, 0, t.x + TOWER_W, 0); st.addColorStop(0, "#5b6170"); st.addColorStop(.5, "#9aa1b0"); st.addColorStop(1, "#4a4f5c");
          ctx.fillStyle = st; ctx.fillRect(t.x, y0, TOWER_W, h);
          ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
          for (let yy = y0 + 18; yy < y0 + h; yy += 18) { ctx.beginPath(); ctx.moveTo(t.x, yy); ctx.lineTo(t.x + TOWER_W, yy); ctx.stroke(); }
          const capY = top ? t.gap - 16 : t.gap + t.size;
          ctx.fillStyle = "#2f4fa8"; ctx.fillRect(t.x - 6, capY, TOWER_W + 12, 16);
          ctx.fillStyle = "#e0b04a"; ctx.fillRect(t.x - 6, top ? capY + 12 : capY, TOWER_W + 12, 4);
        }
      }
      // ground
      ctx.fillStyle = "#3b2a17"; ctx.fillRect(0, VH - 40, VW, 40); ctx.fillStyle = "#4f7a2a"; ctx.fillRect(0, VH - 40, VW, 8);
      // the gryphon: golden body, white head, flapping wings
      const ang = Math.max(-0.5, Math.min(0.9, s.vy / 12)), wing = Math.sin((now - s.flap) / 70) * (now - s.flap < 300 ? 1 : 0.35);
      ctx.save(); ctx.translate(120, s.y); ctx.rotate(ang);
      ctx.fillStyle = "#c98a2e"; ctx.beginPath(); ctx.ellipse(-4, 2, 22, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f2e8d0"; ctx.beginPath(); ctx.arc(16, -6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd100"; ctx.beginPath(); ctx.moveTo(24, -7); ctx.lineTo(34, -3); ctx.lineTo(24, -1); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(19, -8, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#a8742a"; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-22 + wing * 4, -26 - wing * 12); ctx.lineTo(6, -6); ctx.fill();
      ctx.fillStyle = "#8a5a1c"; ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(-36, -4); ctx.lineTo(-34, 8); ctx.fill();
      ctx.restore();
      // score
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 5; ctx.font = "700 46px Marcellus, serif"; ctx.textAlign = "center";
      if (s.state !== "ready") { ctx.strokeText(String(s.score), VW / 2, 80); ctx.fillText(String(s.score), VW / 2, 80); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div ref={wrap} className="gr-wrap" onPointerDown={(e) => { if (state === "on") { e.preventDefault(); flap(); } }}>
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
              <strong className="snake-big">Grounded</strong>
              <SkillResultLine game="gryphon" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Fly again</button>
            </SkillOverlay>
          )}
        </div>
      </div>
      <SkillPanel game="gryphon" how={<>Each flap lifts your gryphon; gravity does the rest. Pass between the towers without touching them or the ground. The gaps tighten and the wind picks up as you go.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
