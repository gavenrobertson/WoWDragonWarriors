"use client";
// Interrupt!: an enemy caster channels; the moment the cast turns dangerous, kick it. Five casts,
// score = average reaction in ms (lower is better). Kicking too early costs a retry.
import { useCallback, useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const ROUNDS = 5;
const SPELLS = [
  { name: "Pyroblast", icon: "spell_fire_fireball02" }, { name: "Shadow Bolt", icon: "spell_shadow_shadowbolt" },
  { name: "Frostbolt", icon: "spell_frost_frostbolt02" }, { name: "Holy Light", icon: "spell_holy_holybolt" },
];
type Phase = "ready" | "wait" | "go" | "early" | "between" | "done";

export function Reaction({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("reaction", best0, leftToday0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [times, setTimes] = useState<number[]>([]);
  const [spell, setSpell] = useState(SPELLS[0]);
  const [last, setLast] = useState<number | null>(null);
  const goAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("ready"); phaseRef.current = phase;
  const timesRef = useRef<number[]>([]); timesRef.current = times;

  const arm = useCallback(() => {
    setSpell(SPELLS[Math.floor(Math.random() * SPELLS.length)]);
    setPhase("wait"); setLast(null);
    timer.current = setTimeout(() => { goAt.current = performance.now(); setPhase("go"); }, 1300 + Math.random() * 2700);
  }, []);

  const start = () => { setTimes([]); sk.begin(); arm(); };

  const kick = useCallback(() => {
    const p = phaseRef.current;
    if (p === "wait") { if (timer.current) clearTimeout(timer.current); setPhase("early"); return; }
    if (p !== "go") return;
    const ms = Math.round(performance.now() - goAt.current);
    const next = [...timesRef.current, ms];
    setTimes(next); setLast(ms);
    if (next.length >= ROUNDS) { setPhase("done"); void sk.end(Math.round(next.reduce((a, b) => a + b, 0) / next.length)); }
    else { setPhase("between"); timer.current = setTimeout(arm, 900); }
  }, [arm, sk]);

  const kickRef = useRef(kick); kickRef.current = kick;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { const p = phaseRef.current; if (p === "wait" || p === "go") { e.preventDefault(); kickRef.current(); } } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Cast</span><strong>{Math.min(times.length + (phase === "done" ? 0 : 1), ROUNDS)} / {ROUNDS}</strong></span>
          <span><span className="micro muted">Last</span><strong>{last ? `${last} ms` : "—"}</strong></span>
          <span><span className="micro muted">Average</span><strong>{avg ? `${avg} ms` : "—"}</strong></span>
        </div>
        <button type="button" className={`rx-arena rx-${phase}`} onPointerDown={(e) => { e.preventDefault(); kick(); }} disabled={phase === "ready" || phase === "done" || phase === "between"}
          aria-label={phase === "go" ? "Interrupt now!" : "Wait for the cast to turn red"}>
          <span className="rx-caster"><img src={wowIconUrl(spell.icon, 56)} alt="" width={84} height={84} /></span>
          <span className="rx-name">{phase === "go" ? "INTERRUPT!" : phase === "early" ? "Too early!" : `Casting ${spell.name}…`}</span>
          <span className="rx-bar"><span /></span>
          <span className="rx-kick"><img src={wowIconUrl("ability_kick", 56)} alt="" width={44} height={44} /> {phase === "go" ? "Kick it!" : "Wait…"}</span>
        </button>
        <div className="rx-times">{times.map((t, i) => <span key={i}>{t} ms</span>)}</div>
        {phase === "early" && <button type="button" className="btn btn-primary" onClick={arm}>Go again</button>}
        {phase === "ready" && (
          <SkillOverlay>
            <strong className="snake-big">Interrupt!</strong>
            <span className="soft">Five enemy casts. Kick each one the instant it turns red.</span>
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
          </SkillOverlay>
        )}
        {phase === "done" && (
          <SkillOverlay>
            <strong className="snake-big">{avg < 250 ? "Lightning reflexes" : avg < 350 ? "Solid kicks" : "Keep practising"}</strong>
            <SkillResultLine game="reaction" result={sk.result} />
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Try again</button>
          </SkillOverlay>
        )}
      </div>
      <SkillPanel game="reaction" how={<>Click, tap or press space the moment the cast bar turns red. Five casts; your score is the average time in milliseconds, so lower is better. Kicking early means that cast starts over.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
