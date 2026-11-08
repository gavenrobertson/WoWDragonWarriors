"use client";
import { useEffect, useState } from "react";

const pad = (n: number) => (n < 10 ? "0" + n : String(n));

export function Countdown({ target }: { target: string }) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - (now ?? end));
  const days = Math.floor(left / 86400000), hrs = Math.floor(left / 3600000) % 24, mins = Math.floor(left / 60000) % 60, secs = Math.floor(left / 1000) % 60;
  const ready = now !== null;
  const cells: [string, string, boolean?][] = [[String(days), "Days"], [pad(hrs), "Hours"], [pad(mins), "Min"], [pad(secs), "Sec", true]];
  return (
    <div role="timer" aria-label={ready ? `${days} days, ${hrs} hours and ${mins} minutes until raids unlock` : "Countdown to raid unlock"} className="countdown">
      {cells.map(([v, label, hidden]) => (
        <div key={label} className="countdown-cell" aria-hidden={hidden || undefined}>
          <span key={hidden ? v : undefined} className={hidden ? "countdown-num tick" : "countdown-num"}>{ready ? v : "–"}</span>
          <span className="countdown-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
