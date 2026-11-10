"use client";
// Wyrm Run: steer a dragon whelp round the hoard, eat treasure to grow, don't bite your own tail.
// The game runs here in the browser; the server only pays a capped reward for the finished score.
import { useCallback, useEffect, useRef, useState } from "react";
import { snakeFinish, snakeStart } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import { fmt, useArcade, wowIconUrl } from "./ArcadeShell";

const COLS = 20, ROWS = 20;
type P = { x: number; y: number };
type Kind = "coin" | "rune" | "egg";
type Food = P & { kind: Kind; born: number; until: number | null };
const FOOD: Record<Kind, { pts: number; grow: number; icon: string; glow: string; life: number | null }> = {
  coin: { pts: 1, grow: 1, icon: "inv_misc_coin_02", glow: "#FFD100", life: null },
  rune: { pts: 3, grow: 2, icon: "inv_misc_rune_06", glow: "#5ef6ff", life: 7000 },
  egg: { pts: 5, grow: 3, icon: "inv_misc_orb_05", glow: "#c08cff", life: 5500 },
};
const DIRS: Record<string, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const KEYS: Record<string, keyof typeof DIRS> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
};
type Mode = "classic" | "portal";
type Status = "ready" | "playing" | "paused" | "over";
type Board = { score: number; name: string | null; surname: string | null; class: string | null; name_style: string | null; title: string | null }[];

