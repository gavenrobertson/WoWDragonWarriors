"use client";
// Dragonspire: climb the tower floor by floor, opening one arched door per floor. Treasure lets you climb
// (the hero token rises up the ladder and the multiplier rung lights up); a dragon ends the climb in a
// burst of fire. When the climb ends every door swings open in a stagger spreading out from your floor.
import { useEffect, useRef, useState } from "react";
import { spireCashout, spirePick, spireStart } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

type Mode = "easy" | "medium" | "hard" | "expert";
type Round = { id: string; bet: number; status: string; mode: Mode; picks: number[]; floor: number; mult: number; next: number; dragons?: number[][] };

const TREASURE = ["inv_misc_coin_17", "inv_box_02", "inv_misc_gem_variety_01", "inv_jewelry_necklace_07", "inv_misc_bag_10", "inv_misc_gem_variety_02", "inv_misc_ornatebox", "inv_crown_01"];
const DRAGON = "inv_misc_head_dragon_red";
const HERO = "inv_helmet_25";
const BOSS = "achievement_boss_nefarion";
const STAGGER = 70;
const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtX = (n: number) => `${n.toFixed(2)}×`;

export function Dragonspire({ modes, floors, mults }: { modes: Record<Mode, { doors: number; dragons: number }>; floors: number; mults: Record<Mode, number[]> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [mode, setMode] = useState<Mode>("medium");
  const [round, setRound] = useState<Round | null>(null);
  const [climb, setClimb] = useState(0);
  const [picking, setPicking] = useState<number | null>(null);
  const [revealAll, setRevealAll] = useState(false);
  const [burn, setBurn] = useState(false);
  const [outcome, setOutcome] = useState<"won" | "lost" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { [...TREASURE, DRAGON].forEach((i) => { const im = new Image(); im.src = wowIconUrl(i, 56); }); }, []);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, reduced() ? 0 : ms)); };

  const active = round?.status === "active";
  const m = round ? modes[round.mode] : modes[mode];
  const mm = mults[round?.mode ?? mode];
  const cfgMode = active ? round.mode : mode, cfg = modes[cfgMode], cmm = mults[cfgMode];
  const last = round ? Math.max(0, round.picks.length - 1) : 0;
  const span = floors * STAGGER + 520;

  const start = async () => {
    if (busy) return;
    setBusy(true); setMsg(null); play("chip");
    const r = await spireStart({ bet, mode });
    setBusy(false);
    if (!r.ok) { play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); setBalance(r.balance); setRevealAll(false); setBurn(false); setOutcome(null); setClimb(r.round.floor);
    play("thud", { pitch: 0.8 });
    if (r.resumed) { setMode(r.round.mode); setMsg({ text: "Picked up your unfinished climb." }); }
  };

  const pickMode = (k: Mode) => {
    setMode(k); play("click");
    // a finished tower of another difficulty gives way to an empty one of the new difficulty
    if (round && !active && round.mode !== k) { setRound(null); setClimb(0); setRevealAll(false); setBurn(false); setOutcome(null); }
  };

  const finish = (r: Round, won: number, balance: number, delay: number) => {
    later(delay, () => { setRevealAll(true); play("whoosh", { pitch: 0.7 }); });
    later(delay + span, () => {
      setBusy(false); setBalance(balance); setOutcome(won ? "won" : "lost");
      if (won) flash(won);
      celebrate({ mult: won ? won / r.bet : 0, won });
      setChips((c) => [{ k: r.id, label: won ? fmtX(r.mult) : `✕ F${r.picks.length}`, tone: (won ? (r.mult >= 5 ? "big" : "win") : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    });
  };

  const pick = async (door: number) => {
    if (!round || !active || busy) return;
    const f = round.floor;
    setBusy(true); setPicking(door); setMsg(null); play("click");
    const r = await spirePick({ id: round.id, door });
    setPicking(null);
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); play("reveal", { pitch: 0.8 });
    if (r.hit) {
      later(170, () => { play("crash"); play("bomb", { vol: 0.6 }); buzz("fail"); setBurn(true); });
      setMsg({ text: `A dragon! The climb ends on floor ${f + 1}.` });
      finish(r.round, 0, r.balance, 760);
      return;
    }
    later(140, () => { play("gem", { pitch: ladder(f * 1.5) }); buzz("tap"); });
    later(380, () => { setClimb(r.round.floor); play("whoosh", { pitch: 1 + f * 0.06 }); });
    if ("won" in r && r.won) {
      setMsg({ text: `You reached the summit! +${fmt(r.won as number)}`, good: true });
      finish(r.round, r.won as number, r.balance, 820);
      return;
    }
    later(380, () => { setBusy(false); setBalance(r.balance); });
  };

  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    const r = await spireCashout({ id: round.id });
    if (!r.ok) { setBusy(false); play("error"); return setMsg({ text: r.error }); }
    setRound(r.round); play("cashout");
    setMsg({ text: `Climbed down with ${fmtX(r.round.mult)} · ${fmt(r.won)} marks`, good: true });
    finish(r.round, r.won, r.balance, 80);
  };

  // keyboard: 1–4 open a door on the current floor
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!active || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const d = Number(e.key) - 1;
      if (Number.isInteger(d) && d >= 0 && d < m.doors) { e.preventDefault(); pick(d); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const cashValue = round ? Math.floor(round.bet * round.mult) : 0;
  // the multiplier earned so far (a lost round's last pick was the dragon, so count only cleared floors)
  const shownMult = round ? (round.status === "lost" ? (climb > 0 ? mm[climb - 1] : 0) : round.mult) : 0;
  const summit = climb >= floors;

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="fire" label="Dragonspire" className="sp-machine" hud={<>
          <Readout label="Floor">{climb}/{floors}</Readout>
          <Readout label="Multiplier" tone={outcome === "lost" ? "lose" : "gold"}>{shownMult ? <CountUp value={shownMult} format={fmtX} duration={500} /> : "—"}</Readout>
          <Readout label="Next floor" tone={active ? "win" : undefined}>{active ? fmtX(round.next) : "—"}</Readout>
          <ResultStrip items={chips} label="Recent climbs" />
        </>}>
          <div className={`sp${active ? " live" : ""}${burn ? " burn" : ""}${outcome ? ` o-${outcome}` : ""}`} style={{ ["--f" as string]: climb, ["--floors" as string]: floors }}>
            <div className={`sp-roof${summit ? " reached" : ""}`}>
              <span className="sp-boss"><img src={wowIconUrl(BOSS)} alt="" width={56} height={56} /></span>
              <span className="sp-summit">Summit <b>{fmtX(mm[floors - 1])}</b></span>
            </div>
            <div className="sp-shaft">
              <span className={`sp-hero${outcome ? ` ${outcome}` : ""}`} aria-hidden="true">
                <img src={wowIconUrl(HERO)} alt="" width={56} height={56} />
              </span>
              <ol className="sp-floors" aria-label="Tower floors">
                {Array.from({ length: floors }, (_, i) => floors - 1 - i).map((f) => {
                  const picked = round?.picks[f];
                  const reached = !!round && round.picks.length > f;
                  const here = !!active && round.floor === f && climb === f;
                  const cleared = climb > f;
                  const dragons = round?.dragons?.[f] ?? [];
                  const hitFloor = round?.status === "lost" && round.picks.length - 1 === f;
                  return (
                    <li key={f} className={`sp-floor${here ? " here" : ""}${cleared ? " cleared" : ""}${hitFloor ? " hit" : ""}${!round || (!reached && !here && !revealAll) ? " dark" : ""}`}>
                      <span className="sp-rung">{fmtX(mm[f])}</span>
                      <div className="sp-doors" style={{ ["--n" as string]: m.doors }}>
                        {Array.from({ length: m.doors }, (_, d) => {
                          const chosen = reached && picked === d;
                          const isDragon = dragons.includes(d);
                          const open = chosen || (revealAll && !!round?.dragons);
                          const late = open && !chosen;
                          const delay = late ? Math.abs(f - last) * STAGGER + d * 24 : 0;
                          return (
                            <button key={d} type="button" disabled={!here || busy} onClick={() => pick(d)}
                              className={`sp-door${open ? " open" : ""}${open && isDragon ? " dragon" : open ? " safe" : ""}${chosen ? " chosen" : ""}${late ? " late" : ""}${here && picking === d ? " knock" : ""}`}
                              style={late ? { ["--d" as string]: `${delay}ms` } : undefined}
                              aria-label={open ? `Floor ${f + 1}, door ${d + 1}: ${isDragon ? "dragon" : "treasure"}` : `Floor ${f + 1}, door ${d + 1}`}>
                              <span className="sp-behind">{open && <img src={wowIconUrl(isDragon ? DRAGON : TREASURE[(f + d) % TREASURE.length], 56)} alt="" width={56} height={56} />}</span>
                              <span className="sp-leaf" aria-hidden="true"><i /></span>
                              {here && <span className="sp-key" aria-hidden="true">{d + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="sp-base" aria-hidden="true"><span>Gate</span></div>
            {burn && <span className="sp-flash" aria-hidden="true" />}
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={active || busy} />
        <label className="field">Difficulty
          <div className="seg">{(Object.keys(modes) as Mode[]).map((k) => <button key={k} type="button" aria-pressed={(active ? round.mode : mode) === k} disabled={active || busy} onClick={() => pickMode(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </label>
        <div className="dice-stats">
          <div><span className="micro muted">Doors</span><strong>{cfg.doors}</strong></div>
          <div><span className="micro muted">Dragons</span><strong>{cfg.dragons}</strong></div>
          <div><span className="micro muted">Summit</span><strong className="gold">{fmtX(cmm[floors - 1])}</strong></div>
        </div>
        {active ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={cashout} disabled={busy || !round.picks.length}>{round.picks.length ? `Cash out ${fmt(cashValue)}` : "Pick a door"}</button>
        ) : <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!signedIn || busy}>Start climbing</button>}
        {msg && <p className={msg.good ? "game-win" : "game-err"} role="status">{msg.text}</p>}
        <p className="micro muted">{cfg.doors} doors per floor, {cfg.dragons} dragon{cfg.dragons > 1 ? "s" : ""}. Cash out after any floor. Keys: 1–{cfg.doors} open a door.</p>
      </div>
    </div>
  );
}
