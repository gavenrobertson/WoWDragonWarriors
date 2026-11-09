// Small presentational pieces shared across pages (server- and client-safe).
import type { CSSProperties, ReactNode } from "react";
import { classColor, qualityColor, slotAbbr } from "@/lib/ui";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function Bar({ pct, color, height, label }: { pct: number; color?: string; height?: number; label?: string }) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="bar" style={{ "--h": `${height ?? 8}px` } as Vars} role={label ? "img" : undefined} aria-label={label}>
      <span style={{ "--w": `${w}%`, "--c": color ?? "var(--dw-gold)" } as Vars} />
    </div>
  );
}

export function Avatar({ name, className, size = 48, url }: { name: string; className?: string | null; size?: number; url?: string | null }) {
  return (
    <span className="avatar" aria-hidden="true" style={{ "--s": `${size}px`, "--c": classColor(className) } as Vars}>
      {url ? <img src={url} alt="" loading="lazy" /> : name.charAt(0)}
    </span>
  );
}

export function ItemIcon({ slot, quality, iconUrl, size }: { slot: string; quality?: string | null; iconUrl?: string | null; size?: number }) {
  return (
    <span className="item-icon" data-q={quality ?? "common"} aria-hidden="true"
      style={{ "--c": qualityColor(quality), ...(size ? { width: size, height: size } : {}) } as Vars}>
      {iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : slotAbbr(slot)}
    </span>
  );
}

export function ClassName({ name, className, bold = true }: { name: string; className?: string | null; bold?: boolean }) {
  return <span style={{ color: classColor(className), fontWeight: bold ? 600 : undefined }}>{name}</span>;
}

export function StatusDot({ color, live }: { color: string; live?: boolean }) {
  return <span className={live ? "dot status-dot" : "dot"} style={{ "--c": color, background: color } as Vars} aria-hidden="true" />;
}

export function Source({ children }: { children: ReactNode }) {
  return <span className="src">{children}</span>;
}

export function PageHead({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ "--gap": "8px" } as Vars}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {lead && <p className="soft" style={{ fontSize: 16, maxWidth: 680 }}>{lead}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </section>
  );
}

export const vars = (v: Record<string, string | number>) => v as Vars;
