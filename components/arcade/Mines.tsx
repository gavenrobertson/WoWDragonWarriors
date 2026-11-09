"use client";
import { useState } from "react";
import { minesCashout, minesReveal, minesStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

type Round = { id: string; bet: number; mines: number; revealed: number[]; status: string; mult: number; next: number; board?: number[] };

export function Mines({ tiles }: { tiles: number }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const active = round?.status === "active";

  const start = async () => {
    setBusy(true); setMsg(null); setHit(null);
    const r = await minesStart({ bet, mines });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance);
    if (r.resumed) setMsg({ text: "Picked up your unfinished round." });
  };
  const reveal = async (t: number) => {
    if (!round || !active || busy || round.revealed.includes(t)) return;
    setBusy(true);
    const r = await minesReveal({ id: round.id, tile: t });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance);
    if ("hit" in r && r.hit != null) { setHit(r.hit); setMsg({ text: `Boom. The bomb took ${fmt(round.bet)} marks.` }); }
    else if ("won" in r && r.won) { flash(r.won as number); setMsg({ text: `Cleared the board! +${fmt(r.won as number)}`, good: true }); }
  };
  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await minesCashout({ id: round.id });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance); flash(r.won);
    setMsg({ text: `Cashed out ${r.round.mult}× for ${fmt(r.won)} marks`, good: true });
  };

  return (
    <div className="game-layout">
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active} />
        <label className="field">Bombs: <strong className="gold">{mines}</strong>
          <input type="range" min={1} max={24} value={mines} disabled={active} onChange={(e) => setMines(Number(e.target.value))} />
        </label>
        {active ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={cashout} disabled={busy || !round.revealed.length}>
            {round.revealed.length ? `Cash out ${fmt(Math.floor(round.bet * round.mult))}` : "Pick a tile"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Start round</button>
        )}
        {active && <p className="micro muted">Now {round.mult}× · next gem {round.next}×</p>}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <p className="micro muted">More bombs, bigger multipliers. Cash out any time after your first gem.</p>
      </div>
      <div className="game-stage">
        <div className={`mines-grid${active ? " live" : ""}`}>
          {Array.from({ length: tiles }, (_, t) => {
            const open = round?.revealed.includes(t);
            const bomb = round?.board?.includes(t);
            const shown = open || (round && !active && round.board);
            return (
              <button key={t} type="button" className={`mine-tile${open ? " gem" : ""}${shown && bomb ? " bomb" : ""}${hit === t ? " boom" : ""}${shown && !open && !bomb ? " dim" : ""}`}
                onClick={() => reveal(t)} disabled={!active || open || busy} aria-label={open ? "Gem" : shown && bomb ? "Bomb" : `Tile ${t + 1}`}>
                {shown && (bomb ? <img src={wowIconUrl("inv_misc_bomb_04")} alt="" /> : <img src={wowIconUrl("inv_misc_gem_01")} alt="" />)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
