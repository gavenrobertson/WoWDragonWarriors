import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { Medallion } from "@/components/Medallion";
import { Avatar, Bar, vars } from "@/components/bits";
import { SITE, isDemo } from "@/lib/config";
import { LEVEL_BANDS_SAMPLE, getCharacters, getEvents, store } from "@/lib/store";
import { classColor, timeAgo } from "@/lib/ui";

const BAND_COLORS = ["#E3B341", "#D4A537", "#A9832E", "#7D6127", "#56441F"];

export default async function HomePage() {
  const [chars, events, announcements, bank, memberTotal] = await Promise.all([
    getCharacters(), getEvents(), store().announcements(), store().bank(), store().memberTotal(),
  ]);
  const members = chars.filter((c) => c.inGuild);

  const bands = isDemo()
    ? LEVEL_BANDS_SAMPLE
    : [
        { band: "Level 60", count: members.filter((m) => m.level >= 60).length },
        { band: "50–59", count: members.filter((m) => m.level >= 50 && m.level < 60).length },
        { band: "40–49", count: members.filter((m) => m.level >= 40 && m.level < 50).length },
        { band: "30–39", count: members.filter((m) => m.level >= 30 && m.level < 40).length },
        { band: "Under 30", count: members.filter((m) => m.level < 30).length },
      ];
  const maxBand = Math.max(1, ...bands.map((b) => b.count));
  const at60 = bands[0].count;

  const signedFor = (raid: string) => {
    const e = events.find((ev) => ev.raid === raid);
    return e ? e.signups.filter((s) => s.status !== "declined").length + e.extraSigned : 0;
  };
  const hyjal = signedFor("hyjal-summit");
  const barrowGroups = Math.floor(signedFor("barrow-deeps") / 8);
  const raids = [
    { name: "Onyxia’s Lair", size: "40 players · 1 boss", metric: "Raiders at 60", count: `${at60} / 40`, pct: (at60 / 40) * 100, note: "Main team. Fire resistance check before first pull." },
    { name: "Hyjal Summit", size: "20 players", metric: "Team A signed up", count: `${hyjal} / 20`, pct: (hyjal / 20) * 100, note: hyjal >= 20 ? "Team A is full." : "Needs 2 healers and 1 tank." },
    { name: "Barrow Deeps", size: "10 players", metric: "Groups forming", count: `${barrowGroups} group${barrowGroups === 1 ? "" : "s"}`, pct: Math.min(100, barrowGroups * 50), note: "Alt-friendly. Run it on off nights." },
  ];

  const recent = [...members].filter((m) => m.lastSeenMin != null).sort((a, b) => a.lastSeenMin! - b.lastSeenMin!).slice(0, 6);
  const crafters = new Map<string, { name: string; className: string; skill: number }>();
  for (const c of members) for (const p of c.professions) {
    if (["Mining", "Herbalism", "Skinning", "Fishing", "Cooking", "First Aid"].includes(p.name)) continue;
    const cur = crafters.get(p.name);
    if (!cur || p.skill > cur.skill) crafters.set(p.name, { name: c.name, className: c.className, skill: p.skill });
  }
  const crafterList = [...crafters.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);

  return (
    <main id="main" tabIndex={-1} className="container page" style={{ paddingTop: 40, gap: 32 }}>
      <section aria-labelledby="hero-title" className="hero">
        <div className="stack" style={{ flex: "999 1 520px", minWidth: 0, "--gap": "18px" } as React.CSSProperties}>
          <span className="eyebrow">Phase 1 · First raid week</span>
          <h1 id="hero-title" className="title-xl">Raids open December 9</h1>
          <p className="lead">Onyxia&apos;s Lair, Hyjal Summit and the Barrow Deeps unlock together. Hit 60, lock in your wishlist, and claim a spot for the guild&apos;s first clear.</p>
          <div className="row" style={{ marginTop: 6 }}>
            <Link href="/raids" className="btn btn-primary btn-lg">Sign up for raid night</Link>
            <Link href="/loot?tab=wish" className="btn btn-lg">Build your wishlist</Link>
          </div>
        </div>
        <div className="inset stack countdown-card" data-tilt style={{ flex: "1 1 300px", justifyContent: "center", alignItems: "stretch", padding: 28, borderRadius: 12, "--gap": "8px" } as React.CSSProperties}>
          <div className="row" style={{ gap: 14, flexWrap: "nowrap", marginBottom: 6 }}>
            <Medallion size={84} />
            <span className="small muted">Time until raids unlock</span>
          </div>
          <Countdown target={SITE.raidUnlock} />
          <span className="soft" style={{ fontSize: 14 }}>Wednesday, December 9, 2026</span>
        </div>
      </section>

      <section aria-labelledby="ready-title" className="stack" style={vars({ "--gap": "16px" })}>
        <div className="row between baseline">
          <h2 id="ready-title" style={{ fontSize: 26 }}>Raid readiness</h2>
          <Link href="/raids" className="small strong">Open raid calendar</Link>
        </div>
        <div className="grid-auto">
          {raids.map((r) => (
            <article key={r.name} className="panel raid-card" data-tilt style={{ gap: 14 }}>
              <div className="row between" style={{ alignItems: "flex-start" }}>
                <div className="stack" style={vars({ "--gap": "2px" })}>
                  <h3 className="display" style={{ fontSize: 20 }}>{r.name}</h3>
                  <span className="small muted">{r.size}</span>
                </div>
                <span className="pill">Dec 9</span>
              </div>
              <div className="stack" style={vars({ "--gap": "6px" })}>
                <div className="row between small"><span className="soft">{r.metric}</span><span className="strong">{r.count}</span></div>
                <Bar pct={r.pct} />
              </div>
              <span className="small muted">{r.note}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="split">
        <div className="main-col stack" style={vars({ "--gap": "24px" })}>
          <section aria-labelledby="road-title" className="panel" style={{ gap: 18 }}>
            <div className="row between baseline">
              <h2 id="road-title">Road to 60</h2>
              <span className="small muted">{memberTotal} members · level cap 60 · Blizzard API guild roster</span>
            </div>
            <div className="stack">
              {bands.map((l, i) => (
                <div key={l.band} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) 40px", alignItems: "center", gap: 14, fontSize: 14 }}>
                  <span className="soft">{l.band}</span>
                  <Bar pct={(l.count / maxBand) * 100} color={BAND_COLORS[i]} height={14} />
                  <span className="strong" style={{ textAlign: "right" }}>{l.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="news-title" className="panel" style={{ gap: 18 }}>
            <h2 id="news-title">Officer announcements</h2>
            {announcements.length === 0 && <p className="soft">No announcements yet. Officers post them from Admin › Events &amp; news.</p>}
            <div className="stack divided" style={vars({ "--gap": "18px" })}>
              {announcements.map((a, i) => (
                <article key={a.id} className="stack" style={{ "--gap": "6px", paddingTop: i ? 18 : 0 } as React.CSSProperties}>
                  <div className="row small muted" style={vars({ "--gap": "10px" })}>
                    <span className="strong" style={{ color: a.authorColor ?? "var(--dw-gold-link)" }}>{a.author}</span><span>{a.authorRole}</span><span>·</span><span>{a.date}</span>
                  </div>
                  <h3>{a.title}</h3>
                  <p className="soft" style={{ whiteSpace: "pre-line" }}>{a.body}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="side-col stack" style={vars({ "--gap": "24px" })}>
          <section aria-labelledby="online-title" className="panel" style={{ gap: 14 }}>
            <div className="row between baseline">
              <h2 id="online-title">Recently active</h2>
              <Link href="/roster" className="small strong">Full roster</Link>
            </div>
            <span className="src">From each character&apos;s last logout · Blizzard API</span>
            {recent.length === 0 ? <p className="soft small">No roster data yet. The roster sync runs every 30 minutes.</p> : (
              <ul>
                {recent.map((m) => (
                  <li key={m.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid #241A33" }}>
                    <Link href={`/characters/${m.slug}`} className="row" style={{ textDecoration: "none", gap: 10, flexWrap: "nowrap" }}>
                      <Avatar name={m.fullName} className={m.className} size={36} url={m.avatarUrl} />
                      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                        <span className="strong" style={{ color: classColor(m.className) }}>{m.fullName}</span>
                        <span className="micro muted">{m.className} · {timeAgo(m.lastSeenMin)}</span>
                      </span>
                    </Link>
                    <span className="small strong soft">{m.level}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="bank-title" className="panel" style={{ gap: 14 }}>
            <h2 id="bank-title">Guild bank</h2>
            <div className="row baseline" style={vars({ "--gap": "8px" })}>
              <span style={{ fontSize: 28, fontWeight: 700, color: "var(--dw-gold-light)" }}>{bank.gold != null ? Math.floor(bank.gold / 10000).toLocaleString("en-US") : "[GOLD]"}</span>
              <span className="muted">gold</span>
            </div>
            <p className="soft" style={{ fontSize: 14 }}>Consumables fund for raid night: flasks, potions and repair costs.</p>
            <span className="src">No Blizzard API for bank contents · synced by the guild addon export</span>
            <Link href="/roster?tab=bank" className="small strong">Request materials</Link>
          </section>

          <section aria-labelledby="craft-title" className="panel" style={{ gap: 12 }}>
            <h2 id="craft-title">Crafters</h2>
            <span className="src">Blizzard API · /professions per character</span>
            {crafterList.length === 0 && <p className="soft small">Crafters appear once profiles sync.</p>}
            {crafterList.map(([prof, c]) => (
              <div key={prof} className="row between" style={{ fontSize: 14 }}>
                <span className="soft">{prof}</span>
                <span className="strong" style={{ color: classColor(c.className) }}>{c.name}</span>
              </div>
            ))}
            <Link href="/roster?tab=craft" className="small strong">Crafting directory</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
