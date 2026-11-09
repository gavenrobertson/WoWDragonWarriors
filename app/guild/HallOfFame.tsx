"use client";
// Guild Hall of Fame: leaderboards built from each member's Blizzard character statistics.
import Link from "next/link";
import { GROUPS, type MetricGroup } from "@/lib/metrics";
import { classColor } from "@/lib/ui";

export interface FameEntry { slug: string; name: string; className: string; avatarUrl: string | null; level: number; value: number }
export interface FameBoard { key: string; title: string; label: string; group: MetricGroup; glyph: string; top: FameEntry[] }
export interface HallOfFameData {
  tracked: number;
  members: number;
  totals: { quests: number; dungeons: number; bosses: number; kills: number; hks: number; deaths: number };
  boards: FameBoard[];
  dungeons: { name: string; kills: number }[];
}

const n = (v: number) => v.toLocaleString("en-US");

function Face({ e, size }: { e: FameEntry; size: number }) {
  const c = classColor(e.className);
  return (
    <span className="hof-face" style={{ width: size, height: size, ["--c" as string]: c }}>
      {e.avatarUrl ? <img src={e.avatarUrl} alt="" /> : <span>{e.name.charAt(0)}</span>}
    </span>
  );
}

function Board({ b, i }: { b: FameBoard; i: number }) {
  const [first, ...rest] = b.top;
  return (
    <article className="hof-card" style={{ ["--i" as string]: i }}>
      <header className="hof-card-head">
        <span className="hof-glyph" aria-hidden="true">{b.glyph}</span>
        <span className="hof-card-titles">
          <h3>{b.title}</h3>
          <span>Most {b.label}</span>
        </span>
      </header>
      {first ? (
        <>
          <Link href={`/characters/${first.slug}`} className="hof-champ">
            <span className="hof-crown" aria-hidden="true">♛</span>
            <Face e={first} size={56} />
            <span className="hof-champ-name" style={{ color: classColor(first.className) }}>{first.name}</span>
            <span className="hof-champ-val">{n(first.value)}<small> {b.label}</small></span>
          </Link>
          {rest.length > 0 && (
            <ol className="hof-runners" start={2}>
              {rest.map((e, k) => (
                <li key={e.slug}>
                  <span className={`hof-medal m${k + 2}`} aria-label={k === 0 ? "Second" : "Third"}>{k + 2}</span>
                  <Face e={e} size={26} />
                  <Link href={`/characters/${e.slug}`} style={{ color: classColor(e.className) }}>{e.name}</Link>
                  <span className="hof-run-val">{n(e.value)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <p className="hof-empty">{b.key === "raidBosses" ? "Raids open December 9. Who takes the first kill?" : "No one has claimed this title yet."}</p>
      )}
    </article>
  );
}

export function HallOfFame({ data }: { data: HallOfFameData }) {
  const t = data.totals;
  const tiles: [string, number, string][] = [
    ["❗", t.quests, "Quests completed"], ["🗝", t.dungeons, "Dungeons entered"], ["💀", t.bosses, "Bosses slain"],
    ["⚔", t.kills, "Total kills"], ["🛡", t.hks, "Honorable kills"], ["👻", t.deaths, "Deaths"],
  ];
  const maxD = Math.max(1, ...data.dungeons.map((d) => d.kills));
  let i = 0;

  if (!data.tracked) {
    return (
      <div className="hof">
        <p className="wow-scroll hof-wait">The Hall of Fame fills in as member profiles sync from Blizzard (a few every 10 minutes). Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="hof">
      <section aria-label="Guild totals" className="hof-totals">
        {tiles.map(([g, v, label]) => (
          <div key={label} className="hof-total">
            <span className="hof-total-glyph" aria-hidden="true">{g}</span>
            <strong>{n(v)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <p className="hof-note">Guild-wide, across {data.tracked} of {data.members} members · from Blizzard character statistics, refreshed as profiles sync</p>

      {GROUPS.map((g) => (
        <section key={g.id} className="hof-group" aria-labelledby={`hof-${g.id}`}>
          <div className="hof-group-head">
            <h2 id={`hof-${g.id}`}>{g.title}</h2>
            <span>{g.blurb}</span>
          </div>
          <div className="hof-grid">
            {data.boards.filter((b) => b.group === g.id).map((b) => <Board key={b.key} b={b} i={i++} />)}
            {g.id === "legends" && data.dungeons.length > 0 && (
              <article className="hof-card hof-wide" style={{ ["--i" as string]: i++ }}>
                <header className="hof-card-head">
                  <span className="hof-glyph" aria-hidden="true">🏰</span>
                  <span className="hof-card-titles"><h3>Favorite Haunts</h3><span>Boss kills by dungeon, whole guild</span></span>
                </header>
                <ul className="hof-bars">
                  {data.dungeons.map((d) => (
                    <li key={d.name}>
                      <span className="hof-bar-name">{d.name}</span>
                      <span className="hof-bar" aria-hidden="true"><span style={{ width: `${(d.kills / maxD) * 100}%` }} /></span>
                      <span className="hof-bar-val">{n(d.kills)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
