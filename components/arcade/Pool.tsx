"use client";
// Dragon's Eye 8-ball. Physics, rules and the AI live in lib/pool.ts; this draws the table and handles input.
import { useCallback, useEffect, useRef, useState } from "react";
import { poolFinish, poolStart } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import * as P from "@/lib/pool";
import { fmt, useArcade } from "./ArcadeShell";

type Mode = "ai" | "friend";
type Phase = "menu" | "aim" | "strike" | "rolling" | "ai" | "over";
const LEVELS: { id: P.Level; name: string; blurb: string; pts: number }[] = [
  { id: "apprentice", name: "Tavern Apprentice", blurb: "Still learning which end of the cue to hold", pts: 1 },
  { id: "veteran", name: "Goblin Hustler", blurb: "Plays the angles and the odds", pts: 2 },
  { id: "champion", name: "Dragonflight Champion", blurb: "Rarely misses. Bring your best", pts: 4 },
];
const COLORS = ["#f4efe2", "#f5c400", "#1f5fd1", "#d62828", "#7a3bc9", "#f07b12", "#188a3a", "#8a1f1f", "#111"];
const colorOf = (id: number) => COLORS[id > 8 ? id - 8 : id];
const TW = P.W + 2 * P.RAIL, TH = P.H + 2 * P.RAIL;
type Board = { score: number; name: string | null; surname: string | null; class: string | null; name_style: string | null; title: string | null }[];

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

  const g = useRef<P.Game>(P.newGame());
  const phaseRef = useRef<Phase>("menu");
  const angle = useRef(0);
  const powerRef = useRef(0.55);
  const log = useRef<P.ShotLog>(P.newLog());
  const anim = useRef({ strikeAt: 0, aiFrom: 0, aiTo: 0, aiStart: 0, aiPower: 0.5, acc: 0, last: 0 });
  const flashes = useRef<{ x: number; y: number; t: number; c: string }[]>([]);
  const dragCue = useRef(false);
  const runId = useRef<Promise<string | null> | null>(null);
  const crest = useRef<HTMLImageElement | null>(null);
  const modeRef = useRef<Mode>("ai"), levelRef = useRef<P.Level>("veteran"), namesRef = useRef<[string, string]>([me, "Goblin Hustler"]);

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseS(p); };
  const setPower = (v: number) => { const x = Math.max(0.05, Math.min(1, v)); powerRef.current = x; setPowerS(x); };
  const sync = useCallback(() => {
    const s = g.current;
    setHud({ turn: s.turn, groups: s.groups, note: s.note, left: s.balls.filter((b) => !b.down && b.id !== 0).map((b) => b.id), inHand: s.inHand, winner: s.winner });
  }, []);
  const vertical = width < 560;
  // on phones the table stands upright; keep it short enough that the shoot bar fits under it
  const [vh, setVh] = useState(800);
  useEffect(() => { const f = () => setVh(window.innerHeight); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const scale = vertical ? Math.min(width / TH, Math.max(0.4, (vh - 290) / TW)) : width / TW;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth, 1000)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { const i = new Image(); i.src = "/assets/crest-256.webp"; crest.current = i; }, []);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = cv.current!.getBoundingClientRect(), sx = cx - r.left, sy = cy - r.top;
    return vertical ? { x: sy / scale - P.RAIL, y: P.H + P.RAIL - sx / scale } : { x: sx / scale - P.RAIL, y: sy / scale - P.RAIL };
  }, [vertical, scale]);

  const human = () => modeRef.current === "friend" || g.current.turn === 0;

  // ---------------------------------------------------------------- game flow
  const finishGame = useCallback(async () => {
    const s = g.current;
    setPhase("over"); sync();
    if (modeRef.current !== "ai") return;
    const id = await runId.current; runId.current = null;
    if (!signedIn) return setResult({ earned: 0, note: "Sign in to earn Dragon Marks for wins." });
    if (!id) return setResult({ earned: 0, note: "Couldn't reach the server, so this game didn't count." });
    const r = await poolFinish({ id, won: s.winner === 0 });
    if (!r.ok) return setResult({ earned: 0, note: r.error });
    setBalance(r.balance); flash(r.earned); setLeftToday(r.leftToday);
    setResult({ earned: r.earned, note: s.winner === 0 && r.earned === 0 ? "You've hit today's 8-ball limit. Wins count again tomorrow." : undefined });
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
    const next = P.resolve(s, s.balls, log.current, namesRef.current);
    g.current = next;
    sync();
    if (next.winner !== null) return void finishGame();
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
    g.current.note = `${nm[0]} breaks. Drag the cue ball to move it, or just aim and shoot.`;
    angle.current = 0; setPower(0.9); setResult(null); sync();
    runId.current = m === "ai" && signedIn ? poolStart({ level: lvl }).then((r) => (r.ok ? r.id : null)).catch(() => null) : null;
    setPhase("aim");
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
      dragCue.current = s.inHand && Math.hypot(w.x - cue.x, w.y - cue.y) < P.R * 3.2;
      if (!dragCue.current) aimAt(e);
    };
    const move = (e: PointerEvent) => {
      if (phaseRef.current !== "aim" || !human()) return;
      if (dragCue.current) {
        const w = toWorld(e.clientX, e.clientY), s = g.current;
        if (P.placeOk(s.balls, w.x, w.y, s.kitchen)) { const cue = s.balls.find((b) => b.id === 0)!; cue.x = w.x; cue.y = w.y; }
        return;
      }
      if (e.pointerType === "mouse" || e.buttons) aimAt(e);
    };
    const up = () => { dragCue.current = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
  }, [toWorld]);

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
      else if (e.key === " " && wrap.current?.closest(".pool-layout")?.contains(document.activeElement ?? null) !== false) { e.preventDefault(); shoot(); }
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
    const view = () => vertical
      ? ctx.setTransform(0, scale * dpr, -scale * dpr, 0, (P.H + P.RAIL) * scale * dpr, P.RAIL * scale * dpr)
      : ctx.setTransform(scale * dpr, 0, 0, scale * dpr, P.RAIL * scale * dpr, P.RAIL * scale * dpr);
    let raf = 0;
    anim.current.last = performance.now();

    const ball = (id: number, x: number, y: number, alpha = 1) => {
      const r = P.R;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x + 2.5, y + 3, r, r * .9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.save(); ctx.clip();
      const stripe = id >= 9;
      ctx.fillStyle = stripe ? "#f4efe2" : colorOf(id); ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (stripe) { ctx.fillStyle = colorOf(id); ctx.fillRect(x - r, y - r * .55, r * 2, r * 1.1); }
      const hl = ctx.createRadialGradient(x - r * .4, y - r * .45, 0, x, y, r * 1.15);
      hl.addColorStop(0, "rgba(255,255,255,.75)"); hl.addColorStop(.25, "rgba(255,255,255,.12)"); hl.addColorStop(1, "rgba(0,0,0,.45)");
      ctx.fillStyle = hl; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
      if (id === 8) { // the Dragon's Eye: an amethyst slit eye instead of a number
        const eg = ctx.createRadialGradient(x, y, 0, x, y, r * .5); eg.addColorStop(0, "#e0c4ff"); eg.addColorStop(.6, "#9b5dff"); eg.addColorStop(1, "#3a0f80");
        ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(x, y, r * .5, r * .42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0a0014"; ctx.beginPath(); ctx.ellipse(x, y, r * .1, r * .36, 0, 0, Math.PI * 2); ctx.fill();
      } else if (id > 0) {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r * .46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.font = `700 ${r * .66}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(id), x, y + r * .04);
      } else { ctx.fillStyle = "#c9a13b"; ctx.beginPath(); ctx.arc(x + r * .25, y + r * .2, r * .13, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };

    const table = () => {
      // rails: dark oak with gold trim and sights
      const wood = ctx.createLinearGradient(0, -P.RAIL, 0, P.H + P.RAIL);
      wood.addColorStop(0, "#3a2614"); wood.addColorStop(.5, "#24160b"); wood.addColorStop(1, "#3a2614");
      ctx.fillStyle = wood; ctx.beginPath(); ctx.roundRect(-P.RAIL, -P.RAIL, TW, TH, 26); ctx.fill();
      ctx.strokeStyle = "#8a6a2c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-P.RAIL + 6, -P.RAIL + 6, TW - 12, TH - 12, 20); ctx.stroke();
      ctx.fillStyle = "#e0b04a";
      for (const f of [1, 2, 3, 5, 6, 7]) for (const y of [-P.RAIL / 2 - 3, P.H + P.RAIL / 2 + 3]) { const x = (P.W / 8) * f; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.fill(); }
      for (const f of [1, 2, 3]) for (const x of [-P.RAIL / 2 - 3, P.W + P.RAIL / 2 + 3]) { const y = (P.H / 4) * f; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.fill(); }
      // cushions, then felt
      ctx.fillStyle = "#0b3a2c"; ctx.fillRect(-13, -13, P.W + 26, P.H + 26);
      const felt = ctx.createRadialGradient(P.W / 2, P.H / 2, 40, P.W / 2, P.H / 2, P.W * .62);
      felt.addColorStop(0, "#17775a"); felt.addColorStop(1, "#0d4a37");
      ctx.fillStyle = felt; ctx.fillRect(0, 0, P.W, P.H);
      const cr = crest.current;
      if (cr?.complete && cr.naturalWidth) { ctx.save(); ctx.globalAlpha = .1; ctx.translate(P.W / 2, P.H / 2); if (vertical) ctx.rotate(-Math.PI / 2); ctx.drawImage(cr, -130, -130, 260, 260); ctx.restore(); }
      // head string and foot spot
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(P.HEAD_X, 0); ctx.lineTo(P.HEAD_X, P.H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(P.FOOT.x, P.FOOT.y, 3, 0, Math.PI * 2); ctx.fill();
      // pockets
      for (const p of P.POCKETS) {
        const pg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 4); pg.addColorStop(0, "#000"); pg.addColorStop(1, "#140c06");
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#c9a13b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.stroke();
      }
    };

    const cueStick = (a: number, pull: number, alpha = 1) => {
      const cue = g.current.balls.find((b) => b.id === 0)!;
      const dx = Math.cos(a), dy = Math.sin(a), tip = P.R + 4 + pull, len = 420;
      const x0 = cue.x - dx * tip, y0 = cue.y - dy * tip, x1 = cue.x - dx * (tip + len), y1 = cue.y - dy * (tip + len);
      ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x0 + 4, y0 + 5); ctx.lineTo(x1 + 4, y1 + 5); ctx.stroke();
      const wd = ctx.createLinearGradient(x0, y0, x1, y1); wd.addColorStop(0, "#e9d8b0"); wd.addColorStop(.3, "#a8743a"); wd.addColorStop(.7, "#4a2a12"); wd.addColorStop(1, "#1e1008");
      ctx.strokeStyle = wd; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
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
        const nx = hit.ball.x - hit.x, ny = hit.ball.y - hit.y, nl = Math.hypot(nx, ny) || 1;
        ctx.strokeStyle = legal ? "rgba(255,225,120,.9)" : "rgba(255,90,90,.9)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(hit.ball.x, hit.ball.y); ctx.lineTo(hit.ball.x + (nx / nl) * 70, hit.ball.y + (ny / nl) * 70); ctx.stroke();
        // cue ball deflects along the tangent
        const tx = -ny / nl, ty = nx / nl, side = Math.sign(Math.cos(a) * tx + Math.sin(a) * ty) || 1;
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.moveTo(hit.x, hit.y); ctx.lineTo(hit.x + tx * side * 40, hit.y + ty * side * 40); ctx.stroke();
        if (!legal) { ctx.strokeStyle = "rgba(255,90,90,.9)"; ctx.beginPath(); ctx.arc(hit.ball.x, hit.ball.y, P.R + 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      const s = g.current, ph = phaseRef.current, A = anim.current;
      // physics at a fixed 60 steps a second, whatever the screen's refresh rate
      if (ph === "rolling") {
        A.acc += Math.min(100, now - A.last);
        while (A.acc >= 1000 / 60) {
          A.acc -= 1000 / 60;
          const before = log.current.potted.length;
          P.step(s.balls, log.current);
          for (const id of log.current.potted.slice(before)) {
            const b = s.balls.find((x) => x.id === id)!;
            const pk = P.POCKETS.reduce((m, p) => (Math.hypot(p.x - b.x, p.y - b.y) < Math.hypot(m.x - b.x, m.y - b.y) ? p : m));
            flashes.current.push({ x: pk.x, y: pk.y, t: now, c: id === 0 ? "#fff" : id === 8 ? "#c08cff" : colorOf(id) });
          }
          if (!P.moving(s.balls)) { for (const b of s.balls) b.vx = b.vy = 0; A.acc = 0; afterShot(); break; }
        }
      }
      A.last = now;
      if (ph === "strike" && now - A.strikeAt > 140) {
        log.current = P.newLog();
        const cue = s.balls.find((b) => b.id === 0)!, v = powerRef.current * P.MAX_SPEED;
        cue.vx = Math.cos(angle.current) * v; cue.vy = Math.sin(angle.current) * v;
        A.acc = 0; setPhase("rolling");
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      view();
      table();
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
      for (const b of s.balls) if (!b.down) ball(b.id, b.x, b.y);
      // cue stick
      if (ph === "aim" && myAim) cueStick(angle.current, 10 + powerRef.current * 70);
      else if (ph === "strike") { const k = Math.min(1, (now - A.strikeAt) / 140); cueStick(angle.current, (10 + powerRef.current * 70) * (1 - k)); }
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
  const shootBar = (
    <div className="pool-shootbar">
      <label className="field">Power <span className="micro muted">{Math.round(power * 100)}%</span>
        <input type="range" min={5} max={100} value={Math.round(power * 100)} disabled={!yourTurn} onChange={(e) => setPower(Number(e.target.value) / 100)} />
      </label>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn" aria-label="Turn aim left" disabled={!yourTurn} onClick={() => { angle.current -= 0.006; }}>◀</button>
        <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={!yourTurn} onClick={shoot}>Shoot</button>
        <button type="button" className="btn" aria-label="Turn aim right" disabled={!yourTurn} onClick={() => { angle.current += 0.006; }}>▶</button>
      </div>
    </div>
  );

  return (
    <div className="pool-layout">
      <div className="game-stage pool-stage">
        <div className="pool-players">
          {[0, 1].map((p) => (
            <div key={p} className={`pool-player${hud.turn === p && phase !== "menu" && phase !== "over" ? " up" : ""}`}>
              <strong>{names[p]}</strong>
              <span className="micro muted">{hud.groups[p] ? (hud.groups[p] === "solids" ? "Solids" : "Stripes") : phase === "menu" ? "" : "Open table"}</span>
              <span className="pool-minis">{groupBalls(p as 0 | 1)}</span>
            </div>
          ))}
        </div>
        <div ref={wrap} className="pool-wrap">
          <canvas ref={cv} className="pool-canvas" aria-label="8-ball table. Aim with the mouse or by dragging, set power, then shoot." />
          {phase === "menu" && (
            <div className="pool-overlay">
              <strong className="snake-big">Dragon&apos;s Eye 8-Ball</strong>
              <span className="soft">Sink your seven, then the Dragon&apos;s Eye. Sink it early and you lose.</span>
              <div className="pool-levels">
                {LEVELS.map((l) => (
                  <button key={l.id} type="button" className="btn pool-level" onClick={() => start("ai", l.id)}>
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
            <div className="pool-overlay">
              <strong className="snake-big">{mode === "friend" ? `${names[hud.winner ?? 0]} wins!` : hud.winner === 0 ? "Victory!" : "Defeat"}</strong>
              <span className="soft">{hud.note}</span>
              {mode === "ai" && hud.winner === 0 && (result ? (result.earned ? <span>Earned <strong className="gold">+{fmt(result.earned)}</strong> Dragon Marks</span> : null) : signedIn ? <span className="micro muted">Counting your marks…</span> : null)}
              {result?.note && <span className="micro muted" role="status">{result.note}</span>}
              <span className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => start(mode, level)}>Rematch</button>
                <button type="button" className="btn btn-lg" onClick={() => setPhase("menu")}>Change opponent</button>
              </span>
            </div>
          )}
        </div>
        {vertical && phase !== "menu" && phase !== "over" && shootBar}
        <p className="pool-note" role="status" aria-live="polite">{phase === "ai" ? `${names[1]} is lining up a shot…` : phase === "menu" ? "" : hud.note}</p>
      </div>

      <div className="game-controls panel pool-controls">
        {!vertical && shootBar}
        <p className="micro muted">{vertical ? "Drag on the table to aim, fine-tune with the arrows, set power, shoot." : "Point to aim (arrow keys fine-tune, up/down for power), space or Shoot to hit."} With ball in hand, drag the cue ball to place it.</p>
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
