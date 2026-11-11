"use client";
// Mines in a dwarven mine. Tiles are stone blocks that flip in 3D to a gem (rising pitch per gem) or a bomb
// (blast, flash, shake). When the round ends the rest of the seam is revealed in a diagonal stagger, with
// the gems you never dug shown dimmer. HUD: current multiplier and what the next gem would pay.
import { useEffect, useRef, useState } from "react";
import { minesCashout, minesReveal, minesStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

type Round = { id: string; bet: number; mines: number; revealed: number[]; status: string; mult: number; next: number; board?: number[] };

const COLS = 5;
const GEMS = ["inv_misc_gem_ruby_01", "inv_misc_gem_sapphire_01", "inv_misc_gem_emerald_01", "inv_misc_gem_topaz_01", "inv_misc_gem_amethyst_01", "inv_misc_gem_diamond_01"];
const GEM_HUE = ["#ff4d5e", "#4d8dff", "#3fdc6a", "#ffc23d", "#c06bff", "#dff4ff"];
const gemOf = (t: number) => (t * 7 + 3) % GEMS.length;
const BOMB = "inv_misc_bomb_02";
const STEP = 46; // ms per diagonal in the end-of-round reveal
const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// preview of the first gem's payout (the server decides the real numbers)
const firstGem = (mines: number, tiles: number) => Math.floor(0.97 * (tiles / (tiles - mines)) * 100) / 100;
const fmtX = (n: number) => `${n.toFixed(2)}×`;

export function Mines({ tiles }: { tiles: number }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [digging, setDigging] = useState<number | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const [blast, setBlast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { [...GEMS, BOMB].forEach((i) => { const im = new Image(); im.src = wowIconUrl(i); }); }, []);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, reduced() ? 0 : ms)); };
  const active = round?.status === "active";
  const rows = Math.ceil(tiles / COLS);
  const revealSpan = (rows + COLS - 2) * STEP + 380;

  const start = async () => {
    if (busy) return;
    setBusy(true); setMsg(null); setHit(null); setRevealAll(false); setBlast(false); play("chip");
    const r = await minesStart({ bet, mines });
    setBusy(false);
    if (!r.ok) { play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); setBalance(r.balance); play("whoosh");
    if (r.resumed) setMsg({ text: "Picked up your unfinished round." });
  };

  const finish = (r: Round, won: number, balance: number, delay: number) => {
    later(delay, () => setRevealAll(true));
    later(delay + revealSpan, () => {
      setBusy(false); setBalance(balance);
      if (won) flash(won);
      const mult = won ? won / r.bet : 0;
      celebrate({ mult, won });
      setChips((c) => [{ k: r.id, label: won ? fmtX(r.mult) : `✕ ${r.revealed.length}`, tone: (won ? (r.mult >= 5 ? "big" : "win") : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    });
  };

  const reveal = async (t: number) => {
    if (!round || !active || busy || round.revealed.includes(t)) return;
    setBusy(true); setDigging(t); play("tick", { pitch: 0.7 });
    const r = await minesReveal({ id: round.id, tile: t });
    setDigging(null);
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    const nr = r.round as Round;
    setRound(nr);
    if ("hit" in r && r.hit != null) {
      setHit(r.hit);
      later(150, () => { play("bomb"); buzz("fail"); setBlast(true); });
      setMsg({ text: `Boom. The bomb took ${fmt(round.bet)} marks.` });
      finish(nr, 0, r.balance, 650);
      return;
    }
    play("gem", { pitch: ladder(nr.revealed.length - 1) }); buzz("tap");
    if ("won" in r && r.won) {
      setMsg({ text: `Cleared the seam! +${fmt(r.won as number)}`, good: true });
      finish(nr, r.won as number, r.balance, 380);
      return;
    }
    setBalance(r.balance); setBusy(false);
  };

  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await minesCashout({ id: round.id });
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); play("cashout");
    setMsg({ text: `Cashed out ${fmtX(r.round.mult)} for ${fmt(r.won)} marks`, good: true });
    finish(r.round, r.won, r.balance, 60);
  };

  const found = round?.revealed.length ?? 0;
  const safeTotal = tiles - (round?.mines ?? mines);
  const lost = round?.status === "lost";
  const cashValue = round ? Math.floor(round.bet * round.mult) : 0;
  const nextValue = round ? Math.floor(round.bet * round.next) : 0;

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="mine" label="Mines" className="mn-machine" hud={<>
          <Readout label="Multiplier" tone={lost ? "lose" : "gold"}>{round && found ? <CountUp value={round.mult} format={fmtX} duration={450} /> : "1.00×"}</Readout>
          <Readout label="Next gem" tone={active ? "win" : undefined}>{active && found < safeTotal ? <>{fmtX(round.next)} <small>· {fmt(nextValue)}</small></> : "—"}</Readout>
          <Readout label="Gems">{found}/{safeTotal}</Readout>
          <ResultStrip items={chips} label="Recent rounds" />
        </>}>
          <div className={`mn-pit${active ? " live" : ""}${lost ? " lost" : ""}${round?.status === "won" ? " won" : ""}${blast ? " blasted" : ""}`}>
            <span className="mn-lantern l" aria-hidden="true" /><span className="mn-lantern r" aria-hidden="true" />
            <div className="mn-grid" style={{ ["--cols" as string]: COLS }}>
              {Array.from({ length: tiles }, (_, t) => {
                const mine = !!round?.board?.includes(t);
                const dug = !!round?.revealed.includes(t);
                const open = dug || hit === t || (revealAll && !!round?.board);
                const isBomb = mine || hit === t;
                const g = gemOf(t), row = Math.floor(t / COLS), col = t % COLS;
                const late = open && !dug && hit !== t;
                return (
                  <button key={t} type="button"
                    className={`mn-tile${open ? " open" : ""}${isBomb && open ? " bomb" : open ? " gem" : ""}${hit === t ? " boom" : ""}${late ? " late" : ""}${digging === t ? " dig" : ""}`}
                    style={{ ["--hue" as string]: GEM_HUE[g], ...(late ? { ["--d" as string]: `${(row + col) * STEP}ms` } : null) }}
                    onClick={() => reveal(t)} disabled={!active || dug || busy}
                    aria-label={open ? (isBomb ? "Bomb" : dug ? "Gem" : "Gem (not dug)") : `Tile ${t + 1}`}>
                    <span className="mn-in">
                      <span className="mn-face mn-stone" aria-hidden="true" />
                      <span className="mn-face mn-under" aria-hidden="true">
                        {open && <img src={wowIconUrl(isBomb ? BOMB : GEMS[g])} alt="" width={56} height={56} />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {blast && <span className="mn-flash" aria-hidden="true" />}
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active || busy} />
        <label className="field">Bombs: <strong className="gold">{mines}</strong>
          <input type="range" min={1} max={24} value={mines} disabled={active || busy} onChange={(e) => setMines(Number(e.target.value))} />
        </label>
        <div className="seg" role="group" aria-label="Bomb presets">
          {[1, 3, 5, 10, 24].map((m) => <button key={m} type="button" aria-pressed={mines === m} disabled={active || busy} onClick={() => { setMines(m); play("click"); }}>{m}</button>)}
        </div>
        <div className="dice-stats">
          <div><span className="micro muted">First gem</span><strong className="gold">{fmtX(firstGem(active ? round.mines : mines, tiles))}</strong></div>
          <div><span className="micro muted">Safe tiles</span><strong>{tiles - (active ? round.mines : mines)}</strong></div>
          <div><span className="micro muted">Cash out</span><strong>{active && found ? fmt(cashValue) : "—"}</strong></div>
        </div>
        {active ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={cashout} disabled={busy || !found}>
            {found ? `Cash out ${fmt(cashValue)}` : "Pick a tile"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Start round</button>
        )}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <p className="micro muted">More bombs, bigger multipliers. Cash out any time after your first gem.</p>
      </div>
    </div>
  );
}
