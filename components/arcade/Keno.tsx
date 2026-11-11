"use client";
// Rune Keno: pick up to 10 of 40 runestones, then the rune drum winds up and ten runes are drawn one by one.
// Hits flare gold and climb in pitch; the paytable ladder for your pick count lights up live as hits land.
import { useEffect, useRef, useState } from "react";
import { kenoPlay } from "@/app/arcade/actions";
import { BetInput, fmt, useArcade } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ";
const STEP = 170;   // ms between drawn runes
const WIND = 700;   // the drum's wind-up before the first rune
const rune = (n: number) => RUNES[n - 1];
const fmtX = (m: number) => (m >= 100 ? `${Math.round(m).toLocaleString("en-US")}×` : `${m}×`);

export function Keno({ pays }: { pays: Record<number, Record<number, number>> }) {
  const { signedIn, setBalance, flash } = useArcade();
  const [bet, setBet] = useState(50);
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [winding, setWinding] = useState(false);
  const [done, setDone] = useState<{ hits: number; mult: number; won: number } | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [chips, setChips] = useState<Chip[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => { const tm = timers.current; return () => tm.forEach(clearTimeout); }, []);
  const later = (f: () => void, ms: number) => timers.current.push(setTimeout(f, ms));

  const reset = () => { setDrawn([]); setDone(null); setErr(null); };
  const toggle = (n: number) => {
    if (busy) return;
    reset();
    const has = picks.includes(n);
    if (!has && picks.length >= 10) { play("error"); return; }
    play("click", { pitch: has ? 0.8 : 1 + picks.length * 0.06 });
    setPicks(has ? picks.filter((x) => x !== n) : [...picks, n]);
  };
  const quick = (count: number) => {
    if (busy) return;
    const s = new Set<number>();
    while (s.size < count) s.add(1 + Math.floor(Math.random() * 40));
    setPicks([...s]); reset(); play("reveal");
  };

  const draw = async () => {
    if (busy || !picks.length) return;
    setBusy(true); reset();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) { setWinding(true); play("spin"); }
    const t0 = performance.now();
    const r = await kenoPlay({ bet, picks });
    if (!r.ok) { setBusy(false); setWinding(false); play("error"); return setErr(r.error); }
    const wait = reduced ? 0 : Math.max(0, WIND - (performance.now() - t0));
    const mine = new Set(picks);
    const settle = () => {
      setBusy(false); setDone({ hits: r.hits, mult: r.mult, won: r.won });
      setBalance(r.balance); flash(r.won - bet); setLastWin(r.won);
      celebrate({ mult: r.won > 0 ? r.won / bet : 0, won: r.won });
      setChips((c) => [{ k: `${Date.now()}`, label: `${r.hits}/${picks.length}`, tone: (r.mult >= 10 ? "big" : r.mult > 1 ? "win" : r.won ? "neutral" : "lose") as Chip["tone"] }, ...c].slice(0, 14));
    };
    if (reduced) { setDrawn(r.drawn); settle(); return; }
    later(() => {
      setWinding(false);
      let hits = 0;
      r.drawn.forEach((n, i) => later(() => {
        const hit = mine.has(n);
        if (hit) { hits++; play("gem", { pitch: ladder(hits * 2) }); buzz("tap"); }
        else play("flip", { pitch: 1 + i * 0.05 });
        setDrawn(r.drawn.slice(0, i + 1));
      }, i * STEP));
      later(settle, r.drawn.length * STEP + 260);
    }, wait);
  };

  const table = pays[picks.length] ?? {};
  const rows = Object.entries(table).map(([h, m]) => ({ h: Number(h), m }));
  const drawnSet = new Set(drawn);
  const hitsNow = picks.filter((p) => drawnSet.has(p)).length;
  const current = drawn.length ? drawn[drawn.length - 1] : null;
  const curHit = current !== null && picks.includes(current);
  const top = rows.length ? rows[rows.length - 1].m : 0;

  return (
    <div className="game-layout">
      <div className="game-stage">
        <Machine theme="arcane" label="Rune Keno" hud={<>
          <Readout label="Picked" tone="gold">{picks.length}/10</Readout>
          <Readout label="Hits" tone={hitsNow ? "win" : undefined}>{hitsNow}</Readout>
          <Readout label="Last win" tone={lastWin ? "win" : undefined}><CountUp value={lastWin} /></Readout>
          <ResultStrip items={chips} label="Recent draws" />
        </>}>
          <div className={`kn-wrap${busy ? " drawing" : ""}${done ? (done.won > 0 ? " won" : " lost") : ""}`}>
            <div className="kn-head">
              <div className={`kn-orb${winding ? " winding" : ""}${curHit ? " hit" : ""}`} aria-hidden="true">
                <span className="kn-orb-swirl" />
                {current !== null && !winding
                  ? <span key={drawn.length} className="kn-orb-rune"><b>{rune(current)}</b><small>{current}</small></span>
                  : <span className="kn-orb-rune idle"><b>{winding ? "✦" : "ᛟ"}</b></span>}
              </div>
              <div className="kn-tray" role="list" aria-label="Drawn runes">
                {Array.from({ length: 10 }, (_, i) => {
                  const n = drawn[i];
                  return (
                    <span key={i} role="listitem" className={`kn-slot${n !== undefined ? (picks.includes(n) ? " hit" : " in") : ""}`} aria-label={n !== undefined ? `Rune ${n}${picks.includes(n) ? ", a hit" : ""}` : "Not drawn yet"}>
                      {n !== undefined ? <><b>{rune(n)}</b><small>{n}</small></> : null}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className={`kn-board${done && done.won > 0 ? " shudder" : ""}`} role="group" aria-label="Runes">
              {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => {
                const picked = picks.includes(n), isDrawn = drawnSet.has(n);
                const cls = picked && isDrawn ? " hit" : isDrawn ? " drawn" : picked && done ? " dud" : picked ? " picked" : "";
                return (
                  <button key={n} type="button" className={`kn-cell${cls}`} onClick={() => toggle(n)} disabled={busy} aria-pressed={picked}
                    aria-label={`Rune ${n}${isDrawn ? (picked ? ", drawn: a hit" : ", drawn") : ""}`}>
                    <span className="kn-glyph" aria-hidden="true">{rune(n)}</span><span className="kn-n">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="kn-ladder" role="table" aria-label={`Paytable for ${picks.length} picks`}>
              {rows.length ? rows.map(({ h, m }) => {
                const live = drawn.length > 0 && hitsNow === h, got = !!done && done.hits === h && done.won > 0;
                return (
                  <span key={h} role="row" className={`kn-rung${live ? " live" : ""}${got ? " got" : ""}`}>
                    <span role="cell" className="kn-rung-h">{h} hit{h === 1 ? "" : "s"}</span>
                    <strong role="cell">{fmtX(m)}</strong>
                  </span>
                );
              }) : <span className="kn-ladder-empty">Pick 1 to 10 runes to see what they pay</span>}
            </div>
          </div>
        </Machine>
      </div>
      <div className="game-controls panel">
        <BetInput value={bet} onChange={setBet} disabled={busy} />
        <div className="field">Quick pick
          <div className="seg">{[3, 5, 8, 10].map((c) => <button key={c} type="button" disabled={busy} onClick={() => quick(c)}>{c}</button>)}</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => { setPicks([]); reset(); play("click", { pitch: 0.7 }); }} disabled={busy || !picks.length}>Clear picks</button>
        <button type="button" className="btn btn-primary btn-lg" onClick={draw} disabled={!signedIn || busy || !picks.length}>
          {busy ? "Drawing…" : picks.length ? `Draw · ${picks.length} rune${picks.length === 1 ? "" : "s"}` : "Pick some runes"}
        </button>
        {done && <p className={done.won > 0 ? "game-win" : "game-err"} role="status">{done.won > 0 ? `${done.hits} hits · ${fmtX(done.mult)} · won ${fmt(done.won)}` : `${done.hits} hit${done.hits === 1 ? "" : "s"}. No prize this time.`}</p>}
        {err && <p className="game-err" role="alert">{err}</p>}
        {top > 0 && <p className="micro muted">Top prize for {picks.length} pick{picks.length === 1 ? "" : "s"}: <strong className="gold">{fmtX(top)}</strong> ({fmt(Math.floor(bet * top))} marks).</p>}
        <p className="micro muted">Pick up to 10 of 40 runes. Ten are drawn; the more you match, the bigger the prize.</p>
      </div>
    </div>
  );
}
