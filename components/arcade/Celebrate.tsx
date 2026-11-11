"use client";
// Win moments for every game: call celebrate({ mult, won }) when a result lands. One layer, mounted in
// ArcadeShell, plays the tier's sound, bursts coins and sparks from the game screen, and for big wins
// shows a banner with the payout counting up. Also: CountUp (rolling numbers) and ResultStrip (recent chips).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buzz, play, tierFor, tierSound, type WinTier } from "./sfx";

/** origin: element or selector to burst from (default: the game cabinet). noMult: hide the "×" figure (free rewards).
 *  rarity: celebrate a cosmetic drop by rarity instead of a payout (no amount shown, never the lose sound). */
type Detail = { mult: number; won: number; label?: string; origin?: Element | string; noMult?: boolean; rarity?: "rare" | "epic" | "legendary" };
const EVT = "dw-celebrate";

/** Announce a result. mult = payout ÷ bet (0 for a loss); won = marks paid out. */
export function celebrate(d: Detail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Detail>(EVT, { detail: d }));
}

const TIER_TEXT: Record<WinTier, string> = { none: "", win: "", big: "Big win!", epic: "Epic win!", legendary: "Legendary win!" };
const TIER_COLOR: Record<WinTier, string> = { none: "#fff", win: "#FFD100", big: "#4CD964", epic: "#C08CFF", legendary: "#FF9433" };
const BURST: Record<WinTier, number> = { none: 0, win: 12, big: 45, epic: 100, legendary: 170 };

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; kind: "coin" | "spark"; rot: number; vr: number; hue: string };

