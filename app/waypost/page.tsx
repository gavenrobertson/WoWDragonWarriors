import type { Metadata } from "next";
import Link from "next/link";
import { WAYPOST, WAYPOST_COMMANDS, WAYPOST_FEATURES } from "@/lib/waypost";
import { DISCORD_INVITE } from "@/lib/links";
import "../styles/waypost.css";

export const metadata: Metadata = {
  title: "Waypost: leveling guide addon",
  description: "Waypost is the Dragon Warriors leveling guide addon for WoW Forever: routes from 1 to 60 for every race, a 3D arrow, auto quest pickup and a guild leveling board. Free and open source on CurseForge.",
  openGraph: { title: "Waypost: leveling guide addon for WoW Forever", images: [{ url: "/assets/waypost/banner-1600.webp", width: 1600, height: 400 }] },
};

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

function FeatureIcon({ name }: { name: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const shapes: Record<string, React.ReactNode> = {
    window: <><rect x="3.5" y="4" width="17" height="16" rx="2" {...p} /><path d="M3.5 8.5h17M7 12.5h7M7 16h4" {...p} /></>,
    arrow: <path d="M12 3l7 9h-4v9H9v-9H5z" {...p} />,
    hand: <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5V4a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V13c0 4.5-2.5 8-6.5 8-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14" {...p} />,
    compass: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M15.5 8.5l-2 5-5 2 2-5z" {...p} /></>,
    party: <><circle cx="8" cy="8.5" r="2.8" {...p} /><circle cx="16.5" cy="9.5" r="2.3" {...p} /><path d="M3 19c.6-3.3 2.6-5 5-5s4.4 1.7 5 5M13.5 14.6c.9-.7 1.9-1 3-1 2.1 0 3.6 1.5 4 4.4" {...p} /></>,
    spark: <path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.7z" {...p} />,
  };
  return <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">{shapes[name]}</svg>;
}

/** A picture of the addon's guide window, drawn in HTML so it stays crisp and themes with the site. */
function GuideWindowMock() {
  return (
    <figure className="wp-window" aria-label="Illustration of the Waypost guide window">
      <div className="wp-window-bar">
        <img src="/assets/waypost/icon-128.webp" alt="" width={20} height={20} />
        <span>Waypost</span>
        <span className="wp-window-guide">Elwynn Forest · 6–10</span>
      </div>
      <div className="wp-arrow-wrap" aria-hidden="true">
        <span className="wp-arrow" />
        <span className="wp-arrow-dist">84 yd · 0:18</span>
      </div>
      <div className="wp-now">
        <span className="wp-tag">Do now</span>
        <strong>Kill Kobold Miners</strong>
        <span className="wp-sub">Fargodeep Mine · northeast of you</span>
      </div>
      <ul className="wp-goals">
        <li className="done"><i />Gold Dust 10/10</li>
        <li className="ticking"><i /><span>Kobold Miner <b className="wp-count" /></span></li>
        <li><i />Candle 0/8</li>
      </ul>
      <div className="wp-next"><span className="wp-tag dim">Next</span>Hand in to Remy “Two Times” · 310 yd</div>
      <div className="wp-xp"><span>14.2k xp/hr</span><span>Level 9 in 21 min</span></div>
      <figcaption className="sr-only">The guide window shows the one thing to do now, the step&apos;s goals ticking off, what&apos;s next, and XP per hour, with the gold arrow pointing the way.</figcaption>
    </figure>
  );
}

export default function WaypostPage() {
  return (
    <main id="main" tabIndex={-1} className="container page wp-page">
      {/* ---------- hero ---------- */}
      <section className="wp-hero" aria-labelledby="wp-title">
        <img className="wp-hero-art" src="/assets/waypost/path-1920.webp" srcSet="/assets/waypost/path-960.webp 960w, /assets/waypost/path-1920.webp 1920w" sizes="(max-width: 900px) 100vw, 1200px" alt="" width={1920} height={1076} fetchPriority="high" />
        <div className="wp-hero-copy">
          <div className="wp-brandline">
            <img src="/assets/waypost/icon-256.webp" alt="" width={84} height={84} className="wp-icon" />
            <span className="eyebrow">Made by the guild · Free &amp; open source</span>
          </div>
          <h1 id="wp-title" className="wp-title">Waypost</h1>
          <p className="wp-lead">The leveling guide for WoW Forever. Routes from 1 to 60 for every race on both factions. Press Start and follow the arrow.</p>
          <div className="row wp-ctas">
            <a href={WAYPOST.curseforge} {...ext} className="btn btn-primary btn-lg wp-cta-main">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Get it on CurseForge
            </a>
            <a href={WAYPOST.github} {...ext} className="btn btn-lg">View the source</a>
          </div>
          <ul className="wp-chips" aria-label="Release details">
            <li>v{WAYPOST.version}</li><li>Game {WAYPOST.gameVersion}</li><li>{WAYPOST.size}</li><li>{WAYPOST.license}</li><li>No account needed</li>
          </ul>
        </div>
        <div className="wp-hero-mock"><GuideWindowMock /></div>
      </section>

      {/* ---------- at a glance ---------- */}
      <ul className="wp-stats" aria-label="At a glance">
        <li><strong>1 → 60</strong><span>full routes</span></li>
        <li><strong>Every race</strong><span>Alliance &amp; Horde</span></li>
        <li><strong>+ Class quests</strong><span>professions &amp; reputations</span></li>
        <li><strong>Auto</strong><span>quest pickup &amp; hand-in</span></li>
      </ul>

      {/* ---------- how it works ---------- */}
      <section className="wp-section" aria-labelledby="wp-how">
        <div className="wp-head">
          <span className="eyebrow">Three steps</span>
          <h2 id="wp-how">From the log-in screen to 60</h2>
        </div>
        <ol className="wp-steps">
          <li>
            <span className="wp-step-n">1</span>
            <h3>Install it</h3>
            <p>Grab it from the CurseForge app, or download the zip and unzip the <code>Waypost</code> folder into your WoW Forever <code>Interface\AddOns</code> folder.</p>
          </li>
          <li>
            <span className="wp-step-n">2</span>
            <h3>Pick your guide</h3>
            <p>The first time you log in, a welcome window explains the basics and offers the right guide for your character.</p>
          </li>
          <li>
            <span className="wp-step-n">3</span>
            <h3>Follow the arrow</h3>
            <p>Press Start. The card says what to do now, the arrow shows where, and quests are picked up and handed in for you.</p>
          </li>
        </ol>
      </section>

      {/* ---------- the arrow ---------- */}
      <section className="wp-arrowband" aria-labelledby="wp-arrow-h">
        <img className="wp-arrowband-art" src="/assets/waypost/scene-1145.webp" srcSet="/assets/waypost/scene-760.webp 760w, /assets/waypost/scene-1145.webp 1145w" sizes="(max-width: 900px) 100vw, 1200px" alt="" width={1145} height={400} loading="lazy" />
        <div className="wp-arrowband-copy">
          <h2 id="wp-arrow-h">Never open the map to find the next quest</h2>
          <p>A 3D gold arrow turns with you and points at the next objective, with the distance and travel time underneath. It points down when you arrive.</p>
        </div>
        <img className="wp-headings" src="/assets/waypost/arrows.webp" alt="The Waypost arrow at nine headings, from pointing right through to pointing down on arrival" width={1200} height={220} loading="lazy" />
      </section>

      {/* ---------- features ---------- */}
      <section className="wp-section" aria-labelledby="wp-feat">
        <div className="wp-head">
          <span className="eyebrow">What it does</span>
          <h2 id="wp-feat">Everything you need on the road to 60</h2>
        </div>
        <div className="wp-features">
          {WAYPOST_FEATURES.map((f) => (
            <article key={f.title} className="wp-feature" data-tilt>
              <span className="wp-feature-icon"><FeatureIcon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- guild callout ---------- */}
      <section className="wp-guild" aria-labelledby="wp-guild-h">
        <div className="wp-guild-copy">
          <span className="eyebrow">Level together</span>
          <h2 id="wp-guild-h">Built for Dragon Warriors</h2>
          <p>Everyone in the guild running Waypost shows up on the guild board with their guide and level. Officers can put the whole guild on one guide and send notices, and the party panel pulls your group onto the same route so nobody falls behind.</p>
          <p className="wp-small">Party and guild features need Waypost on both ends. Anyone without it shows as “no data”.</p>
          <div className="row" style={{ gap: 10 }}>
            <a href={WAYPOST.curseforge} {...ext} className="btn btn-primary">Download Waypost</a>
            <Link href="/roster" className="btn">See who&apos;s leveling</Link>
          </div>
        </div>
        <div className="wp-board" aria-label="Illustration of the Waypost guild board">
          <div className="wp-board-head"><span>Guild board</span><span className="wp-tag">Guild guide: Elwynn → Westfall</span></div>
          {[["Warrior", "Level 58", 96], ["Mage", "Level 41", 68], ["Priest", "Level 33", 55], ["Rogue", "Level 22", 36]].map(([cls, lvl, pct]) => (
            <div key={cls as string} className="wp-board-row">
              <span className={`wp-dot c-${(cls as string).toLowerCase()}`} />
              <span className="wp-board-name">{cls}</span>
              <span className="wp-board-bar"><i style={{ width: `${pct}%` }} /></span>
              <span className="wp-board-lvl">{lvl}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- commands + details ---------- */}
      <div className="wp-cols">
        <section className="wp-section panel" aria-labelledby="wp-cmd">
          <h2 id="wp-cmd">Slash commands</h2>
          <dl className="wp-commands">
            {WAYPOST_COMMANDS.map(([c, d]) => (<div key={c}><dt><code>{c}</code></dt><dd>{d}</dd></div>))}
          </dl>
          <p className="wp-small">Esc also has a Waypost button under the game menu, and there&apos;s a minimap button.</p>
        </section>

        <div className="stack" style={{ gap: 20 }}>
          <section className="panel" aria-labelledby="wp-report">
            <h2 id="wp-report">Wrong step?</h2>
            <p className="soft">Type <code>/waypost report</code> in game and paste what it gives you into an issue on GitHub, or drop it in the Discord.</p>
            <div className="row" style={{ gap: 10 }}>
              <a href={WAYPOST.issues} {...ext} className="btn btn-sm">Open an issue</a>
              <a href={DISCORD_INVITE} {...ext} className="btn btn-sm btn-discord">Tell us in Discord</a>
            </div>
          </section>
          <section className="panel" aria-labelledby="wp-missing">
            <h2 id="wp-missing">Not in it yet</h2>
            <ul className="wp-list">
              <li>No mailbox automation.</li>
              <li>No auction house scanning for upgrades.</li>
              <li>Guide text is English only. The interface is partly translated (German, French, Spanish, Portuguese, Chinese).</li>
            </ul>
          </section>
          <section className="panel" aria-labelledby="wp-credits">
            <h2 id="wp-credits">Credits</h2>
            <p className="soft">Routes and talent plans are from <a href={WAYPOST.polestar} {...ext}>Polestar Guides</a> by the Polestar authors, used under the GPL-3.0, so the credit for the routing work is theirs. Waypost is GPL-3.0 too. Full credits are in the addon&apos;s About window.</p>
          </section>
        </div>
      </div>

      {/* ---------- closing CTA ---------- */}
      <section className="wp-final" aria-labelledby="wp-final-h">
        <img src="/assets/waypost/icon-256.webp" alt="" width={96} height={96} className="wp-icon" loading="lazy" />
        <h2 id="wp-final-h">Ready to ding?</h2>
        <p>Free, open source, no account to link. Install it and press Start.</p>
        <a href={WAYPOST.curseforge} {...ext} className="btn btn-primary btn-lg">Get Waypost on CurseForge</a>
      </section>
    </main>
  );
}
