"use client";
// Free daily spin: one per day (midnight Central), bigger with a streak.
import { useState } from "react";
import { spinDaily } from "@/app/arcade/actions";
import { useArcade } from "./ArcadeShell";

const COLORS = ["#3a2a12", "#4a2468", "#3a2a12", "#1f3d6b", "#3a2a12", "#5b1f1f", "#3a2a12", "#7a5200"];

export function DailyWheel({ segments, canSpin, streak, signedIn }: { segments: number[]; canSpin: boolean; streak: number; signedIn: boolean }) {
  const { setBalance, flash } = useArcade();
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(!canSpin);
  const [msg, setMsg] = useState<string | null>(null);
  const n = segments.length, seg = 360 / n;

  const spin = async () => {
    if (spinning || done) return;
    setSpinning(true); setMsg(null);
    const r = await spinDaily();
    if (!r.ok) { setSpinning(false); setMsg(r.error); return; }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = 360 * (reduced ? 1 : 7) + (360 - (r.index * seg + seg / 2)) + (Math.random() - 0.5) * seg * 0.6;
    setAngle((a) => a - (a % 360) + target);
    setTimeout(() => {
      setSpinning(false); setDone(true); setBalance(r.balance); flash(r.marks);
      setMsg(`+${r.marks.toLocaleString("en-US")} marks${r.bonusPct ? ` (includes +${r.bonusPct}% for a ${r.streak}-day streak)` : ""}`);
    }, reduced ? 400 : 5200);
  };

  return (
    <div className="daily-wheel">
      <div className="wheel-wrap">
        <span className="wheel-pointer" aria-hidden="true" />
        <svg viewBox="-110 -110 220 220" className="wheel" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
          {segments.map((m, i) => {
            const a0 = ((i * seg - 90) * Math.PI) / 180, a1 = (((i + 1) * seg - 90) * Math.PI) / 180, mid = ((i + 0.5) * seg);
            return (
              <g key={i}>
                <path d={`M0 0 L${100 * Math.cos(a0)} ${100 * Math.sin(a0)} A100 100 0 0 1 ${100 * Math.cos(a1)} ${100 * Math.sin(a1)} Z`} fill={COLORS[i % COLORS.length]} stroke="#b8902f" strokeWidth="1.5" />
                <text transform={`rotate(${mid}) translate(0 -68)`} textAnchor="middle" fill={m >= 2500 ? "#FFD100" : "#F2E8D0"} fontSize={m >= 1000 ? 13 : 14} fontFamily="Marcellus, serif">{m >= 1000 ? `${m / 1000}k` : m}</text>
              </g>
            );
          })}
          <circle r="100" fill="none" stroke="#FFD100" strokeWidth="3" />
          <circle r="22" fill="#1a1206" stroke="#FFD100" strokeWidth="2" />
          <circle r="9" fill="#9B5DFF" />
        </svg>
      </div>
      <div className="stack" style={{ gap: 6, alignItems: "center", textAlign: "center" }}>
        <button type="button" className="btn btn-primary" onClick={spin} disabled={!signedIn || spinning || done}>
          {!signedIn ? "Sign in to spin" : spinning ? "Spinning…" : done ? "Come back tomorrow" : "Spin the daily wheel"}
        </button>
        <span className="micro muted" aria-live="polite">{msg ?? (streak > 1 ? `${streak}-day streak · +10% per day, up to +50%` : "Free once a day · streaks pay more")}</span>
      </div>
    </div>
  );
}
