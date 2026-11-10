"use client";
// Incantations: a 60-second typing test of spells, places and things from Azeroth. Score = net WPM.
import { useEffect, useMemo, useRef, useState } from "react";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

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

export function Typing({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("typing", best0, leftToday0);
  const [text, setText] = useState("");
  useEffect(() => { setText(makeText()); }, []);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [left, setLeft] = useState(TIME);
  const [keys, setKeys] = useState({ ok: 0, all: 0 });
  const startAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const correct = useMemo(() => { let n = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) n++; return n; }, [typed, text]);
  const elapsed = state === "on" ? Math.max(1, TIME - left) : TIME;
  const wpm = Math.round((correct / 5) / (elapsed / 60));
  const acc = keys.all ? Math.round((keys.ok / keys.all) * 100) : 100;

  useEffect(() => {
    if (state !== "on") return;
    const id = setInterval(() => {
      const l = Math.max(0, TIME - Math.floor((performance.now() - startAt.current) / 1000));
      setLeft(l);
      if (l === 0) { clearInterval(id); setState("done"); }
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

  // keep the current word in view
  useEffect(() => {
    const cur = box.current?.querySelector(".ty-cur") as HTMLElement | null;
    if (cur && box.current) box.current.scrollTop = Math.max(0, cur.offsetTop - box.current.clientHeight / 3);
  }, [typed]);

  const reset = () => { setText(makeText()); setTyped(""); setKeys({ ok: 0, all: 0 }); setLeft(TIME); setState("ready"); setTimeout(() => input.current?.focus(), 0); };
  const onChange = (v: string) => {
    if (state === "done") return;
    if (state === "ready") { if (!v) return; setState("on"); startAt.current = performance.now(); sk.begin(); }
    if (v.length > typed.length) { const ch = v[v.length - 1]; setKeys((k) => ({ ok: k.ok + (ch === text[v.length - 1] ? 1 : 0), all: k.all + 1 })); }
    setTyped(v.slice(0, text.length));
  };

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Time</span><strong>{left}s</strong></span>
          <span><span className="micro muted">WPM</span><strong>{state === "ready" ? 0 : wpm}</strong></span>
          <span><span className="micro muted">Accuracy</span><strong>{acc}%</strong></span>
        </div>
        <div className="ty-box" ref={box} onClick={() => input.current?.focus()}>
          <p className="ty-text" aria-hidden="true">
            {text.split("").map((ch, i) => {
              const cls = i < typed.length ? (typed[i] === ch ? "ok" : "bad") : i === typed.length ? "ty-cur" : "";
              return <span key={i} className={cls}>{ch}</span>;
            })}
          </p>
          <input ref={input} className="ty-input" value={typed} onChange={(e) => onChange(e.target.value)} disabled={state === "done"}
            autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label="Type the incantation here" />
          {state === "ready" && <div className="ty-hint">Click here and start typing. The clock starts on your first key.</div>}
          {state === "done" && (
            <SkillOverlay>
              <strong className="snake-big">Time!</strong>
              <SkillResultLine game="typing" result={sk.result} />
              <span className="micro muted">{acc}% accuracy · {correct} correct characters</span>
              <button type="button" className="btn btn-primary btn-lg" onClick={reset}>Try again</button>
            </SkillOverlay>
          )}
        </div>
      </div>
      <SkillPanel game="typing" how={<>Type the words exactly as shown for 60 seconds. Mistakes count against you. Your score is net words per minute (5 characters is one word).</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
