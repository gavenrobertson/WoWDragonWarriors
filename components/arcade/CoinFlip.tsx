"use client";
import { useState } from "react";
import { coinFlip } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

export function CoinFlip() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [side, setSide] = useState<"alliance" | "horde">("alliance");
  const [rot, setRot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);

  const flip = async () => {
    setBusy(true); setMsg(null);
    const r = await coinFlip({ bet, side });
    if (!r.ok) { setBusy(false); return setMsg({ text: r.error }); }
    const face = r.landed === "alliance" ? 0 : 180;
    setRot((x) => x - (x % 360) + 360 * 5 + face);
    setTimeout(() => {
      setBusy(false); setBalance(r.balance); flash(r.won - bet);
      setMsg(r.win ? { text: `${r.landed === "alliance" ? "For the Alliance!" : "For the Horde!"} Won ${fmt(r.won)}`, good: true } : { text: `Landed ${r.landed === "alliance" ? "Alliance" : "Horde"}. Lost ${fmt(bet)}.` });
    }, 1700);
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <div className="seg faction">
          <button type="button" aria-pressed={side === "alliance"} onClick={() => setSide("alliance")} disabled={busy}>Alliance</button>
          <button type="button" aria-pressed={side === "horde"} onClick={() => setSide("horde")} disabled={busy}>Horde</button>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={flip} disabled={!signedIn || busy}>Flip · win {fmt(Math.floor(bet * 1.94))}</button>
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
      </div>
      <div className="game-stage coin-stage">
        <div className="coin" style={{ transform: `rotateY(${rot}deg)` }}>
          <div className="coin-face alliance"><img src={wowIconUrl("achievement_pvp_a_a")} alt="" /></div>
          <div className="coin-face horde"><img src={wowIconUrl("achievement_pvp_h_h")} alt="" /></div>
        </div>
      </div>
    </div>
  );
}
