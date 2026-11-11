// The arcade cabinet every game sits in: a gold-trimmed bezel, an optional HUD row (readouts and the
// recent-results strip) and a themed screen. Each theme is a backdrop drawn in CSS (arcade.css).
export type MachineTheme = "arcane" | "mine" | "sky" | "tavern" | "fire" | "frost" | "forest" | "void" | "hoard" | "crypt" | "felt" | "parchment";

export function Machine({ theme, hud, children, className = "", label }: {
  theme: MachineTheme; hud?: React.ReactNode; children: React.ReactNode; className?: string; label?: string;
}) {
  return (
    <div className={`machine m-${theme} ${className}`} aria-label={label}>
      <span className="machine-rivet r1" aria-hidden="true" /><span className="machine-rivet r2" aria-hidden="true" />
      <span className="machine-rivet r3" aria-hidden="true" /><span className="machine-rivet r4" aria-hidden="true" />
      {hud && <div className="machine-hud">{hud}</div>}
      <div className="machine-screen">{children}</div>
    </div>
  );
}

/** A small labelled readout for the HUD (e.g. "Multiplier 2.40×"). */
export function Readout({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "gold" | "win" | "lose" }) {
  return <span className={`readout${tone ? ` ${tone}` : ""}`}><span className="readout-l">{label}</span><strong className="readout-v">{children}</strong></span>;
}
