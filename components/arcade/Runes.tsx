"use client";
// Rune Recall: four runes flash a sequence; repeat it. Each round adds one. Score = longest sequence repeated.
// Four big glowing runes around a turning rune circle in the arcane cabinet. Each rune has its own note
// (low to high), lights for ~440ms with a gap between, and the ward flares gold or cracks red.
import { useCallback, useEffect, useRef, useState } from "react";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps, type SkillResult } from "./SkillKit";

const RUNES = [
  { name: "Arcane", color: "#b07bff", glyph: "M12 3 L21 12 L12 21 L3 12 Z M12 7 L12 17 M7 12 L17 12" },
  { name: "Fel", color: "#5cff3a", glyph: "M5 5 L19 19 M19 5 L5 19 M12 3 L12 21" },
  { name: "Frost", color: "#5ec8ff", glyph: "M12 3 L12 21 M4 7.5 L20 16.5 M20 7.5 L4 16.5" },
  { name: "Fire", color: "#ff7a2a", glyph: "M12 3 C17 9 18 13 12 21 C6 13 7 9 12 3 Z M12 11 L12 17" },
];
// each rune's note, low to high: a major arpeggio (root, third, fifth, octave)
const NOTE = [0.7, 0.882, 1.049, 1.4];
const sing = (r: number, vol = 1) => { play("reveal", { pitch: NOTE[r], vol }); play("thud", { pitch: 1.6 + r * 0.5, vol: 0.18 * vol }); };
type Phase = "ready" | "show" | "input" | "done";

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

/** The engraved circle behind the runes: rings, a star and small glyphs, the outer band turning slowly. */
function RuneCircle() {
  const marks = Array.from({ length: 16 }, (_, i) => i);
  return (
    <svg className="rn-bg" viewBox="0 0 200 200" aria-hidden="true">
      <g className="rn-turn">
        <circle cx="100" cy="100" r="96" className="rn-ring" />
        <circle cx="100" cy="100" r="84" className="rn-ring thin" />
        {marks.map((i) => (
          <g key={i} transform={`rotate(${i * 22.5} 100 100) translate(94 10) scale(.33)`}>
            <path d={RUNES[i % 4].glyph} className="rn-mark" />
          </g>
        ))}
      </g>
      <g className="rn-turn back">
        <rect x="45" y="45" width="110" height="110" className="rn-star" />
        <rect x="45" y="45" width="110" height="110" className="rn-star" transform="rotate(45 100 100)" />
      </g>
      <circle cx="100" cy="100" r="56" className="rn-ring thin" />
      <circle cx="100" cy="100" r="30" className="rn-ring" />
    </svg>
  );
}

