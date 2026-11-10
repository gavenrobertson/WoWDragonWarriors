"use client";
// Arcane Barrage: arcane orbs flare up and fade. Pop as many as you can in 30 seconds. Score = orbs popped.
import { useEffect, useRef, useState } from "react";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const TIME = 30;
type Orb = { id: number; x: number; y: number; born: number; life: number; size: number };

export function Barrage({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("barrage", best0, leftToday0);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const [pops, setPops] = useState<{ id: number; x: number; y: number }[]>([]);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [left, setLeft] = useState(TIME);
  const scoreRef = useRef(0), seq = useRef(0), t0 = useRef(0);
  const [now, setNow] = useState(0);
  const orbsRef = useRef<Orb[]>([]);

  useEffect(() => {
    if (state !== "on") return;
    let raf = 0, next = 0;
    const loop = (t: number) => {
      const el = (t - t0.current) / 1000;
      setNow(t); setLeft(Math.max(0, Math.ceil(TIME - el)));
      if (el >= TIME) { setState("done"); orbsRef.current = []; setOrbs([]); void sk.end(scoreRef.current); return; }
      let n = orbsRef.current.filter((o) => t - o.born < o.life);
      if (t >= next && n.length < 4) {
        const size = Math.max(34, 70 - el * 1.2);
        n = [...n, { id: ++seq.current, x: 8 + Math.random() * 84, y: 10 + Math.random() * 80, born: t, life: Math.max(700, 1500 - el * 22), size }];
        next = t + Math.max(260, 650 - el * 12);
      }
      orbsRef.current = n; setOrbs(n);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = () => { scoreRef.current = 0; setScore(0); setMisses(0); orbsRef.current = []; setOrbs([]); setLeft(TIME); t0.current = performance.now(); setState("on"); sk.begin(); };
  const pop = (o: Orb) => {
    scoreRef.current += 1; setScore(scoreRef.current);
    orbsRef.current = orbsRef.current.filter((x) => x.id !== o.id); setOrbs(orbsRef.current);
    setPops((p) => [...p, { id: o.id, x: o.x, y: o.y }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== o.id)), 400);
  };
  const acc = score + misses ? Math.round((score / (score + misses)) * 100) : 100;

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Time</span><strong>{left}s</strong></span>
          <span><span className="micro muted">Hits</span><strong>{score}</strong></span>
          <span><span className="micro muted">Accuracy</span><strong>{acc}%</strong></span>
        </div>
        <div className="ab-arena" onPointerDown={(e) => { if (state === "on" && e.target === e.currentTarget) setMisses((m) => m + 1); }}>
          {orbs.map((o) => {
            const k = Math.min(1, (now - o.born) / o.life);
            return (
              <button key={o.id} type="button" className="ab-orb" aria-label="Arcane orb"
                style={{ left: `${o.x}%`, top: `${o.y}%`, width: o.size, height: o.size, opacity: 1 - k * 0.7, transform: `translate(-50%,-50%) scale(${1 - k * 0.45})` }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); pop(o); }} />
            );
          })}
          {pops.map((p) => <span key={p.id} className="ab-pop" style={{ left: `${p.x}%`, top: `${p.y}%` }} />)}
          {state === "ready" && (
            <SkillOverlay>
              <strong className="snake-big">Arcane Barrage</strong>
              <span className="soft">Pop the arcane orbs before they fade. 30 seconds.</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Channel</button>
            </SkillOverlay>
          )}
          {state === "done" && (
            <SkillOverlay>
              <strong className="snake-big">Mana spent</strong>
              <span className="soft">{acc}% accuracy.</span>
              <SkillResultLine game="barrage" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Again</button>
            </SkillOverlay>
          )}
        </div>
      </div>
      <SkillPanel game="barrage" how={<>Orbs appear around the arena, shrink and fade. Click or tap each one before it&apos;s gone. They get smaller and quicker as the 30 seconds run down. Your score is orbs popped.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
