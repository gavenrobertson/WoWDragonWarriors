"use client";
import { useState } from "react";
import { spireCashout, spirePick, spireStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";

type Mode = "easy" | "medium" | "hard" | "expert";
type Round = { id: string; bet: number; status: string; mode: Mode; picks: number[]; floor: number; mult: number; next: number; dragons?: number[][] };

export function Dragonspire({ modes, floors, mults }: { modes: Record<Mode, { doors: number; dragons: number }>; floors: number; mults: Record<Mode, number[]> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [mode, setMode] = useState<Mode>("medium");
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const active = round?.status === "active";
  const m = round ? modes[round.mode] : modes[mode];
  const mm = mults[round?.mode ?? mode];

  const start = async () => {
    setBusy(true); setMsg(null);
    const r = await spireStart({ bet, mode });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance);
    if (r.resumed) setMsg({ text: "Picked up your unfinished climb." });
  };
  const pick = async (door: number) => {
    if (!round || !active || busy) return;
    setBusy(true);
    const r = await spirePick({ id: round.id, door });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance);
    if (r.hit) setMsg({ text: `A dragon! The climb ends on floor ${r.round.floor}.` });
    else if ("won" in r && r.won) { flash(r.won as number); setMsg({ text: `You reached the top! +${fmt(r.won as number)}`, good: true }); }
  };
  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await spireCashout({ id: round.id });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error });
    setRound(r.round); setBalance(r.balance); flash(r.won);
    setMsg({ text: `Climbed down with ${r.round.mult}× · ${fmt(r.won)} marks`, good: true });
  };

  return (
    <div className="game-layout">
      <div className="game-stage spire-stage">
        <ol className="spire" aria-label="Tower floors">
          {Array.from({ length: floors }, (_, i) => floors - 1 - i).map((f) => {
            const picked = round?.picks[f], here = active && round.floor === f, past = round && round.picks.length > f;
            const dragons = round?.dragons?.[f] ?? [];
            return (
              <li key={f} className={`spire-floor${here ? " current" : ""}${past ? " past" : ""}`}>
                <span className="spire-mult">{mm[f]}×</span>
                <div className="spire-doors" style={{ ["--n" as string]: m.doors }}>
                  {Array.from({ length: m.doors }, (_, d) => {
                    const isDragon = dragons.includes(d), chosen = picked === d;
                    const show = (round && !active && round.dragons) || (past && chosen);
                    return (
                      <button key={d} type="button" className={`spire-door${chosen ? " chosen" : ""}${show && isDragon ? " dragon" : ""}${show && !isDragon && chosen ? " safe" : ""}`}
                        disabled={!here || busy} onClick={() => pick(d)} aria-label={`Floor ${f + 1}, door ${d + 1}`}>
                        {show ? <img src={wowIconUrl(isDragon ? "inv_misc_head_dragon_01" : "inv_misc_gem_01", 36)} alt="" /> : here ? <span className="spire-q">?</span> : null}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active} />
        <label className="field">Difficulty
          <div className="seg">{(Object.keys(modes) as Mode[]).map((k) => <button key={k} type="button" aria-pressed={(round?.mode ?? mode) === k} disabled={active} onClick={() => setMode(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </label>
        <p className="micro muted" style={{ margin: 0 }}>{m.doors} doors per floor, {m.dragons} dragon{m.dragons > 1 ? "s" : ""}. Top floor pays {mm[floors - 1]}×.</p>
        {active ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={cashout} disabled={busy || !round.picks.length}>{round.picks.length ? `Cash out ${fmt(Math.floor(round.bet * round.mult))}` : "Pick a door"}</button>
        ) : <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Start climbing</button>}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
      </div>
    </div>
  );
}
