"use client";
import { useRef, useState } from "react";
import { slotsSpin } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

type Sym = { id: string; icon: string; pay3: number };
const CELL = 96;

export function Slots({ symbols, pair, one, two, rtp }: { symbols: Sym[]; pair: number; one: number; two: number; rtp: number }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [reels, setReels] = useState<number[][]>([[0, 1, 2], [1, 2, 3], [2, 3, 4]].map((r) => r));
  const [offset, setOffset] = useState([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const spins = useRef(0);

  const spin = async () => {
    if (spinning) return;
    setSpinning(true); setMsg(null);
    const r = await slotsSpin({ bet });
    if (!r.ok) { setSpinning(false); return setMsg({ text: r.error }); }
    spins.current++;
    // Build long strips ending on the result row (middle line).
    const strips = r.reels.map((final, i) => {
      const len = 22 + i * 8;
      const s = Array.from({ length: len }, () => Math.floor(Math.random() * symbols.length));
      s[len - 2] = final;
      return s;
    });
    const cell = (document.querySelector(".slot-cell") as HTMLElement | null)?.offsetHeight || CELL;
    setReels(strips); setOffset([0, 0, 0]);
    requestAnimationFrame(() => requestAnimationFrame(() => setOffset(strips.map((s) => (s.length - 3) * cell))));
    setTimeout(() => {
      setSpinning(false); setBalance(r.balance); flash(r.won - bet);
      setMsg(r.won ? { text: `${r.mult}× · won ${fmt(r.won)}`, good: true } : { text: "No luck this spin." });
    }, 2600);
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={spinning} />
        <button type="button" className="btn btn-primary btn-lg" onClick={spin} disabled={!signedIn || spinning}>{spinning ? "Spinning…" : "Spin"}</button>
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <table className="paytable">
          <tbody>
            {symbols.map((s) => <tr key={s.id}><td><img src={wowIconUrl(s.icon, 36)} alt="" /><img src={wowIconUrl(s.icon, 36)} alt="" /><img src={wowIconUrl(s.icon, 36)} alt="" /></td><td className="gold">{s.pay3}×</td></tr>)}
            <tr><td>Any two dragons</td><td className="gold">{two}×</td></tr>
            <tr><td>One dragon</td><td className="gold">{one}×</td></tr>
            <tr><td>Any pair</td><td className="gold">+{pair}×</td></tr>
          </tbody>
        </table>
        <p className="micro muted">Pays back about {Math.round(rtp * 100)}% over time.</p>
      </div>
      <div className="game-stage slots-stage">
        <div className="slots-machine">
          {reels.map((strip, i) => (
            <div key={`${i}-${spins.current}`} className="slot-reel">
              <div className="slot-strip" style={{ transform: `translateY(-${offset[i]}px)`, transition: offset[i] ? `transform ${1.4 + i * 0.45}s cubic-bezier(.12,.75,.25,1)` : "none" }}>
                {strip.map((sym, k) => <div key={k} className="slot-cell"><img src={wowIconUrl(symbols[sym].icon)} alt="" /></div>)}
              </div>
            </div>
          ))}
          <div className="slot-line" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
