"use client";
// The council gavel: rises, slams onto a crest striking plate, flash + shockwave + sparks + hall shake,
// then an "AWARDED" stamp. Plays once per award; under reduced motion only the stamp shows.
import { useEffect, useState } from "react";

export interface GavelMoment { key: number; item: string; winner: string; color: string; icon: string | null; word?: string }

export function GavelSlam({ moment, onDone }: { moment: GavelMoment | null; onDone: () => void }) {
  const [phase, setPhase] = useState<"idle" | "raise" | "slam" | "stamp">("idle");

  useEffect(() => {
    if (!moment) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduced) {
      setPhase("stamp");
      timers.push(setTimeout(() => { setPhase("idle"); onDone(); }, 2200));
    } else {
      setPhase("raise");
      timers.push(setTimeout(() => setPhase("slam"), 650));
      timers.push(setTimeout(() => {
        // shake the hall on impact
        const hall = document.querySelector(".council-hall");
        hall?.classList.remove("quake"); void (hall as HTMLElement | null)?.offsetWidth; hall?.classList.add("quake");
      }, 650 + 230));
      timers.push(setTimeout(() => setPhase("stamp"), 650 + 260));
      timers.push(setTimeout(() => { setPhase("idle"); onDone(); }, 650 + 260 + 2600));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.key]);

  if (!moment || phase === "idle") return null;
  return (
    <div className={`gavel-scene phase-${phase}`} role="status" aria-live="assertive" style={{ ["--q" as string]: moment.color }}>
      <span className="visually-hidden">{moment.item} {(moment.word ?? "awarded").toLowerCase()}: given to {moment.winner}</span>
      <div className="gavel-vignette" aria-hidden="true" />

      <div className="gavel-plate" aria-hidden="true">
        <img src="/assets/crest-256.jpg" alt="" />
      </div>
      <div className="gavel-impact" aria-hidden="true">
        <span className="gavel-flash" />
        <span className="gavel-wave" />
        <span className="gavel-wave w2" />
        <div className="gavel-sparks">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * 22.5}deg`, ["--d" as string]: `${90 + (i % 4) * 28}px` }} />)}</div>
      </div>

      <div className="gavel-arm" aria-hidden="true">
        <svg viewBox="0 0 320 120" className="gavel-svg">
          <defs>
            <linearGradient id="gvWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b3d1c" /><stop offset=".5" stopColor="#3e200c" /><stop offset="1" stopColor="#24120a" /></linearGradient>
            <linearGradient id="gvIron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b8f99" /><stop offset=".45" stopColor="#3b3f48" /><stop offset="1" stopColor="#1a1c22" /></linearGradient>
            <linearGradient id="gvGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".4" stopColor="#e0a100" /><stop offset="1" stopColor="#7a5200" /></linearGradient>
            <radialGradient id="gvGem" cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#f0d8ff" /><stop offset=".35" stopColor="#9b5dff" /><stop offset="1" stopColor="#3a1478" /></radialGradient>
          </defs>
          {/* handle */}
          <rect x="6" y="52" width="196" height="16" rx="7" fill="url(#gvWood)" stroke="#120804" strokeWidth="2" />
          <path d="M20 56 H190 M20 64 H190" stroke="#a0662f" strokeOpacity=".35" strokeWidth="1" />
          {[34, 92, 150].map((x) => <rect key={x} x={x} y="49" width="10" height="22" rx="2" fill="url(#gvGold)" stroke="#2a1a00" strokeWidth="1.5" />)}
          <circle cx="10" cy="60" r="11" fill="url(#gvGold)" stroke="#2a1a00" strokeWidth="2" />
          <circle cx="10" cy="60" r="4" fill="url(#gvGem)" />
          {/* head */}
          <rect x="196" y="16" width="112" height="88" rx="10" fill="url(#gvIron)" stroke="#0b0c10" strokeWidth="3" />
          <rect x="190" y="10" width="20" height="100" rx="5" fill="url(#gvGold)" stroke="#2a1a00" strokeWidth="2" />
          <rect x="294" y="10" width="20" height="100" rx="5" fill="url(#gvGold)" stroke="#2a1a00" strokeWidth="2" />
          <path d="M218 30 l8 -8 l8 8 M246 30 l8 -8 l8 8 M274 30 l8 -8 l8 8 M218 90 l8 8 l8 -8 M246 90 l8 8 l8 -8 M274 90 l8 8 l8 -8" stroke="#c9a13b" strokeWidth="2" fill="none" strokeOpacity=".8" />
          <path d="M226 46 v28 M290 46 v28" stroke="#9b5dff" strokeWidth="2" strokeOpacity=".55" />
          <polygon points="258,38 276,60 258,82 240,60" fill="url(#gvGold)" stroke="#2a1a00" strokeWidth="2" />
          <polygon points="258,46 269,60 258,74 247,60" fill="url(#gvGem)" className="gavel-gem" />
        </svg>
      </div>

      {phase === "stamp" && (
        <div className="gavel-stamp">
          <span className="gavel-stamp-word">{moment.word ?? "Awarded"}</span>
          <span className="gavel-stamp-item">
            {moment.icon && <img src={moment.icon} alt="" />}
            <span style={{ color: moment.color }}>{moment.item}</span>
          </span>
          <span className="gavel-stamp-winner">to {moment.winner}</span>
        </div>
      )}
    </div>
  );
}
