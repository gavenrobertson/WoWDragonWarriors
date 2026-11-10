"use client";
// Rune Recall: four runes flash a sequence; repeat it. Each round adds one. Score = longest sequence repeated.
import { useCallback, useEffect, useRef, useState } from "react";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const RUNES = [
  { name: "Arcane", color: "#b07bff", glyph: "M12 3 L21 12 L12 21 L3 12 Z M12 7 L12 17 M7 12 L17 12" },
  { name: "Fel", color: "#5cff3a", glyph: "M5 5 L19 19 M19 5 L5 19 M12 3 L12 21" },
  { name: "Frost", color: "#5ec8ff", glyph: "M12 3 L12 21 M4 7.5 L20 16.5 M20 7.5 L4 16.5" },
  { name: "Fire", color: "#ff7a2a", glyph: "M12 3 C17 9 18 13 12 21 C6 13 7 9 12 3 Z M12 11 L12 17" },
];
type Phase = "ready" | "show" | "input" | "done";

export function Runes({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("runes", best0, leftToday0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = useCallback((s: number[]) => {
    setPhase("show"); setPos(0);
    const step = Math.max(300, 640 - s.length * 22);
    s.forEach((r, i) => { later(() => setLit(r), 500 + i * step); later(() => setLit(null), 500 + i * step + step * 0.7); });
    later(() => setPhase("input"), 500 + s.length * step);
  }, []);

  const start = () => { timers.current.forEach(clearTimeout); setWrong(null); const s = [0, 1, 2].map(() => Math.floor(Math.random() * 4)); setSeq(s); sk.begin(); play(s); };

  const press = (r: number) => {
    if (phase !== "input") return;
    setLit(r); later(() => setLit((x) => (x === r ? null : x)), 180);
    if (seq[pos] !== r) {
      setWrong(r); setPhase("done");
      void sk.end(seq.length - 1);
      return;
    }
    if (pos + 1 === seq.length) {
      const next = [...seq, Math.floor(Math.random() * 4)];
      setSeq(next); setPhase("show");
      later(() => play(next), 450);
    } else setPos(pos + 1);
  };

  useEffect(() => {
    const keys: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, q: 0, w: 1, a: 2, s: 3 };
    const onKey = (e: KeyboardEvent) => { if (keys[e.key] !== undefined) press(keys[e.key]); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const level = Math.max(0, seq.length - (phase === "done" ? 1 : 0));
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Sequence</span><strong>{phase === "ready" ? "—" : seq.length}</strong></span>
          <span><span className="micro muted">Status</span><strong>{phase === "show" ? "Watch…" : phase === "input" ? `Your turn ${pos + 1}/${seq.length}` : phase === "done" ? "Broken" : "Ready"}</strong></span>
        </div>
        <div className="rn-grid">
          {RUNES.map((r, i) => (
            <button key={r.name} type="button" className={`rn-rune${lit === i ? " lit" : ""}${wrong === i ? " wrong" : ""}`} style={{ ["--c" as string]: r.color }}
              onPointerDown={(e) => { e.preventDefault(); press(i); }} disabled={phase !== "input"} aria-label={`${r.name} rune`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={r.glyph} /></svg>
              <span className="micro">{r.name} · {i + 1}</span>
            </button>
          ))}
        </div>
        {phase === "ready" && (
          <SkillOverlay>
            <strong className="snake-big">Rune Recall</strong>
            <span className="soft">Watch the runes light up, then repeat the order. It gets one longer every round.</span>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
          </SkillOverlay>
        )}
        {phase === "done" && (
          <SkillOverlay>
            <strong className="snake-big">The ward breaks</strong>
            <span className="soft">You held {level} runes.</span>
            <SkillResultLine game="runes" result={sk.result} />
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Try again</button>
          </SkillOverlay>
        )}
      </div>
      <SkillPanel game="runes" how={<>The runes flash in order. Repeat it by clicking them (or keys 1 to 4). Every round adds one more rune and plays a little faster. Your score is the longest sequence you repeated.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
