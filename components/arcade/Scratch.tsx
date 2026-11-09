"use client";
// Treasure Scratch: the server decides the card; you scratch the gold foil off with a finger or the mouse.
import { useEffect, useRef, useState } from "react";
import { scratchBuy } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

type Sym = { id: string; icon: string; mult?: number };

export function Scratch({ prizes, filler }: { prizes: Sym[]; filler: Sym }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [card, setCard] = useState<{ cells: string[]; win: string | null; mult: number; won: number; balance: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const all = [...prizes, filler];
  const icon = (id: string) => all.find((s) => s.id === id)?.icon ?? filler.icon;

  // Paint the foil whenever a new card arrives.
  useEffect(() => {
    const c = canvas.current; if (!c || !card) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext("2d")!; g.scale(dpr, dpr);
    const grad = g.createLinearGradient(0, 0, r.width, r.height);
    grad.addColorStop(0, "#8a6a2c"); grad.addColorStop(.3, "#e8c867"); grad.addColorStop(.55, "#b8902f"); grad.addColorStop(.8, "#f4dc8a"); grad.addColorStop(1, "#7a5a20");
    g.globalCompositeOperation = "source-over"; g.fillStyle = grad; g.fillRect(0, 0, r.width, r.height);
    g.fillStyle = "rgba(60,40,10,.55)"; g.font = "600 15px Marcellus, serif"; g.textAlign = "center";
    for (let y = 30; y < r.height; y += 46) for (let x = 40; x < r.width; x += 92) g.fillText("✦ SCRATCH ✦", x + ((y / 46) % 2) * 30, y);
  }, [card]);

  const finish = () => {
    if (!card || revealed) return;
    setRevealed(true); setBalance(card.balance); if (card.won) flash(card.won - bet);
  };
  const scratchAt = (x: number, y: number) => {
    const c = canvas.current; if (!c) return;
    const g = c.getContext("2d")!, r = c.getBoundingClientRect();
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000"; // fully opaque brush, so a swipe clears the foil completely
    g.beginPath(); g.arc(x - r.left, y - r.top, 22, 0, Math.PI * 2); g.fill();
  };
  const cleared = () => {
    const c = canvas.current; if (!c) return 0;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, n = 0;
    for (let i = 3; i < d.length; i += 4 * 40) { n++; if (d[i] < 20) clear++; }
    return clear / n;
  };
  const buy = async () => {
    setBusy(true); setErr(null); setRevealed(false);
    const r = await scratchBuy({ bet });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setBalance(r.balance - r.won); // the price leaves now; any prize lands when the card is revealed
    setCard({ cells: r.cells, win: r.win, mult: r.mult, won: r.won, balance: r.balance });
  };

  return (
    <div className="game-layout">
      <div className="game-stage scratch-stage">
        <div className="scratch-card">
          <div className="scratch-grid">
            {(card?.cells ?? Array(9).fill(filler.id)).map((id, i) => (
              <div key={i} className={`scratch-cell${revealed && card?.win === id ? " win" : ""}`}><img src={wowIconUrl(icon(id))} alt="" /></div>
            ))}
          </div>
          {card && !revealed && (
            <canvas ref={canvas} className="scratch-foil" aria-label="Scratch to reveal"
              onPointerDown={(e) => { drawing.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); scratchAt(e.clientX, e.clientY); }}
              onPointerMove={(e) => { if (drawing.current) scratchAt(e.clientX, e.clientY); }}
              onPointerUp={() => { drawing.current = false; if (cleared() > 0.55) finish(); }} />
          )}
          {!card && <div className="scratch-empty">Buy a card to start scratching</div>}
        </div>
        {card && revealed && <p className={card.won ? "game-win" : "game-err"} role="status" style={{ textAlign: "center" }}>{card.won ? `Three of a kind! ${card.mult}× · won ${fmt(card.won)}` : "No match this time."}</p>}
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy || (!!card && !revealed)} />
        {card && !revealed
          ? <button type="button" className="btn btn-lg" onClick={finish}>Reveal all</button>
          : <button type="button" className="btn btn-primary btn-lg" onClick={buy} disabled={!signedIn || busy}>{busy ? "…" : `Buy a card · ${fmt(bet)}`}</button>}
        {err && <p className="game-err" role="alert">{err}</p>}
        <table className="paytable"><tbody>
          {prizes.map((p) => <tr key={p.id}><td><img src={wowIconUrl(p.icon, 36)} alt="" /><img src={wowIconUrl(p.icon, 36)} alt="" /><img src={wowIconUrl(p.icon, 36)} alt="" /></td><td className="gold">{p.mult}×</td></tr>)}
        </tbody></table>
        <p className="micro muted">Scratch with your finger or mouse. Three of the same treasure wins.</p>
      </div>
    </div>
  );
}
