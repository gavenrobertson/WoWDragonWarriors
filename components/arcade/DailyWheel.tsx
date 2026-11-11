"use client";
// Free daily spin: one per day (midnight Central), bigger with a streak.
// The wheel is drawn in SVG and driven by a rAF loop: it winds up and cruises while the server rolls, then
// decelerates (velocity-matched ease-out) onto the rolled segment. A sprung flapper is pushed by every peg on
// the rim and twangs back; each peg ticks louder and higher the faster the wheel turns. Some stops creep
// right up to the next peg and rock back (only when the neighbour would have paid less: never a fake tease).
import { useEffect, useRef, useState } from "react";
import { spinDaily } from "@/app/arcade/actions";
import { fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { CountUp, celebrate } from "./Celebrate";
import { buzz, play } from "./sfx";

// segment faces: [light, dark] per segment, jackpot last
const FACES: [string, string][] = [
  ["#5a4220", "#1e1408"], ["#6a35a0", "#1f0d33"], ["#5a4220", "#1e1408"], ["#2c5aa0", "#0b1a33"],
  ["#5a4220", "#1e1408"], ["#8f2a2a", "#2a0a0a"], ["#5a4220", "#1e1408"], ["#d69a1a", "#4a2c00"],
];
const iconFor = (m: number) =>
  m >= 10000 ? "inv_misc_head_dragon_01" : m >= 5000 ? "inv_misc_coinbag_special" : m >= 2500 ? "inv_misc_bag_10" : m >= 1500 ? "inv_misc_coin_01"
  : m >= 1000 ? "inv_misc_coin_02" : m >= 750 ? "inv_misc_coin_17" : m >= 500 ? "inv_misc_coin_03" : "inv_misc_coin_05";
const short = (m: number) => (m >= 1000 ? `${m / 1000}K` : String(m));

const R = 100;            // wheel face radius
const PIVOT_Y = -127;     // flapper pivot (above the rim)
const PEG_R = 104;        // pegs sit on the rim
const BULBS = 24;
const CRUISE = 0.72;      // deg per ms while waiting for the roll (2 turns a second)
const CONTACT = 6;        // degrees either side of the pointer where a peg touches the flapper
const MAX_FLAP = 28;      // flapper deflection, degrees

type Plan =
  | { kind: "idle" }
  | { kind: "accel"; t0: number }
  | { kind: "decel"; t0: number; from: number; dist: number; dur: number }
  | { kind: "rock"; t0: number; from: number; to: number; dur: number };

const wedge = (i: number, seg: number, r = R) => {
  const a0 = ((i * seg - 90) * Math.PI) / 180, a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
  return `M0 0 L${(r * Math.cos(a0)).toFixed(2)} ${(r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 0 1 ${(r * Math.cos(a1)).toFixed(2)} ${(r * Math.sin(a1)).toFixed(2)} Z`;
};

function msToCentralMidnight() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Math.max(0, 86400 - (g("hour") * 3600 + g("minute") * 60 + g("second"))) * 1000;
}

