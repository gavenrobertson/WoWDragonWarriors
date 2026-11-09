"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { setBisStatus } from "@/app/actions";
import { Avatar, Bar, ItemIcon, StatusDot, vars } from "@/components/bits";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import { SOURCE_COLORS, cap, qualityColor } from "@/lib/ui";

type Status = "have" | "wishlisted" | "need";
export interface BisRow {
  itemId: number; iconUrl: string | null; slot: string; name: string; quality: string; type: string; source: string; zone: string;
  pin: { label: string; x: number; y: number } | null; status: Status; how: string;
}
export interface BisChar { slug: string; name: string; className: string; avatarUrl?: string | null; rows: BisRow[] }

const STATUS_LABEL: Record<Status, [string, string]> = { have: ["Have", "#4CD964"], wishlisted: ["Wishlisted", "#F2CF6B"], need: ["Need", "#A99CC0"] };
const TYPES = ["raid", "dungeon", "quest", "crafted"];

export function BisPlanner({ chars }: { chars: BisChar[] }) {
  const [ch, setCh] = useState(0);
  const [type, setType] = useState("all");
  const [sel, setSel] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const { pending, run, toast } = useAction();

  const char = chars[ch];
  const items = useMemo(
    () => (char?.rows ?? []).map((r, i) => ({ ...r, idx: i, s: overrides[`${char.slug}:${r.itemId}:${i}`] ?? r.status })),
    [char, overrides],
  );

  if (!char) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <Header chars={[]} ch={0} onPick={() => {}} />
        <div className="empty">No BiS lists yet. Officers publish phase lists per class; they show up here once your character is level 60.</div>
      </main>
    );
  }

  const selIdx = Math.min(sel, items.length - 1);
  const s = items[selIdx];
  const rows = items.filter((it) => type === "all" || it.type === type);
  const have = items.filter((it) => it.s === "have").length;
  const pins = new Map<string, { label: string; x: number; y: number; first: number }>();
  for (const it of items) if (it.pin && !pins.has(it.pin.label)) pins.set(it.pin.label, { ...it.pin, first: it.idx });
  const [tbg, tfg] = SOURCE_COLORS[s.type] ?? SOURCE_COLORS.world;

  const toggleHave = () => {
    const next: Status = s.s === "have" ? "need" : "have";
    const key = `${char.slug}:${s.itemId}:${s.idx}`;
    run(() => setBisStatus({ character: char.slug, itemId: s.itemId, status: next === "have" ? "have" : "need" }), () => setOverrides({ ...overrides, [key]: next }));
  };

  return (
    <main id="main" tabIndex={-1} className="container page">
      <Header chars={chars} ch={ch} onPick={(i) => { setCh(i); setSel(0); }} />

      <section aria-label="Progress" className="row" style={{ alignItems: "stretch", gap: 12 }}>
        <div className="panel" style={{ flex: "2 1 320px", gap: 10, padding: 20 }}>
          <div className="row between small"><span className="soft">BiS collected</span><span className="strong">{have} / {items.length}</span></div>
          <Bar pct={(have / items.length) * 100} height={10} />
        </div>
        {TYPES.map((t) => (
          <div key={t} className="panel" style={{ flex: "1 1 140px", gap: 4, padding: 16 }}>
            <span className="row small strong" style={{ gap: 8 }}><span className="dot" style={vars({ "--c": SOURCE_COLORS[t][1] })} />{cap(t)}</span>
            <span className="small muted">{items.filter((it) => it.type === t && it.s !== "have").length} left</span>
          </div>
        ))}
      </section>

      <div className="row" role="group" aria-label="Filter by source" style={{ gap: 8 }}>
        <span className="small muted">Source</span>
        {["all", ...TYPES].map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{t === "all" ? "All" : cap(t)}</button>
        ))}
      </div>

      <div className="split" style={{ gap: 16 }}>
        <ul aria-label="Best in slot items" className="main-col stack" style={{ gap: 8, flexBasis: 480 }}>
          {rows.length === 0 && <li className="empty">Nothing from this source on your list.</li>}
          {rows.map((r) => {
            const on = r.idx === selIdx;
            const [bg, fg] = SOURCE_COLORS[r.type] ?? SOURCE_COLORS.world;
            return (
              <li key={`${r.itemId}-${r.idx}`}>
                <button type="button" className="select-card" aria-pressed={on} onClick={() => setSel(r.idx)} style={{ width: "100%", padding: "10px 14px" }}>
                  <ItemIcon slot={r.slot} quality={r.quality} iconUrl={r.iconUrl} />
                  <span className="stack grow" style={{ gap: 2, lineHeight: 1.3 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="strong" style={{ color: qualityColor(r.quality) }}>{r.name}</span>
                      <span className="tag" style={{ background: bg, color: fg }}>{cap(r.type)}</span>
                    </span>
                    <span className="micro muted">{r.slot} · {r.source} · {r.zone}</span>
                  </span>
                  <span className="row small strong" style={{ gap: 6, color: STATUS_LABEL[r.s][1], flex: "none" }}>
                    <StatusDot color={STATUS_LABEL[r.s][1]} />{STATUS_LABEL[r.s][0]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <aside aria-label="Where to get it" className="side-col panel sticky-aside" style={{ flexBasis: 420 }}>
          <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
            <ItemIcon slot={s.slot} quality={s.quality} iconUrl={s.iconUrl} size={56} />
            <div className="stack" style={{ gap: 2 }}>
              <h2 style={{ fontSize: 20, color: qualityColor(s.quality) }}>{s.name}</h2>
              <span className="small muted">{s.slot} · <span style={{ color: tfg, background: tbg, padding: "0 6px", borderRadius: 6 }}>{cap(s.type)}</span></span>
            </div>
          </div>

          <div id="map" role="img" aria-label={s.pin ? `Map pin: ${s.pin.label}` : "No map location"} className="schematic-map">
            <svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              <g stroke="#4E3C6E" strokeWidth="1" opacity="0.5"><path d="M0 100 H1000 M0 200 H1000 M0 300 H1000 M0 400 H1000 M0 500 H1000 M125 0 V600 M250 0 V600 M375 0 V600 M500 0 V600 M625 0 V600 M750 0 V600 M875 0 V600" /></g>
              <path d="M120 90 C200 40 300 70 340 130 C390 200 360 260 400 330 C430 400 390 480 330 530 C260 580 180 550 150 480 C110 400 60 360 70 280 C80 200 60 140 120 90 Z" fill="#2A1F3B" stroke="#7A5E22" strokeWidth="3" />
              <path d="M640 70 C720 40 820 60 860 120 C900 180 860 230 880 290 C910 360 880 430 820 480 C760 540 690 520 660 460 C630 400 600 380 610 310 C620 240 580 200 600 140 C610 105 620 82 640 70 Z" fill="#2A1F3B" stroke="#7A5E22" strokeWidth="3" />
              <path d="M360 380 C460 330 540 360 640 300" fill="none" stroke="#C9A13B" strokeWidth="2" strokeDasharray="8 10" opacity="0.6" />
              <text x="230" y="300" textAnchor="middle" fill="#6A5590" fontSize="34" fontFamily="Cinzel, serif" letterSpacing="6">KALIMDOR</text>
              <text x="750" y="330" textAnchor="middle" fill="#6A5590" fontSize="30" fontFamily="Cinzel, serif" letterSpacing="4">EASTERN KINGDOMS</text>
            </svg>
            {[...pins.values()].map((p) => {
              const on = s.pin?.label === p.label;
              return (
                <button key={p.label} type="button" className="map-pin" aria-label={p.label} aria-pressed={on} onClick={() => setSel(p.first)} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <span className="map-pin-tag" style={on ? { background: "#2E2414", borderColor: "var(--dw-gold)" } : undefined}>{p.label}</span>
                  <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden="true"><path d="M11 27 C11 27 2 16 2 10 A9 9 0 0 1 20 10 C20 16 11 27 11 27 Z" fill={on ? "#E3B341" : "#8E7BB5"} stroke="#120C1C" strokeWidth="2" /><circle cx="11" cy="10" r="3.5" fill="#120C1C" /></svg>
                </button>
              );
            })}
            {!s.pin && <div className="map-note">Crafted items have no map pin. Find a crafter in Roster › Crafting.</div>}
            <span className="map-label">Schematic map</span>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h3>How to get it</h3>
            <p className="soft" style={{ fontSize: 14 }}>{s.how}</p>
            <span className="src">{s.source} · {s.zone}</span>
          </div>

          <div className="row" style={{ gap: 10 }}>
            {s.type === "raid" && <Link href="/loot" className="btn btn-primary grow">Add to raid wishlist</Link>}
            {s.type === "dungeon" && <Link href="/raids" className="btn btn-primary grow">Find a dungeon group</Link>}
            {s.type === "crafted" && <Link href="/roster?tab=craft" className="btn btn-primary grow">Request a craft</Link>}
            {s.type === "quest" && <Link href="/raids" className="btn btn-primary grow">See raid calendar</Link>}
            <button type="button" className="btn grow" onClick={toggleHave} disabled={pending}>{s.s === "have" ? "Mark as still needed" : "Mark as obtained"}</button>
          </div>
          <span className="src">Item data and icons: Blizzard API /data/wow/item + /media/item. Drop sources: guild loot database. &quot;Have&quot; is checked against /equipment.</span>
        </aside>
      </div>

      <p className="small muted">Hyjal Summit and Barrow Deeps items join BiS lists once their loot is known after December 9.</p>
      <Toast toast={toast} />
    </main>
  );
}

function Header({ chars, ch, onPick }: { chars: BisChar[]; ch: number; onPick: (i: number) => void }) {
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Best in slot</span>
        <h1>BiS Planner</h1>
        <p className="soft" style={{ fontSize: 16 }}>Every slot&apos;s best item for this phase, where it drops, and what you still need.</p>
      </div>
      {chars.length > 1 && (
        <div className="row" role="group" aria-label="Character">
          {chars.map((c, i) => (
            <button key={c.slug} type="button" className="select-card" aria-pressed={i === ch} onClick={() => onPick(i)} style={{ padding: "8px 14px 8px 8px" }}>
              <Avatar name={c.name} className={c.className} size={36} url={c.avatarUrl} />
              <span className="strong">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
