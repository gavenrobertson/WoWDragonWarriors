"use client";
// Guild Hall of Fame: guild feats (tiered goals from everyone's Blizzard statistics), title holders and
// favorite dungeons, one view at a time so it stays short on phones. Personal records live on each character page.
import Link from "next/link";
import { useState } from "react";
import { wowIcon } from "@/lib/metrics";
import { classColor } from "@/lib/ui";

export interface FameEntry { slug: string; name: string; className: string; avatarUrl: string | null; level: number; value: number }
export interface HallOfFameData {
  tracked: number;
  members: number;
  totals: { quests: number; dungeons: number; bosses: number; kills: number; hks: number; deaths: number };
  feats: { key: string; name: string; desc: string; icon: string; tiers: number[]; value: number }[];
  titles: { key: string; title: string; label: string; icon: string; holder: FameEntry | null }[];
  dungeons: { name: string; kills: number }[];
}

const n = (v: number) => v.toLocaleString("en-US");
const short = (v: number) => (v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, "")}k` : n(v));
const VIEWS = [["feats", "Guild Feats"], ["titles", "Title Holders"], ["dungeons", "Dungeons"]] as const;
type View = (typeof VIEWS)[number][0];

function Icon({ name, size = 56 }: { name: string; size?: 36 | 56 }) {
  return <span className={`hof-icon${size === 36 ? " sm" : ""}`} aria-hidden="true"><img src={wowIcon(name, size)} alt="" loading="lazy" /></span>;
}

export function HallOfFame({ data }: { data: HallOfFameData }) {
  const [view, setView] = useState<View>("feats");
  const t = data.totals;
  const tiles: [string, number, string][] = [
    ["achievement_quests_completed_08", t.quests, "Quests"], ["achievement_dungeon_classicdungeonmaster", t.dungeons, "Dungeons"],
    ["inv_misc_bone_humanskull_01", t.bosses, "Bosses"], ["ability_warrior_bladestorm", t.kills, "Kills"],
    ["achievement_pvp_a_a", t.hks, "Honor kills"], ["spell_holy_guardianspirit", t.deaths, "Deaths"],
  ];

  if (!data.tracked) {
    return <div className="hof"><p className="wow-scroll hof-wait">The Hall of Fame fills in as member profiles sync from Blizzard (a few every 10 minutes). Check back soon.</p></div>;
  }
  const maxD = Math.max(1, ...data.dungeons.map((d) => d.kills));
  const earned = data.feats.reduce((a, f) => a + f.tiers.filter((x) => f.value >= x).length, 0);
  const possible = data.feats.reduce((a, f) => a + f.tiers.length, 0);

  return (
    <div className="hof">
      <section aria-label="Guild totals" className="hof-totals">
        {tiles.map(([icon, v, label]) => (
          <div key={label} className="hof-total" title={`${n(v)} ${label.toLowerCase()}`}>
            <Icon name={icon} size={36} />
            <strong>{short(v)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <div className="hof-switch" role="tablist" aria-label="Hall of Fame views">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className="hof-switch-btn" onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {view === "feats" && (
        <section aria-label="Guild feats" className="hof-panel">
          <p className="hof-panel-note">The whole guild&apos;s progress, from every member&apos;s Blizzard statistics. <strong>{earned}</strong> of {possible} tiers earned.</p>
          <ul className="hof-feats">
            {data.feats.map((f) => {
              const done = f.tiers.filter((x) => f.value >= x).length;
              const next = f.tiers.find((x) => f.value < x);
              const prev = done ? f.tiers[done - 1] : 0;
              const pct = next ? Math.max(2, ((f.value - prev) / (next - prev)) * 100) : 100;
              return (
                <li key={f.key} title={`${f.desc}: ${n(f.value)}`} className={`hof-feat${done ? " earned" : ""}${!next ? " maxed" : ""}`}>
                  <Icon name={f.icon} />
                  <div className="hof-feat-body">
                    <div className="hof-feat-top">
                      <span className="hof-feat-name">{f.name}</span>
                      <span className="hof-pips" aria-label={`Tier ${done} of ${f.tiers.length}`}>
                        {f.tiers.map((x, i) => <i key={x} className={i < done ? "on" : ""} />)}
                      </span>
                    </div>
                    <span className="hof-feat-desc">{f.desc}</span>
                    <span className="hof-feat-prog">
                      <span className="hof-feat-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      <span className="hof-feat-count">{short(f.value)}{next ? <> / {short(next)}</> : " ✓"}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view === "titles" && (
        <section aria-label="Title holders" className="hof-panel">
          <p className="hof-panel-note">Each title goes to the member with the highest count. Open any character to see their full records.</p>
          <ul className="hof-titles">
            {data.titles.map((ti) => (
              <li key={ti.key}>
                <Icon name={ti.icon} size={36} />
                <span className="hof-title-name"><strong>{ti.title}</strong><span>Most {ti.label}</span></span>
                {ti.holder ? (
                  <Link href={`/characters/${ti.holder.slug}`} className="hof-holder">
                    <span className="hof-face" style={{ width: 28, height: 28, ["--c" as string]: classColor(ti.holder.className) }}>
                      {ti.holder.avatarUrl ? <img src={ti.holder.avatarUrl} alt="" /> : <span>{ti.holder.name.charAt(0)}</span>}
                    </span>
                    <span className="hof-holder-name" style={{ color: classColor(ti.holder.className) }}>{ti.holder.name}</span>
                    <span className="hof-holder-val">{n(ti.holder.value)}</span>
                  </Link>
                ) : (
                  <span className="hof-holder vacant">{ti.key === "raidBosses" ? "Unclaimed · raids open Dec 9" : "Unclaimed"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "dungeons" && (
        <section aria-label="Favorite dungeons" className="hof-panel">
          <p className="hof-panel-note">Boss kills by dungeon, whole guild.</p>
          {data.dungeons.length ? (
            <ul className="hof-bars">
              {data.dungeons.map((d) => (
                <li key={d.name}>
                  <span className="hof-bar-name">{d.name}</span>
                  <span className="hof-bar" aria-hidden="true"><span style={{ width: `${(d.kills / maxD) * 100}%` }} /></span>
                  <span className="hof-bar-val">{n(d.kills)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="hof-empty">No dungeon bosses down yet.</p>}
        </section>
      )}

      <p className="hof-note">From Blizzard character statistics for {data.tracked} of {data.members} members · refreshed as profiles sync</p>
    </div>
  );
}