export function DailyWheel({ segments, canSpin, streak, signedIn }: { segments: number[]; canSpin: boolean; streak: number; signedIn: boolean }) {
  const { setBalance, flash } = useArcade();
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(!canSpin);
  const [msg, setMsg] = useState<string | null>(null);
  const [landed, setLanded] = useState<number | null>(null);
  const [prize, setPrize] = useState<{ marks: number; bonusPct: number } | null>(null);
  const [days, setDays] = useState(streak);
  const [wait, setWait] = useState<string | null>(null);
  const n = segments.length, seg = 360 / n;

  const wheelG = useRef<SVGGElement>(null);
  const flapG = useRef<SVGGElement>(null);
  const sim = useRef({ theta: 0, omega: 0, flap: 0, flapV: 0, last: 0, peg: 0, blur: false, plan: { kind: "idle" } as Plan, onStop: null as null | (() => void) });
  const raf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); timers.current.forEach(clearTimeout); }, []);

  // countdown to the next spin once today's is used
  useEffect(() => {
    if (!done || !signedIn) return;
    const upd = () => { const ms = msToCentralMidnight(), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); setWait(h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`); };
    upd();
    const id = setInterval(upd, 30000);
    return () => clearInterval(id);
  }, [done, signedIn]);

  const draw = () => {
    const s = sim.current;
    wheelG.current?.setAttribute("transform", `rotate(${s.theta.toFixed(3)})`);
    flapG.current?.setAttribute("transform", `rotate(${s.flap.toFixed(2)} 0 ${PIVOT_Y})`);
  };

  const loop = (t: number) => {
    const s = sim.current;
    const dt = Math.min(34, Math.max(1, t - (s.last || t - 16))); s.last = t;
    const prev = s.theta, p = s.plan;
    if (p.kind === "accel") {
      const e = t - p.t0;
      // a little backswing, then wind up to cruising speed
      const w = e < 140 ? -0.06 : e < 820 ? CRUISE * ((e - 140) / 680) ** 1.4 : CRUISE;
      s.theta += w * dt;
    } else if (p.kind === "decel") {
      const u = Math.min(1, (t - p.t0) / p.dur);
      s.theta = p.from + p.dist * (1 - (1 - u) ** 3);
      if (u >= 1) { s.plan = { kind: "idle" }; const f = s.onStop; s.onStop = null; f?.(); }
    } else if (p.kind === "rock") {
      const u = Math.min(1, (t - p.t0) / p.dur), k = 1 - (1 - u) ** 3;
      s.theta = p.from + (p.to - p.from) * k;
      if (u >= 1) { s.plan = { kind: "idle" }; const f = s.onStop; s.onStop = null; f?.(); }
    }
    s.omega = (s.theta - prev) / dt;
    const blur = Math.abs(s.omega) > 0.45;
    if (blur !== s.blur) { s.blur = blur; if (blur) wheelG.current?.setAttribute("filter", "url(#dw-blur)"); else wheelG.current?.removeAttribute("filter"); }

    // pegs: tick on every one that passes the pointer, louder and higher when fast
    const pegIdx = Math.floor(s.theta / seg);
    if (pegIdx !== s.peg) {
      const sp = Math.abs(s.omega);
      play("tick", { vol: Math.min(1, 0.35 + sp * 0.9), pitch: 0.82 + Math.min(0.45, sp * 0.6) });
      if (sp < 0.2) buzz("tick");
      s.peg = pegIdx;
    }

    // flapper: pushed by a peg in contact, otherwise a damped spring back to rest
    const off = (((s.theta % seg) + seg * 1.5) % seg) - seg / 2; // nearest peg's angle from the pointer
    let c: number | null = null;
    if (s.omega > 0.0005 && off >= -CONTACT && off <= 0) c = -MAX_FLAP * (1 + off / CONTACT);
    else if (s.omega < -0.0005 && off >= 0 && off <= CONTACT) c = MAX_FLAP * (1 - off / CONTACT);
    const sec = dt / 1000;
    if (c !== null && (c < 0 ? s.flap > c : s.flap < c)) { s.flapV = (c - s.flap) / sec * 0.3; s.flap = c; }
    else { const a = -1500 * s.flap - 16 * s.flapV; s.flapV += a * sec; s.flap += s.flapV * sec; }
    draw();

    const moving = s.plan.kind !== "idle" || Math.abs(s.flap) > 0.02 || Math.abs(s.flapV) > 0.5;
    raf.current = moving ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf.current) { sim.current.last = 0; raf.current = requestAnimationFrame(loop); } };

  const finish = (r: { index: number; marks: number; base: number; streak: number; bonusPct: number; balance: number }) => {
    setLanded(r.index);
    setSpinning(false); setDone(true); setDays(r.streak);
    setPrize({ marks: r.marks, bonusPct: r.bonusPct });
    setBalance(r.balance); flash(r.marks);
    setMsg(`+${fmt(r.marks)} marks${r.bonusPct ? ` (includes +${r.bonusPct}% for a ${r.streak}-day streak)` : ""}`);
    const top = Math.max(...segments);
    celebrate({ mult: r.marks / 500, won: r.marks, label: r.base >= top ? "Dragon's jackpot!" : undefined, origin: ".dw-wrap", noMult: true });
  };

  const spin = async () => {
    if (spinning || done || !signedIn) return;
    play("click");
    setSpinning(true); setMsg(null); setLanded(null); setPrize(null);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = sim.current;
    if (!reduced) { play("spin"); s.plan = { kind: "accel", t0: performance.now() }; s.peg = Math.floor(s.theta / seg); kick(); }
    const t0 = performance.now();
    const r = await spinDaily();
    if (!r.ok) {
      play("error");
      if (!reduced) { const now = performance.now(); s.plan = { kind: "decel", t0: now, from: s.theta, dist: Math.max(0, s.omega) * 900 / 3, dur: 900 }; kick(); }
      setSpinning(false); setMsg(r.error); return;
    }
    // where the pointer should rest, in wheel degrees (the pointer reads phi = -theta)
    const rockable = r.index > 0 && segments[r.index - 1] < segments[r.index] && Math.random() < 0.4;
    const restPhi = rockable ? r.index * seg + 0.7 : r.index * seg + seg * (0.2 + Math.random() * 0.6);
    const rockBy = rockable ? 4 + Math.random() * 3 : 0;
    if (reduced) {
      s.theta = -(restPhi + rockBy); draw();
      timers.current.push(setTimeout(() => { play("stop"); finish(r); }, 350));
      return;
    }
    const land = () => {
      play("stop", { vol: 0.8 }); buzz("tap");
      sim.current.flapV += sim.current.flap <= 0 ? 260 : -260; // pointer kick on landing
      kick();
      timers.current.push(setTimeout(() => finish(r), 260));
    };
    const startDecel = () => {
      const now = performance.now();
      const target = -restPhi; // theta, mod 360
      const base = (((target - s.theta) % 360) + 360) % 360;
      const want = CRUISE * 4800 / 3;
      const dist = base + 360 * Math.max(1, Math.round((want - base) / 360));
      s.plan = { kind: "decel", t0: now, from: s.theta, dist, dur: (3 * dist) / CRUISE };
      s.onStop = rockable
        ? () => { s.plan = { kind: "rock", t0: performance.now(), from: s.theta, to: s.theta - rockBy, dur: 720 }; s.onStop = land; kick(); }
        : land;
      kick();
    };
    // let the wind-up reach cruising speed before braking
    const wait = Math.max(0, 860 - (performance.now() - t0));
    timers.current.push(setTimeout(startDecel, wait));
  };

  const flames = Math.min(5, Math.max(0, days - 1));
  return (
    <div className={`daily-wheel dw${spinning ? " spinning" : ""}${landed !== null ? " landed" : ""}${done && landed === null ? " used" : ""}`}>
      <div className="dw-wrap">
        <svg viewBox="-132 -134 264 266" className="dw-svg" aria-hidden="true">
          <defs>
            {FACES.map(([l, d], i) => (
              <radialGradient key={i} id={`dw-face-${i}`} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={d} /><stop offset=".55" stopColor={d} stopOpacity=".95" /><stop offset=".85" stopColor={l} /><stop offset="1" stopColor={l} />
              </radialGradient>
            ))}
            <linearGradient id="dw-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff2b8" /><stop offset=".25" stopColor="#e7b54a" /><stop offset=".5" stopColor="#8a5a12" />
              <stop offset=".72" stopColor="#f6cf6a" /><stop offset="1" stopColor="#6b420a" />
            </linearGradient>
            <radialGradient id="dw-bezel" cx="0" cy="0" r="130" gradientUnits="userSpaceOnUse">
              <stop offset=".84" stopColor="#120c05" /><stop offset=".92" stopColor="#2e2010" /><stop offset="1" stopColor="#0b0703" />
            </radialGradient>
            <radialGradient id="dw-peg" cx=".35" cy=".35" r=".7">
              <stop offset="0" stopColor="#fffbe6" /><stop offset=".45" stopColor="#e9b84c" /><stop offset="1" stopColor="#5a3a08" />
            </radialGradient>
            <linearGradient id="dw-gloss" x1="0" y1="0" x2=".55" y2=".8">
              <stop offset="0" stopColor="#fff" stopOpacity=".34" /><stop offset=".42" stopColor="#fff" stopOpacity=".06" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="dw-vignette" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
              <stop offset=".72" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".45" />
            </radialGradient>
            <radialGradient id="dw-gem" cx=".38" cy=".32" r=".75">
              <stop offset="0" stopColor="#f3e6ff" /><stop offset=".3" stopColor="#b98aff" /><stop offset=".75" stopColor="#5b22b8" /><stop offset="1" stopColor="#2a0b5a" />
            </radialGradient>
            <clipPath id="dw-icon-clip"><circle r="13" /></clipPath>
            <filter id="dw-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.9" /></filter>
          </defs>

          {/* bezel with marquee bulbs (static) */}
          <circle r="129" fill="url(#dw-bezel)" />
          <circle r="128.5" fill="none" stroke="url(#dw-gold)" strokeWidth="2" />
          <circle r="113" fill="none" stroke="#000" strokeWidth="2" />
          {Array.from({ length: BULBS }, (_, i) => {
            const a = (i / BULBS) * Math.PI * 2;
            return <circle key={i} className="dw-bulb" cx={(120.5 * Math.sin(a)).toFixed(2)} cy={(-120.5 * Math.cos(a)).toFixed(2)} r="3.1" style={{ ["--i" as string]: i }} />;
          })}

          {/* the wheel (rotated by the loop) */}
          <g ref={wheelG}>
            {segments.map((m, i) => {
              const mid = (i + 0.5) * seg, f = i === n - 1 ? FACES.length - 1 : i % (FACES.length - 1);
              return (
                <g key={i} className={`dw-seg${landed === i ? " win" : ""}${landed !== null && landed !== i ? " dim" : ""}`}>
                  <path d={wedge(i, seg)} fill={`url(#dw-face-${f})`} stroke="#c9a040" strokeOpacity=".7" strokeWidth="1.1" />
                  <g transform={`rotate(${mid})`}>
                    <g transform="translate(0 -54)">
                      <circle r="14.6" fill="#000" />
                      <image href={wowIconUrl(iconFor(m), 36)} x="-13" y="-13" width="26" height="26" clipPath="url(#dw-icon-clip)" preserveAspectRatio="xMidYMid slice" />
                      <circle r="14" fill="none" stroke="url(#dw-gold)" strokeWidth="1.6" />
                    </g>
                    <text className={`dw-label${i === n - 1 ? " jackpot" : ""}`} y="-77" textAnchor="middle" dominantBaseline="middle">{short(m)}</text>
                  </g>
                </g>
              );
            })}
            {landed !== null && <path className="dw-win-ring" d={wedge(landed, seg, R - 1)} />}
            <circle r={R} fill="none" stroke="#000" strokeWidth="1.5" />
            <circle r="106" fill="none" stroke="url(#dw-gold)" strokeWidth="11" />
            <circle r="111.2" fill="none" stroke="#3a2608" strokeWidth=".8" />
            <circle r="100.8" fill="none" stroke="#fff3c4" strokeOpacity=".5" strokeWidth=".6" />
            {segments.map((_, i) => {
              const a = (i * seg * Math.PI) / 180;
              return (
                <g key={i} transform={`translate(${(PEG_R * Math.sin(a)).toFixed(2)} ${(-PEG_R * Math.cos(a)).toFixed(2)})`}>
                  <circle r="4" fill="#000" opacity=".55" cx=".8" cy="1.2" />
                  <circle r="3.4" fill="url(#dw-peg)" stroke="#2a1a02" strokeWidth=".6" />
                </g>
              );
            })}
            {segments.map((_, i) => {
              const a = (((i + 0.5) * seg) * Math.PI) / 180;
              return <circle key={i} r="1.5" fill="#2a1a02" opacity=".7" cx={(PEG_R * Math.sin(a)).toFixed(2)} cy={(-PEG_R * Math.cos(a)).toFixed(2)} />;
            })}
          </g>

          {/* glass, hub and flapper (static) */}
          <circle r={R} fill="url(#dw-vignette)" pointerEvents="none" />
          <path d={`M${-R} 0 A${R} ${R} 0 0 1 ${R} 0 C 60 -14, -40 30, ${-R} 0 Z`} transform="rotate(-24)" fill="url(#dw-gloss)" pointerEvents="none" />
          <circle r="24" fill="#120b03" />
          <circle r="22" fill="url(#dw-gold)" />
          <circle r="16.5" fill="#1a1006" stroke="#000" strokeWidth="1" />
          <circle className="dw-gem" r="12" fill="url(#dw-gem)" />
          <ellipse cx="-3.5" cy="-5" rx="4.5" ry="2.6" fill="#fff" opacity=".55" transform="rotate(-30 -3.5 -5)" />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 + 0.5;
            return <circle key={i} r="1.4" fill="#fff3c4" opacity=".8" cx={(19.3 * Math.cos(a)).toFixed(2)} cy={(19.3 * Math.sin(a)).toFixed(2)} />;
          })}

          <g ref={flapG} className="dw-flapper">
            <path d={`M-9 ${PIVOT_Y - 2} Q0 ${PIVOT_Y - 9} 9 ${PIVOT_Y - 2} L2.4 -95 Q0 -92 -2.4 -95 Z`} fill="#000" opacity=".45" transform="translate(1.5 2.5)" />
            <path d={`M-9 ${PIVOT_Y - 2} Q0 ${PIVOT_Y - 9} 9 ${PIVOT_Y - 2} L2.4 -95 Q0 -92 -2.4 -95 Z`} fill="url(#dw-gold)" stroke="#2a1a02" strokeWidth="1" />
            <path d={`M-3 ${PIVOT_Y + 2} L0 -100 L1.2 ${PIVOT_Y + 2} Z`} fill="#fff6d0" opacity=".55" />
            <circle cx="0" cy={PIVOT_Y} r="5.2" fill="#9b1f1f" stroke="url(#dw-gold)" strokeWidth="2" />
            <circle cx="-1.4" cy={PIVOT_Y - 1.6} r="1.5" fill="#fff" opacity=".7" />
          </g>
        </svg>
      </div>

      <div className="dw-foot">
        {prize ? (
          <div className="dw-prize" key={prize.marks}>
            <span className="mark-coin" aria-hidden="true" />
            <strong>+<CountUp value={prize.marks} from={0} duration={1100} tick /></strong>
            {prize.bonusPct > 0 && <span className="dw-bonus">+{prize.bonusPct}% streak</span>}
          </div>
        ) : null}
        <button type="button" className="btn btn-primary btn-lg dw-btn" onClick={spin} disabled={!signedIn || spinning || done}>
          {!signedIn ? "Sign in to spin" : spinning ? "Spinning…" : done ? (wait ? `Next spin in ${wait}` : "Come back tomorrow") : "Spin the daily wheel"}
        </button>
        {signedIn && days > 0 && (
          <div className="dw-streak" title={`${days}-day streak`}>
            <span className="dw-flames" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => <span key={i} className={`dw-flame${i < flames ? " lit" : ""}`} style={{ ["--i" as string]: i }} />)}
            </span>
            <span className="micro"><strong>{days}-day streak</strong> · {days > 1 ? `+${Math.min(50, (days - 1) * 10)}% bonus` : "+10% tomorrow"}</span>
          </div>
        )}
        <span className="micro muted dw-msg" aria-live="polite">{msg ?? (days > 1 ? "+10% per day in a row, up to +50%" : "Free once a day · streaks pay more")}</span>
      </div>
    </div>
  );
}
