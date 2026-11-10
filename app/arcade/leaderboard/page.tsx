import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { monthRange, skillBoard, type BoardRow } from "@/lib/arcade";
import { CHESTS } from "@/lib/cosmetics";
import { MONTHLY_PRIZES, SKILL_IDS, SKILL_META, fmtScore } from "@/lib/skill-games";
import { wowIconUrl } from "@/lib/arcade-games";
import { PlayerName } from "@/components/PlayerName";

export const metadata: Metadata = { title: "Leaderboard · DW Arcade" };

type Props = { searchParams: Promise<{ t?: string }> };

export default async function LeaderboardPage({ searchParams }: Props) {
  const { t } = await searchParams;
  const all = t === "all";
  const v = await getViewer();
  const month = monthRange();
  const boards = v.demo ? SKILL_IDS.map(() => [] as BoardRow[]) : await Promise.all(SKILL_IDS.map((g) => skillBoard(g, all ? {} : { from: month.from, to: month.to }).catch(() => [] as BoardRow[])));
  const nextMonth = new Date(month.to).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" });
  const chestName = (id: string) => CHESTS.find((c) => c.id === id)?.name ?? id;

  return (
    <section className="arcade-game" aria-labelledby="lb-title">
      <div className="arcade-game-head">
        <h1 id="lb-title">Leaderboard</h1>
        <span className="soft">The best scores in every skill game. Top three each month win prizes.</span>
      </div>

      <nav className="segmented lb-tabs" aria-label="Leaderboard period">
        <Link href="/arcade/leaderboard" aria-selected={!all} role="tab">This month</Link>
        <Link href="/arcade/leaderboard?t=all" aria-selected={all} role="tab">All time</Link>
      </nav>

      {!all && (
        <div className="panel lb-prizes">
          <strong>{month.label} prizes, paid {nextMonth}</strong>
          <span className="lb-prize-row">
            {MONTHLY_PRIZES.map((p) => (
              <span key={p.place} className="lb-prize"><span className={`lb-place p${p.place[0]}`}>{p.place}</span> {p.marks.toLocaleString("en-US")} marks + {chestName(p.chest)}</span>
            ))}
          </span>
          <span className="micro muted">In every game. 8-ball ranks by wins this month; Interrupt! by your fastest average.</span>
        </div>
      )}

      <div className="lb-grid">
        {SKILL_IDS.map((g, gi) => {
          const meta = SKILL_META[g], rows = boards[gi];
          return (
            <article key={g} className="panel lb-card">
              <Link href={`/arcade/${g}`} className="lb-head">
                <img src={wowIconUrl(meta.icon, 56)} alt="" width={36} height={36} />
                <span><strong>{meta.name}</strong><span className="micro muted">{meta.agg === "wins" ? "Most wins" : meta.better === "low" ? "Fastest average" : `Best ${meta.unit}`}</span></span>
                <span className="micro lb-play">Play ›</span>
              </Link>
              {rows.length ? (
                <ol className="lb-list">
                  {rows.map((r, i) => (
                    <li key={r.user_id} className={`${r.user_id === v.userId ? "me " : ""}${i < 3 ? `top p${i + 1}` : ""}`}>
                      <span className="lb-rank">{i + 1}</span>
                      <PlayerName name={`${r.name ?? "Someone"} ${r.surname ?? ""}`.trim()} className={r.class} nameStyle={r.name_style} showTitle={false} />
                      <strong>{meta.agg === "wins" ? `${r.score} win${Number(r.score) === 1 ? "" : "s"}` : fmtScore(g, Number(r.score))}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="micro muted lb-empty">{all ? "No scores yet." : "No scores this month yet. The first one takes the crown."}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
