"use client";
// Dragon's Eye 8-ball. Physics, rules and the AI live in lib/pool.ts; this draws the table and handles input.
// The static table is painted once to an offscreen canvas; balls carry a 3D orientation so their numbers and
// stripes roll as they travel. Impacts, cushions and pockets are read off the physics each step for sound and sparks.
import { useCallback, useEffect, useRef, useState } from "react";
import { poolFinish, poolStart } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import * as P from "@/lib/pool";
import { fmt, useArcade } from "./ArcadeShell";
import { Machine } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, isMuted, onMuteChange, play, setMuted } from "./sfx";

type Mode = "ai" | "friend";
type Phase = "menu" | "aim" | "strike" | "rolling" | "ai" | "over";
const LEVELS: { id: P.Level; name: string; blurb: string; pts: number; mult: number }[] = [
  { id: "apprentice", name: "Tavern Apprentice", blurb: "Still learning which end of the cue to hold", pts: 1, mult: 2 },
  { id: "veteran", name: "Goblin Hustler", blurb: "Plays the angles and the odds", pts: 2, mult: 4 },
  { id: "champion", name: "Dragonflight Champion", blurb: "Rarely misses. Bring your best", pts: 4, mult: 12 },
];
const COLORS = ["#f4efe2", "#f5c400", "#1f5fd1", "#d62828", "#7a3bc9", "#f07b12", "#188a3a", "#8a1f1f", "#111"];
const colorOf = (id: number) => COLORS[id > 8 ? id - 8 : id];
const TW = P.W + 2 * P.RAIL, TH = P.H + 2 * P.RAIL;
type Board = { score: number; name: string | null; surname: string | null; class: string | null; name_style: string | null; title: string | null }[];
type V3 = [number, number, number];
type Spin = { n: V3; m: V3; px: number; py: number };
type Fx = { x: number; y: number; vx: number; vy: number; life: number; c: string };

