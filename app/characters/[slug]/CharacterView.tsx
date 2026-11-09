"use client";
import Link from "next/link";
import { useState } from "react";
import { syncMyCharacter } from "@/app/actions";
import { Avatar, Bar, ItemIcon, StatusDot, vars } from "@/components/bits";
import { IconPlus, IconSync } from "@/components/icons";
import { ModelStage } from "@/components/ModelStage";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import { classColor, qualityColor, STATUS } from "@/lib/ui";

export interface CharacterVM {
  slug: string; name: string; level: number; race: string; className: string; spec: string; role: string; isMain: boolean;
  rank: string; attendance: string; priority: string;
  stats: { label: string; value: string }[];
  legacy: { rank: number; pct: number; milestones: { title: string; when: string }[] } | null;
  profs: { name: string; skill: number; max?: number }[];
  gear: { slot: string; name: string; quality: string; iconUrl?: string | null }[];
  wishlist: { rank: number; name: string; source: string; status: string; iconUrl?: string | null; slot: string }[];
  renderUrl: string | null; syncedAt: string | null;
}

const TABS = [["stats", "Stats"], ["legacy", "Legacy"], ["loot", "Wishlist & loot"], ["prof", "Professions"]] as const;
type Tab = (typeof TABS)[number][0];
const SOURCES: Record<Tab, string> = {
  stats: "Blizzard API · /statistics", legacy: "Blizzard API · /achievements (Legacy)", loot: "Hub database · wishlists, loot council decisions", prof: "Blizzard API · /professions",
};

