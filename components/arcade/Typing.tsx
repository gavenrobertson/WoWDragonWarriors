"use client";
// Incantations: a 60-second typing test of spells, places and things from Azeroth. Score = net WPM.
// Drawn as an illuminated spellbook page in the arcade cabinet: a gliding caret, letters that settle
// into the ink, a three-line window that scrolls smoothly and a soft key "thock" on every keystroke.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps, type SkillResult } from "./SkillKit";

const WORDS = (
  "frostbolt fireball pyroblast arcane missiles blink polymorph counterspell evocation scorch flamestrike blizzard " +
  "shadow bolt corruption fear soulstone healthstone drain life curse of agony felhunter voidwalker succubus " +
  "smite renew flash heal power word shield mind blast holy nova resurrection prayer of healing " +
  "lightning bolt chain heal healing wave windfury totem earthbind tremor ghost wolf reincarnation " +
  "backstab ambush sinister strike eviscerate vanish sprint sap kidney shot poison stealth " +
  "mortal strike whirlwind charge intercept shield wall taunt cleave execute battle shout sunder armor " +
  "holy light consecration blessing of kings divine shield hammer of justice judgement seal of command " +
  "aimed shot multi shot hunter's mark feign death aspect of the hawk trueshot aura serpent sting " +
  "moonfire starfire wrath rejuvenation regrowth innervate bear form cat form travel form entangling roots " +
  "stormwind ironforge darnassus orgrimmar undercity thunder bluff gadgetzan booty bay stranglethorn " +
  "tanaris winterspring silithus feralas azshara felwood ashenvale westfall duskwood redridge elwynn " +
  "molten core onyxia blackwing lair zul'gurub ahn'qiraj naxxramas blackrock depths scholomance stratholme " +
  "hearthstone mount gryphon wyvern raid guild loot epic legendary flask elixir potion bandage mana rage " +
  "dragon whelp murloc kobold gnoll defias quest dungeon tank healer damage threat aggro wipe pull ready check"
).split(" ");