/** Rotate v about the unit axis a by angle t (Rodrigues). */
const rot = (v: V3, a: V3, t: number): V3 => {
  const c = Math.cos(t), s = Math.sin(t), d = (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) * (1 - c);
  return [v[0] * c + (a[1] * v[2] - a[2] * v[1]) * s + a[0] * d, v[1] * c + (a[2] * v[0] - a[0] * v[2]) * s + a[1] * d, v[2] * c + (a[0] * v[1] - a[1] * v[0]) * s + a[2] * d];
};
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Pool({ rules, leftToday0, board, me }: {
  rules: { perPoint: number; daily: number }; leftToday0: number; board: Board; me: string;
}) {
  const { signedIn, setBalance, flash } = useArcade();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [mode, setMode] = useState<Mode>("ai");
  const [level, setLevel] = useState<P.Level>("veteran");
  const [phase, setPhaseS] = useState<Phase>("menu");
  const [power, setPowerS] = useState(0.55);
  const [hud, setHud] = useState<{ turn: 0 | 1; groups: P.Game["groups"]; note: string; left: number[]; inHand: boolean; winner: 0 | 1 | null }>(
    { turn: 0, groups: [null, null], note: "", left: [], inHand: false, winner: null });
  const [names, setNames] = useState<[string, string]>([me, "Goblin Hustler"]);
  const [leftToday, setLeftToday] = useState(leftToday0);
  const [result, setResult] = useState<{ earned: number; note?: string } | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);

  const g = useRef<P.Game>(P.newGame());
  const phaseRef = useRef<Phase>("menu");
  const angle = useRef(0);
  const powerRef = useRef(0.55);
  const log = useRef<P.ShotLog>(P.newLog());
  const anim = useRef({ strikeAt: 0, aiFrom: 0, aiTo: 0, aiStart: 0, aiPower: 0.5, acc: 0, last: 0, stopUntil: 0, shakeAt: -1e9, broke: false, lastRail: 0 });
  const flashes = useRef<{ x: number; y: number; t: number; c: string }[]>([]);
  const sinks = useRef<{ id: number; x: number; y: number; px: number; py: number; t: number }[]>([]);
  const sparks = useRef<Fx[]>([]);
  const spins = useRef<Map<number, Spin>>(new Map());
  const dragCue = useRef(false);
  // pull-back shooting: where the drag started and the power it's pulled to
  const pull = useRef<{ x: number; y: number; power0: number; p: number } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullPct, setPullPct] = useState(0);
  // fine aim: horizontal drags turn the cue slowly instead of pointing it
  const fineRef = useRef(false);
  const [fine, setFine] = useState(false);
  const fineDrag = useRef<{ sx: number; a0: number } | null>(null);
  // cue-ball spin for the next shot (resets after each shot)
  const cueSpin = useRef<P.Spin>({ top: 0, side: 0 });
  const [spinUI, setSpinUI] = useState<P.Spin>({ top: 0, side: 0 });
  const setCueSpin = (s: P.Spin) => { cueSpin.current = s; setSpinUI(s); };
  const nudgeT = useRef<ReturnType<typeof setInterval> | null>(null);
  const runId = useRef<Promise<string | null> | null>(null);
  const crest = useRef<HTMLImageElement | null>(null);
  const tableDirty = useRef(true);
  const modeRef = useRef<Mode>("ai"), levelRef = useRef<P.Level>("veteran"), namesRef = useRef<[string, string]>([me, "Goblin Hustler"]);

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseS(p); };
  const setPower = (v: number) => { const x = Math.max(0.05, Math.min(1, v)); powerRef.current = x; setPowerS(x); };
  const sync = useCallback(() => {
    const s = g.current;
    setHud({ turn: s.turn, groups: s.groups, note: s.note, left: s.balls.filter((b) => !b.down && b.id !== 0).map((b) => b.id), inHand: s.inHand, winner: s.winner });
  }, []);
  const vertical = width < 560;
  // On phones the table stands upright and is sized so the cabinet's player row, the table and the shoot bar
  // all fit between the sticky header + arcade bar and the bottom of the screen: nothing covers the table.
  const [vh, setVh] = useState(800);
  const [chrome, setChrome] = useState(120);
  useEffect(() => {
    const f = () => {
      setVh(window.innerHeight);
      const hdr = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 64;
      const bar = document.querySelector(".arcade-bar")?.getBoundingClientRect().height ?? 48;
      setChrome(Math.round(hdr + bar));
    };
    f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, []);
  // player row ~46, shoot bar ~122, cabinet and screen padding + gaps ~52, a little breathing room ~8
  const PHONE_EXTRA = 46 + 122 + 52 + 8;
  const scale = vertical ? Math.min(width / TH, Math.max(0.3, (vh - chrome - PHONE_EXTRA) / TW)) : width / TW;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth, 1000)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { const i = new Image(); i.onload = () => { tableDirty.current = true; }; i.src = "/assets/crest-256.webp"; crest.current = i; }, []);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = cv.current!.getBoundingClientRect(), sx = cx - r.left, sy = cy - r.top;
    return vertical ? { x: sy / scale - P.RAIL, y: P.H + P.RAIL - sx / scale } : { x: sx / scale - P.RAIL, y: sy / scale - P.RAIL };
  }, [vertical, scale]);

  const human = () => modeRef.current === "friend" || g.current.turn === 0;

  // ---------------------------------------------------------------- game flow
  const finishGame = useCallback(async () => {
    const s = g.current;
    setPhase("over"); sync();
    const lvl = LEVELS.find((l) => l.id === levelRef.current)!;
    const won = s.winner === 0;
    if (modeRef.current !== "ai") {
      play("win");
      setChips((c) => [{ k: performance.now(), label: `${namesRef.current[s.winner ?? 0]}`, tone: "neutral" as Chip["tone"] }, ...c].slice(0, 14));
      return;
    }
    setChips((c) => [{ k: performance.now(), label: `${won ? "Won" : "Lost"} · ${lvl.name.split(" ").pop()}`, tone: (won ? (lvl.pts >= 4 ? "big" : "win") : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    const id = await runId.current; runId.current = null;
    if (!signedIn) { if (won) play("win"); else celebrate({ mult: 0, won: 0 }); return setResult({ earned: 0, note: "Sign in to earn Dragon Marks for wins." }); }
    if (!id) { celebrate({ mult: 0, won: 0 }); return setResult({ earned: 0, note: "Couldn't reach the server, so this game didn't count." }); }
    const r = await poolFinish({ id, won });
    if (!r.ok) { if (won) play("win"); else celebrate({ mult: 0, won: 0 }); return setResult({ earned: 0, note: r.error }); }
    setBalance(r.balance); flash(r.earned); setLeftToday(r.leftToday);
    setResult({ earned: r.earned, note: won && r.earned === 0 ? "You've hit today's 8-ball limit. Wins count again tomorrow." : undefined });
    if (won && r.earned > 0) celebrate({ mult: lvl.mult, won: r.earned, label: lvl.pts >= 4 ? "Champion slain!" : undefined });
    else if (won) play("win");
    else celebrate({ mult: 0, won: 0 });
  }, [signedIn, setBalance, flash, sync]);

  const aiTurn = useCallback(() => {
    setPhase("ai");
    const s = g.current;
    setTimeout(() => {
      if (phaseRef.current !== "ai") return;
      if (s.inHand) { const spot = P.aiPlace(s); const c = s.balls.find((b) => b.id === 0)!; c.x = spot.x; c.y = spot.y; c.down = false; }
      const shot = P.aiShot(s, levelRef.current);
      const a = anim.current;
      a.aiFrom = angle.current; a.aiTo = shot.angle; a.aiStart = performance.now(); a.aiPower = shot.power;
      // swing the cue round, then shoot
      setTimeout(() => { if (phaseRef.current !== "ai") return; angle.current = shot.angle; powerRef.current = shot.power; a.strikeAt = performance.now(); setPhase("strike"); }, 750);
    }, s.inHand ? 900 : 650);
  }, []);

  const afterShot = useCallback(() => {
    const s = g.current;
    const was = s.turn;
    const next = P.resolve(s, s.balls, log.current, namesRef.current);
    g.current = next;
    sync();
    if (next.winner !== null) return void finishGame();
    if (next.inHand) { play("error"); buzz("tick"); }
    else if (next.turn !== was) play("whoosh", { vol: .25 });
    if (modeRef.current === "ai" && next.turn === 1) return aiTurn();
    // aim the new shooter at something sensible
    const cue = next.balls.find((b) => b.id === 0)!, t = P.targets(next, next.turn)[0];
    const tb = next.balls.find((b) => b.id === t);
    if (tb) angle.current = Math.atan2(tb.y - cue.y, tb.x - cue.x);
    setPhase("aim");
  }, [aiTurn, finishGame, sync]);

  const start = (m: Mode, lvl: P.Level) => {
    modeRef.current = m; levelRef.current = lvl; setMode(m); setLevel(lvl);
    const nm: [string, string] = m === "ai" ? [me, LEVELS.find((l) => l.id === lvl)!.name] : ["Player 1", "Player 2"];
    namesRef.current = nm; setNames(nm);
    g.current = P.newGame(Math.random, 0);
    g.current.note = `${nm[0]} breaks. Drag the cue ball to place it, then pull back on the cue to shoot.`;
    spins.current = new Map(); sinks.current = []; sparks.current = [];
    angle.current = 0; setPower(0.9); setResult(null); sync();
    runId.current = m === "ai" && signedIn ? poolStart({ level: lvl }).then((r) => (r.ok ? r.id : null)).catch(() => null) : null;
    play("deal"); setTimeout(() => play("chip", { pitch: .8 }), 90);
    setPhase("aim");
    // phones: bring the whole cabinet into view, tucked under the sticky header and arcade bar
    if (vertical) requestAnimationFrame(() => {
      const mc = document.querySelector(".pl-machine"); if (!mc) return;
      const top = mc.getBoundingClientRect().top + window.scrollY - chrome - 4;
      window.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };

  const shoot = useCallback(() => {
    if (phaseRef.current !== "aim" || !human()) return;
    anim.current.strikeAt = performance.now();
    setPhase("strike");
  }, []);

  // ---------------------------------------------------------------- input
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const aimAt = (e: PointerEvent) => {
      const w = toWorld(e.clientX, e.clientY), cue = g.current.balls.find((b) => b.id === 0)!;
      if (Math.hypot(w.x - cue.x, w.y - cue.y) > 4) angle.current = Math.atan2(w.y - cue.y, w.x - cue.x);
    };
    const down = (e: PointerEvent) => {
      if (phaseRef.current !== "aim" || !human()) return;
      c.setPointerCapture(e.pointerId);
      const w = toWorld(e.clientX, e.clientY), s = g.current, cue = s.balls.find((b) => b.id === 0)!;
      const ax = Math.cos(angle.current), ay = Math.sin(angle.current), rx = w.x - cue.x, ry = w.y - cue.y;
      const along = rx * ax + ry * ay, across = Math.abs(-rx * ay + ry * ax);
      const onBall = Math.hypot(rx, ry) < P.R * 3.2;
      // ball in hand: grabbing the ball itself moves it
      if (s.inHand && onBall) { dragCue.current = true; return; }
      // grabbing the cue ball (or the cue stick behind it) starts a pull-back shot
      const onStick = along < -P.R * 1.2 && along > -P.R * 18 && across < P.R * 2.8;
      if (onStick || onBall) {
        pull.current = { x: w.x, y: w.y, power0: powerRef.current, p: 0 };
        powerRef.current = 0.05; setPulling(true); setPullPct(0); play("click", { vol: .5 });
        return;
      }
      if (fineRef.current) { fineDrag.current = { sx: e.clientX - e.clientY, a0: angle.current }; return; }
      aimAt(e);
    };
    const move = (e: PointerEvent) => {
      if (phaseRef.current !== "aim" || !human()) return;
      if (dragCue.current) {
        const w = toWorld(e.clientX, e.clientY), s = g.current;
        if (P.placeOk(s.balls, w.x, w.y, s.kitchen)) { const cue = s.balls.find((b) => b.id === 0)!; cue.x = w.x; cue.y = w.y; }
        return;
      }
      const pl = pull.current;
      if (pl) {
        const w = toWorld(e.clientX, e.clientY);
        const back = (pl.x - w.x) * Math.cos(angle.current) + (pl.y - w.y) * Math.sin(angle.current);
        const p = Math.max(0, Math.min(1, back / 130));
        if (Math.floor(p * 20) !== Math.floor(pl.p * 20)) { setPullPct(Math.round(p * 100)); if (p > pl.p) play("tick", { pitch: 0.8 + p * 0.8, vol: .35 }); }
        pl.p = p; powerRef.current = Math.max(0.05, p);
        return;
      }
      const fd = fineDrag.current;
      if (fd) { angle.current = fd.a0 + ((e.clientX - e.clientY) - fd.sx) * 0.0015; return; }
      if (e.pointerType === "mouse" && !e.buttons) {
        // hover-aim, except over the cue ball or the stick: there the cursor is reaching to grab it
        const w = toWorld(e.clientX, e.clientY), cue = g.current.balls.find((b) => b.id === 0)!;
        const ax = Math.cos(angle.current), ay = Math.sin(angle.current), rx = w.x - cue.x, ry = w.y - cue.y;
        const along = rx * ax + ry * ay, across = Math.abs(-rx * ay + ry * ax);
        const overGrip = Math.hypot(rx, ry) < P.R * 3.2 || (along < -P.R * 1.2 && along > -P.R * 18 && across < P.R * 2.8);
        c.style.cursor = overGrip ? "grab" : "crosshair";
        if (overGrip) return;
      }
      if (e.pointerType === "mouse" || e.buttons) aimAt(e);
    };
    const up = () => {
      dragCue.current = false; fineDrag.current = null;
      const pl = pull.current;
      if (pl) {
        pull.current = null; setPulling(false);
        if (pl.p >= 0.04) { setPower(pl.p); shoot(); } // release to shoot
        else setPower(pl.power0); // let go near the start: cancelled
      }
    };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
  }, [toWorld, shoot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (phaseRef.current !== "aim" || !human()) return;
      const step = e.shiftKey ? 0.002 : 0.012;
      if (e.key === "ArrowLeft") { angle.current -= step; e.preventDefault(); }
      else if (e.key === "ArrowRight") { angle.current += step; e.preventDefault(); }
      else if (e.key === "ArrowUp") { setPower(powerRef.current + 0.05); e.preventDefault(); }
      else if (e.key === "ArrowDown") { setPower(powerRef.current - 0.05); e.preventDefault(); }
      else if (e.key === " " && wrap.current?.closest(".pool-game")?.contains(document.activeElement ?? null) !== false) { e.preventDefault(); shoot(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shoot]);

  // ---------------------------------------------------------------- drawing + physics loop
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = (vertical ? TH : TW) * scale, cssH = (vertical ? TW : TH) * scale;
    c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
    const view = (x: CanvasRenderingContext2D) => vertical
      ? x.setTransform(0, scale * dpr, -scale * dpr, 0, (P.H + P.RAIL) * scale * dpr, P.RAIL * scale * dpr)
      : x.setTransform(scale * dpr, 0, 0, scale * dpr, P.RAIL * scale * dpr, P.RAIL * scale * dpr);
    // screen directions expressed in table units: light from the top left, shadows to the bottom right
    const fromScreen = (dx: number, dy: number) => (vertical ? { x: dy, y: -dx } : { x: dx, y: dy });
    const light = fromScreen(-.42, -.46), shade = fromScreen(2.5, 3.2);
    const reduced = reducedMotion();
    const cache = document.createElement("canvas"); cache.width = c.width; cache.height = c.height;
    tableDirty.current = true;
    let raf = 0;
    anim.current.last = performance.now();

    const spinOf = (b: P.Ball) => {
      let o = spins.current.get(b.id);
      if (!o) { o = { n: [0, 0, 1], m: [0, 1, 0], px: b.x, py: b.y }; spins.current.set(b.id, o); }
      return o;
    };

    const ball = (b: P.Ball, x = b.x, y = b.y, size = 1, alpha = 1) => {
      const r = P.R * size, id = b.id, o = spinOf(b);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(x + shade.x * size, y + shade.y * size, r, r * .92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.save(); ctx.clip();
      const stripe = id >= 9;
      ctx.fillStyle = stripe ? "#f4efe2" : colorOf(id); ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (stripe) { // the stripe is a band round the ball: draw the half that faces us
        const [mx, my, mz] = o.m, hl = Math.hypot(mx, my);
        if (hl > .02) {
          const ux = my / hl, uy = -mx / hl; // u = m × z (in the table plane)
          const vx = my * 0 - mz * uy, vy = mz * ux - mx * 0, vz = mx * uy - my * ux; // v = m × u
          ctx.strokeStyle = colorOf(id); ctx.lineWidth = r * 1.1 * Math.max(.18, hl); ctx.lineCap = "butt"; ctx.beginPath();
          let on = false;
          for (let i = 0; i <= 32; i++) {
            const t = (i / 32) * Math.PI * 2, cz = vz * Math.sin(t);
            const px = x + (ux * Math.cos(t) + vx * Math.sin(t)) * r, py = y + (uy * Math.cos(t) + vy * Math.sin(t)) * r;
            if (cz >= -.05) { if (on) ctx.lineTo(px, py); else ctx.moveTo(px, py); on = true; } else on = false;
          }
          ctx.stroke();
        } else { // band seen face on: a coloured disc with white caps round the rim
          ctx.fillStyle = colorOf(id); ctx.beginPath(); ctx.arc(x, y, r * .82, 0, Math.PI * 2); ctx.fill();
        }
      }
      // the number disc (or the Dragon's Eye) sits on the side of the ball that's rolled into view
      const [nx, ny, nz] = o.n;
      if (nz > 0) {
        const dx = x + nx * r, dy = y + ny * r, ang = Math.atan2(ny, nx);
        ctx.save(); ctx.translate(dx, dy); ctx.rotate(ang); ctx.scale(Math.max(.08, nz), 1);
        if (id === 8) {
          const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * .5); eg.addColorStop(0, "#e0c4ff"); eg.addColorStop(.6, "#9b5dff"); eg.addColorStop(1, "#3a0f80");
          ctx.rotate(-ang); ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(0, 0, r * .5, r * .42, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#0a0014"; ctx.beginPath(); ctx.ellipse(0, 0, r * .1, r * .36, 0, 0, Math.PI * 2); ctx.fill();
        } else if (id > 0) {
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r * .46, 0, Math.PI * 2); ctx.fill();
          ctx.rotate(-ang - (vertical ? Math.PI / 2 : 0)); // keep the number upright on screen
          ctx.fillStyle = "#111"; ctx.font = `700 ${r * .66}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(id), 0, r * .04);
        } else { ctx.fillStyle = "#c9a13b"; ctx.beginPath(); ctx.arc(0, 0, r * .14, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      // shading: a bright highlight toward the light and a darker far side
      const hl = ctx.createRadialGradient(x + light.x * r, y + light.y * r, 0, x, y, r * 1.12);
      hl.addColorStop(0, "rgba(255,255,255,.8)"); hl.addColorStop(.18, "rgba(255,255,255,.14)"); hl.addColorStop(.6, "rgba(0,0,0,0)"); hl.addColorStop(1, "rgba(0,0,0,.5)");
      ctx.fillStyle = hl; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };

    const table = (x: CanvasRenderingContext2D) => {
      // rails: dark oak with grain, gold trim and diamond sights
      const wood = x.createLinearGradient(0, -P.RAIL, 0, P.H + P.RAIL);
      wood.addColorStop(0, "#4a3018"); wood.addColorStop(.08, "#2e1c0d"); wood.addColorStop(.5, "#24160b"); wood.addColorStop(.92, "#2e1c0d"); wood.addColorStop(1, "#4a3018");
      x.fillStyle = wood; x.beginPath(); x.roundRect(-P.RAIL, -P.RAIL, TW, TH, 26); x.fill();
      x.save(); x.beginPath(); x.roundRect(-P.RAIL, -P.RAIL, TW, TH, 26); x.clip();
      x.strokeStyle = "rgba(0,0,0,.18)"; x.lineWidth = 1;
      for (let i = 0; i < 40; i++) { const yy = -P.RAIL + Math.random() * TH; x.beginPath(); x.moveTo(-P.RAIL, yy); x.bezierCurveTo(P.W * .3, yy + (Math.random() - .5) * 8, P.W * .7, yy + (Math.random() - .5) * 8, P.W + P.RAIL, yy + (Math.random() - .5) * 4); x.stroke(); }
      x.restore();
      x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.roundRect(-P.RAIL + 1, -P.RAIL + 1, TW - 2, TH - 2, 25); x.stroke();
      x.strokeStyle = "#c9a13b"; x.lineWidth = 2.5; x.beginPath(); x.roundRect(-P.RAIL + 6, -P.RAIL + 6, TW - 12, TH - 12, 20); x.stroke();
      x.strokeStyle = "rgba(255,226,154,.25)"; x.lineWidth = 1; x.beginPath(); x.roundRect(-P.RAIL + 9, -P.RAIL + 9, TW - 18, TH - 18, 17); x.stroke();
      const sight = (sx: number, sy: number) => {
        x.fillStyle = "#fff3c4"; x.beginPath(); x.moveTo(sx, sy - 4.5); x.lineTo(sx + 3.2, sy); x.lineTo(sx, sy + 4.5); x.lineTo(sx - 3.2, sy); x.fill();
        x.strokeStyle = "#8a6a2c"; x.lineWidth = 1; x.stroke();
      };
      for (const f of [1, 2, 3, 5, 6, 7]) for (const y of [-P.RAIL / 2 - 3, P.H + P.RAIL / 2 + 3]) sight((P.W / 8) * f, y);
      for (const f of [1, 2, 3]) for (const xx of [-P.RAIL / 2 - 3, P.W + P.RAIL / 2 + 3]) sight(xx, (P.H / 4) * f);
      // cushions, then felt with a pool of lamplight
      x.fillStyle = "#0a3326"; x.fillRect(-14, -14, P.W + 28, P.H + 28);
      const felt = x.createRadialGradient(P.W / 2, P.H / 2, 40, P.W / 2, P.H / 2, P.W * .62);
      felt.addColorStop(0, "#1c8a66"); felt.addColorStop(.6, "#13654b"); felt.addColorStop(1, "#0b4434");
      x.fillStyle = felt; x.fillRect(0, 0, P.W, P.H);
      for (let i = 0; i < 1400; i++) { x.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.05)"; x.fillRect(Math.random() * P.W, Math.random() * P.H, 1.5, 1.5); }
      // cushion noses along the physics segments
      x.lineCap = "round";
      for (const cs of P.CUSHIONS.slice(0, 6)) {
        x.strokeStyle = "#0e5a43"; x.lineWidth = 9; x.beginPath(); x.moveTo(cs.ax, cs.ay); x.lineTo(cs.bx, cs.by); x.stroke();
        x.strokeStyle = "rgba(160,255,210,.14)"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cs.ax, cs.ay); x.lineTo(cs.bx, cs.by); x.stroke();
      }
      const cr = crest.current;
      if (cr?.complete && cr.naturalWidth) { x.save(); x.globalAlpha = .1; x.translate(P.W / 2, P.H / 2); if (vertical) x.rotate(-Math.PI / 2); x.drawImage(cr, -130, -130, 260, 260); x.restore(); }
      // head string and foot spot
      x.strokeStyle = "rgba(255,255,255,.12)"; x.setLineDash([6, 8]); x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(P.HEAD_X, 0); x.lineTo(P.HEAD_X, P.H); x.stroke(); x.setLineDash([]);
      x.fillStyle = "rgba(255,255,255,.18)"; x.beginPath(); x.arc(P.FOOT.x, P.FOOT.y, 3, 0, Math.PI * 2); x.fill();
      // pockets: leather nets in gold-rimmed cups
      for (const p of P.POCKETS) {
        const pg = x.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 5); pg.addColorStop(0, "#000"); pg.addColorStop(.75, "#0a0604"); pg.addColorStop(1, "#2a1a0c");
        x.fillStyle = pg; x.beginPath(); x.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "#c9a13b"; x.lineWidth = 3; x.beginPath(); x.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = "rgba(255,240,190,.5)"; x.lineWidth = 1; x.beginPath(); x.arc(p.x, p.y, p.r + 5.5, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
      }
    };
    const paintCache = () => {
      const x = cache.getContext("2d")!;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cache.width, cache.height);
      view(x); table(x); tableDirty.current = false;
    };

    const cueStick = (a: number, pull: number, alpha = 1) => {
      const cue = g.current.balls.find((b) => b.id === 0)!;
      const dx = Math.cos(a), dy = Math.sin(a), tip = P.R + 4 + pull, len = 420;
      const x0 = cue.x - dx * tip, y0 = cue.y - dy * tip, x1 = cue.x - dx * (tip + len), y1 = cue.y - dy * (tip + len);
      ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x0 + shade.x * 1.6, y0 + shade.y * 1.6); ctx.lineTo(x1 + shade.x * 1.6, y1 + shade.y * 1.6); ctx.stroke();
      const wd = ctx.createLinearGradient(x0, y0, x1, y1); wd.addColorStop(0, "#e9d8b0"); wd.addColorStop(.3, "#a8743a"); wd.addColorStop(.7, "#4a2a12"); wd.addColorStop(1, "#1e1008");
      ctx.strokeStyle = wd; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0 + light.x * 3, y0 + light.y * 3); ctx.lineTo(x1 + light.x * 3, y1 + light.y * 3); ctx.stroke(); // sheen
      ctx.strokeStyle = "#f2e8d0"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - dx * 8, y0 - dy * 8); ctx.stroke(); // tip
      ctx.strokeStyle = "#e0b04a"; ctx.lineWidth = 7.5; ctx.beginPath(); ctx.moveTo(x0 - dx * 10, y0 - dy * 10); ctx.lineTo(x0 - dx * 16, y0 - dy * 16); ctx.stroke(); // gold ferrule
      ctx.strokeStyle = "#7a3bc9"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x0 - dx * 300, y0 - dy * 300); ctx.lineTo(x0 - dx * 330, y0 - dy * 330); ctx.stroke(); // amethyst wrap
      ctx.restore();
    };

    const guide = () => {
      const s = g.current, cue = s.balls.find((b) => b.id === 0)!, a = angle.current;
      const hit = P.castAim(s.balls, a);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(hit.x, hit.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(hit.x, hit.y, P.R, 0, Math.PI * 2); ctx.stroke();
      if (hit.ball) {
        const legal = P.targets(s, s.turn).includes(hit.ball.id);
        const ob = hit.ball, nx = ob.x - hit.x, ny = ob.y - hit.y, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
        // where the object ball heads: into a pocket (path clear of other balls) or toward a cushion
        let pot: (typeof P.POCKETS)[number] | null = null, potT = Infinity;
        for (const pk of P.POCKETS) {
          const vx = pk.x - ob.x, vy = pk.y - ob.y, t = vx * ux + vy * uy;
          if (t <= 0 || Math.abs(-vx * uy + vy * ux) > pk.r * 0.8 || t >= potT) continue;
          const blocked = s.balls.some((o) => !o.down && o.id !== ob.id && o.id !== 0 && (() => { const wx = o.x - ob.x, wy = o.y - ob.y, k = wx * ux + wy * uy; return k > 0 && k < t && Math.abs(-wx * uy + wy * ux) < P.R * 2; })());
          if (!blocked) { pot = pk; potT = t; }
        }
        const wallT = Math.min(ux > 0 ? (P.W - P.R - ob.x) / ux : ux < 0 ? (P.R - ob.x) / ux : 1e9, uy > 0 ? (P.H - P.R - ob.y) / uy : uy < 0 ? (P.R - ob.y) / uy : 1e9);
        const len = pot ? potT : Math.min(wallT, 240);
        const good = pot && legal;
        ctx.strokeStyle = good ? "rgba(110,255,150,.95)" : legal ? "rgba(255,225,120,.9)" : "rgba(255,90,90,.9)"; ctx.lineWidth = good ? 2.5 : 2;
        ctx.beginPath(); ctx.moveTo(ob.x, ob.y); ctx.lineTo(ob.x + ux * len, ob.y + uy * len); ctx.stroke();
        if (good && pot) { ctx.strokeStyle = "rgba(110,255,150,.8)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(pot.x, pot.y, pot.r + 6 + Math.sin(performance.now() / 160) * 2, 0, Math.PI * 2); ctx.stroke(); }
        // the cue ball after contact: it keeps the sideways part of its speed, plus follow or draw from its spin
        const ax = Math.cos(a), ay = Math.sin(a), tx = -uy, ty = ux, dt = ax * tx + ay * ty, top = cueSpin.current.top;
        const cx = tx * dt + ax * top * P.FOLLOW, cy = ty * dt + ay * top * P.FOLLOW, cl = Math.hypot(cx, cy);
        if (cl > 0.03) {
          ctx.strokeStyle = top > 0.1 ? "rgba(140,200,255,.6)" : top < -0.1 ? "rgba(255,160,120,.6)" : "rgba(255,255,255,.4)";
          ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(hit.x, hit.y); ctx.lineTo(hit.x + (cx / cl) * 30 + cx * 70, hit.y + (cy / cl) * 30 + cy * 70); ctx.stroke(); ctx.setLineDash([]);
        }
        if (!legal) { ctx.strokeStyle = "rgba(255,90,90,.9)"; ctx.beginPath(); ctx.arc(ob.x, ob.y, P.R + 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.restore();
    };

    // one physics step, read for impacts: a ball that changes velocity sharply hit something
    const stepAndListen = (now: number) => {
      const s = g.current, A = anim.current;
      const before = s.balls.map((b) => ({ vx: b.vx, vy: b.vy, down: b.down }));
      const potted0 = log.current.potted.length;
      P.step(s.balls, log.current);
      let ballHit = 0, railHit = 0, railAt: { x: number; y: number } | null = null;
      s.balls.forEach((b, i) => {
        const o = before[i]; if (b.down || o.down) return;
        const sp0 = Math.hypot(o.vx, o.vy), dv = Math.hypot(b.vx - o.vx * .988, b.vy - o.vy * .988);
        if (dv < .8) return;
        const wall = Math.min(b.x, P.W - b.x, b.y, P.H - b.y) < P.R + 3;
        if (wall && Math.hypot(b.vx, b.vy) < sp0 + .1) { if (dv > railHit) { railHit = dv; railAt = { x: b.x, y: b.y }; } }
        else ballHit = Math.max(ballHit, dv);
      });
      if (ballHit > 0) {
        play("chip", { pitch: .7 + Math.min(.6, ballHit * .03), vol: Math.min(1, .25 + ballHit / 14) });
        if (s.breakShot && !A.broke && ballHit > 9) { // a hard break: freeze a beat and shake the cabinet
          A.broke = true; play("bomb", { vol: .22 }); buzz("tap");
          if (!reduced) { A.stopUntil = now + 55; A.shakeAt = now; }
        }
      }
      if (railHit > 0 && railAt && now - A.lastRail > 45) {
        A.lastRail = now; play("thud", { pitch: 1.5, vol: Math.min(.55, .1 + railHit / 30) });
        if (!reduced && railHit > 3) {
          const pt = railAt as { x: number; y: number };
          const ex = pt.x < P.R + 3 ? -P.R : pt.x > P.W - P.R - 3 ? P.R : 0, ey = pt.y < P.R + 3 ? -P.R : pt.y > P.H - P.R - 3 ? P.R : 0;
          for (let i = 0; i < Math.min(8, 2 + railHit / 3); i++) {
            const a = Math.random() * Math.PI * 2, v = .6 + Math.random() * 2;
            sparks.current.push({ x: pt.x + ex, y: pt.y + ey, vx: Math.cos(a) * v - ex * .08, vy: Math.sin(a) * v - ey * .08, life: 1, c: Math.random() < .5 ? "#ffe9a8" : "#ffd100" });
          }
        }
      }
      for (const id of log.current.potted.slice(potted0)) {
        const b = s.balls.find((x) => x.id === id)!;
        const pk = P.POCKETS.reduce((m, p) => (Math.hypot(p.x - b.x, p.y - b.y) < Math.hypot(m.x - b.x, m.y - b.y) ? p : m));
        flashes.current.push({ x: pk.x, y: pk.y, t: now, c: id === 0 ? "#fff" : id === 8 ? "#c08cff" : colorOf(id) });
        sinks.current.push({ id, x: b.x, y: b.y, px: pk.x, py: pk.y, t: now });
        play("stop", { pitch: .7 }); setTimeout(() => play("tick", { pitch: .6 }), 70);
        if (id !== 0) buzz("tick");
      }
    };

    const frame = (now: number) => {
      const s = g.current, ph = phaseRef.current, A = anim.current;
      // physics at a fixed 60 steps a second, whatever the screen's refresh rate
      if (ph === "rolling") {
        if (now < A.stopUntil) A.last = now; // hit-stop
        A.acc += Math.min(100, now - A.last);
        while (A.acc >= 1000 / 60) {
          A.acc -= 1000 / 60;
          stepAndListen(now);
          if (!P.moving(s.balls)) { for (const b of s.balls) b.vx = b.vy = 0; A.acc = 0; afterShot(); break; }
        }
      }
      A.last = now;
      if (ph === "strike" && now - A.strikeAt > 140) {
        const sp = human() ? cueSpin.current : P.NO_SPIN;
        log.current = P.newLog(sp, angle.current);
        if (sp.top || sp.side) setCueSpin({ top: 0, side: 0 });
        const cue = s.balls.find((b) => b.id === 0)!, v = powerRef.current * P.MAX_SPEED;
        cue.vx = Math.cos(angle.current) * v; cue.vy = Math.sin(angle.current) * v;
        A.acc = 0; A.broke = false; setPhase("rolling");
        play("thud", { pitch: 1.7, vol: .25 + powerRef.current * .45 }); play("chip", { pitch: .6, vol: .4 + powerRef.current * .4 });
      }
      // roll each ball by how far it moved: rotate its number pole and stripe axis about the rolling axis
      for (const b of s.balls) {
        if (b.down) continue;
        const o = spinOf(b), dx = b.x - o.px, dy = b.y - o.py, d = Math.hypot(dx, dy);
        if (d > 0 && d < P.R * 3) { const ax: V3 = [-dy / d, dx / d, 0]; o.n = rot(o.n, ax, d / P.R); o.m = rot(o.m, ax, d / P.R); }
        o.px = b.x; o.py = b.y;
      }

      if (tableDirty.current) paintCache();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      const sk = now - A.shakeAt;
      const jx = sk < 180 ? (Math.random() - .5) * 8 * (1 - sk / 180) * dpr : 0, jy = sk < 180 ? (Math.random() - .5) * 8 * (1 - sk / 180) * dpr : 0;
      ctx.drawImage(cache, jx, jy);
      view(ctx);
      if (jx || jy) { const m = ctx.getTransform(); ctx.setTransform(m.a, m.b, m.c, m.d, m.e + jx, m.f + jy); }
      for (const f of flashes.current) {
        const k = (now - f.t) / 500; if (k > 1) continue;
        ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 20 + k * 30, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      flashes.current = flashes.current.filter((f) => now - f.t < 500);
      const myAim = ph === "aim" && (modeRef.current === "friend" || s.turn === 0);
      if (myAim) guide();
      const cue0 = s.balls.find((b) => b.id === 0)!;
      if (myAim && s.inHand && !cue0.down) {
        ctx.strokeStyle = "rgba(255,225,120,.75)"; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cue0.x, cue0.y, P.R + 7 + Math.sin(now / 200) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      // balls dropping into pockets: slide to the cup and shrink away
      for (const sn of sinks.current) {
        const k = (now - sn.t) / 220; if (k > 1) continue;
        const b = s.balls.find((x) => x.id === sn.id); if (!b || !b.down) continue;
        ball(b, sn.x + (sn.px - sn.x) * k, sn.y + (sn.py - sn.y) * k, 1 - k * .55, 1 - k);
      }
      sinks.current = sinks.current.filter((sn) => now - sn.t < 220);
      for (const b of s.balls) if (!b.down) ball(b);
      // cushion sparks
      for (const p of sparks.current) {
        p.x += p.vx; p.y += p.vy; p.vx *= .9; p.vy *= .9; p.life -= .06;
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; sparks.current = sparks.current.filter((p) => p.life > 0);
      // pulling back: a power ring around the cue ball, gold to red
      const pl = pull.current;
      if (ph === "aim" && myAim && pl && !cue0.down) {
        const k = pl.p;
        ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.arc(cue0.x, cue0.y, P.R + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `hsl(${50 - k * 50} 100% ${60 - k * 8}%)`; ctx.beginPath(); ctx.arc(cue0.x, cue0.y, P.R + 9, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
      // cue stick
      if (ph === "aim" && myAim) cueStick(angle.current, 10 + powerRef.current * 70);
      else if (ph === "strike") { const k = Math.min(1, (now - A.strikeAt) / 140); cueStick(angle.current, (10 + powerRef.current * 70) * (1 - k * k)); }
      else if (ph === "ai") {
        const k = Math.min(1, Math.max(0, (now - A.aiStart) / 650)), e = 1 - Math.pow(1 - k, 3);
        let d = A.aiTo - A.aiFrom; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        angle.current = A.aiStart ? A.aiFrom + d * e : angle.current;
        cueStick(angle.current, 10 + A.aiPower * 70 * e, .9);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, vertical, scale, afterShot]);

  // ---------------------------------------------------------------- UI
  const groupBalls = (p: 0 | 1) => {
    const grp = hud.groups[p];
    if (!grp) return null;
    const ids = grp === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    return ids.map((id) => <span key={id} className={`pool-mini${hud.left.includes(id) ? "" : " gone"}${id > 8 ? " striped" : ""}`} style={{ ["--c" as string]: colorOf(id) }} />);
  };
  const yourTurn = phase === "aim" && (mode === "friend" || hud.turn === 0);
  const lvl = LEVELS.find((l) => l.id === level)!;
  // hold an arrow to keep turning: slow at first for precision, then faster
  const stopNudge = () => { if (nudgeT.current) { clearInterval(nudgeT.current); nudgeT.current = null; } };
  const startNudge = (dir: 1 | -1) => {
    stopNudge();
    const t0 = performance.now();
    angle.current += dir * 0.0025; play("tick", { vol: .4 });
    nudgeT.current = setInterval(() => {
      const held = performance.now() - t0;
      if (held < 280) return;
      angle.current += dir * (held < 900 ? 0.0025 : held < 2000 ? 0.008 : 0.02);
    }, 30);
  };
  useEffect(() => stopNudge, []);
  const nudgeProps = (dir: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (yourTurn) startNudge(dir); },
    onPointerUp: stopNudge, onPointerLeave: stopNudge, onPointerCancel: stopNudge,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); angle.current += dir * 0.0025; } },
  });
  const shootBar = (
    <div className="pool-shootbar">
      <div className="pl-bar-top">
        <label className="field pl-power-field">Power <span className="micro muted">{pulling ? (pullPct < 4 ? "pull back…" : `${pullPct}% · let go to shoot`) : `${Math.round(power * 100)}%`}</span>
          <input type="range" min={5} max={100} value={Math.round(power * 100)} disabled={!yourTurn} onChange={(e) => setPower(Number(e.target.value) / 100)}
            style={{ ["--p" as string]: `${Math.round(power * 100)}%` }} className="pl-power" />
        </label>
        <SpinPicker spin={spinUI} onChange={(s) => { setCueSpin(s); play("click", { vol: .4 }); }} disabled={!yourTurn} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn pl-nudge" aria-label="Turn aim left (hold to keep turning)" disabled={!yourTurn} {...nudgeProps(-1)}>◀</button>
        <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={!yourTurn} onClick={shoot}>Shoot</button>
        <button type="button" className="btn pl-nudge" aria-label="Turn aim right (hold to keep turning)" disabled={!yourTurn} {...nudgeProps(1)}>▶</button>
        <button type="button" className={`btn pl-fine${fine ? " on" : ""}`} aria-pressed={fine} title="Fine aim: drag sideways on the table to turn the cue slowly"
          onClick={() => { fineRef.current = !fine; setFine(!fine); play("click", { vol: .4 }); }}>Fine</button>
        <PoolMute />
      </div>
    </div>
  );
  const plate = (p: 0 | 1) => (
    <div key={p} className={`pool-player${hud.turn === p && phase !== "menu" && phase !== "over" ? " up" : ""}${phase === "over" && hud.winner === p ? " won" : ""}`}>
      <strong>{names[p]}</strong>
      <span className="micro muted">{hud.groups[p] ? (hud.groups[p] === "solids" ? "Solids" : "Stripes") : phase === "menu" ? "" : "Open table"}</span>
      <span className="pool-minis">{groupBalls(p)}</span>
    </div>
  );

  return (
    <div className="game-layout pool-game">
      <div className="game-stage pool-stage">
        <Machine theme="felt" label="Dragon's Eye 8-Ball" className="pl-machine" hud={<>
          <div className="pool-players">{plate(0)}{plate(1)}</div>
          <ResultStrip items={chips} label="Recent games" />
        </>}>
          <div ref={wrap} className="pool-wrap">
            <div className={`pl-frame pl-${phase}`}>
              <canvas ref={cv} className="pool-canvas" aria-label="8-ball table. Aim with the mouse or by dragging, set power, then shoot." />
              {phase === "menu" && (
                <div className="pool-overlay">
                  <strong className="snake-big">Dragon&apos;s Eye 8-Ball</strong>
                  <span className="soft">Sink your seven, then the Dragon&apos;s Eye. Sink it early and you lose.</span>
                  <div className="pool-levels">
                    {LEVELS.map((l) => (
                      <button key={l.id} type="button" className={`btn pool-level pl-lv-${l.id}`} onClick={() => start("ai", l.id)}>
                        <strong>{l.name}</strong><span className="micro">{l.blurb}</span>
                        <span className="micro gold">{signedIn ? `Win +${fmt(l.pts * rules.perPoint)} marks` : "Free to play"}</span>
                      </button>
                    ))}
                    <button type="button" className="btn pool-level" onClick={() => start("friend", "veteran")}>
                      <strong>Play a friend</strong><span className="micro">Two players on this device</span><span className="micro muted">Just for fun</span>
                    </button>
                  </div>
                </div>
              )}
              {phase === "over" && (
                <div className={`pool-overlay pl-end${mode === "ai" ? (hud.winner === 0 ? " win" : " lose") : " win"}`}>
                  <strong className="snake-big">{mode === "friend" ? `${names[hud.winner ?? 0]} wins!` : hud.winner === 0 ? "Victory!" : "Defeat"}</strong>
                  <span className="soft">{hud.note}</span>
                  {mode === "ai" && hud.winner === 0 && (result ? (result.earned ? <span className="pl-earned">Earned <strong className="gold">+{fmt(result.earned)}</strong> Dragon Marks</span> : null) : signedIn ? <span className="micro muted">Counting your marks…</span> : null)}
                  {result?.note && <span className="micro muted" role="status">{result.note}</span>}
                  <span className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <button type="button" className="btn btn-primary btn-lg" onClick={() => start(mode, level)}>Rematch</button>
                    <button type="button" className="btn btn-lg" onClick={() => setPhase("menu")}>Change opponent</button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </Machine>
        {vertical && phase !== "menu" && phase !== "over" && shootBar}
        <p className="pool-note" role="status" aria-live="polite">{phase === "ai" ? `${names[1]} is lining up a shot…` : phase === "menu" ? "" : hud.note}</p>
      </div>

      <div className="game-controls panel pool-controls">
        {!vertical && shootBar}
        <p className="micro muted">{vertical ? "Drag on the table to aim. To shoot, grab the cue stick (or the cue ball, when it isn't in hand) and pull back, then let go; or set power and tap Shoot." : "Point to aim, then grab the cue stick (or the cue ball, when it isn't in hand) and pull back to shoot; or use the power bar and Shoot (arrow keys fine-tune, Space shoots)."} Hold the arrows to keep turning; Fine makes drags turn the cue slowly. Tap the cue ball in the spin picker for follow, draw or side spin. With ball in hand, drag the cue ball to place it.</p>
        {phase !== "menu" && phase !== "over" && <button type="button" className="btn btn-sm" onClick={() => setPhase("menu")}>{mode === "ai" ? "Concede" : "Quit"}</button>}
        <p className="micro muted">Free to play. Beat {lvl.name} for +{fmt(lvl.pts * rules.perPoint)} marks; up to {fmt(rules.daily)} a day from 8-ball.{signedIn ? ` ${fmt(leftToday)} left today.` : " Sign in to earn."}</p>
        {board.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ fontSize: 16 }}>Most wins</h3>
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

/** Pick where the cue strikes the cue ball: up = follow, down = draw, sides = english. */
function SpinPicker({ spin, onChange, disabled }: { spin: P.Spin; onChange: (s: P.Spin) => void; disabled?: boolean }) {
  const set = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
    const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
    if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; } // a tap in the middle clears it
    onChange({ side: Math.round(x * 10) / 10, top: Math.round(-y * 10) / 10 });
  };
  const label = !spin.top && !spin.side ? "Centre" : [spin.top > 0.1 ? "Follow" : spin.top < -0.1 ? "Draw" : "", spin.side > 0.1 ? "Right" : spin.side < -0.1 ? "Left" : ""].filter(Boolean).join(" + ");
  const nudge = (dx: number, dy: number) => onChange({ side: Math.max(-1, Math.min(1, Math.round((spin.side + dx) * 10) / 10)), top: Math.max(-1, Math.min(1, Math.round((spin.top + dy) * 10) / 10)) });
  return (
    <div className="pl-spin">
      <button type="button" className="pl-spin-ball" disabled={disabled} aria-label={`Cue ball spin: ${label}. Tap a spot on the ball; arrow keys move it, Enter centres it.`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }} onPointerMove={(e) => { if (e.buttons) set(e); }}
        onKeyDown={(e) => {
          const k: Record<string, [number, number]> = { ArrowUp: [0, .2], ArrowDown: [0, -.2], ArrowLeft: [-.2, 0], ArrowRight: [.2, 0] };
          if (k[e.key]) { e.preventDefault(); e.stopPropagation(); nudge(...k[e.key]); } else if (e.key === "Enter") { e.preventDefault(); onChange({ top: 0, side: 0 }); }
        }}>
        <span className="pl-spin-dot" style={{ left: `${50 + spin.side * 38}%`, top: `${50 - spin.top * 38}%` }} />
      </button>
      <span className="micro muted">{label}</span>
    </div>
  );
}

/** On phones the mute button lives in 8-ball's control row (the floating one would sit on the table). */
function PoolMute() {
  const [muted, setM] = useState(false);
  useEffect(() => { setM(isMuted()); return onMuteChange(setM); }, []);
  return (
    <button type="button" className="btn pl-mute" aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Mute sound"} onClick={() => setMuted(!muted)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" />{muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}</svg>
    </button>
  );
}