export function Runes({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("runes", best0, leftToday0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [flare, setFlare] = useState(0);
  const [endShown, setEndShown] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const circle = useRef<HTMLDivElement>(null);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const chips = useRunMoments(sk.result, (r) => `${r.score} rune${r.score === 1 ? "" : "s"}`);

  const show = useCallback((s: number[]) => {
    setPhase("show"); setPos(0); setShown(0);
    // ~440ms lit with a clear gap; a little quicker as the sequence grows
    const step = Math.max(520, 760 - s.length * 20), on = Math.min(440, step - 120);
    s.forEach((r, i) => {
      later(() => { setLit(r); setShown(i + 1); sing(r); }, 600 + i * step);
      later(() => setLit((x) => (x === r ? null : x)), 600 + i * step + on);
    });
    later(() => { setPhase("input"); play("tick", { pitch: 1.3 }); }, 600 + s.length * step);
  }, []);

  const start = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setWrong(null); setLit(null); setEndShown(false);
    const s = [0, 1, 2].map(() => Math.floor(Math.random() * 4));
    setSeq(s); sk.begin(); play("launch", { vol: 0.4 }); show(s);
  };

  const press = (r: number) => {
    if (phase !== "input") return;
    setLit(r); later(() => setLit((x) => (x === r ? null : x)), 200);
    if (seq[pos] !== r) {
      setWrong(r); setPhase("done");
      play("error"); play("lose"); buzz("fail");
      if (circle.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        circle.current.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }], { duration: 220, easing: "ease-out" });
      }
      void sk.end(seq.length - 1);
      later(() => setEndShown(true), 900); // let the cracked ward show first
      return;
    }
    sing(r, 0.9); buzz("tap");
    if (pos + 1 === seq.length) {
      // the ward holds: flare gold, then one more rune
      setPos(pos + 1); setFlare((f) => f + 1);
      later(() => play("gem", { pitch: ladder(seq.length - 3) }), 160);
      const next = [...seq, Math.floor(Math.random() * 4)];
      setSeq(next); setPhase("show");
      later(() => show(next), 900);
    } else setPos(pos + 1);
  };

  useEffect(() => {
    const keys: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, q: 0, w: 1, a: 2, s: 3 };
    const onKey = (e: KeyboardEvent) => { if (keys[e.key] !== undefined) press(keys[e.key]); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const level = Math.max(0, seq.length - (phase === "done" ? 1 : 0));
  const held = phase === "show" && pos > 0 && pos === seq.length - 1; // just completed the previous sequence
  const status = phase === "show" ? (held ? "The ward holds!" : "Watch…") : phase === "input" ? "Your turn" : phase === "done" ? "Broken" : "Ready";
  const pips = phase === "input" ? seq.length : phase === "show" ? (held ? seq.length - 1 : seq.length) : seq.length;
  const filled = phase === "input" ? pos : phase === "show" ? (held ? pos : shown) : 0;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage rn-stage">
        <Machine theme="arcane" label="Rune Recall" className="rn-machine" hud={<>
          <Readout label="Sequence" tone="gold">{phase === "ready" ? "—" : seq.length}</Readout>
          <Readout label="Status" tone={phase === "done" ? "lose" : phase === "input" ? "win" : undefined}>{phase === "input" ? `${pos + 1 > seq.length ? seq.length : pos + 1}/${seq.length}` : status}</Readout>
          <Readout label="Best">{sk.best || "—"}</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div ref={circle} className={`rn-circle rn-${phase}${wrong !== null ? " broken" : ""}`}>
            <RuneCircle />
            {flare > 0 && <span key={flare} className="rn-flare" aria-hidden="true" />}
            {RUNES.map((r, i) => (
              <span key={`b${i}`} className={`rn-beam p${i}${lit === i ? " on" : ""}`} style={{ ["--c" as string]: r.color }} aria-hidden="true" />
            ))}
            <div className="rn-core" aria-live="polite">
              <span className="rn-status">{status}</span>
              <strong className="rn-count">{phase === "ready" ? "·" : level}</strong>
              <span className="rn-pips" aria-hidden="true">
                {Array.from({ length: Math.min(pips, 14) }, (_, i) => <i key={i} className={i < filled ? "on" : ""} />)}
                {pips > 14 && <em>+{pips - 14}</em>}
              </span>
            </div>
            {RUNES.map((r, i) => (
              <button key={r.name} type="button" className={`rn-rune p${i}${lit === i ? " lit" : ""}${wrong === i ? " wrong" : ""}`} style={{ ["--c" as string]: r.color }}
                onPointerDown={(e) => { e.preventDefault(); press(i); }} disabled={phase !== "input"} aria-label={`${r.name} rune (key ${i + 1})`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={r.glyph} /></svg>
                <span className="rn-key">{i + 1}</span>
              </button>
            ))}
          </div>
          {phase === "ready" && (
            <SkillOverlay>
              <span className="rn-ov-glyphs" aria-hidden="true">
                {RUNES.map((r) => <svg key={r.name} viewBox="0 0 24 24" style={{ ["--c" as string]: r.color }}><path d={r.glyph} /></svg>)}
              </span>
              <strong className="snake-big">Rune Recall</strong>
              <span className="soft">Watch the runes light up, then repeat the order. It gets one longer every round.</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
            </SkillOverlay>
          )}
          {phase === "done" && endShown && (
            <SkillOverlay>
              <strong className="snake-big">The ward breaks</strong>
              <div className="rn-final"><strong>{level}</strong><span>rune{level === 1 ? "" : "s"} held</span></div>
              <SkillResultLine game="runes" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Try again</button>
            </SkillOverlay>
          )}
        </Machine>
      </div>
      <SkillPanel game="runes" how={<>The runes flash in order. Repeat it by clicking them (or keys 1 to 4). Every round adds one more rune and plays a little faster. Your score is the longest sequence you repeated.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