export function CelebrationLayer() {
  const cv = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);
  const [banner, setBanner] = useState<{ k: number; tier: WinTier; won: number; mult: number; label?: string; noMult?: boolean; noAmount?: boolean } | null>(null);
  const origin = useRef<Element | string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = () => {
      const c = cv.current; if (!c) return;
      const g = c.getContext("2d")!, dpr = Math.min(2, devicePixelRatio || 1);
      const vw = W(), vh = innerHeight;
      if (c.width !== vw * dpr || c.height !== vh * dpr) { c.width = vw * dpr; c.height = vh * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, vw, vh);
      parts.current = parts.current.filter((p) => p.life > 0);
      for (const p of parts.current) {
        p.vy += p.kind === "coin" ? 0.32 : 0.06; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        const a = Math.min(1, p.life / 25);
        if (a <= 0) continue;
        g.globalAlpha = a;
        if (p.kind === "coin") {
          g.save(); g.translate(p.x, p.y); g.scale(Math.cos(p.rot), 1);
          const gr = g.createRadialGradient(-p.size * .3, -p.size * .3, 1, 0, 0, p.size);
          gr.addColorStop(0, "#fff6c2"); gr.addColorStop(.5, "#ffd100"); gr.addColorStop(1, "#a06a00");
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.size, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "rgba(90,50,0,.6)"; g.lineWidth = 1; g.stroke(); g.restore();
        } else {
          g.fillStyle = p.hue; g.beginPath(); g.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
      raf.current = parts.current.length ? requestAnimationFrame(loop) : 0;
    };
    const W = () => document.documentElement.clientWidth || innerWidth;
    const burst = (tier: WinTier) => {
      if (reduced()) return;
      const o = origin.current;
      const stage = (o ? (typeof o === "string" ? document.querySelector(o) : o) : document.querySelector(".machine-screen, .game-stage")) as HTMLElement | null;
      const r = stage?.getBoundingClientRect();
      const ox = r ? r.left + r.width / 2 : W() / 2, oy = r ? r.top + r.height * 0.45 : innerHeight / 2;
      const n = BURST[tier], col = TIER_COLOR[tier];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, s = 4 + Math.random() * (tier === "win" ? 6 : 11);
        const coin = Math.random() < (tier === "win" ? 0.5 : 0.6);
        parts.current.push({ x: ox + (Math.random() - .5) * 40, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 60 + Math.random() * 50, max: 110,
          size: coin ? 5 + Math.random() * 5 : 1.5 + Math.random() * 2.5, kind: coin ? "coin" : "spark", rot: Math.random() * 6, vr: 0.1 + Math.random() * 0.25,
          hue: Math.random() < 0.5 ? col : "#fff3b0" });
      }
      if (tier === "legendary") for (let i = 0; i < 120; i++) parts.current.push({ x: Math.random() * W(), y: -20 - Math.random() * 400, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3,
        life: 140 + Math.random() * 60, max: 200, size: 5 + Math.random() * 5, kind: "coin", rot: Math.random() * 6, vr: 0.15, hue: col });
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    };
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      origin.current = d.origin ?? null;
      if (d.rarity) {
        const rt: WinTier = d.rarity === "legendary" ? "legendary" : d.rarity === "epic" ? "epic" : "big";
        play(rt === "big" ? "bigwin" : rt); buzz("big"); burst(rt);
        setBanner({ k: Date.now(), tier: rt, won: 0, mult: 0, label: d.label ?? `${d.rarity[0].toUpperCase()}${d.rarity.slice(1)}!`, noMult: true, noAmount: true });
        if (hide.current) clearTimeout(hide.current);
        hide.current = setTimeout(() => setBanner(null), rt === "legendary" ? 3600 : 2600);
        return;
      }
      const tier = d.won > 0 ? tierFor(d.mult) : "none";
      if (d.won <= 0) { play("lose"); buzz("fail"); return; }
      if (d.mult > 0 && d.mult <= 1) { play("reveal", { pitch: d.mult < 1 ? 0.8 : 1 }); return; } // a partial return or a push: soft, no coins
      const s = tierSound[tier] ?? "coin"; play(s); buzz(tier === "win" || tier === "none" ? "win" : "big");
      burst(tier === "none" ? "win" : tier);
      if (tier === "big" || tier === "epic" || tier === "legendary") {
        setBanner({ k: Date.now(), tier, won: d.won, mult: d.mult, label: d.label, noMult: d.noMult });
        if (hide.current) clearTimeout(hide.current);
        hide.current = setTimeout(() => setBanner(null), tier === "legendary" ? 3600 : tier === "epic" ? 2800 : 2000);
      }
    };
    window.addEventListener(EVT, on);
    return () => { window.removeEventListener(EVT, on); cancelAnimationFrame(raf.current); };
  }, []);

  // Portalled to <body>: transformed ancestors (page entrance animations) would otherwise trap position: fixed.
  if (!host) return null;
  return createPortal(
    <>
      <canvas ref={cv} className="celebrate-canvas" aria-hidden="true" />
      {banner && (
        <div key={banner.k} className={`celebrate-banner t-${banner.tier}`} role="status" style={{ ["--tc" as string]: TIER_COLOR[banner.tier] }}>
          <strong>{banner.label ?? TIER_TEXT[banner.tier]}</strong>
          {!banner.noAmount && <span className="celebrate-amount">+<CountUp value={banner.won} from={0} duration={banner.tier === "legendary" ? 2200 : 1300} /></span>}
          {!banner.noMult && <span className="celebrate-mult">{banner.mult >= 100 ? Math.round(banner.mult) : banner.mult.toFixed(2)}×</span>}
        </div>
      )}
    </>,
    host,
  );
}

/** A number that rolls to its new value (ease-out). Jumps under reduced motion. */
export function CountUp({ value, from, duration = 700, format = (n: number) => Math.round(n).toLocaleString("en-US"), tick = false }: {
  value: number; from?: number; duration?: number; format?: (n: number) => string; tick?: boolean;
}) {
  const [shown, setShown] = useState(from ?? value);
  const prev = useRef(from ?? value);
  useEffect(() => {
    const start = prev.current, end = value;
    if (start === end || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(end); prev.current = end; return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      const v = start + (end - start) * e; setShown(v);
      if (tick && k < 1) play("count", { pitch: 1 + k * 0.6 });
      if (k < 1) raf = requestAnimationFrame(step); else prev.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); prev.current = end; };
  }, [value, duration, tick]);
  return <>{format(shown)}</>;
}

/** cls: an extra class for game-specific colouring (e.g. roulette red/black/green). */
export type Chip = { k: number | string; label: string; tone: "win" | "lose" | "big" | "neutral"; cls?: string };
/** Recent results as chips, newest first. */
export function ResultStrip({ items, label = "Recent results" }: { items: Chip[]; label?: string }) {
  return (
    <div className="result-strip" role="group" aria-label={label}>
      {items.slice(0, 14).map((c, i) => <span key={c.k} className={`rs-chip ${c.tone}${c.cls ? ` ${c.cls}` : ""}${i === 0 ? " fresh" : ""}`}>{c.label}</span>)}
    </div>
  );
}
