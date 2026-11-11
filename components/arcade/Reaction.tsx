"use client";
// Interrupt!: an enemy caster channels; the moment the cast turns dangerous, kick it. Five casts,
// score = average reaction in ms (lower is better). Kicking too early costs a retry.
// Drawn as a WoW target frame + cast bar in the void cabinet: a ring bursts from the centre on "go",
// the chime climbs higher the faster you kick, and a timeline charts all five reactions.
import { useCallback, useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps, type SkillResult } from "./SkillKit";

const ROUNDS = 5;
const SPELLS = [
  { name: "Pyroblast", icon: "spell_fire_fireball02" }, { name: "Shadow Bolt", icon: "spell_shadow_shadowbolt" },
  { name: "Frostbolt", icon: "spell_frost_frostbolt02" }, { name: "Holy Light", icon: "spell_holy_holybolt" },
];
const CASTERS = [
  { name: "Kel'Thuzad", icon: "achievement_boss_kelthuzad_01" }, { name: "Scourge Necromancer", icon: "achievement_character_undead_male" },
];
type Phase = "ready" | "wait" | "go" | "early" | "between" | "done";
const rate = (ms: number) => (ms < 220 ? "lightning" : ms < 300 ? "quick" : ms < 400 ? "steady" : "slow");
const RATE_TEXT = { lightning: "Lightning!", quick: "Quick kick", steady: "Steady", slow: "Slow" } as const;

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

/** The five reactions as bars (shorter is better), with the running average. */
function Timeline({ times }: { times: number[] }) {
  const max = 600, h = (ms: number) => `${Math.max(6, Math.min(1, ms / max) * 100)}%`;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  return (
    <div className="rx-chart" role="img" aria-label={times.length ? `Reaction times: ${times.join(", ")} milliseconds` : "No reactions yet"}>
      <div className="rx-plot">
        {Array.from({ length: ROUNDS }, (_, i) => {
          const t = times[i];
          return (
            <span key={i} className={`rx-col${t ? ` ${rate(t)}` : " rx-none"}`}>
              {t ? <><span className="rx-bar-v" style={{ height: h(t) }} /><span className="rx-val" style={{ bottom: h(t) }}>{t}</span></> : <span className="rx-slot">{i + 1}</span>}
            </span>
          );
        })}
        {avg > 0 && <span className="rx-avg" style={{ bottom: h(avg) }}><span>avg {avg}</span></span>}
      </div>
    </div>
  );
}

