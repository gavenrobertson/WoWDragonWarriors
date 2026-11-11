"use client";
// Murloc Mayhem: murlocs pop out of the pools for 30 seconds. Bonk them (+1); leave the whelps alone (-3).
// Pools with rippling water in the forest cabinet; murlocs squash-and-stretch up and duck back down,
// bonks land with an impact star and a pitch ladder while the combo grows, whelps glow red.
import { useCallback, useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps, type SkillResult } from "./SkillKit";

const HOLES = 9, TIME = 30;
type Kind = "murloc" | "whelp";
type Pop = { kind: Kind; id: number; until: number } | null;
type Gone = { kind: Kind; id: number; mode: "duck" | "bonk" | "oops" };
type Hit = { id: number; text: string; bad: boolean; big: boolean };
const ICON: Record<Kind, string> = { murloc: "inv_misc_head_murloc_01", whelp: "inv_misc_head_dragon_red" };
const CRIES = ["Mrgl!", "Mrglglgl!", "Mrrrgll!", "Rwlrwlrwl!", "Mmmrrrggglll!"];
// numpad layout: 7 8 9 / 4 5 6 / 1 2 3
const NUMPAD: Record<string, number> = { "7": 0, "8": 1, "9": 2, "4": 3, "5": 4, "6": 5, "1": 6, "2": 7, "3": 8 };

