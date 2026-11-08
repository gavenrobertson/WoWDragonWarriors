import type { Metadata } from "next";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Brand" };

const PALETTE = [
  ["#120C1C", "Night purple", "Page background"], ["#231544", "Royal purple", "Hero and feature panels"], ["#1A1229", "Amethyst", "Cards"],
  ["#3E2F58", "Frame", "Borders and dividers"], ["#E3B341", "Royal gold", "Primary buttons, active states"], ["#F5D77E", "Light gold", "Page titles, highlights"],
  ["#C9A13B", "Antique gold", "Header trim, logo frame"], ["#F3EEF8", "Lavender white", "Body text"],
];

export default function BrandPage() {
  return (
    <main id="main" tabIndex={-1} className="container page">
      <div className="row" style={{ alignItems: "flex-start", gap: 40 }}>
        <img src="/assets/crest-1024.jpg" width={600} height={600} style={{ flex: "1 1 360px", maxWidth: 600, height: "auto", borderRadius: 16, border: "1px solid var(--dw-gold-antique)" }}
          alt="Dragon Warriors guild crest: a purple dragon with gold horns on a dark wooden shield, framed in spiked gold, with crossed swords, an amethyst gem and purple banners" />
        <div className="stack" style={{ flex: "1 1 360px", gap: 28 }}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Official guild crest</span>
            <h1>{SITE.name}</h1>
            <p className="soft">Royal purple and gold: deep purple panels, gold for actions and titles, and antique gold trim around the crest.</p>
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
            {[128, 64, 48, 32].map((s) => <img key={s} src="/assets/crest-256.jpg" alt={`${SITE.name} crest, ${s}px`} width={s} height={s} className="logo" style={{ objectFit: "cover" }} />)}
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