const TIME = 60;
const makeText = () => Array.from({ length: 90 }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join(" ");

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

export function Typing({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("typing", best0, leftToday0);
  const [text, setText] = useState("");
  useEffect(() => { setText(makeText()); }, []);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [left, setLeft] = useState(TIME);
  const [keys, setKeys] = useState({ ok: 0, all: 0 });
  const [focused, setFocused] = useState(false);
  const [busyKeys, setBusyKeys] = useState(false);
  const startAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordStreak = useRef(0);
  const chips = useRunMoments(sk.result, (r) => `${r.score} WPM`);

  const correct = useMemo(() => { let n = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) n++; return n; }, [typed, text]);
  const errors = typed.length - correct;
  const elapsed = state === "on" ? Math.max(1, TIME - left) : TIME;
  const wpm = Math.round((correct / 5) / (elapsed / 60));
  const acc = keys.all ? Math.round((keys.ok / keys.all) * 100) : 100;
  const net = Math.max(0, Math.round(((correct - errors) / 5) / (TIME / 60)));

  useEffect(() => {
    if (state !== "on") return;
    let shown = TIME;
    const id = setInterval(() => {
      const l = Math.max(0, TIME - Math.floor((performance.now() - startAt.current) / 1000));
      if (l !== shown) { shown = l; if (l <= 10 && l > 0) play("tick", { pitch: l <= 3 ? 1.4 : 1 }); }
      setLeft(l);
      if (l === 0) { clearInterval(id); setState("done"); play("stop"); }
    }, 200);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state !== "done") return;
    let n = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) n++;
    const errors = typed.length - n;
    void sk.end(Math.max(0, Math.round(((n - errors) / 5) / (TIME / 60))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // the caret glides to the next letter; the page scrolls a line at a time so the current line stays second of three
  useLayoutEffect(() => {
    const box = lines.current, c = caret.current;
    if (!box || !c) return;
    const all = box.querySelectorAll<HTMLElement>(".ty-c");
    if (!all.length) return;
    const lh = parseFloat(getComputedStyle(box).lineHeight) || 40;
    const at = Math.min(typed.length, all.length - 1), el = all[at];
    const x = typed.length >= all.length ? el.offsetLeft + el.offsetWidth : el.offsetLeft;
    const line = Math.max(0, Math.round((el.offsetTop + el.offsetHeight / 2 - lh / 2) / lh));
    c.style.left = `${x}px`;
    c.style.top = `${line * lh + lh * 0.16}px`;
    c.style.height = `${lh * 0.68}px`;
    box.style.transform = `translateY(${-Math.max(0, line - 1) * lh}px)`;
  }, [typed, text]);

  const reset = () => {
    setText(makeText()); setTyped(""); setKeys({ ok: 0, all: 0 }); setLeft(TIME); setState("ready"); wordStreak.current = 0;
    play("flip");
    setTimeout(() => input.current?.focus(), 0);
  };

  const onChange = (v: string) => {
    if (state === "done") return;
    if (state === "ready") { if (!v) return; setState("on"); startAt.current = performance.now(); sk.begin(); }
    if (v.length > typed.length) {
      const i = v.length - 1, ch = v[i], ok = ch === text[i];
      setKeys((k) => ({ ok: k.ok + (ok ? 1 : 0), all: k.all + 1 }));
      // a soft "thock": a short pitched body plus the key click, nudged a little each time so it never sounds robotic
      play("key");
      if (!ok) { play("error", { vol: 0.35 }); wordStreak.current = 0; }
      else {
        play("thud", { pitch: 2.3 + Math.random() * 0.45, vol: 0.16 });
        if (ch === " ") {
          // a finished word: chime, climbing while the words keep coming clean
          const start = text.lastIndexOf(" ", i - 1) + 1;
          const clean = v.slice(start, i) === text.slice(start, i);
          if (clean) { wordStreak.current += 1; play("chip", { pitch: 0.62 * ladder(wordStreak.current % 13), vol: 0.32 }); }
          else wordStreak.current = 0;
        }
      }
    } else if (v.length < typed.length) play("tick", { pitch: 0.6, vol: 0.5 });
    setBusyKeys(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setBusyKeys(false), 450);
    setTyped(v.slice(0, text.length));
  };
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);

  // words are kept whole so lines only break between them
  const words = useMemo(() => {
    const out: { start: number; w: string }[] = [];
    let i = 0;
    for (const w of text.split(" ")) { out.push({ start: i, w }); i += w.length + 1; }
    return out;
  }, [text]);
  const cls = (i: number) => (i < typed.length ? (typed[i] === text[i] ? " ok" : " bad") : i === typed.length ? " cur" : "");

  const urgent = state === "on" && left <= 10;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage ty-stage">
        <Machine theme="parchment" label="Incantations" className="ty-machine" hud={<>
          <Readout label="Time" tone={urgent ? "lose" : undefined}><span className={urgent ? "ty-urgent" : undefined}>{left}s</span></Readout>
          <Readout label="WPM" tone="gold"><CountUp value={state === "ready" ? 0 : wpm} duration={360} /></Readout>
          <Readout label="Accuracy" tone={acc >= 95 ? "win" : acc < 85 ? "lose" : undefined}>{acc}%</Readout>
          <Readout label="Best">{sk.best ? `${sk.best}` : "—"}</Readout>
          <ResultStrip items={chips} label="Recent runs" />
        </>}>
          <div className={`ty-book${state === "on" ? " on" : ""}${state === "done" ? " done" : ""}`} onClick={() => input.current?.focus()}>
            <div className="ty-page">
              <div className="ty-head" aria-hidden="true">
                <span className="ty-orn" /><span className="ty-title">Incantation</span><span className="ty-orn r" />
              </div>
              <div className={`ty-window${focused ? " focus" : ""}`}>
                <div className="ty-lines" ref={lines} aria-hidden="true">
                  {words.map(({ start, w }, wi) => (
                    <span key={wi}>
                      <span className="ty-w">
                        {w.split("").map((ch, j) => <span key={j} className={`ty-c${cls(start + j)}`}>{ch}</span>)}
                      </span>
                      {wi < words.length - 1 && <span className={`ty-c sp${cls(start + w.length)}`}> </span>}
                    </span>
                  ))}
                  <span ref={caret} className={`ty-caret${busyKeys ? " busy" : ""}${focused && state !== "done" ? "" : " off"}`} />
                </div>
              </div>
              <div className="ty-quill" aria-hidden="true"><span style={{ ["--p" as string]: `${(left / TIME) * 100}%` }} /></div>
              <div className="ty-foot" aria-hidden="true">
                <span>{correct} letters inscribed</span>
                <span className={errors ? "bad" : ""}>{errors} blot{errors === 1 ? "" : "s"}</span>
              </div>
            </div>
            <input ref={input} className="ty-input" value={typed} onChange={(e) => onChange(e.target.value)} disabled={state === "done"}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Type the incantation here" />
            {state === "ready" && <div className="ty-hint">{focused ? "Begin the incantation. The sands run on your first letter." : "Click the page and start typing. The clock starts on your first key."}</div>}
          </div>
          {state === "done" && (
            <SkillOverlay>
              <span className="ty-seal" aria-hidden="true" />
              <strong className="snake-big">Time!</strong>
              <div className="ty-final"><strong><CountUp value={net} from={0} duration={900} /></strong><span>WPM</span></div>
              <SkillResultLine game="typing" result={sk.result} />
              <span className="micro muted">{acc}% accuracy · {correct} correct · {errors} mistyped</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={reset}>Try again</button>
            </SkillOverlay>
          )}
        </Machine>
      </div>
      <SkillPanel game="typing" how={<>Type the words exactly as shown for 60 seconds. Mistakes count against you. Your score is net words per minute (5 characters is one word).</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
