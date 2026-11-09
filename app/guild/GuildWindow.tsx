"use client";
// Public guild view styled after WoW's in-game guild window: framed panel, circular crest portrait,
// gold title plate, green Message of the Day, sortable roster with class icons, tabs along the bottom.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GuildProfile } from "@/lib/store";
import { classColor, timeAgo } from "@/lib/ui";

export interface GuildMember { slug: string; name: string; level: number; className: string; classIcon: string | null; rank: string; rankIndex: number; lastSeenMin: number | null; race: string }
type SortKey = "name" | "level" | "className" | "rank" | "seen";

export function GuildWindow({ profile, members, motd, info, isMember, signedIn }: {
  profile: GuildProfile; members: GuildMember[]; motd: string; info: string; isMember: boolean; signedIn: boolean;
}) {
  const [tab, setTab] = useState<"roster" | "info">("roster");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const cmp: Record<SortKey, (a: GuildMember, b: GuildMember) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      level: (a, b) => a.level - b.level,
      className: (a, b) => a.className.localeCompare(b.className),
      rank: (a, b) => a.rankIndex - b.rankIndex || b.level - a.level,
      seen: (a, b) => (a.lastSeenMin ?? 1e12) - (b.lastSeenMin ?? 1e12),
    };
    return members
      .filter((m) => !q || `${m.name} ${m.className} ${m.rank}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => cmp[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name));
  }, [members, sort, q]);

  const head = (key: SortKey, label: string, cls = "") => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="wow-sort" onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === "level" ? -1 : 1 })}>
        {label}{sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
  const founded = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
  const at60 = members.filter((m) => m.level >= 60).length;
  const classes = [...new Set(members.map((m) => m.className))].length;

  return (
    <div className="wow-shell">
    <section className="wow-window" aria-labelledby="guild-name">
      <div className="wow-portrait" aria-hidden="true"><img src="/assets/crest-256.jpg" alt="" /></div>
      <div className="wow-titlebar">
        <h1 id="guild-name" className="wow-title">{profile.name}</h1>
      </div>

      <div className="wow-subhead">
        <span className="wow-faction" data-faction={profile.faction.toLowerCase()}>&lt;{profile.faction}&gt;</span>
        <span>WoW Forever · {profile.ruleset}</span>
        <span>Guild Members: <strong>{profile.memberCount}</strong></span>
      </div>

      {motd && (
        <p className="wow-motd"><span className="wow-motd-label">Guild Message of the Day:</span> {motd}</p>
      )}

      <div className="wow-body">
        {tab === "roster" ? (
          <>
            <div className="wow-toolbar">
              <label className="wow-search">
                <span className="visually-hidden">Search the roster</span>
                <input type="search" placeholder="Search name, class or rank" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <span className="wow-count">{rows.length} of {members.length} shown</span>
            </div>
            <div className="wow-list" role="region" aria-label="Guild roster" tabIndex={0}>
              <table className="wow-table">
                <thead>
                  <tr>{head("name", "Name")}{head("level", "Level", "num")}{head("className", "Class")}{head("rank", "Rank")}{head("seen", "Last Seen")}</tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={5} className="wow-empty">{members.length ? "No members match." : "The roster syncs from Blizzard every 30 minutes."}</td></tr>}
                  {rows.map((m) => (
                    <tr key={m.slug}>
                      <td>
                        <Link href={`/characters/${m.slug}`} className="wow-name" style={{ color: classColor(m.className) }}>{m.name}</Link>
                      </td>
                      <td className="num">{m.level}</td>
                      <td>
                        <span className="wow-class">
                          {m.classIcon && <img src={m.classIcon} alt="" width={20} height={20} />}
                          <span>{m.className}</span>
                        </span>
                      </td>
                      <td className="wow-rank">{m.rank}</td>
                      <td className="wow-seen">{timeAgo(m.lastSeenMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="wow-info">
            <div className="wow-scroll">
              {(info || "Officers haven't written the guild information yet.").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <dl className="wow-facts">
              <div><dt>Faction</dt><dd data-faction={profile.faction.toLowerCase()}>{profile.faction}</dd></div>
              <div><dt>Ruleset</dt><dd>{profile.ruleset}</dd></div>
              {founded && <div><dt>Founded</dt><dd>{founded}</dd></div>}
              <div><dt>Members</dt><dd>{profile.memberCount}</dd></div>
              <div><dt>At level 60</dt><dd>{at60}</dd></div>
              <div><dt>Classes</dt><dd>{classes}</dd></div>
            </dl>
          </div>
        )}
      </div>

      <div className="wow-footer">
        <span className="wow-footer-note">Roster from the Blizzard API · updated every 30 minutes</span>
        {isMember ? (
          <Link href="/" className="wow-button">Open the guild hub</Link>
        ) : (
          <Link href={signedIn ? "/sign-in?step=apply" : "/apply"} className="wow-button">Apply to join</Link>
        )}
      </div>


    </section>
    <div className="wow-tabs" role="tablist" aria-label="Guild window">
        <button type="button" role="tab" aria-selected={tab === "roster"} className="wow-tab" onClick={() => setTab("roster")}>Roster</button>
        <button type="button" role="tab" aria-selected={tab === "info"} className="wow-tab" onClick={() => setTab("info")}>Guild Info</button>
      </div>
    </div>
  );
}
