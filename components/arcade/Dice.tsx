"use client";
// Dice: pick a target on a rune-carved slab and roll over or under it. The rune marker starts swinging the
// instant you click (no dead pause while the server decides), then eases onto the real roll with a little
// overshoot; the number pops and the winning zone flares. Marker and number are moved in a rAF loop via refs.
import { useEffect, useRef, useState } from "react";
import { diceRoll } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { play, unlockAudio } from "./sfx";

const MIN_SWING = 420; // ms of swinging before the marker may settle
const easeOutBack = (k: number) => { const c = 1.25; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
type Roll = { v: number; win: boolean; won: number; k: number };

export function Dice() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>([]);
  const [pips, setPips] = useState<{ v: number; win: boolean; k: number }[]>([]);
  const markerEl = useRef<HTMLSpanElement>(null);
  const numEl = useRef<HTMLSpanElement>(null);
  const markerNum = useRef<HTMLSpanElement>(null);
  const pos = useRef(50);
  const raf = useRef(0);
  const chance = over ? 100 - target : target;
  const mult = Math.floor((0.97 / (chance / 100)) * 10000) / 10000;

  const draw = (x: number, num?: string) => {
    pos.current = x;
    if (markerEl.current) markerEl.current.style.left = `${x}%`;
    const t = num ?? x.toFixed(2);
    if (numEl.current) numEl.current.textContent = t;
    if (markerNum.current) markerNum.current.textContent = Math.floor(x).toString();
  };
  useEffect(() => {
    draw(50, "—");
    if (markerNum.current) markerNum.current.textContent = "?";
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const go = async () => {
    if (busy || !signedIn) return;
    unlockAudio();
    setBusy(true); setErr(null); setRoll(null);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bet0 = bet;
    play("whoosh", { vol: 0.6 });
    // swing right away: a pendulum across the slab, continuing from wherever the marker is
    let result: { v: number; win: boolean; won: number; balance: number } | null = null, failed = false;
    const t0 = performance.now();
    const amp = 44, w = 0.0105;
    const ph0 = Math.asin(Math.max(-1, Math.min(1, (pos.current - 50) / amp)));
    let lastBand = Math.floor(pos.current / 10), settleFrom: { t: number; x: number; dur: number } | null = null;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      if (!settleFrom) {
        const x = 50 + amp * Math.sin(ph0 + (t - t0) * w);
        draw(x);
        const band = Math.floor(x / 10);
        if (band !== lastBand) { lastBand = band; play("tick", { pitch: 0.8 + x / 140, vol: 0.7 }); }
        if ((result || failed) && t - t0 >= MIN_SWING) {
          const to = result ? result.v : pos.current;
          settleFrom = { t, x: pos.current, dur: 520 + Math.min(260, Math.abs(to - pos.current) * 4) };
        }
        raf.current = requestAnimationFrame(tick);
        return;
      }
      if (failed) { finish(); return; }
      const k = Math.min(1, (t - settleFrom.t) / settleFrom.dur), e = easeOutBack(k);
      const v = result!.v, x = settleFrom.x + (v - settleFrom.x) * e;
      draw(Math.max(0, Math.min(100, x)), k < 1 ? Math.max(0, Math.min(99.99, x)).toFixed(2) : v.toFixed(2));
      const band = Math.floor(x / 10);
      if (band !== lastBand && k < 0.7) { lastBand = band; play("tick", { pitch: 0.8 + x / 140, vol: 0.6 }); }
      if (k < 1) { raf.current = requestAnimationFrame(tick); return; }
      finish();
    };
    const finish = () => {
      setBusy(false);
      if (!result) return;
      const r = result;
      if (markerNum.current) markerNum.current.textContent = Math.floor(r.v).toString();
      play("stop", { pitch: r.win ? 1.3 : 0.9 });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        numEl.current?.animate([{ transform: "scale(1.22)" }, { transform: "scale(.96)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.2,1.5,.4,1)" });
        markerEl.current?.animate([{ transform: "translateX(-50%) scale(1.25, .8)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 260, easing: "cubic-bezier(.2,1.5,.4,1)" });
      }
      setRoll({ v: r.v, win: r.win, won: r.won, k: performance.now() });
      setBalance(r.balance); flash(r.won - bet0);
      setChips((c) => [{ k: performance.now(), label: r.v.toFixed(2), tone: (r.win ? (r.won / bet0 >= 3 ? "big" : "win") : "lose") as Chip["tone"] }, ...c].slice(0, 14));
      setPips((p) => [{ v: r.v, win: r.win, k: performance.now() }, ...p].slice(0, 8));
      celebrate({ mult: r.win ? r.won / bet0 : 0, won: r.won });
    };
    if (!reduced) raf.current = requestAnimationFrame(tick);
    const r = await diceRoll({ bet: bet0, target, over });
    if (!r.ok) {
      failed = true; setErr(r.error); play("error");
      if (reduced) setBusy(false);
      return;
    }
    result = { v: r.roll, win: r.win, won: r.won, balance: r.balance };
    if (reduced) { draw(r.roll, r.roll.toFixed(2)); finish(); }
  };

  const setT = (n: number) => {
    const v = Math.max(2, Math.min(98, Math.round(n)));
    if (v !== target) play("tick", { pitch: 0.7 + v / 120, vol: 0.5 });
    setTarget(v);
  };
  const swap = (o: boolean) => { if (o !== over) { setOver(o); play("click"); } };
  const state = roll ? (roll.win ? " win" : " lose") : "";
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="crypt" label="Dice" className="dc-machine" hud={<>
          <Readout label="Target" tone="gold">{over ? "Over" : "Under"} {target}</Readout>
          <Readout label="Chance">{chance}%</Readout>
          <Readout label="Payout">{mult.toFixed(2)}×</Readout>
          <ResultStrip items={chips} label="Recent rolls" />
        </>}>
          <div className={`dc-screen${state}${busy ? " rolling" : ""}`}>
            <div className="dc-readout">
              <span className="dc-cap">{busy ? "Rolling…" : roll ? (roll.win ? "Roll · win" : "Roll · miss") : "Roll"}</span>
              <span className={`dc-num${state}`} ref={numEl} aria-hidden="true" />
              <span className="visually-hidden" aria-live="polite">{roll ? `Rolled ${roll.v.toFixed(2)}. ${roll.win ? `You win ${fmt(roll.won)}.` : "No win."}` : ""}</span>
              <span className={`dc-verdict${roll ? state : " idle"}`} key={`v${roll?.k ?? 0}`}>
                {roll ? (roll.win ? <>Won <strong>+{fmt(roll.won)}</strong></> : <>Needed {over ? "over" : "under"} {target}</>) : <>Roll {over ? "over" : "under"} <strong>{target}</strong> to win {fmt(Math.floor(bet * mult))}</>}
              </span>
            </div>
            <div className="dc-slab">
              <div className="dc-lane">
                <span className={`dc-marker${state}${busy ? " live" : ""}`} ref={markerEl} aria-hidden="true">
                  <span className="dc-gem"><span ref={markerNum} /></span>
                </span>
              </div>
              <div className={`dc-track${over ? " over" : " under"}`} style={{ ["--t" as string]: `${target}%` }}>
                <span className="dc-zone lose" /><span className="dc-zone win" key={roll?.win ? roll.k : "z"} />
                <span className="dc-notches" aria-hidden="true" />
                {pips.map((p, i) => <span key={p.k} className={`dc-pip${p.win ? " win" : ""}`} style={{ left: `${p.v}%`, opacity: 1 - i * 0.11 }} aria-hidden="true" />)}
                <span className="dc-handle" aria-hidden="true"><span>{target}</span></span>
                <input type="range" min={2} max={98} step={1} value={target} disabled={busy} onChange={(e) => setT(Number(e.target.value))}
                  aria-label={`Target: roll ${over ? "over" : "under"}`} aria-valuetext={`${over ? "Over" : "Under"} ${target}, ${chance}% chance`} />
              </div>
              <div className="dc-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <div className="seg"><button type="button" aria-pressed={over} disabled={busy} onClick={() => swap(true)}>Roll over</button><button type="button" aria-pressed={!over} disabled={busy} onClick={() => swap(false)}>Roll under</button></div>
        <div className="dice-stats">
          <div><span className="micro muted">Win chance</span><strong>{chance}%</strong></div>
          <div><span className="micro muted">Payout</span><strong className="gold">{mult.toFixed(2)}×</strong></div>
          <div><span className="micro muted">Win</span><strong>{fmt(Math.floor(bet * mult))}</strong></div>
        </div>
        <button type="button" className="btn btn-primary btn-lg dc-go" onClick={go} disabled={!signedIn || busy}>{busy ? "Rolling…" : "Roll"}</button>
        {err && <p className="game-err" role="alert">{err}</p>}
        <p className="micro muted">Drag the rune or use the arrow keys to set your target.</p>
      </div>
    </div>
  );
}
