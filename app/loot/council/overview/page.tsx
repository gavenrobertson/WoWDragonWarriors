import type { Metadata } from "next";
import Link from "next/link";
import { isDemo } from "@/lib/config";
import { latestSession } from "@/lib/council";
import { CouncilRecap } from "@/components/CouncilRecap";

export const metadata: Metadata = { title: "Council overview", description: "Every item the Dragon Warriors loot council awarded in its latest session." };

export default async function CouncilOverviewPage() {
  const data = isDemo() ? null : await latestSession().catch(() => null);
  return (
    <main id="main" tabIndex={-1} className="container page">
      <section className="panel-royal page-head">
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Loot council · open to the whole guild</span>
          <h1>Council overview</h1>
          <p className="soft" style={{ fontSize: 16 }}>What the council handed out in its latest session, who got it and how it was decided.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/loot/council" className="btn">Council chamber</Link>
          <Link href="/loot?tab=history" className="btn">Full loot history</Link>
        </div>
      </section>
      {data ? <CouncilRecap data={data} /> : <div className="empty">The council hasn&apos;t met yet. Once it awards loot, the session recap shows up here.</div>}
    </main>
  );
}