export function Snake({ rules, best0, leftToday0, board }: {
  rules: { perPoint: number; maxRun: number; daily: number }; best0: number; leftToday0: number; board: Board;
}) {
  const { signedIn, setBalance, flash } = useArcade();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [cell, setCell] = useState(24);
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(best0);
  const [mode, setMode] = useState<Mode>("classic");
  const [leftToday, setLeftToday] = useState(leftToday0);
  const [result, setResult] = useState<{ earned: number; note?: string } | null>(null);
  const runId = useRef<Promise<string | null> | null>(null);
  const bestBefore = useRef(best0);

  // All live game state sits in one ref so the animation loop never waits on React.
  const g = useRef({
    snake: [] as P[], prev: [] as P[], dir: DIRS.right, queue: [] as P[], grow: 0, foods: [] as Food[], score: 0,
    interval: 140, last: 0, status: "ready" as Status, mode: "classic" as Mode, parts: [] as { x: number; y: number; vx: number; vy: number; life: number; c: string }[],
    shake: 0, deadAt: 0,
  });
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const floor = useRef<HTMLCanvasElement | null>(null);

  // size the board to its container
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    // fit the width, and leave room for the header and HUD so the whole board is on screen
    const fit = () => setCell(Math.max(14, Math.floor(Math.min(el.clientWidth, 600, Math.max(300, window.innerHeight - 330)) / COLS)));
    const ro = new ResizeObserver(fit);
    ro.observe(el); window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // preload treasure icons and the crest watermark
  useEffect(() => {
    for (const k of Object.keys(FOOD) as Kind[]) { const i = new Image(); i.src = wowIconUrl(FOOD[k].icon, 36); imgs.current[k] = i; }
    const c = new Image(); c.src = "/assets/crest-256.webp"; imgs.current.crest = c; c.onload = () => { floor.current = null; };
  }, []);

  const spawn = useCallback((now: number, kind?: Kind) => {
    const s = g.current;
    const free: P[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
      if (!s.snake.some((p) => p.x === x && p.y === y) && !s.foods.some((f) => f.x === x && f.y === y)) free.push({ x, y });
    if (!free.length) return;
    const p = free[Math.floor(Math.random() * free.length)];
    const k: Kind = kind ?? "coin";
    s.foods.push({ ...p, kind: k, born: now, until: FOOD[k].life ? now + FOOD[k].life! : null });
  }, []);

  const reset = useCallback(() => {
    const s = g.current;
    const mid = Math.floor(ROWS / 2);
    s.snake = [{ x: 6, y: mid }, { x: 5, y: mid }, { x: 4, y: mid }, { x: 3, y: mid }];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = DIRS.right; s.queue = []; s.grow = 0; s.foods = []; s.score = 0; s.interval = 140; s.parts = []; s.shake = 0;
    spawn(performance.now(), "coin");
    setScore(0);
  }, [spawn]);

  const finish = useCallback(async () => {
    const s = g.current;
    s.status = "over"; s.deadAt = performance.now(); setStatus("over");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) s.shake = 10;
    const final = s.score;
    setBest((b) => Math.max(b, final));
    const id = await runId.current;
    runId.current = null;
    if (!signedIn) return setResult({ earned: 0, note: "Sign in to earn Dragon Marks for your runs." });
    if (!id) return setResult({ earned: 0, note: "Couldn't reach the server, so this run didn't earn marks." });
    const r = await snakeFinish({ id, score: final });
    if (!r.ok) return setResult({ earned: 0, note: r.error });
    setBalance(r.balance); flash(r.earned); setLeftToday(r.leftToday); setBest((b) => Math.max(b, r.best));
    setResult({ earned: r.earned, note: r.earned === 0 && final > 0 ? "You've hit today's Wyrm Run limit. Come back tomorrow." : undefined });
  }, [signedIn, setBalance, flash]);

  const start = useCallback(() => {
    reset();
    bestBefore.current = best;
    g.current.mode = mode;
    g.current.status = "playing"; g.current.last = performance.now();
    setStatus("playing"); setResult(null);
    runId.current = signedIn ? snakeStart().then((r) => (r.ok ? r.id : null)).catch(() => null) : Promise.resolve(null);
    wrap.current?.focus({ preventScroll: true });
  }, [mode, reset, signedIn, best]);

  const turn = useCallback((name: keyof typeof DIRS) => {
    const s = g.current;
    if (s.status !== "playing") return;
    const d = DIRS[name];
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (last.x === d.x && last.y === d.y) return;
    if (last.x === -d.x && last.y === -d.y) return; // no reversing into yourself
    if (s.queue.length < 3) s.queue.push(d);
  }, []);

  const pause = useCallback(() => {
    const s = g.current;
    if (s.status === "playing") { s.status = "paused"; setStatus("paused"); }
    else if (s.status === "paused") { s.status = "playing"; s.last = performance.now(); setStatus("playing"); }
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const s = g.current;
      if (KEYS[e.key] && (s.status === "playing" || s.status === "paused")) { e.preventDefault(); if (s.status === "paused") pause(); turn(KEYS[e.key]); return; }
      if ((e.key === " " || e.key === "p" || e.key === "P" || e.key === "Escape") && (s.status === "playing" || s.status === "paused")) { e.preventDefault(); pause(); return; }
      if ((e.key === "Enter" || e.key === " ") && (s.status === "ready" || s.status === "over") && wrap.current?.contains(document.activeElement)) { e.preventDefault(); start(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, start, turn]);

  // pause when the tab is hidden
  useEffect(() => {
    const v = () => { if (document.hidden && g.current.status === "playing") pause(); };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [pause]);

  // swipe on the board
  useEffect(() => {
    const c = cv.current; if (!c) return;
    let o: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { o = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!o) return;
      const dx = e.clientX - o.x, dy = e.clientY - o.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
      o = { x: e.clientX, y: e.clientY };
    };
    const up = () => { o = null; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [turn]);

  // the game loop: fixed-rate steps, smooth drawing in between
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cell * COLS, H = cell * ROWS;
    c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
    floor.current = null;
    if (!g.current.snake.length) reset();
    let raf = 0;

    const drawFloor = () => {
      const f = document.createElement("canvas"); f.width = W * dpr; f.height = H * dpr;
      const x = f.getContext("2d")!; x.scale(dpr, dpr);
      const bg = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * .75);
      bg.addColorStop(0, "#221a12"); bg.addColorStop(1, "#0c0906");
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      for (let yy = 0; yy < ROWS; yy++) for (let xx = 0; xx < COLS; xx++) {
        x.fillStyle = (xx + yy) % 2 ? "rgba(255,255,255,.018)" : "rgba(0,0,0,.12)";
        x.fillRect(xx * cell, yy * cell, cell, cell);
      }
      const crest = imgs.current.crest;
      if (crest?.complete && crest.naturalWidth) { x.globalAlpha = .07; const s = W * .55; x.drawImage(crest, (W - s) / 2, (H - s) / 2, s, s); x.globalAlpha = 1; }
      floor.current = f;
    };

    const step = (now: number) => {
      const s = g.current;
      if (s.queue.length) s.dir = s.queue.shift()!;
      const h = s.snake[0];
      let nx = h.x + s.dir.x, ny = h.y + s.dir.y;
      if (s.mode === "portal") { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
      else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return finish();
      const willPop = s.grow === 0;
      const body = willPop ? s.snake.slice(0, -1) : s.snake;
      if (body.some((p) => p.x === nx && p.y === ny)) return finish();
      s.prev = s.snake.map((p) => ({ ...p }));
      s.snake.unshift({ x: nx, y: ny });
      if (s.grow > 0) s.grow--; else s.snake.pop();
      const fi = s.foods.findIndex((f) => f.x === nx && f.y === ny);
      if (fi >= 0) {
        const f = s.foods[fi]; s.foods.splice(fi, 1);
        const def = FOOD[f.kind];
        s.score += def.pts; s.grow += def.grow; setScore(s.score);
        s.interval = Math.max(62, 140 - s.score * 1.6);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5;
          s.parts.push({ x: (nx + .5) * cell, y: (ny + .5) * cell, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: def.glow });
        }
        if (f.kind === "coin") spawn(now, "coin");
        const r = Math.random();
        if (!s.foods.some((x) => x.kind !== "coin")) { if (r < .14) spawn(now, "rune"); else if (r < .2) spawn(now, "egg"); }
      }
      if (!s.foods.some((f) => f.kind === "coin")) spawn(now, "coin");
    };

    const draw = (now: number) => {
      const s = g.current;
      if (s.status === "playing") {
        let guard = 0;
        while (now - s.last >= s.interval && guard++ < 5 && g.current.status === "playing") { s.last += s.interval; step(now); }
        s.foods = s.foods.filter((f) => !f.until || f.until > now);
      }
      if (!floor.current) drawFloor();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (s.shake > 0) { ctx.translate((Math.random() - .5) * s.shake, (Math.random() - .5) * s.shake); s.shake *= .86; if (s.shake < .3) s.shake = 0; }
      ctx.drawImage(floor.current!, 0, 0, W, H);

      // treasure
      for (const f of s.foods) {
        const def = FOOD[f.kind], cx = (f.x + .5) * cell, cy = (f.y + .5) * cell;
        const pulse = 1 + Math.sin(now / 220 + f.x) * .06;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * .9);
        glow.addColorStop(0, def.glow + "88"); glow.addColorStop(1, def.glow + "00");
        ctx.fillStyle = glow; ctx.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
        const sz = cell * .78 * pulse, img = imgs.current[f.kind];
        ctx.save();
        ctx.beginPath(); ctx.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, sz * .2); ctx.clip();
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
        else { ctx.fillStyle = def.glow; ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz); }
        ctx.restore();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, sz * .2); ctx.stroke();
        if (f.until) { // countdown ring
          const left = Math.max(0, (f.until - now) / FOOD[f.kind].life!);
          ctx.strokeStyle = def.glow; ctx.lineWidth = 2.5; ctx.beginPath();
          ctx.arc(cx, cy, cell * .56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        }
      }

      // the dragon
      const t = s.status === "playing" ? Math.min(1, (now - s.last) / s.interval) : 1;
      const pts = s.snake.map((p, i) => {
        const q = s.prev[i] ?? p;
        const jump = Math.abs(q.x - p.x) > 1 || Math.abs(q.y - p.y) > 1;
        const x = jump ? p.x : q.x + (p.x - q.x) * t, y = jump ? p.y : q.y + (p.y - q.y) * t;
        return { x: (x + .5) * cell, y: (y + .5) * cell, jump };
      });
      const n = pts.length;
      const rad = (i: number) => cell * (.4 - .2 * (i / Math.max(1, n - 1)));
      // wings on the shoulders
      if (n > 3) {
        const a = pts[2], b = pts[1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x), flap = Math.sin(now / 160) * .35 + .9;
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang + side * (Math.PI / 2) * flap * .55);
          const wg = ctx.createLinearGradient(0, 0, cell * 1.1, 0); wg.addColorStop(0, "#5b2fb8"); wg.addColorStop(1, "rgba(155,93,255,.25)");
          ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cell * 1.1, -cell * .35 * side); ctx.lineTo(cell * .75, cell * .15 * side); ctx.lineTo(cell * .45, cell * .05 * side); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(255,209,0,.55)"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        }
      }
      // body, tail to neck
      ctx.lineCap = "round";
      for (let i = n - 1; i > 0; i--) {
        const a = pts[i], b = pts[i - 1];
        if (a.jump || b.jump || Math.hypot(a.x - b.x, a.y - b.y) > cell * 1.5) continue;
        const k = i / Math.max(1, n - 1);
        ctx.strokeStyle = `hsl(${268 - k * 18} ${70 - k * 20}% ${50 - k * 22}%)`;
        ctx.lineWidth = rad(i) * 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // gold spine
      ctx.fillStyle = "#FFD100";
      for (let i = 1; i < n; i++) { const p = pts[i]; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, rad(i) * .22), 0, Math.PI * 2); ctx.fill(); }
      // head
      if (n) {
        const h = pts[0], d = s.dir, ang = Math.atan2(d.y, d.x), r = cell * .46;
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
        ctx.fillStyle = "#e0b04a"; // horns
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * .3, side * r * .55); ctx.lineTo(-r * 1.25, side * r * 1.05); ctx.lineTo(-r * .05, side * r * .25); ctx.closePath(); ctx.fill(); }
        const hg = ctx.createRadialGradient(r * .2, -r * .2, 1, 0, 0, r * 1.1); hg.addColorStop(0, "#b98cff"); hg.addColorStop(1, "#4a1f99");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * .85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = "#4a1f99"; ctx.beginPath(); ctx.ellipse(r * .75, 0, r * .45, r * .38, 0, 0, Math.PI * 2); ctx.fill(); // snout
        const dead = s.status === "over";
        for (const side of [-1, 1]) { // eyes
          ctx.fillStyle = dead ? "#555" : "#fff36b"; ctx.shadowColor = dead ? "transparent" : "#ffd100"; ctx.shadowBlur = dead ? 0 : 8;
          ctx.beginPath(); ctx.ellipse(r * .3, side * r * .38, r * .2, r * .13, 0, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#1a0a00"; ctx.fillRect(r * .28, side * r * .38 - r * .1, r * .06, r * .2);
        }
        ctx.restore();
      }
      // sparkles
      for (const p of s.parts) {
        p.x += p.vx; p.y += p.vy; p.vx *= .94; p.vy *= .94; p.life -= .035;
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; s.parts = s.parts.filter((p) => p.life > 0);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cell, finish, reset, spawn]);

  const runMarks = Math.min(rules.maxRun, score * rules.perPoint, leftToday);
  return (
    <div className="game-layout snake-layout">
      <div className="game-stage snake-stage">
        <div className="snake-hud">
          <span><span className="micro muted">Score</span><strong>{score}</strong></span>
          <span><span className="micro muted">Best</span><strong>{Math.max(best, score)}</strong></span>
          <span><span className="micro muted">This run</span><strong className="gold">{signedIn ? `+${fmt(runMarks)}` : "—"}</strong></span>
        </div>
        <div ref={wrap} className="snake-wrap" tabIndex={-1} aria-label="Wyrm Run board. Arrow keys or WASD to steer, space to pause.">
          <canvas ref={cv} className="snake-canvas" />
          {status !== "playing" && (
            <div className="snake-overlay">
              {status === "ready" && (<>
                <strong className="snake-big">Wyrm Run</strong>
                <span className="soft">Eat treasure, grow your dragon, don&apos;t bite your tail.</span>
                <button type="button" className="btn btn-primary btn-lg" onClick={start}>Play</button>
                <span className="micro muted">Arrow keys or WASD · swipe on phones · space to pause</span>
              </>)}
              {status === "paused" && (<>
                <strong className="snake-big">Paused</strong>
                <button type="button" className="btn btn-primary btn-lg" onClick={pause}>Resume</button>
              </>)}
              {status === "over" && (<>
                <strong className="snake-big">{score > bestBefore.current ? "New best!" : "The wyrm falls"}</strong>
                <span className="soft">Score <strong>{score}</strong>{result ? (result.earned ? <> · earned <strong className="gold">+{fmt(result.earned)}</strong> marks</> : null) : signedIn ? " · counting your marks…" : null}</span>
                {result?.note && <span className="micro muted" role="status">{result.note}</span>}
                <button type="button" className="btn btn-primary btn-lg" onClick={start}>Play again</button>
              </>)}
            </div>
          )}
        </div>
        <div className="snake-pad" aria-label="Steering">
          <button type="button" className="btn" aria-label="Up" onPointerDown={(e) => { e.preventDefault(); turn("up"); }}>▲</button>
          <button type="button" className="btn" aria-label="Left" onPointerDown={(e) => { e.preventDefault(); turn("left"); }}>◀</button>
          <button type="button" className="btn" aria-label={status === "paused" ? "Resume" : "Pause"} onClick={pause} disabled={status !== "playing" && status !== "paused"}>{status === "paused" ? "▶" : "❚❚"}</button>
          <button type="button" className="btn" aria-label="Right" onPointerDown={(e) => { e.preventDefault(); turn("right"); }}>▶</button>
          <button type="button" className="btn" aria-label="Down" onPointerDown={(e) => { e.preventDefault(); turn("down"); }}>▼</button>
        </div>
      </div>
      <div className="game-controls panel">
        <div className="field">Walls
          <div className="seg">
            <button type="button" aria-pressed={mode === "classic"} disabled={status === "playing" || status === "paused"} onClick={() => setMode("classic")}>Deadly</button>
            <button type="button" aria-pressed={mode === "portal"} disabled={status === "playing" || status === "paused"} onClick={() => setMode("portal")}>Portals</button>
          </div>
        </div>
        <ul className="snake-key">
          {(Object.keys(FOOD) as Kind[]).map((k) => (
            <li key={k}><img src={wowIconUrl(FOOD[k].icon, 36)} alt="" width={28} height={28} />
              <span><strong>{k === "coin" ? "Gold coin" : k === "rune" ? "Ley rune" : "Dragon egg"}</strong><span className="micro muted">+{FOOD[k].pts} point{FOOD[k].pts > 1 ? "s" : ""}{FOOD[k].life ? `, gone in ${FOOD[k].life / 1000}s` : ""}</span></span></li>
          ))}
        </ul>
        <p className="micro muted">Free to play. Each point pays {rules.perPoint} marks, up to {fmt(rules.maxRun)} a run and {fmt(rules.daily)} a day.{signedIn ? ` ${fmt(leftToday)} left today.` : " Sign in to earn."}</p>
        {board.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ fontSize: 16 }}>Longest wyrms</h3>
            <ol className="snake-board">
              {board.map((b, i) => (
                <li key={i}><span className="micro muted">{i + 1}</span>
                  <PlayerName name={`${b.name ?? "Someone"} ${b.surname ?? ""}`.trim()} className={b.class} nameStyle={b.name_style} showTitle={false} />
                  <strong>{b.score}</strong></li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
