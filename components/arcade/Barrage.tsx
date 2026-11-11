"use client";
// Arcane Barrage: arcane orbs flare up and fade. Pop as many as you can in 30 seconds. Score = orbs popped.
// Orbs with an inner glow and a shrinking timer ring in the void cabinet; pops burst into sparks, the combo
// climbs a pitch ladder, and misses fizzle. Per-frame fading is written straight to the DOM, not React state.
import { useEffect, useRef, useState } from "react";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps, type SkillResult } from "./SkillKit";

const TIME = 30;
type Orb = { id: number; x: number; y: number; born: number; life: number; size: number };
type Burst = { id: number; x: number; y: number; text: string; big: boolean; parts: [number, number][] };
type Miss = { id: number; x: number; y: number };

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

export function Barrage({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("barrage", best0, leftToday0);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [fizz, setFizz] = useState<Miss[]>([]);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [left, setLeft] = useState(TIME);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [run, setRun] = useState(0);
  const scoreRef = useRef(0), comboRef = useRef(0), seq = useRef(0), t0 = useRef(0), fx = useRef(0);
  const orbsRef = useRef<Orb[]>([]);
  const nodes = useRef(new Map<number, HTMLButtonElement>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const chips = useRunMoments(sk.result, (r) => `${r.score}`);

  const breakCombo = () => {
    if (comboRef.current >= 5) play("thud", { pitch: 0.8, vol: 0.4 });
    comboRef.current = 0; setCombo(0);
  };

  useEffect(() => {
    if (state !== "on") return;
    let raf = 0, next = 0, shown = TIME;
    const loop = (t: number) => {
      const el = (t - t0.current) / 1000;
      const l = Math.max(0, Math.ceil(TIME - el));
      if (l !== shown) { shown = l; setLeft(l); if (l <= 5 && l > 0) play("tick", { pitch: 1 + (5 - l) * 0.12 }); }
      if (el >= TIME) { setState("done"); orbsRef.current = []; setOrbs([]); play("stop"); void sk.end(scoreRef.current); return; }
      const before = orbsRef.current;
      let n = before.filter((o) => t - o.born < o.life);
      let changed = n.length !== before.length;
      if (changed) breakCombo(); // an orb faded away unpopped
      if (t >= next && n.length < 4) {
        const size = Math.max(34, 70 - el * 1.2);
        n = [...n, { id: ++seq.current, x: 8 + Math.random() * 84, y: 10 + Math.random() * 80, born: t, life: Math.max(700, 1500 - el * 22), size }];
        next = t + Math.max(260, 650 - el * 12);
        changed = true;
        play("peg", { pitch: 1.5, vol: 0.22 });
      }
      if (changed) { orbsRef.current = n; setOrbs(n); }
      // fade, shrink and run down each orb's timer ring without re-rendering
      for (const o of n) {
        const node = nodes.current.get(o.id); if (!node) continue;
        const k = Math.min(1, (t - o.born) / o.life);
        node.style.opacity = String(1 - k * 0.7);
        node.style.transform = `translate(-50%,-50%) scale(${1 - k * 0.45})`;
        node.style.setProperty("--k", String(k));
        node.classList.toggle("late", k > 0.66);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = () => {
    scoreRef.current = 0; comboRef.current = 0; setScore(0); setMisses(0); setCombo(0); setBestCombo(0);
    orbsRef.current = []; setOrbs([]); setBursts([]); setFizz([]); setLeft(TIME); setRun((r) => r + 1);
    t0.current = performance.now(); setState("on"); sk.begin(); play("launch", { vol: 0.45 });
  };

  const pop = (o: Orb) => {
    scoreRef.current += 1; setScore(scoreRef.current);
    orbsRef.current = orbsRef.current.filter((x) => x.id !== o.id); setOrbs(orbsRef.current);
    const c = comboRef.current + 1; comboRef.current = c; setCombo(c); setBestCombo((b) => Math.max(b, c));
    const big = c % 10 === 0;
    play("gem", { pitch: ladder(Math.min(12, c - 1)) });
    play("thud", { pitch: 2.2, vol: 0.25 });
    if (big) play("coin", { pitch: 1 + Math.min(3, c / 10) * 0.1 });
    buzz("tap");
    const parts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i * 36 + Math.random() * 24, 34 + Math.random() * 30]);
    const id = ++fx.current;
    setBursts((p) => [...p, { id, x: o.x, y: o.y, text: big ? `Surge ×${c}!` : c >= 3 ? `×${c}` : "+1", big, parts }]);
    later(() => setBursts((p) => p.filter((x) => x.id !== id)), 650);
  };

  const miss = (e: React.PointerEvent<HTMLDivElement>) => {
    if (state !== "on" || e.target !== e.currentTarget) return;
    setMisses((m) => m + 1);
    breakCombo();
    play("tick", { pitch: 0.45, vol: 0.6 });
    const r = e.currentTarget.getBoundingClientRect();
    const id = ++fx.current;
    setFizz((f) => [...f, { id, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }]);
    later(() => setFizz((f) => f.filter((x) => x.id !== id)), 420);
  };

  const acc = score + misses ? Math.round((score / (score + misses)) * 100) : 100;
  const urgent = state === "on" && left <= 5;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage ab-stage">
        <Machine theme="void" label="Arcane Barrage" className="ab-machine" hud={<>
          <Readout label="Time" tone={urgent ? "lose" : undefined}>{left}s</Readout>
          <Readout label="Hits" tone="gold"><span key={score} className="ab-bump"><CountUp value={score} duration={240} /></span></Readout>
          <Readout label="Combo" tone={combo >= 10 ? "win" : undefined}>×{combo}</Readout>
          <Readout label="Accuracy" tone={acc < 70 ? "lose" : undefined}>{acc}%</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div className={`ab-arena${state === "on" ? " on" : ""}`} onPointerDown={miss}>
            <span className="ab-sigil" aria-hidden="true" />
            {state === "on" && <span key={run} className="ab-time" aria-hidden="true" />}
            <span className={`ab-combo${combo >= 10 ? " hot" : combo >= 5 ? " warm" : ""}`} aria-hidden="true">
              <span key={combo} className="ab-combo-n">×{combo}</span><span className="ab-combo-l">combo</span>
            </span>
            {orbs.map((o) => (
              <button key={o.id} type="button" className="ab-orb" aria-label="Arcane orb"
                ref={(el) => { if (el) nodes.current.set(o.id, el); else nodes.current.delete(o.id); }}
                style={{ left: `${o.x}%`, top: `${o.y}%`, width: o.size, height: o.size }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pop(o); }}>
                <span className="ab-core" />
                <svg className="ab-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" className="ab-track" /><circle cx="20" cy="20" r="18" pathLength={100} className="ab-timer" /></svg>
              </button>
            ))}
            {bursts.map((b) => (
              <span key={b.id} className={`ab-burst${b.big ? " big" : ""}`} style={{ left: `${b.x}%`, top: `${b.y}%` }} aria-hidden="true">
                <span className="ab-wave" />
                {b.parts.map(([a, d], i) => <span key={i} className="ab-spark" style={{ ["--a" as string]: `${a}deg`, ["--d" as string]: `${d}px` }} />)}
                <span className="ab-plus">{b.text}</span>
              </span>
            ))}
            {fizz.map((f) => <span key={f.id} className="ab-fizz" style={{ left: `${f.x}%`, top: `${f.y}%` }} aria-hidden="true" />)}
          </div>
          {state === "ready" && (
            <SkillOverlay>
              <span className="ab-ov-orb" aria-hidden="true"><span className="ab-core" /></span>
              <strong className="snake-big">Arcane Barrage</strong>
              <span className="soft">Pop the arcane orbs before they fade. 30 seconds.</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Channel</button>
            </SkillOverlay>
          )}
          {state === "done" && (
            <SkillOverlay>
              <strong className="snake-big">Mana spent</strong>
              <div className="ab-final"><strong><CountUp value={score} from={0} duration={900} /></strong><span>hits</span></div>
              <span className="micro muted">{acc}% accuracy · best combo ×{bestCombo}</span>
              <SkillResultLine game="barrage" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Again</button>
            </SkillOverlay>
          )}
        </Machine>
      </div>
      <SkillPanel game="barrage" how={<>Orbs appear around the arena, shrink and fade. Click or tap each one before it&apos;s gone. They get smaller and quicker as the 30 seconds run down. Your score is orbs popped.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
