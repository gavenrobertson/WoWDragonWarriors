"use client";
import Link from "next/link";
import { useState } from "react";
import { claimWelcome } from "@/app/arcade/actions";
import type { Cosmetic } from "@/lib/cosmetics";
import { fmt, useArcade } from "./ArcadeShell";
import { CosmeticPreview } from "./CosmeticPreview";

export function WelcomeBonus({ marks }: { marks: number }) {
  const { setBalance, flash } = useArcade();
  const [state, setState] = useState<"ready" | "busy" | { gift: Cosmetic | null } | null>("ready");
  const [err, setErr] = useState<string | null>(null);
  if (state === null) return null;

  const claim = async () => {
    setState("busy");
    const r = await claimWelcome();
    if (!r.ok) { setErr(r.error); setState("ready"); return; }
    setBalance(r.balance); flash(r.marks);
    setState({ gift: r.gift });
  };

  return (
    <section className={`welcome-bonus${typeof state === "object" ? " claimed" : ""}`} aria-live="polite">
      <div className="welcome-coins" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      {typeof state === "object" ? (
        <div className="welcome-body">
          <span className="eyebrow">Welcome to the arcade</span>
          <h2>+{fmt(marks)} Dragon Marks</h2>
          {state.gift && (
            <div className="row" style={{ gap: 12, justifyContent: "center" }}>
              <CosmeticPreview c={state.gift} sample="Your Name" />
              <span className="soft">and a free name colour: <strong>{state.gift.name}</strong>. Equip it in your <Link href="/arcade/collection">Collection</Link>.</span>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setState(null)}>Let&apos;s play</button>
        </div>
      ) : (
        <div className="welcome-body">
          <span className="eyebrow">New here?</span>
          <h2>Your welcome bonus is waiting</h2>
          <p className="soft"><strong className="gold">{fmt(marks)} Dragon Marks</strong> and a free name colour, on the house.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={claim} disabled={state === "busy"}>{state === "busy" ? "Opening…" : "Claim welcome bonus"}</button>
          {err && <p className="game-err">{err}</p>}
        </div>
      )}
    </section>
  );
}
