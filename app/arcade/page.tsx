import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { BENCH_MARKS, COUNCIL_VOTE_MARKS, OBSERVER_MARKS, RAID_MARKS, WELCOME_MARKS, WHEEL, canSpinToday, leaderboard, recentWins, wallet } from "@/lib/arcade";
import { CHESTS, cosmeticById, RARITY_COLOR } from "@/lib/cosmetics";
import { PlayerName } from "@/components/PlayerName";
import { DailyWheel } from "@/components/arcade/DailyWheel";
import { WelcomeBonus } from "@/components/arcade/WelcomeBonus";
import { GAMES, fmt, wowIconUrl } from "@/lib/arcade-games";

export const metadata: Metadata = { title: "Arcade", description: "The Dragon Warriors arcade: Plinko, Mines, Dragonflight and more. Win Dragon Marks and open chests for name styles, titles and site themes." };

const GAME_LABEL: Record<string, string> = { plinko: "Plinko", mines: "Mines", crash: "Dragonflight", hilo: "Higher or Lower", slots: "Dragon's Hoard", dice: "Dice", coinflip: "Faction Flip", wheel: "Daily Wheel" };

export default async function ArcadeLobby() {
  const v = await getViewer();
  const live = v.signedIn && !v.demo && v.userId;
  const [w, board, wins] = await Promise.all([
    live ? wallet(v.userId!) : Promise.resolve(null),
    v.demo ? Promise.resolve([]) : leaderboard().catch(() => []),
    v.demo ? Promise.resolve([]) : recentWins().catch(() => []),
  ]);
  return (
    <div className="arcade-lobby">
      {w && !w.welcomed && <WelcomeBonus marks={WELCOME_MARKS} />}
      <section className="panel-royal arcade-hero">
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">The Dragon Warriors Arcade</span>
          <h1>Arcade</h1>
          <p className="soft" style={{ fontSize: 16, maxWidth: 620 }}>Spin the wheel every day for free Dragon Marks, play for more, then crack open chests for glowing and chrome name colours, titles and whole new looks for the site.</p>
        </div>
        <DailyWheel segments={WHEEL.map((s) => s.marks)} canSpin={!!w && canSpinToday(w.lastDaily)} streak={w?.streak ?? 0} signedIn={!!w} />
      </section>

      <section aria-labelledby="earn-h" className="panel earn-panel">
        <h2 id="earn-h">Ways to earn Dragon Marks</h2>
        <ul className="earn-list">
          <li><img src={wowIconUrl("inv_misc_coin_02", 36)} alt="" /><span><strong>Daily wheel</strong><span className="micro muted">{fmt(WHEEL[0].marks)} to {fmt(WHEEL[WHEEL.length - 1].marks)}, more with a streak</span></span></li>
          <li><img src={wowIconUrl("inv_box_02", 36)} alt="" /><span><strong>Chests from play</strong><span className="micro muted">Every bet can drop a chest; bigger bets, better odds</span></span></li>
          <li><img src={wowIconUrl("inv_box_04", 36)} alt="" /><span><strong>Monthly chests</strong><span className="micro muted">Everyone gets 3 Copper-Bound, 2 Gilded and a Dragon&apos;s Hoard at the end of every month</span></span></li>
          <li><img src={wowIconUrl("achievement_boss_onyxia", 36)} alt="" /><span><strong>+{fmt(RAID_MARKS)} per raid</strong><span className="micro muted">Sign up and show up ({fmt(BENCH_MARKS)} if benched), paid after the raid</span></span></li>
          <li><img src={wowIconUrl("inv_misc_note_06", 36)} alt="" /><span><strong>+{COUNCIL_VOTE_MARKS} per council vote</strong><span className="micro muted">Officers who vote, every item awarded</span></span></li>
          <li><img src={wowIconUrl("inv_misc_ticket_darkmoon_01", 36)} alt="" /><span><strong>+{OBSERVER_MARKS} for observing</strong><span className="micro muted">Back a contender in the council pool, win or lose</span></span></li>
        </ul>
      </section>

      <section aria-labelledby="games-h" className="stack" style={{ gap: 12 }}>
        <h2 id="games-h">Games</h2>
        <div className="arcade-games">
          {GAMES.map((g, i) => (
            <Link key={g.slug} href={`/arcade/${g.slug}`} className="arcade-game-card" style={{ ["--i" as string]: i }}>
              <span className="hof-icon"><img src={wowIconUrl(g.icon)} alt="" /></span>
              <span className="stack" style={{ gap: 2 }}><strong>{g.name}</strong><span className="micro muted">{g.blurb}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <div className="arcade-split">
        <section aria-labelledby="chests-h" className="panel stack" style={{ gap: 12 }}>
          <div className="row between baseline"><h2 id="chests-h">Chests</h2><Link href="/arcade/chests" className="small">Open chests →</Link></div>
          <div className="arcade-chest-row">
            {CHESTS.map((c) => (
              <Link key={c.id} href={`/arcade/chests#${c.id}`} className="arcade-chest-mini">
                <span className="hof-icon"><img src={wowIconUrl(c.icon)} alt="" /></span>
                <span className="stack" style={{ gap: 0 }}><strong>{c.name}</strong><span className="micro"><span className="mark-coin sm" aria-hidden="true" /> {c.price.toLocaleString("en-US")}</span></span>
              </Link>
            ))}
          </div>
          <p className="micro muted">Name colours (glowing, chrome, living flame), titles, and site themes like Fel Corruption and Frozen Throne.</p>
        </section>

        <section aria-labelledby="lb-h" className="panel stack" style={{ gap: 10 }}>
          <h2 id="lb-h">Richest in the guild</h2>
          {board.length === 0 ? <p className="micro muted">No one has played yet. Be first.</p> : (
            <ol className="arcade-lb">
              {board.map((r, i) => (
                <li key={i}>
                  <span className="arcade-lb-rank">{i + 1}</span>
                  {r.slug ? <Link href={`/characters/${r.slug}`}><PlayerName name={`${r.name ?? "?"} ${r.surname ?? ""}`.trim()} className={r.class} nameStyle={r.name_style} title={r.title} /></Link> : <span className="muted">Unclaimed hero</span>}
                  <span className="arcade-lb-marks"><span className="mark-coin sm" aria-hidden="true" /> {r.marks.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {wins.length > 0 && (
        <section aria-labelledby="wins-h" className="panel stack" style={{ gap: 10 }}>
          <h2 id="wins-h">Big wins</h2>
          <ul className="arcade-wins">
            {wins.map((p, i) => {
              const d = p.detail ? JSON.parse(p.detail) : {};
              const item = d.item ? cosmeticById(d.item) : null;
              return (
                <li key={i}>
                  <PlayerName name={`${p.name ?? "Someone"} ${p.surname ?? ""}`.trim()} className={p.class} nameStyle={p.name_style} showTitle={false} />
                  {item ? <span>found <strong style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</strong></span>
                    : <span>won <strong className="gold">{p.payout.toLocaleString("en-US")}</strong> on {GAME_LABEL[p.game] ?? p.game} ({(p.payout / Math.max(1, p.bet)).toFixed(1)}×)</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
