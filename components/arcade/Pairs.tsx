"use client";
// Hoard Pairs: find the eight matching pairs of loot. Score out of 1,000: fewer flips and less time is better.
import { useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { Machine, Readout } from "./Machine";
import { CountUp, ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, ladder, play } from "./sfx";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const LOOT = ["inv_sword_04", "inv_misc_bag_10", "inv_misc_rune_01", "inv_misc_orb_05", "inv_misc_coin_02", "inv_box_02", "inv_misc_gem_ruby_01", "inv_misc_head_dragon_01"];
// item quality colours for the glow around each piece of loot once it's matched
const QUALITY: Record<string, string> = {
  inv_sword_04: "#5AA6FF", inv_misc_bag_10: "#4CD964", inv_misc_rune_01: "#C08CFF", inv_misc_orb_05: "#C08CFF",
  inv_misc_coin_02: "#FFD100", inv_box_02: "#E6E1D8", inv_misc_gem_ruby_01: "#5AA6FF", inv_misc_head_dragon_01: "#FF9433",
};
const deal = () => {
  const d = [...LOOT, ...LOOT].map((icon, i) => ({ icon, k: i }));
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
export const pairsScore = (moves: number, secs: number) => Math.max(50, Math.round(1000 - Math.max(0, moves - 8) * 30 - secs * 4));

export function Pairs({ rules, best0, leftToday0, board }: SkillProps) {
  const sk = useSkillRun("pairs", best0, leftToday0);
  const [cards, setCards] = useState(() => [...LOOT, ...LOOT].map((icon, i) => ({ icon, k: i })));
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [state, setState] = useState<"ready" | "on" | "done">("ready");
  const [secs, setSecs] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [miss, setMiss] = useState<number[]>([]);
  const [dealt, setDealt] = useState(0);
  const [final, setFinal] = useState(0);
  const [chips, setChips] = useState<Chip[]>([]);
  const t0 = useRef(0);
  const lock = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bestAtStart = useRef(best0);
  const later = (f: () => void, ms: number) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (state !== "on") return;
    const id = setInterval(() => setSecs(Math.floor((performance.now() - t0.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => { if (sk.result && sk.result.earned > 0) celebrate({ mult: 2, won: sk.result.earned }); }, [sk.result]);

  const start = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    bestAtStart.current = sk.best;
    setCards(deal()); setOpen([]); setFound(new Set()); setMoves(0); setSecs(0); setStreak(0); setBestStreak(0); setMiss([]); setFinal(0);
    setDealt((d) => d + 1);
    t0.current = performance.now(); lock.current = false; setState("on"); sk.begin();
    play("deal");
    for (let i = 1; i < 6; i++) later(() => play("deal", { vol: .5 }), i * 120);
  };

  const flip = (i: number) => {
    if (state !== "on" || lock.current || open.includes(i) || found.has(cards[i].icon)) return;
    play("flip", { pitch: open.length ? 1.12 : 1 });
    const o = [...open, i];
    setOpen(o);
    if (o.length === 2) {
      const m = moves + 1; setMoves(m);
      if (cards[o[0]].icon === cards[o[1]].icon) {
        const st = streak + 1;
        setStreak(st); setBestStreak(Math.max(bestStreak, st));
        later(() => { play("gem", { pitch: ladder((st - 1) * 2) }); buzz("tap"); }, 220);
        const f = new Set(found); f.add(cards[i].icon); setFound(f); setOpen([]);
        if (f.size === LOOT.length) {
          const s = (performance.now() - t0.current) / 1000;
          const score = pairsScore(m, s);
          setSecs(Math.floor(s)); setState("done"); setFinal(score);
          setChips((c) => [{ k: performance.now(), label: String(score), tone: (score > bestAtStart.current ? "big" : score >= 700 ? "win" : "neutral") as Chip["tone"] }, ...c].slice(0, 14));
          later(() => play("cashout"), 520);
          void sk.end(score);
        }
      } else {
        setStreak(0);
        lock.current = true;
        later(() => { setMiss(o); play("thud", { pitch: 1.3, vol: .6 }); buzz("tick"); }, 340);
        later(() => { setOpen([]); setMiss([]); lock.current = false; }, 750);
      }
    }
  };

  const live = state === "on" ? pairsScore(moves, secs) : state === "done" ? final : 1000;
  const accuracy = moves ? Math.round((LOOT.length / moves) * 100) : 0;
  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <Machine theme="hoard" label="Hoard Pairs" className="pr-machine" hud={<>
          <Readout label="Time">{secs}s</Readout>
          <Readout label="Flips">{moves}</Readout>
          <Readout label="Pairs" tone={found.size === LOOT.length ? "win" : undefined}>{found.size}/{LOOT.length}</Readout>
          <Readout label="Score" tone="gold">{live}</Readout>
          <ResultStrip items={chips} label="Recent hoards" />
        </>}>
          <div className={`pr-board pr-${state}`}>
            {streak >= 2 && state === "on" && <span key={streak} className="pr-streak" aria-live="polite">Streak ×{streak}</span>}
            <div key={dealt} className={`pr-grid${dealt ? " pr-dealt" : ""}`}>
              {cards.map((c, i) => {
                const isFound = found.has(c.icon), up = open.includes(i) || isFound;
                return (
                  <button key={c.k} type="button" style={{ ["--i" as string]: i, ["--q" as string]: QUALITY[c.icon] }}
                    className={`pr-card${up ? " up" : ""}${isFound ? " found" : ""}${miss.includes(i) ? " miss" : ""}`}
                    onClick={() => flip(i)} aria-label={up ? "Revealed card" : "Hidden card"}>
                    <span className="pr-inner">
                      <span className="pr-back"><img src="/assets/crest-64.webp" alt="" /></span>
                      <span className="pr-front"><img src={wowIconUrl(c.icon, 56)} alt="" /></span>
                    </span>
                  </button>
                );
              })}
            </div>
            {state === "ready" && (
              <SkillOverlay>
                <strong className="snake-big">Hoard Pairs</strong>
                <span className="soft">Flip two cards at a time and match all eight pieces of loot.</span>
                <button type="button" className="btn btn-primary btn-lg" onClick={start}>Deal</button>
              </SkillOverlay>
            )}
            {state === "done" && (
              <SkillOverlay>
                <strong className="snake-big">{final > bestAtStart.current ? "New best!" : "Hoard sorted"}</strong>
                <span className="pr-final"><CountUp value={final} from={0} duration={900} /></span>
                <span className="pr-stats">
                  <span><strong>{moves}</strong><span className="micro muted">flips</span></span>
                  <span><strong>{secs}s</strong><span className="micro muted">time</span></span>
                  <span><strong>×{bestStreak}</strong><span className="micro muted">best streak</span></span>
                  <span><strong>{accuracy}%</strong><span className="micro muted">accuracy</span></span>
                </span>
                <SkillResultLine game="pairs" result={sk.result} />
                <button type="button" className="btn btn-primary btn-lg" onClick={start}>Deal again</button>
              </SkillOverlay>
            )}
          </div>
        </Machine>
      </div>
      <SkillPanel game="pairs" how={<>Turn over two cards; matching loot stays face up. Find all eight pairs. You start with 1,000 points and lose 30 for every flip over eight and 4 for every second.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
