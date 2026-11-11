"use client";
// Wyrm Run: steer a dragon whelp round the hoard, eat treasure to grow, don't bite your own tail.
// The game runs here in the browser; the server only pays a capped reward for the finished score.
// Steps run at a fixed rate; between steps the body is drawn as a string of pearls interpolated along the path.
import { useCallback, useEffect, useRef, useState } from "react";
import { snakeFinish, snakeStart } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import { fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

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
const PEARLS = 14; // shades from neck to tail
const BODY = '"Alegreya Sans", system-ui, sans-serif';

/** Pre-rendered pearl sprites (one per shade) and treasure glows, so a frame is mostly drawImage calls. */
function makeSprites(dpr: number) {
  const S = 48 * dpr;
  const pearls = Array.from({ length: PEARLS }, (_, i) => {
    const k = i / (PEARLS - 1), c = document.createElement("canvas"); c.width = c.height = S;
    const x = c.getContext("2d")!, r = S / 2;
    const g = x.createRadialGradient(r * .7, r * .62, r * .08, r, r, r);
    g.addColorStop(0, `hsl(${268 - k * 16} 85% ${78 - k * 18}%)`);
    g.addColorStop(.45, `hsl(${266 - k * 18} ${72 - k * 18}% ${50 - k * 18}%)`);
    g.addColorStop(1, `hsl(${262 - k * 20} ${60 - k * 20}% ${20 - k * 8}%)`);
    x.fillStyle = g; x.beginPath(); x.arc(r, r, r - 1, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = dpr; x.stroke();
    x.fillStyle = "rgba(255,255,255,.35)"; x.beginPath(); x.ellipse(r * .72, r * .6, r * .22, r * .14, -.6, 0, Math.PI * 2); x.fill();
    return c;
  });
  const glows = {} as Record<Kind, HTMLCanvasElement>;
  for (const k of Object.keys(FOOD) as Kind[]) {
    const c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d")!, r = S / 2;
    const g = x.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, FOOD[k].glow + "99"); g.addColorStop(.5, FOOD[k].glow + "33"); g.addColorStop(1, FOOD[k].glow + "00");
    x.fillStyle = g; x.fillRect(0, 0, S, S); glows[k] = c;
  }
  return { pearls, glows };
}

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
  const [chips, setChips] = useState<Chip[]>([]);
  const runId = useRef<Promise<string | null> | null>(null);
  const bestBefore = useRef(best0);

  // All live game state sits in one ref so the animation loop never waits on React.
  const g = useRef({
    snake: [] as P[], prev: [] as P[], dir: DIRS.right, queue: [] as P[], grow: 0, foods: [] as Food[], score: 0,
    interval: 140, last: 0, status: "ready" as Status, mode: "classic" as Mode, parts: [] as { x: number; y: number; vx: number; vy: number; life: number; c: string }[],
    shake: 0, deadAt: 0, swallows: [] as number[], pops: [] as { x: number; y: number; t: number; text: string; c: string }[], combo: 0, lastEat: 0,
  });
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const floor = useRef<HTMLCanvasElement | null>(null);

  // size the board to its container
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    // fit the width, and leave room for the header, cabinet HUD and pad so the whole board is on screen
    const fit = () => setCell(Math.max(14, Math.floor(Math.min(el.clientWidth, 600, Math.max(280, window.innerHeight - 390)) / COLS)));
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
    if (k !== "coin" && s.status === "playing") play("reveal", { pitch: k === "egg" ? 1.5 : 1.25, vol: .7 });
  }, []);

  const reset = useCallback(() => {
    const s = g.current;
    const mid = Math.floor(ROWS / 2);
    s.snake = [{ x: 6, y: mid }, { x: 5, y: mid }, { x: 4, y: mid }, { x: 3, y: mid }];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = DIRS.right; s.queue = []; s.grow = 0; s.foods = []; s.score = 0; s.interval = 140; s.parts = []; s.shake = 0;
    s.swallows = []; s.pops = []; s.combo = 0; s.lastEat = 0;
    spawn(performance.now(), "coin");
    setScore(0);
  }, [spawn]);

  const finish = useCallback(async () => {
    const s = g.current;
    s.status = "over"; s.deadAt = performance.now(); setStatus("over");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) s.shake = 4;
    play("thud", { pitch: .7 }); play("crash", { vol: .35 }); buzz("fail");
    const final = s.score;
    setBest((b) => Math.max(b, final));
    setChips((c) => [{ k: s.deadAt, label: String(final), tone: (final > bestBefore.current && final > 0 ? "big" : final >= 20 ? "win" : final > 0 ? "neutral" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    const id = await runId.current;
    runId.current = null;
    if (!signedIn) return setResult({ earned: 0, note: "Sign in to earn Dragon Marks for your runs." });
    if (!id) return setResult({ earned: 0, note: "Couldn't reach the server, so this run didn't earn marks." });
    const r = await snakeFinish({ id, score: final });
    if (!r.ok) return setResult({ earned: 0, note: r.error });
    setBalance(r.balance); flash(r.earned); setLeftToday(r.leftToday); setBest((b) => Math.max(b, r.best));
    setResult({ earned: r.earned, note: r.earned === 0 && final > 0 ? "You've hit today's Wyrm Run limit. Come back tomorrow." : undefined });
    if (r.earned > 0) celebrate({ mult: 2, won: r.earned });
  }, [signedIn, setBalance, flash]);

  const start = useCallback(() => {
    reset();
    bestBefore.current = best;
    g.current.mode = mode;
    g.current.status = "playing"; g.current.last = performance.now();
    setStatus("playing"); setResult(null);
    play("launch", { vol: .4 });
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
    if (s.queue.length < 3) { s.queue.push(d); play("key", { vol: .5 }); }
  }, []);

  const pause = useCallback(() => {
    const s = g.current;
    if (s.status === "playing") { s.status = "paused"; setStatus("paused"); play("click"); }
    else if (s.status === "paused") { s.status = "playing"; s.last = performance.now(); setStatus("playing"); play("click"); }
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
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spr = makeSprites(dpr);
    let raf = 0;

    const drawFloor = () => {
      const f = document.createElement("canvas"); f.width = W * dpr; f.height = H * dpr;
      const x = f.getContext("2d")!; x.scale(dpr, dpr);
      const bg = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * .75);
      bg.addColorStop(0, "#3a2912"); bg.addColorStop(.7, "#1a120a"); bg.addColorStop(1, "#0c0906");
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      for (let yy = 0; yy < ROWS; yy++) for (let xx = 0; xx < COLS; xx++) {
        x.fillStyle = (xx + yy) % 2 ? "rgba(255,230,180,.025)" : "rgba(0,0,0,.14)";
        x.fillRect(xx * cell, yy * cell, cell, cell);
      }
      // loose coins glinting in the hoard
      for (let i = 0; i < 34; i++) {
        const cx = Math.random() * W, cy = Math.random() * H, r = cell * (.1 + Math.random() * .08);
        x.fillStyle = `rgba(255,${190 + Math.random() * 40},60,${.07 + Math.random() * .07})`; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      }
      const crest = imgs.current.crest;
      if (crest?.complete && crest.naturalWidth) { x.globalAlpha = .08; const s = W * .55; x.drawImage(crest, (W - s) / 2, (H - s) / 2, s, s); x.globalAlpha = 1; }
      const v = x.createRadialGradient(W / 2, H / 2, W * .35, W / 2, H / 2, W * .75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.5)");
      x.fillStyle = v; x.fillRect(0, 0, W, H);
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
        // a treasure streak climbs the scale; a pause of a few seconds starts it again
        s.combo = now - s.lastEat < 4000 ? s.combo + 1 : 0; s.lastEat = now;
        if (f.kind === "coin") play("coin", { pitch: ladder(s.combo) });
        else { play("gem", { pitch: ladder(s.combo) }); buzz("tap"); }
        s.swallows.push(now);
        s.pops.push({ x: (nx + .5) * cell, y: (ny + .5) * cell, t: now, text: `+${def.pts}`, c: def.glow });
        if (!reduced) for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, v = .8 + Math.random() * 1.8;
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
      if (s.shake > 0) { ctx.translate((Math.random() - .5) * s.shake * 2, (Math.random() - .5) * s.shake * 2); s.shake *= .82; if (s.shake < .3) s.shake = 0; }
      ctx.drawImage(floor.current!, 0, 0, W, H);
      // the walls: deadly embers, or shimmering portals
      ctx.strokeStyle = s.mode === "portal" || (s.status === "ready" && mode === "portal") ? `rgba(155,93,255,${.45 + Math.sin(now / 300) * .15})` : "rgba(255,120,60,.28)";
      ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

      // treasure: a soft glow, a pop-in, twinkling sparkles and a countdown ring for the rare ones
      for (const f of s.foods) {
        const def = FOOD[f.kind], cx = (f.x + .5) * cell, cy = (f.y + .5) * cell;
        const ink = Math.max(0, Math.min(1, (now - f.born) / 320)), grow = reduced || ink >= 1 ? 1 : 1 - Math.pow(1 - ink, 3) + Math.sin(ink * Math.PI) * .25;
        const pulse = (1 + Math.sin(now / 220 + f.x) * .06) * grow;
        ctx.drawImage(spr.glows[f.kind], cx - cell * 1.1, cy - cell * 1.1, cell * 2.2, cell * 2.2);
        const sz = cell * .78 * pulse, img = imgs.current[f.kind];
        ctx.save();
        ctx.beginPath(); ctx.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, sz * .2); ctx.clip();
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz);
        else { ctx.fillStyle = def.glow; ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz); }
        ctx.restore();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx - sz / 2, cy - sz / 2, sz, sz, sz * .2); ctx.stroke();
        if (!reduced) for (let i = 0; i < 3; i++) { // sparkles
          const a = now / 900 + i * 2.1 + f.x, tw = Math.max(0, Math.sin(now / 260 + i * 1.7 + f.y));
          const sx = cx + Math.cos(a) * cell * .55, sy = cy + Math.sin(a) * cell * .55, sr = cell * .14 * tw;
          if (sr < .5) continue;
          ctx.fillStyle = "#fff8d6"; ctx.beginPath();
          ctx.moveTo(sx, sy - sr); ctx.lineTo(sx + sr * .25, sy - sr * .25); ctx.lineTo(sx + sr, sy); ctx.lineTo(sx + sr * .25, sy + sr * .25);
          ctx.lineTo(sx, sy + sr); ctx.lineTo(sx - sr * .25, sy + sr * .25); ctx.lineTo(sx - sr, sy); ctx.lineTo(sx - sr * .25, sy - sr * .25); ctx.fill();
        }
        if (f.until) { // countdown ring
          const left = Math.max(0, (f.until - now) / FOOD[f.kind].life!);
          ctx.strokeStyle = def.glow; ctx.lineWidth = 2.5; ctx.beginPath();
          ctx.arc(cx, cy, cell * .58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        }
      }

      // the dragon: interpolated joints...
      const t = s.status === "playing" ? Math.min(1, (now - s.last) / s.interval) : 1;
      const pts = s.snake.map((p, i) => {
        const q = s.prev[i] ?? p;
        const jump = Math.abs(q.x - p.x) > 1 || Math.abs(q.y - p.y) > 1;
        const x = jump ? p.x : q.x + (p.x - q.x) * t, y = jump ? p.y : q.y + (p.y - q.y) * t;
        return { x: (x + .5) * cell, y: (y + .5) * cell, jump };
      });
      const n = pts.length;
      // ...then pearls laid along the path at an even spacing, head first
      const sp = cell * .3, pearls: { x: number; y: number; L: number }[] = [];
      if (n) {
        pearls.push({ x: pts[0].x, y: pts[0].y, L: 0 });
        let need = sp, L = 0;
        for (let i = 0; i < n - 1; i++) {
          const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
          if (a.jump || b.jump || len > cell * 1.5) { L += sp; pearls.push({ x: b.x, y: b.y, L }); need = sp; continue; } // through a portal
          let at = 0;
          while (len - at >= need) { at += need; L += sp; pearls.push({ x: a.x + dx * (at / len), y: a.y + dy * (at / len), L }); need = sp; }
          need -= len - at;
        }
      }
      const total = Math.max(sp, pearls.length ? pearls[pearls.length - 1].L : sp);
      // a swallowed treasure bulges its way down to the tail
      const bulgeSpeed = cell * 15 / 1000;
      s.swallows = s.swallows.filter((t0) => (now - t0) * bulgeSpeed < total + cell);
      // wings on the shoulders
      const dead0 = s.status === "over";
      if (n > 3) {
        const a = pts[2], b = pts[1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x), flap = Math.sin(now / 160) * .35 + .9;
        for (const side of [-1, 1]) {
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang + side * (Math.PI / 2) * flap * .55);
          const L = cell * 1.35, wg = ctx.createLinearGradient(0, 0, L, 0); wg.addColorStop(0, dead0 ? "#555" : "#7a45e0"); wg.addColorStop(1, dead0 ? "rgba(120,120,120,.4)" : "rgba(192,140,255,.55)");
          ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -cell * .42 * side);
          ctx.quadraticCurveTo(L * .8, -cell * .05 * side, L * .72, cell * .16 * side); ctx.quadraticCurveTo(L * .55, cell * .02 * side, L * .4, cell * .1 * side); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(255,209,0,.75)"; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.strokeStyle = "rgba(255,230,160,.45)"; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * .72, cell * .16 * side); ctx.stroke();
          ctx.restore();
        }
      }
      const dead = s.status === "over";
      if (dead) ctx.filter = "grayscale(.6) brightness(.8)";
      for (let i = pearls.length - 1; i > 0; i--) {
        const p = pearls[i], k = p.L / total;
        let r = cell * (.42 - .24 * k);
        for (const t0 of s.swallows) { const d = (p.L - (now - t0) * bulgeSpeed) / (cell * .7); r *= 1 + .42 * Math.exp(-d * d); }
        const img = spr.pearls[Math.min(PEARLS - 1, Math.floor(k * PEARLS))];
        ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
        if (i % 3 === 0) { ctx.fillStyle = "#FFD100"; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, r * .2), 0, Math.PI * 2); ctx.fill(); } // gold spine
      }
      ctx.filter = "none";
      // head
      if (n) {
        const h = pts[0], nb = pts[1];
        const ang = nb && Math.hypot(h.x - nb.x, h.y - nb.y) > 1 && !h.jump && !nb.jump ? Math.atan2(h.y - nb.y, h.x - nb.x) : Math.atan2(s.dir.y, s.dir.x);
        const r = cell * .52;
        // the nearest treasure, for the eyes to follow and the jaw to open
        let food: { x: number; y: number; d: number } | null = null;
        for (const f of s.foods) { const fx = (f.x + .5) * cell, fy = (f.y + .5) * cell, d = Math.hypot(fx - h.x, fy - h.y); if (!food || d < food.d) food = { x: fx, y: fy, d }; }
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
        ctx.fillStyle = dead ? "#777" : "#e0b04a"; // horns
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * .3, side * r * .55); ctx.lineTo(-r * 1.25, side * r * 1.05); ctx.lineTo(-r * .05, side * r * .25); ctx.closePath(); ctx.fill(); }
        const hg = ctx.createRadialGradient(r * .2, -r * .2, 1, 0, 0, r * 1.1);
        hg.addColorStop(0, dead ? "#999" : "#c49cff"); hg.addColorStop(1, dead ? "#444" : "#4a1f99");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * .85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.2; ctx.stroke();
        const open = !dead && food && food.d < cell * 2.2 ? Math.min(1, (cell * 2.2 - food.d) / cell) : 0;
        ctx.fillStyle = dead ? "#555" : "#4a1f99"; ctx.beginPath(); ctx.ellipse(r * .75, 0, r * .45, r * (.38 + open * .1), 0, 0, Math.PI * 2); ctx.fill(); // snout
        if (open > 0) { ctx.fillStyle = "#1a0510"; ctx.beginPath(); ctx.moveTo(r * .55, 0); ctx.lineTo(r * 1.22, -r * .22 * open); ctx.lineTo(r * 1.22, r * .22 * open); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(r * 1.0, -r * .14, r * .05, 0, Math.PI * 2); ctx.moveTo(r * 1.05, r * .14); ctx.arc(r * 1.0, r * .14, r * .05, 0, Math.PI * 2); ctx.fill(); // nostrils
        // pupils track the treasure (in the head's turned frame)
        let px = 0, py = 0;
        if (food) { const dx = food.x - h.x, dy = food.y - h.y, l = Math.hypot(dx, dy) || 1, ca = Math.cos(-ang), sa = Math.sin(-ang); px = ((dx * ca - dy * sa) / l) * r * .07; py = ((dx * sa + dy * ca) / l) * r * .06; }
        for (const side of [-1, 1]) { // eyes
          const ex = r * .3, ey = side * r * .38;
          if (dead) {
            ctx.strokeStyle = "#1a0a00"; ctx.lineWidth = Math.max(1.2, r * .09); ctx.beginPath();
            ctx.moveTo(ex - r * .13, ey - r * .13); ctx.lineTo(ex + r * .13, ey + r * .13); ctx.moveTo(ex + r * .13, ey - r * .13); ctx.lineTo(ex - r * .13, ey + r * .13); ctx.stroke();
            continue;
          }
          ctx.fillStyle = "#fff36b"; ctx.shadowColor = "#ffd100"; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.ellipse(ex, ey, r * .2, r * .14, 0, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#1a0a00"; ctx.beginPath(); ctx.ellipse(ex + px, ey + py, r * .045, r * .11, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      // sparkles from eaten treasure
      for (const p of s.parts) {
        p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; p.life -= .045;
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; s.parts = s.parts.filter((p) => p.life > 0);
      // "+3" call-outs
      for (const pp of s.pops) {
        const k = (now - pp.t) / 650; if (k > 1) continue;
        ctx.globalAlpha = 1 - k * k; ctx.font = `700 ${Math.round(cell * .7)}px ${BODY}`; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.fillStyle = pp.c;
        ctx.strokeText(pp.text, pp.x, pp.y - cell * .6 - k * cell * .8); ctx.fillText(pp.text, pp.x, pp.y - cell * .6 - k * cell * .8);
      }
      ctx.globalAlpha = 1; s.pops = s.pops.filter((pp) => now - pp.t < 650);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cell, finish, reset, spawn, mode]);

  const runMarks = Math.min(rules.maxRun, score * rules.perPoint, leftToday);
  return (
    <div className="game-layout snake-layout">
      <div className="game-stage snake-stage">
        <Machine theme="hoard" label="Wyrm Run" className="sn-machine" hud={<>
          <Readout label="Score" tone="gold"><span key={score} className="sn-pop">{score}</span></Readout>
          <Readout label="Best">{Math.max(best, score)}</Readout>
          <Readout label="This run">{signedIn ? `+${fmt(runMarks)}` : "—"}</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div ref={wrap} className="snake-wrap" tabIndex={-1} aria-label="Wyrm Run board. Arrow keys or WASD to steer, space to pause.">
            <div className={`sn-frame sn-${status}`}>
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
                    <span className="sn-final">{score}<small>treasure</small></span>
                    <span className="soft">{result ? (result.earned ? <>Earned <strong className="gold">+{fmt(result.earned)}</strong> marks</> : null) : signedIn ? "Counting your marks…" : null}</span>
                    {result?.note && <span className="micro muted" role="status">{result.note}</span>}
                    <button type="button" className="btn btn-primary btn-lg" onClick={start}>Play again</button>
                  </>)}
                </div>
              )}
            </div>
          </div>
        </Machine>
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
            <button type="button" aria-pressed={mode === "classic"} disabled={status === "playing" || status === "paused"} onClick={() => { setMode("classic"); play("click"); }}>Deadly</button>
            <button type="button" aria-pressed={mode === "portal"} disabled={status === "playing" || status === "paused"} onClick={() => { setMode("portal"); play("click"); }}>Portals</button>
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
