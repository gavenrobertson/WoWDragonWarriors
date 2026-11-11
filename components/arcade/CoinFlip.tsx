"use client";
// Faction Flip: call Alliance or Horde and toss a real 3D coin. It leaves your hand the moment you click,
// spins on a parabola (~1500°/s), hangs spinning at the top if the server is still deciding, then its final
// spin is bent so it lands on the right face, with a little bounce. The shadow shrinks while it's airborne.
// Per-frame transforms are written to the DOM from one rAF loop.
import { useEffect, useRef, useState } from "react";
import { coinFlip } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { ladder, play, unlockAudio } from "./sfx";

type Side = "alliance" | "horde";
const SPIN = 1.5; // degrees per ms
const T_UP = 470, T_DOWN = 540;
const EDGE_LAYERS = 12;
const NAME: Record<Side, string> = { alliance: "Alliance", horde: "Horde" };

export function CoinFlip() {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(100);
  const [side, setSide] = useState<Side>("alliance");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ landed: Side; win: boolean; won: number; k: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [tally, setTally] = useState({ alliance: 0, horde: 0 });
  const [chips, setChips] = useState<Chip[]>([]);
  const arena = useRef<HTMLDivElement>(null);
  const toss = useRef<HTMLDivElement>(null);
  const coin = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const angle = useRef(0);
  const raf = useRef(0);
  const streakRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // place the coin: height above the ground (px), its spin, and an optional wobble
  const pose = (h: number, a: number, H: number, wob = 0) => {
    angle.current = a;
    const k = H ? Math.max(0, h) / H : 0;
    if (toss.current) toss.current.style.transform = `translateY(${-h}px) scale(${1 + k * 0.14})`;
    if (coin.current) coin.current.style.transform = `rotateX(${a}deg) rotateY(${wob}deg)`;
    if (shadow.current) { shadow.current.style.transform = `translateX(-50%) scale(${1 - k * 0.6})`; shadow.current.style.opacity = `${0.75 - k * 0.5}`; }
  };

  const flip = async () => {
    if (busy || !signedIn) return;
    unlockAudio();
    setBusy(true); setErr(null); setRes(null);
    const call = side, bet0 = bet;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const H = Math.max(80, (arena.current?.clientHeight ?? 340) * 0.3);
    let result: { landed: Side; win: boolean; won: number; balance: number } | null = null, failed = false;
    play("whoosh", { vol: 0.7 }); play("flip");
    const a0 = angle.current, t0 = performance.now();
    let apexAt = 0, downAt = 0, fromA = 0, toA = 0, landAt = 0, lastTurn = Math.floor(a0 / 360);
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const e = t - t0;
      if (!downAt) {
        // rising, then hanging at the top while we wait
        const a = a0 + e * SPIN;
        const turn = Math.floor(a / 360);
        if (turn !== lastTurn) { lastTurn = turn; play("tick", { pitch: 1.6, vol: 0.4 }); }
        let h: number;
        if (e < T_UP) { const f = e / T_UP; h = H * (1 - (1 - f) * (1 - f)); }
        else { if (!apexAt) apexAt = t; h = H + Math.sin((t - apexAt) / 160) * 5 - 2.5 * Math.min(1, (t - apexAt) / 200); }
        pose(h, a, H);
        if (e >= T_UP && (result || failed)) {
          downAt = t; fromA = a;
          const face = !result ? 0 : result.landed === "alliance" ? 0 : 180;
          // the final spin is bent so it lands exactly on the right face
          toA = Math.ceil((fromA + 620 - face) / 360) * 360 + face;
          if (failed) toA = Math.ceil((fromA + 620) / 360) * 360 + (((a0 % 360) + 360) % 360);
        }
        raf.current = requestAnimationFrame(tick);
        return;
      }
      if (!landAt) {
        const f = Math.min(1, (t - downAt) / T_DOWN);
        const hNow = H * (1 - f * f);
        const a = fromA + (toA - fromA) * (1 - Math.pow(1 - f, 2.2));
        pose(hNow, a, H);
        if (f < 1) { raf.current = requestAnimationFrame(tick); return; }
        landAt = t; play("thud", { pitch: 1.3 }); play("coin", { vol: 0.8 });
        raf.current = requestAnimationFrame(tick);
        return;
      }
      // two little bounces with a damped wobble, then settle
      const b = t - landAt;
      const hop = (s: number, d: number, hgt: number) => { const f = (b - s) / d; return f >= 0 && f <= 1 ? hgt * 4 * f * (1 - f) : 0; };
      const h = hop(0, 250, 20) + hop(250, 160, 6);
      const wob = Math.sin(b / 38) * 14 * Math.exp(-b / 160);
      pose(h, toA, H, wob);
      if (b > 250 && b < 270) play("coin", { vol: 0.4, pitch: 1.1 });
      if (b < 430) { raf.current = requestAnimationFrame(tick); return; }
      pose(0, toA, H);
      finish();
    };
    const finish = () => {
      setBusy(false);
      if (!result) return;
      const r = result;
      const s = r.win ? streakRef.current + 1 : 0;
      streakRef.current = s;
      setStreak(s);
      setRes({ landed: r.landed, win: r.win, won: r.won, k: performance.now() });
      setTally((tl) => ({ ...tl, [r.landed]: tl[r.landed] + 1 }));
      setBalance(r.balance); flash(r.won - bet0);
      setChips((c) => [{ k: performance.now(), label: r.landed === "alliance" ? "Ally" : "Horde", tone: (r.win ? "win" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
      celebrate({ mult: r.win ? r.won / bet0 : 0, won: r.won });
      if (r.win && s >= 2) setTimeout(() => play("gem", { pitch: ladder(s - 1) }), 380);
    };
    if (!reduced) raf.current = requestAnimationFrame(tick);
    const r = await coinFlip({ bet: bet0, side: call });
    if (!r.ok) { failed = true; setErr(r.error); play("error"); if (reduced) setBusy(false); return; }
    result = { landed: r.landed as Side, win: r.win, won: r.won, balance: r.balance };
    if (reduced) { pose(0, r.landed === "alliance" ? 0 : 180, H); finish(); }
  };

  const pick = (s: Side) => { if (busy || s === side) return; setSide(s); play("click"); };
  const state = res ? (res.win ? " win" : " lose") : "";
  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="hoard" label="Faction Flip" className="cf-machine" hud={<>
          <Readout label="Your call" tone="gold">{NAME[side]}</Readout>
          <Readout label="Streak" tone={streak >= 2 ? "win" : undefined}>{streak ? `${streak} win${streak > 1 ? "s" : ""}` : "—"}</Readout>
          <Readout label="Tally">A {tally.alliance} · H {tally.horde}</Readout>
          <ResultStrip items={chips} label="Recent flips" />
        </>}>
          <div className={`cf-screen call-${side}${state}${res ? ` landed-${res.landed}` : ""}${busy ? " flying" : ""}`} ref={arena}>
            <button type="button" className="cf-banner alliance" aria-pressed={side === "alliance"} disabled={busy} onClick={() => pick("alliance")} aria-label="Call Alliance">
              <img src={wowIconUrl("achievement_pvp_a_a")} alt="" width={56} height={56} /><span>Alliance</span>
            </button>
            <button type="button" className="cf-banner horde" aria-pressed={side === "horde"} disabled={busy} onClick={() => pick("horde")} aria-label="Call Horde">
              <img src={wowIconUrl("achievement_pvp_h_h")} alt="" width={56} height={56} /><span>Horde</span>
            </button>
            <div className="cf-arena">
              <span className="cf-shadow" ref={shadow} aria-hidden="true" />
              <div className="cf-toss" ref={toss}>
                <div className="cf-coin" ref={coin} aria-hidden="true">
                  {Array.from({ length: EDGE_LAYERS }, (_, i) => <span key={i} className="cf-edge" style={{ transform: `translateZ(${(i - (EDGE_LAYERS - 1) / 2) * 1.15}px)` }} />)}
                  <Face side="alliance" />
                  <Face side="horde" />
                </div>
              </div>
            </div>
            <div className="cf-verdict" aria-live="polite" key={res?.k ?? 0}>
              {busy ? <span className="cf-wait">The coin is in the air…</span>
                : res ? (res.win ? <><strong>{res.landed === "alliance" ? "For the Alliance!" : "For the Horde!"}</strong><span>+{fmt(res.won)}</span></>
                  : <><strong>{NAME[res.landed]} wins the toss</strong><span>Lost {fmt(bet)}</span></>)
                  : <span className="cf-wait">Call it, then flip · pays 1.94×</span>}
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <div className="seg faction">
          <button type="button" aria-pressed={side === "alliance"} onClick={() => pick("alliance")} disabled={busy}>Alliance</button>
          <button type="button" aria-pressed={side === "horde"} onClick={() => pick("horde")} disabled={busy}>Horde</button>
        </div>
        <button type="button" className="btn btn-primary btn-lg cf-go" onClick={flip} disabled={!signedIn || busy}>{busy ? "Flipping…" : `Flip · win ${fmt(Math.floor(bet * 1.94))}`}</button>
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}

function Face({ side }: { side: Side }) {
  const id = `cf-arc-${side}`;
  return (
    <div className={`cf-face ${side}`}>
      <svg viewBox="0 0 200 200" className="cf-ring" aria-hidden="true">
        <defs><path id={id} d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0" /></defs>
        <circle cx="100" cy="100" r="96" className="cf-rim" />
        <circle cx="100" cy="100" r="86" className="cf-band" />
        <text className="cf-legend"><textPath href={`#${id}`} startOffset="0" textLength="470" lengthAdjust="spacing">{side === "alliance" ? "FOR THE ALLIANCE ✦ FOR THE ALLIANCE ✦" : "FOR THE HORDE ✦ FOR THE HORDE ✦ FOR THE HORDE ✦"}</textPath></text>
        <circle cx="100" cy="100" r="64" className="cf-field" />
      </svg>
      <img src={wowIconUrl(side === "alliance" ? "achievement_pvp_a_a" : "achievement_pvp_h_h")} alt="" />
    </div>
  );
}
