"use client";
// Shared plumbing for the free skill games: start/finish a scored run on the server, show the result,
// and a side panel with how to play, rewards, your best and the game's top five.
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { skillBegin, skillEnd } from "@/app/arcade/actions";
import { PlayerName } from "@/components/PlayerName";
import { SKILL_META, fmtScore, type SkillId } from "@/lib/skill-games";
import { fmt, useArcade } from "./ArcadeShell";

export type SkillBoardRow = { score: number; name: string | null; surname: string | null; class: string | null; name_style: string | null };
export type SkillProps = { rules: { perPoint: number; maxRun: number; daily: number; pointsHint: string }; best0: number; leftToday0: number; board: SkillBoardRow[] };
export type SkillResult = { score: number; earned: number; note?: string; newBest: boolean };

export function useSkillRun(game: SkillId, best0: number, leftToday0: number) {
  const { signedIn, setBalance, flash } = useArcade();
  const run = useRef<Promise<string | null> | null>(null);
  const [best, setBest] = useState(best0);
  const [left, setLeft] = useState(leftToday0);
  const [result, setResult] = useState<SkillResult | null>(null);
  const low = SKILL_META[game].better === "low";
  const bestRef = useRef(best0); bestRef.current = best;

  const begin = useCallback(() => {
    setResult(null);
    run.current = signedIn ? skillBegin({ game }).then((r) => (r.ok ? r.id : null)).catch(() => null) : Promise.resolve(null);
  }, [game, signedIn]);

  const end = useCallback(async (score: number) => {
    const s = Math.max(0, Math.round(score));
    const prev = bestRef.current;
    const newBest = s > 0 && (prev === 0 || (low ? s < prev : s > prev));
    if (newBest) setBest(s);
    const id = await run.current; run.current = null;
    if (!signedIn) return setResult({ score: s, earned: 0, newBest, note: "Sign in to earn Dragon Marks and get on the leaderboard." });
    if (!id) return setResult({ score: s, earned: 0, newBest, note: "Couldn't reach the server, so this run didn't count." });
    const r = await skillEnd({ game, id, score: s });
    if (!r.ok) return setResult({ score: s, earned: 0, newBest: false, note: r.error });
    setBalance(r.balance); flash(r.earned); setLeft(r.leftToday); if (r.best) setBest(r.best);
    setResult({ score: s, earned: r.earned, newBest, note: r.earned === 0 && s > 0 ? (r.leftToday === 0 ? "You've earned today's limit from this game. Scores still count for the leaderboard." : undefined) : undefined });
  }, [game, signedIn, low, setBalance, flash]);

  return { begin, end, result, best, left, signedIn };
}

/** The result line shown when a run ends. */
export function SkillResultLine({ game, result }: { game: SkillId; result: SkillResult | null }) {
  if (!result) return null;
  return (
    <div className="skill-result" role="status">
      <strong className="skill-score">{fmtScore(game, result.score)}</strong>
      {result.newBest && <span className="skill-best-tag">New best!</span>}
      {result.earned > 0 && <span>+<strong className="gold">{fmt(result.earned)}</strong> marks</span>}
      {result.note && <span className="micro muted">{result.note}</span>}
    </div>
  );
}

export function SkillPanel({ game, how, rules, best, left, board, signedIn }: {
  game: SkillId; how: React.ReactNode; rules: SkillProps["rules"]; best: number; left: number; board: SkillBoardRow[]; signedIn: boolean;
}) {
  return (
    <div className="game-controls panel skill-panel">
      <div className="stack" style={{ gap: 4 }}>
        <h3 style={{ fontSize: 16 }}>How to play</h3>
        <div className="small soft">{how}</div>
      </div>
      <div className="dice-stats">
        <div><span className="micro muted">Your best</span><strong>{best ? fmtScore(game, best) : "—"}</strong></div>
        <div><span className="micro muted">Left today</span><strong className="gold">{signedIn ? fmt(left) : "—"}</strong></div>
      </div>
      <p className="micro muted">Free to play. {rules.pointsHint} Up to {fmt(rules.maxRun)} marks a run and {fmt(rules.daily)} a day.</p>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between baseline"><h3 style={{ fontSize: 16 }}>Top players</h3><Link href="/arcade/leaderboard" className="micro">Leaderboard</Link></div>
        {board.length ? (
          <ol className="snake-board">
            {board.slice(0, 5).map((b, i) => (
              <li key={i}><span className="micro muted">{i + 1}</span>
                <PlayerName name={`${b.name ?? "Someone"} ${b.surname ?? ""}`.trim()} className={b.class} nameStyle={b.name_style} showTitle={false} />
                <strong>{fmtScore(game, Number(b.score))}</strong></li>
            ))}
          </ol>
        ) : <span className="micro muted">No scores yet. Be the first.</span>}
      </div>
    </div>
  );
}

/** Big centred overlay used for the start and end screens. */
export function SkillOverlay({ children }: { children: React.ReactNode }) {
  return <div className="skill-overlay">{children}</div>;
}