export function CharacterView({ active, switcher, isOwn, canSync, namespace }: {
  active: CharacterVM; switcher: { slug: string; name: string; level: number; race: string; className: string; isMain: boolean; avatarUrl?: string | null }[];
  isOwn: boolean; canSync: boolean; namespace: string;
}) {
  const [tab, setTab] = useState<Tab>("stats");
  const { pending, run, toast } = useAction();
  const color = classColor(active.className);
  const gearLeft = active.gear.slice(0, 8), gearRight = active.gear.slice(8, 16);

  return (
    <main id="main" tabIndex={-1} className="container page">
      <section aria-label="Characters on this account" className="row" style={{ alignItems: "stretch" }}>
        {switcher.map((c) => {
          const on = c.slug === active.slug;
          return (
            <Link key={c.slug} href={`/characters/${c.slug}`} aria-current={on ? "page" : undefined} className="select-card"
              style={{ flex: "1 1 220px", minHeight: 76, textDecoration: "none", ...(on ? { borderColor: "var(--dw-gold)", background: "var(--dw-selected)" } : {}) }}>
              <Avatar name={c.name} className={c.className} url={c.avatarUrl} />
              <span className="stack" style={{ gap: 0, lineHeight: 1.3, minWidth: 0 }}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="bold" style={{ fontSize: 16, color: classColor(c.className) }}>{c.name}</span>
                  {c.isMain && <span className="tag">MAIN</span>}
                </span>
                <span className="small muted">Level {c.level} {c.race} {c.className}</span>
              </span>
            </Link>
          );
        })}
        {isOwn && (
          <Link href="/sign-in?step=claim" className="select-card dashed" style={{ flex: "0 1 200px", minHeight: 76, textDecoration: "none" }}>
            <IconPlus /> Link a character
          </Link>
        )}
      </section>

      <section aria-labelledby="char-name" className="panel-royal page-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow muted">{active.rank} of Dragon Warriors</span>
          <h1 id="char-name" style={{ fontSize: 46, color }}>{active.name}</h1>
          <span className="soft" style={{ fontSize: 16 }}>Level {active.level} {active.race} {active.className} · {active.spec} · Raid role: {active.role}</span>
          <span className="row micro muted" style={{ gap: 8 }}>
            <StatusDot color={active.syncedAt || !canSync ? STATUS.ok : STATUS.muted} live />
            Synced from Battle.net · /profile/wow/character/{active.slug} · {namespace}
          </span>
        </div>
        <div className="row">
          <div className="inset stack" style={{ gap: 0 }}><span className="micro muted">Attendance</span><span className="bold">{active.attendance}</span></div>
          <div className="inset stack" style={{ gap: 0 }}><span className="micro muted">Loot priority</span><span className="bold">{active.priority}</span></div>
          {canSync && (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => syncMyCharacter(active.slug))}>
              <IconSync /> {pending ? "Syncing…" : "Sync from Armory"}
            </button>
          )}
          {isOwn && <Link href="/loot?tab=wish" className="btn btn-primary">Edit wishlist</Link>}
        </div>
      </section>

      <section aria-label="Equipment and model" className="row" style={{ alignItems: "stretch", gap: 16 }}>
        <GearList label="Equipped, left" gear={gearLeft} />
        <ModelStage name={active.name} color={color} renderUrl={active.renderUrl} slug={active.slug} />
        <GearList label="Equipped, right" gear={gearRight} />
      </section>

      <section aria-label="Character details" className="panel" style={{ padding: 0, gap: 0, borderRadius: 16, overflow: "hidden" }}>
        <div role="tablist" aria-label="Details" className="tablist" style={{ padding: "8px 12px 0" }}>
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" id={`tab-${k}`} aria-controls="char-panel" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div id="char-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="stack" style={{ padding: 24, gap: 16 }}>
          <span className="src">Source: {SOURCES[tab]}</span>

          {tab === "stats" && (active.stats.length ? (
            <div className="grid-fill">
              {active.stats.map((s) => (
                <div key={s.label} className="tile stack" style={{ gap: 0 }}><span className="micro muted">{s.label}</span><span style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</span></div>
              ))}
            </div>
          ) : <p className="soft">Stats appear after the next profile sync.</p>)}

          {tab === "legacy" && (active.legacy ? (
            <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
              <div className="stack" style={{ flex: "1 1 280px", gap: 10 }}>
                <span className="small muted">Legacy rank</span>
                <span className="display gold" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{active.legacy.rank}</span>
                <Bar pct={active.legacy.pct} color="var(--dw-gold-light)" height={10} />
                <span className="small soft">{active.legacy.pct}% to next rank</span>
              </div>
              <ul className="stack" style={{ flex: "2 1 360px", gap: 10 }}>
                {active.legacy.milestones.map((m) => (
                  <li key={m.title} className="tile row between"><span className="strong">{m.title}</span><span className="small muted">{m.when}</span></li>
                ))}
              </ul>
            </div>
          ) : <p className="soft">No Legacy data yet.</p>)}

          {tab === "loot" && (active.wishlist.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {active.wishlist.map((w) => (
                <div key={w.rank} className="tile" style={{ display: "grid", gridTemplateColumns: "40px 40px minmax(0,1fr) auto", alignItems: "center", gap: 14 }}>
                  <span className="bold" style={{ fontSize: 20, color: "var(--dw-gold-link)", textAlign: "center" }}>#{w.rank}</span>
                  <ItemIcon slot={w.slot} quality="epic" iconUrl={w.iconUrl} />
                  <span className="stack" style={{ gap: 0, lineHeight: 1.3 }}><span className="strong" style={{ color: qualityColor("epic") }}>{w.name}</span><span className="micro muted">{w.source}</span></span>
                  <span className="small strong" style={{ color: w.status === "Approved" ? STATUS.ok : "var(--dw-text-2)" }}>{w.status}</span>
                </div>
              ))}
            </div>
          ) : <p className="soft">{active.level < 60 ? "Reach level 60 to build a raid wishlist for this character." : "No wishlist yet. Build one on the Loot hub."}</p>)}

          {tab === "prof" && (active.profs.length ? (
            <div className="grid-fill" style={vars({ "--min": "260px" })}>
              {active.profs.map((p) => (
                <div key={p.name} className="tile stack" style={{ gap: 8, padding: 16 }}>
                  <div className="row between"><span className="strong">{p.name}</span><span className="bold gold">{p.skill} / {p.max ?? 300}</span></div>
                  <Bar pct={(p.skill / (p.max ?? 300)) * 100} color="var(--dw-gold-light)" />
                </div>
              ))}
            </div>
          ) : <p className="soft">No professions synced yet.</p>)}
        </div>
      </section>
      <Toast toast={toast} />
    </main>
  );
}

function GearList({ label, gear }: { label: string; gear: { slot: string; name: string; quality: string; iconUrl?: string | null }[] }) {
  if (!gear.length) {
    return <div className="empty" style={{ flex: "1 1 280px", alignSelf: "flex-start" }}>Gear appears after the next profile sync.</div>;
  }
  return (
    <ul aria-label={label} className="stack" style={{ flex: "1 1 280px", minWidth: 0, gap: 8 }}>
      {gear.map((g, i) => (
        <li key={`${g.slot}-${i}`} className="list-row">
          <ItemIcon slot={g.slot} quality={g.quality} iconUrl={g.iconUrl} />
          <span className="stack" style={{ gap: 0, lineHeight: 1.25, minWidth: 0 }}>
            <span className="strong" style={{ fontSize: 14, color: qualityColor(g.quality) }}>{g.name}</span>
            <span className="micro muted">{g.slot}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
