import type { Metadata } from "next";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Brand" };

const PALETTE = [
  ["#0b0806", "Stone black", "Page background"], ["#1c140b", "Dark oak", "Hero and feature panels"], ["#15100a", "Leather", "Cards and frames"],
  ["#8a6a2c", "Gold trim", "Frame borders and rivets"], ["#FFD100", "WoW gold", "Titles, headings, active tabs"], ["#F0B21C", "Royal gold", "Bars, highlights"],
  ["#a3221a", "Crimson", "Primary action buttons"], ["#9B5DFF", "Crest amethyst", "Magic accents and glows"], ["#F2E8D0", "Parchment", "Body text"],
];

export default function BrandPage() {
  return (
    <main id="main" tabIndex={-1} className="container page brand-page">
      <div className="brand-layout">
        <div className="brand-art">
          <img src="/assets/crest-1024.webp" width={600} height={600} className="brand-crest"
            alt="Dragon Warriors guild crest: a purple dragon head with gold horns and glowing eyes on a riveted dark-oak shield, crossed swords behind it, an amethyst set in a spiked gold crown, purple banners, all framed in spiked gold" />
        </div>
        <div className="brand-info">
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Official guild crest</span>
            <h1>{SITE.name}</h1>
            <p className="soft">WoW interface colours: stone and dark-oak frames with gold trim, WoW gold for titles, crimson action buttons, and the crest&apos;s amethyst purple for magic and glow.</p>
          </div>
          <div className="brand-sizes" aria-label="Crest at small sizes">
            {[128, 64, 48, 32].map((s) => (
              <figure key={s}>
                <img src="/assets/crest-256.webp" alt={`${SITE.name} crest, ${s}px`} width={s} height={s} className="logo" />
                <figcaption className="micro muted">{s}px</figcaption>
              </figure>
            ))}
          </div>
          <section className="stack" style={{ gap: 12 }} aria-labelledby="palette-h">
            <h2 id="palette-h">Site palette</h2>
            <ul className="brand-palette">
              {PALETTE.map(([hex, name, use]) => (
                <li key={hex}>
                  <span className="brand-swatch" style={{ background: hex }} />
                  <span className="strong">{name}</span>
                  <span className="micro muted"><span className="mono">{hex}</span> · {use}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