export function Reaction({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("reaction", best0, leftToday0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [times, setTimes] = useState<number[]>([]);
  const [spell, setSpell] = useState(SPELLS[0]);
  const [caster, setCaster] = useState(CASTERS[0]);
  const [last, setLast] = useState<number | null>(null);
  const [cast, setCast] = useState(0);
  const [hits, setHits] = useState(0);
  const goAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const again = useRef<HTMLButtonElement>(null);
  const phaseRef = useRef<Phase>("ready"); phaseRef.current = phase;
  const timesRef = useRef<number[]>([]); timesRef.current = times;
  const chips = useRunMoments(sk.result, (r) => `${r.score} ms`);

  const arm = useCallback(() => {
    setSpell(SPELLS[Math.floor(Math.random() * SPELLS.length)]);
    setCaster(CASTERS[Math.floor(Math.random() * CASTERS.length)]);
    setPhase("wait"); setLast(null); setCast((c) => c + 1);
    play("spin", { vol: 0.45 });
    timer.current = setTimeout(() => { goAt.current = performance.now(); setPhase("go"); play("click", { pitch: 0.7 }); buzz("tick"); }, 1300 + Math.random() * 2700);
  }, []);

  const start = () => { setTimes([]); sk.begin(); arm(); };

  const kick = useCallback(() => {
    const p = phaseRef.current;
    if (p === "wait") {
      if (timer.current) clearTimeout(timer.current);
      setPhase("early"); play("error"); play("thud", { pitch: 0.6, vol: 0.6 }); buzz("fail");
      setTimeout(() => again.current?.focus(), 0);
      return;
    }
    if (p !== "go") return;
    const ms = Math.round(performance.now() - goAt.current);
    const next = [...timesRef.current, ms];
    setTimes(next); setLast(ms); setHits((h) => h + 1);
    // the faster the kick, the higher the chime
    play("thud", { pitch: 1.5, vol: 0.7 });
    play("gem", { pitch: Math.max(0.7, Math.min(1.7, 2.1 - ms / 250)) });
    buzz("tap");
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
  const barText = phase === "go" ? "INTERRUPT!" : phase === "early" ? "Too early!" : phase === "between" || phase === "done" ? "Interrupted" : spell.name;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage rx-stage">
        <Machine theme="crypt" label="Interrupt!" className="rx-machine" hud={<>
          <Readout label="Cast">{Math.min(times.length + (phase === "done" ? 0 : 1), ROUNDS)} / {ROUNDS}</Readout>
          <Readout label="Last" tone={last && last < 300 ? "win" : undefined}>{last ? `${last} ms` : "—"}</Readout>
          <Readout label="Average" tone="gold">{avg ? `${avg} ms` : "—"}</Readout>
          <Readout label="Best">{sk.best ? `${sk.best} ms` : "—"}</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div className="rx-wrap">
            <button type="button" className={`rx-arena rx-${phase}`} onPointerDown={(e) => { e.preventDefault(); kick(); }} disabled={phase === "ready" || phase === "done" || phase === "between"}
              aria-label={phase === "go" ? "Interrupt now!" : "Wait for the cast to turn red"}>
              <span className="rx-frame">
                <span className="rx-portrait"><img src={wowIconUrl(caster.icon, 56)} alt="" width={64} height={64} /></span>
                <span className="rx-unit">
                  <span className="rx-uname">{caster.name}<span className="rx-elite">Elite</span></span>
                  <span className="rx-hp"><span /></span>
                </span>
              </span>
              <span className="rx-focus" aria-hidden="true">
                <span className="rx-orb"><img src={wowIconUrl(spell.icon, 56)} alt="" width={72} height={72} /></span>
                {phase === "go" && <span key={`r${cast}`} className="rx-ring" />}
                {phase === "go" && <span key={`r2${cast}`} className="rx-ring two" />}
                {(phase === "between" || phase === "done") && last !== null && (
                  <span key={`h${hits}`} className={`rx-hit ${rate(last)}`}>
                    {Array.from({ length: 12 }, (_, i) => <span key={i} className="rx-spark" style={{ ["--a" as string]: `${i * 30 + (i % 2) * 11}deg`, ["--d" as string]: `${54 + (i % 3) * 16}px` }} />)}
                    <strong>{last} ms</strong><em>{RATE_TEXT[rate(last)]}</em>
                  </span>
                )}
              </span>
              <span key={cast} className="rx-castbar">
                <span className="rx-cicon"><img src={wowIconUrl(spell.icon, 36)} alt="" width={30} height={30} /></span>
                <span className="rx-track"><span className="rx-fill" /><span className="rx-ctext">{barText}</span></span>
              </span>
              <span className="rx-kick">
                <span className="rx-kicon"><img src={wowIconUrl("ability_kick", 56)} alt="" width={48} height={48} /><span className="rx-key">Space</span></span>
                <span className="rx-klabel">{phase === "go" ? "Kick it!" : phase === "early" ? "Too early" : "Wait…"}</span>
              </span>
            </button>
            {phase === "early" && <button ref={again} type="button" className="btn btn-primary rx-again" onClick={arm}>Go again</button>}
          </div>
          <Timeline times={times} />
          {phase === "ready" && (
            <SkillOverlay>
              <img className="rx-ov-icon" src={wowIconUrl("ability_kick", 56)} alt="" width={56} height={56} />
              <strong className="snake-big">Interrupt!</strong>
              <span className="soft">Five enemy casts. Kick each one the instant it turns red.</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Start</button>
            </SkillOverlay>
          )}
          {phase === "done" && (
            <SkillOverlay>
              <strong className="snake-big">{avg < 250 ? "Lightning reflexes" : avg < 350 ? "Solid kicks" : "Keep practising"}</strong>
              <div className="rx-final"><strong>{avg}</strong><span>ms average</span></div>
              <Timeline times={times} />
              <SkillResultLine game="reaction" result={sk.result} />
              <button type="button" className="btn btn-primary btn-lg" onClick={start}>Try again</button>
            </SkillOverlay>
          )}
        </Machine>
      </div>
      <SkillPanel game="reaction" how={<>Click, tap or press space the moment the cast bar turns red. Five casts; your score is the average time in milliseconds, so lower is better. Kicking early means that cast starts over.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
