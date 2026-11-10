"use client";
// Murloc Mayhem: murlocs pop out of the pools for 30 seconds. Bonk them (+1); leave the whelps alone (-3).
import { useCallback, useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const HOLES = 9, TIME = 30;
type Pop = { kind: "murloc" | "whelp"; id: number; until: number } | null;

export function Murloc({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("murloc", best0, leftToday0);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [holes, setHoles] = useState<Pop[]>(Array(HOLES).fill(null));
  const [hit, setHit] = useState<Record<number, string>>({});
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(TIME);
  const scoreRef = useRef(0);
  const t0 = useRef(0), seq = useRef(0);

  useEffect(() => {
    if (state !== "on") return;
    let raf = 0, nextPop = 0;
    const loop = (now: number) => {
      const el = (now - t0.current) / 1000;
      setLeft(Math.max(0, Math.ceil(TIME - el)));
      if (el >= TIME) { setState("done"); setHoles(Array(HOLES).fill(null)); void sk.end(scoreRef.current); return; }
      setHoles((hs) => hs.map((h) => (h && h.until < now ? null : h)));
      if (now >= nextPop) {
        const speed = 1 + el / 18; // they get quicker
        setHoles((hs) => {
          const free = hs.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
          if (!free.length) return hs;
          const i = free[Math.floor(Math.random() * free.length)];
          const n = [...hs];
          n[i] = { kind: Math.random() < 0.16 ? "whelp" : "murloc", id: ++seq.current, until: now + (650 + Math.random() * 500) / speed };
          return n;
        });
        nextPop = now + (380 + Math.random() * 420) / speed;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const holesRef = useRef(holes); holesRef.current = holes;
  const bonk = useCallback((i: number) => {
    if (state !== "on") return;
    const h = holesRef.current[i]; if (!h) return;
    holesRef.current = holesRef.current.map((x, j) => (j === i ? null : x));
    const d = h.kind === "murloc" ? 1 : -3;
    scoreRef.current = Math.max(0, scoreRef.current + d); setScore(scoreRef.current);
    setHoles((hs) => hs.map((x, j) => (j === i && x?.id === h.id ? null : x)));
    setHit((x) => ({ ...x, [i]: d > 0 ? "Mrglglgl!" : "Ouch! -3" }));
    setTimeout(() => setHit((x) => { const n = { ...x }; delete n[i]; return n; }), 450);
  }, [state]);

  const start = () => { scoreRef.current = 0; setScore(0); setLeft(TIME); setHoles(Array(HOLES).fill(null)); t0.current = performance.now(); setState("on"); sk.begin(); };

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Time</span><strong>{left}s</strong></span>
          <span><span className="micro muted">Bonks</span><strong>{score}</strong></span>
        </div>
        <div className="ml-grid">
          {holes.map((h, i) => (
            <button key={i} type="button" className={`ml-hole${h ? " up" : ""}`} onPointerDown={(e) => { e.preventDefault(); bonk(i); }} aria-label={h ? (h.kind === "murloc" ? "Murloc! Bonk it" : "Whelp, leave it") : "Empty pool"}>
              <span className="ml-water" />
              {h && <img key={h.id} className={`ml-pop ${h.kind}`} src={wowIconUrl(h.kind === "murloc" ? "inv_misc_head_murloc_01" : "inv_misc_head_dragon_01", 56)} alt="" />}
              {hit[i] && <span className={`ml-hit${hit[i].startsWith("Ouch") ? " bad" : ""}`}>{hit[i]}</span>}
            </button>
          ))}
        </div>
        {state === "ready" && (
          <SkillOverlay>
            <strong className="snake-big">Murloc Mayhem</strong>
            <span className="soft">Bonk every murloc that pops up. Don&apos;t bonk the baby whelps.</span>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
          </SkillOverlay>
        )}
        {state === "done" && (
          <SkillOverlay>
            <strong className="snake-big">Mrglglgl!</strong>
            <SkillResultLine game="murloc" result={sk.result} />
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Play again</button>
          </SkillOverlay>
        )}
      </div>
      <SkillPanel game="murloc" how={<>Murlocs pop out of the pools for 30 seconds. Click or tap each one for a point. Whelps cost you 3, so look before you bonk. They get faster as time runs down.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