/** Session-only chips and a win moment whenever a run's result comes back from the server. */
function useRunMoments(result: SkillResult | null, label: (r: SkillResult) => string) {
  const [chips, setChips] = useState<Chip[]>([]);
  const seen = useRef<SkillResult | null>(null), n = useRef(0);
  useEffect(() => {
    if (!result || seen.current === result) return;
    seen.current = result;
    if (result.earned > 0) celebrate({ mult: 2, won: result.earned });
    else play(result.newBest ? "win" : "reveal");
    const tone: Chip["tone"] = result.newBest ? "big" : result.earned > 0 ? "win" : "neutral";
    setChips((c) => [{ k: ++n.current, label: label(result), tone }, ...c].slice(0, 14));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  return chips;
}

export function Murloc({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("murloc", best0, leftToday0);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [holes, setHoles] = useState<Pop[]>(Array(HOLES).fill(null));
  const [gone, setGone] = useState<Record<number, Gone>>({});
  const [hit, setHit] = useState<Record<number, Hit>>({});
  const [splash, setSplash] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(TIME);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState({ bestCombo: 0, whelps: 0, escaped: 0 });
  const scoreRef = useRef(0), comboRef = useRef(0);
  const t0 = useRef(0), seq = useRef(0);
  const holesRef = useRef<Pop[]>(holes);
  const grid = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const chips = useRunMoments(sk.result, (r) => `${r.score}`);

  const depart = (i: number, g: Gone, ms: number) => {
    setGone((x) => ({ ...x, [i]: g }));
    later(() => setGone((x) => { if (x[i]?.id !== g.id) return x; const n = { ...x }; delete n[i]; return n; }), ms);
  };

  useEffect(() => {
    if (state !== "on") return;
    let raf = 0, nextPop = 0, shown = TIME;
    const loop = (now: number) => {
      const el = (now - t0.current) / 1000;
      const l = Math.max(0, Math.ceil(TIME - el));
      if (l !== shown) { shown = l; setLeft(l); if (l <= 5 && l > 0) play("tick", { pitch: 1 + (5 - l) * 0.12 }); }
      if (el >= TIME) {
        setState("done"); holesRef.current = Array(HOLES).fill(null); setHoles(holesRef.current); setGone({});
        play("stop"); void sk.end(scoreRef.current); return;
      }
      let hs = holesRef.current, changed = false;
      for (let i = 0; i < HOLES; i++) {
        const h = hs[i];
        if (h && h.until < now) {
          if (!changed) { hs = [...hs]; changed = true; }
          hs[i] = null;
          depart(i, { kind: h.kind, id: h.id, mode: "duck" }, 220);
          if (h.kind === "murloc") {
            setStats((s) => ({ ...s, escaped: s.escaped + 1 }));
            if (comboRef.current >= 3) play("whoosh", { vol: 0.35 });
            comboRef.current = 0; setCombo(0);
          }
        }
      }
      if (now >= nextPop) {
        const speed = 1 + el / 18; // they get quicker
        const free = hs.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
        if (free.length) {
          const i = free[Math.floor(Math.random() * free.length)];
          if (!changed) { hs = [...hs]; changed = true; }
          hs[i] = { kind: Math.random() < 0.16 ? "whelp" : "murloc", id: ++seq.current, until: now + (650 + Math.random() * 500) / speed };
          play("peg", { pitch: 0.5, vol: 0.45 });
        }
        nextPop = now + (380 + Math.random() * 420) / speed;
      }
      if (changed) { holesRef.current = hs; setHoles(hs); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const bonk = useCallback((i: number) => {
    if (state !== "on") return;
    const h = holesRef.current[i];
    if (!h) {
      // a splash in an empty pool
      setSplash((x) => ({ ...x, [i]: (x[i] ?? 0) + 1 }));
      play("whoosh", { vol: 0.22 });
      return;
    }
    holesRef.current = holesRef.current.map((x, j) => (j === i ? null : x));
    setHoles(holesRef.current);
    const good = h.kind === "murloc", d = good ? 1 : -3;
    scoreRef.current = Math.max(0, scoreRef.current + d); setScore(scoreRef.current);
    let text: string, big = false;
    if (good) {
      const c = comboRef.current + 1; comboRef.current = c; setCombo(c);
      setStats((s) => ({ ...s, bestCombo: Math.max(s.bestCombo, c) }));
      play("thud", { pitch: 1.2, vol: 0.55 });
      play("gem", { pitch: 0.6 * ladder(Math.min(12, c - 1)) });
      buzz("tap");
      big = c > 0 && c % 5 === 0;
      if (big) play("coin", { pitch: 0.8 + Math.min(4, c / 5) * 0.12 });
      text = big ? `Combo ×${c}!` : CRIES[(h.id * 7) % CRIES.length];
    } else {
      comboRef.current = 0; setCombo(0);
      setStats((s) => ({ ...s, whelps: s.whelps + 1 }));
      play("error"); play("thud", { pitch: 0.7, vol: 0.7 }); buzz("fail");
      text = "Ouch! −3";
      if (grid.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        grid.current.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }], { duration: 200, easing: "ease-out" });
      }
    }
    depart(i, { kind: h.kind, id: h.id, mode: good ? "bonk" : "oops" }, 320);
    setHit((x) => ({ ...x, [i]: { id: h.id, text, bad: !good, big } }));
    later(() => setHit((x) => { if (x[i]?.id !== h.id) return x; const n = { ...x }; delete n[i]; return n; }), 620);
  }, [state]);

  const bonkRef = useRef(bonk); bonkRef.current = bonk;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const i = NUMPAD[e.key]; if (i !== undefined) { e.preventDefault(); bonkRef.current(i); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = () => {
    scoreRef.current = 0; comboRef.current = 0; setScore(0); setCombo(0); setStats({ bestCombo: 0, whelps: 0, escaped: 0 });
    setLeft(TIME); holesRef.current = Array(HOLES).fill(null); setHoles(holesRef.current); setGone({}); setHit({});
    t0.current = performance.now(); setState("on"); sk.begin(); play("launch", { vol: 0.5 });
  };

  const meter = Math.min(1, combo / 20);
  const urgent = state === "on" && left <= 5;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage ml-stage">
        <Machine theme="forest" label="Murloc Mayhem" className="ml-machine" hud={<>
          <Readout label="Time" tone={urgent ? "lose" : undefined}>{left}s</Readout>
          <Readout label="Bonks" tone="gold"><span key={score} className="ml-bump"><CountUp value={score} duration={260} /></span></Readout>
          <Readout label="Combo" tone={combo >= 5 ? "win" : undefined}>×{combo}</Readout>
          <Readout label="Best">{sk.best || "—"}</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div className={`ml-field${state === "on" ? " on" : ""}`}>
            <div className={`ml-meter${combo >= 5 ? " hot" : ""}${combo >= 10 ? " blaze" : ""}`} aria-hidden="true">
              <span className="ml-meter-l">Mrgl-o-meter</span>
              <span className="ml-meter-bar"><span style={{ width: `${meter * 100}%` }} /><i style={{ left: "25%" }} /><i style={{ left: "50%" }} /></span>
              <span key={combo} className="ml-meter-n">×{combo}</span>
            </div>
            <div className="ml-grid" ref={grid}>
              {holes.map((h, i) => {
                const g = gone[i], x = hit[i];
                return (
                  <button key={i} type="button" className={`ml-hole${h ? ` up ${h.kind}` : ""}`} style={{ ["--i" as string]: i }}
                    onPointerDown={(e) => { e.preventDefault(); bonk(i); }}
                    aria-label={h ? (h.kind === "murloc" ? "Murloc! Bonk it" : "Whelp, leave it") : "Empty pool"}>
                    <span className="ml-pool"><span className="ml-ripple" /><span className="ml-ripple b" />
                      {splash[i] ? <span key={splash[i]} className="ml-splash" /> : null}
                      {h ? <span key={`s${h.id}`} className="ml-splash up" /> : null}
                    </span>
                    <span className="ml-pit">
                      {g && <span key={`g${g.id}`} className={`ml-mob ${g.kind} out-${g.mode}`}><img src={wowIconUrl(ICON[g.kind], 56)} alt="" /></span>}
                      {h && <span key={h.id} className={`ml-mob ${h.kind}`}><img src={wowIconUrl(ICON[h.kind], 56)} alt="" />{h.kind === "whelp" && <span className="ml-warn">!</span>}</span>}
                    </span>
                    <span className="ml-lip" />
                    {x && (
                      <span key={x.id} className={`ml-hit${x.bad ? " bad" : ""}${x.big ? " big" : ""}`}>
                        <span className="ml-star" /><span className="ml-cry">{x.text}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {state === "ready" && (
            <SkillOverlay>
              <img className="ml-ov-icon" src={wowIconUrl(ICON.murloc, 56)} alt="" width={64} height={64} />
              <strong className="snake-big">Murloc Mayhem</strong>
              <span className="soft">Bonk every murloc that pops up. Don&apos;t bonk the baby whelps.</span>
              <span className="ml-legend"><span><img src={wowIconUrl(ICON.murloc, 36)} alt="" width={28} height={28} /> +1</span><span className="bad"><img src={wowIconUrl(ICON.whelp, 36)} alt="" width={28} height={28} /> −3</span></span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
            </SkillOverlay>
          )}
          {state === "done" && (
            <SkillOverlay>
              <img className="ml-ov-icon bob" src={wowIconUrl(ICON.murloc, 56)} alt="" width={64} height={64} />
              <strong className="snake-big">Mrglglgl!</strong>
              <div className="ml-final"><strong><CountUp value={score} from={0} duration={900} /></strong><span>bonks</span></div>
              <span className="micro muted">Best combo ×{stats.bestCombo} · {stats.whelps} whelp{stats.whelps === 1 ? "" : "s"} bonked · {stats.escaped} got away</span>
              <SkillResultLine game="murloc" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Play again</button>
            </SkillOverlay>
          )}
        </Machine>
      </div>
      <SkillPanel game="murloc" how={<>Murlocs pop out of the pools for 30 seconds. Click or tap each one for a point (or use the number pad, 7 to 3). Whelps cost you 3, so look before you bonk. They get faster as time runs down.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
