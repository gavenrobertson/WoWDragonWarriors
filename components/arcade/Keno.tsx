"use client";
import { useState } from "react";
import { kenoPlay } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ";

export function Keno({ pays }: { pays: Record<number, Record<number, number>> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const toggle = (n: number) => {
    if (busy) return;
    setDrawn([]); setMsg(null);
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 10 ? p : [...p, n]));
  };
  const auto = () => { const s = new Set<number>(); while (s.size < 8) s.add(1 + Math.floor(Math.random() * 40)); setPicks([...s]); setDrawn([]); setMsg(null); };
  const play = async () => {
    setBusy(true); setDrawn([]); setMsg(null);
    const r = await kenoPlay({ bet, picks });
    if (!r.ok) { setBusy(false); return setMsg({ text: r.error }); }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    r.drawn.forEach((n, i) => setTimeout(() => setDrawn((d) => [...d, n]), reduced ? 0 : i * 140));
    setTimeout(() => {
      setBusy(false); setBalance(r.balance); flash(r.won - bet);
      setMsg(r.won ? { text: `${r.hits} hit${r.hits === 1 ? "" : "s"} · ${r.mult}× · won ${fmt(r.won)}`, good: true } : { text: `${r.hits} hit${r.hits === 1 ? "" : "s"}. No prize this time.` });
    }, reduced ? 200 : r.drawn.length * 140 + 200);
  };
  const table = pays[picks.length] ?? {};

  return (
    <div className="game-layout">
      <div className="game-stage">
        <div className="keno-grid" role="group" aria-label="Runes">
          {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => {
            const picked = picks.includes(n), hit = drawn.includes(n);
            return (
              <button key={n} type="button" className={`keno-cell${picked ? " picked" : ""}${hit ? " drawn" : ""}${picked && hit ? " hit" : ""}`} onClick={() => toggle(n)} aria-pressed={picked} aria-label={`Rune ${n}`}>
                <span className="keno-rune" aria-hidden="true">{RUNES[n - 1]}</span><span className="keno-n">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm grow" onClick={auto} disabled={busy}>Auto-pick 8</button>
          <button type="button" className="btn btn-sm grow" onClick={() => { setPicks([]); setDrawn([]); setMsg(null); }} disabled={busy || !picks.length}>Clear</button>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={play} disabled={!signedIn || busy || !picks.length}>{busy ? "Drawing…" : `Draw · ${picks.length}/10 picked`}</button>
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        {picks.length > 0 && (
          <table className="paytable"><tbody>
            {Object.entries(table).reverse().map(([hits, m]) => <tr key={hits}><td>{hits} of {picks.length}</td><td className="gold">{m}×</td></tr>)}
          </tbody></table>
        )}
        <p className="micro muted">Pick up to 10 of 40 runes. Ten are drawn; the more you match, the bigger the prize.</p>
      </div>
    </div>
  );
}
