import type { Metadata } from "next";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Brand" };

const PALETTE = [
  ["#0b0806", "Stone black", "Page background"], ["#1c140b", "Dark oak", "Hero and feature panels"], ["#15100a", "Leather", "Cards and frames"],
  ["#8a6a2c", "Gold trim", "Frame borders and rivets"], ["#FFD100", "WoW gold", "Titles, headings, active tabs"], ["#F0B21C", "Royal gold", "Bars, highlights"],
  ["#a3221a", "Crimson", "Primary action buttons"], ["#9B5DFF", "Crest amethyst", "Magic accents and glows"], ["#F2E8D0", "Parchment", "Body text"],
]

export default function BrandPage() {
  return (
    <main id="main" tabIndex={-1} className="container page">
      <div className="row" style={{ alignItems: "flex-start", gap: 40 }}>
        <img src="/assets/crest-1024.webp" width={600} height={600} className="brand-crest" style={{ flex: "1 1 360px", maxWidth: 600, height: "auto" }}
          alt="Dragon Warriors guild crest: a purple dragon head with gold horns and glowing eyes on a riveted dark-oak shield, crossed swords behind it, an amethyst set in a spiked gold crown, purple banners, all framed in spiked gold" />
        <div className="stack" style={{ flex: "1 1 360px", gap: 28 }}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Official guild crest</span>
            <h1>{SITE.name}</h1>
            <p className="soft">WoW interface colours: stone and dark-oak frames with gold trim, WoW gold for titles, crimson action buttons, and the crest's amethyst purple for magic and glow.</p>
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
            {[128, 64, 48, 32].map((s) => <img key={s} src="/assets/crest-256.png" alt={`${SITE.name} crest, ${s}px`} width={s} height={s} className="logo" style={{ objectFit: "contain" }} />)}
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <h2>Site palette</h2>
            <div className="grid-auto" style={{ ["--min" as string]: "180px", gap: 12 }}>
              {PALETTE.map(([hex, name, use]) => (
                <div key={hex} className="stack" style={{ gap: 4 }}>
                  <div style={{ height: 56, borderRadius: 10, background: hex, border: "1px solid var(--dw-border-3)" }} />
                  <span className="strong">{name}</span>
                  <span className="micro muted"><span className="mono">{hex}</span> · {use}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
