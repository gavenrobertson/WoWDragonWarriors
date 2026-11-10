"use client";
// Hoard Pairs: find the eight matching pairs of loot. Score out of 1,000: fewer flips and less time is better.
import { useEffect, useRef, useState } from "react";
import { wowIconUrl } from "./ArcadeShell";
import { SkillOverlay, SkillPanel, SkillResultLine, useSkillRun, type SkillProps } from "./SkillKit";

const LOOT = ["inv_sword_04", "inv_misc_bag_10", "inv_misc_rune_01", "inv_misc_orb_05", "inv_misc_coin_02", "inv_box_02", "inv_misc_gem_ruby_01", "inv_misc_head_dragon_01"];
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
  const t0 = useRef(0);
  const lock = useRef(false);

  useEffect(() => {
    if (state !== "on") return;
    const id = setInterval(() => setSecs(Math.floor((performance.now() - t0.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [state]);

  const start = () => { setCards(deal()); setOpen([]); setFound(new Set()); setMoves(0); setSecs(0); t0.current = performance.now(); lock.current = false; setState("on"); sk.begin(); };

  const flip = (i: number) => {
    if (state !== "on" || lock.current || open.includes(i) || found.has(cards[i].icon)) return;
    const o = [...open, i];
    setOpen(o);
    if (o.length === 2) {
      const m = moves + 1; setMoves(m);
      if (cards[o[0]].icon === cards[o[1]].icon) {
        const f = new Set(found); f.add(cards[i].icon); setFound(f); setOpen([]);
        if (f.size === LOOT.length) {
          const s = (performance.now() - t0.current) / 1000;
          setSecs(Math.floor(s)); setState("done");
          void sk.end(pairsScore(m, s));
        }
      } else { lock.current = true; setTimeout(() => { setOpen([]); lock.current = false; }, 750); }
    }
  };

  return (
    <div className="game-layout skill-layout">
      <div className="game-stage skill-stage">
        <div className="skill-hud">
          <span><span className="micro muted">Time</span><strong>{secs}s</strong></span>
          <span><span className="micro muted">Flips</span><strong>{moves}</strong></span>
          <span><span className="micro muted">Pairs</span><strong>{found.size} / {LOOT.length}</strong></span>
        </div>
        <div className="pr-grid">
          {cards.map((c, i) => {
            const up = open.includes(i) || found.has(c.icon);
            return (
              <button key={c.k} type="button" className={`pr-card${up ? " up" : ""}${found.has(c.icon) ? " found" : ""}`} onClick={() => flip(i)} aria-label={up ? "Revealed card" : "Hidden card"}>
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
            <strong className="snake-big">Hoard sorted</strong>
            <span className="soft">{moves} flips in {secs} seconds.</span>
            <SkillResultLine game="pairs" result={sk.result} />
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Deal again</button>
          </SkillOverlay>
        )}
      </div>
      <SkillPanel game="pairs" how={<>Turn over two cards; matching loot stays face up. Find all eight pairs. You start with 1,000 points and lose 30 for every flip over eight and 4 for every second.</>}
        rules={rules} best={sk.best} left={sk.left} board={board} signedIn={sk.signedIn} />
    </div>
  );
}
