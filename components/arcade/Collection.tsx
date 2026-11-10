"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { equipCosmetic } from "@/app/arcade/actions";
import { RARITY_COLOR, RARITY_LABEL, themeAttr, type Cosmetic, type EquipKind, type Rarity } from "@/lib/cosmetics";
import { PlayerName } from "@/components/PlayerName";
import { CosmeticPreview } from "./CosmeticPreview";
import { BannerArt } from "./BannerArt";

type Equipped = { nameStyle: string | null; title: string | null; theme: string | null; banner: string | null };
const KINDS: { kind: EquipKind; label: string; key: keyof Equipped; hint: string; none: string }[] = [
  { kind: "name", label: "Name styles", key: "nameStyle", hint: "How your name looks everywhere on the hub.", none: "Class colour" },
  { kind: "title", label: "Titles", key: "title", hint: "Shown after your name.", none: "No title" },
  { kind: "banner", label: "Profile banners", key: "banner", hint: "The background behind your name on your character page.", none: "Guild frame" },
  { kind: "theme", label: "Site themes", key: "theme", hint: "Restyles the whole site, just for you. Press Preview to try one on.", none: "Dragon Warriors" },
];
const ORDER: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];
const setTheme = (id: string | null) => {
  const t = themeAttr(id);
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
};

export function Collection({ cosmetics, owned, equipped: eq0, me }: {
  cosmetics: Cosmetic[]; owned: string[]; equipped: Equipped; me: { name: string; className: string | null };
}) {
  const [eq, setEq] = useState(eq0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<Cosmetic | null>(null);
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const hero = useRef<HTMLDivElement>(null);
  const eqRef = useRef(eq);
  eqRef.current = eq;

  // Leaving the page always restores the theme you actually have equipped.
  useEffect(() => () => setTheme(eqRef.current.theme), []);

  const equip = async (kind: EquipKind, key: keyof Equipped, id: string | null) => {
    setBusy(true); setErr(null);
    const r = await equipCosmetic({ kind, id });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setEq((e) => ({ ...e, [key]: id }));
    if (kind === "theme") { setPreviewTheme(null); setTheme(id); }
    if (kind === "banner") setPreviewBanner(null);
  };
  const tryTheme = (c: Cosmetic | null) => { setPreviewTheme(c); setTheme(c ? c.id : eq.theme); };
  const tryBanner = (id: string) => {
    setPreviewBanner(id);
    hero.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };
  const shownBanner = previewBanner ?? eq.banner;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div ref={hero} className="panel-royal banner-host collection-hero" style={{ minHeight: 130 }}>
        <BannerArt id={shownBanner} />
        <span className="micro muted">{previewBanner ? `Previewing ${cosmetics.find((c) => c.id === previewBanner)?.name}` : "How you appear"}</span>
        <PlayerName name={me.name} className={me.className} nameStyle={eq.nameStyle} title={eq.title} style={{ fontSize: 34, fontFamily: "var(--font-display)" }} />
        {previewBanner && (
          <span className="row" style={{ gap: 8 }}>
            {owned.includes(previewBanner) && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => equip("banner", "banner", previewBanner)}>Equip this banner</button>}
            <button type="button" className="btn btn-sm" onClick={() => setPreviewBanner(null)}>Stop preview</button>
          </span>
        )}
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>

      <label className="row micro" style={{ gap: 8, alignSelf: "flex-end" }}>
        <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only show what I own
      </label>

      {KINDS.map(({ kind, label, key, hint, none }) => {
        const all = cosmetics.filter((c) => c.kind === kind).sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity));
        const mine = all.filter((c) => owned.includes(c.id));
        const list = mineOnly ? mine : all;
        const previewable = kind === "theme" || kind === "banner";
        return (
          <section key={kind} className="panel stack" style={{ gap: 12 }} aria-labelledby={`k-${kind}`}>
            <div className="row between baseline" style={{ flexWrap: "wrap", gap: 6 }}>
              <div className="stack" style={{ gap: 2 }}>
                <h2 id={`k-${kind}`}>{label}</h2>
                <span className="micro muted">{hint}</span>
              </div>
              <span className="micro muted">{mine.length} of {all.length} collected</span>
            </div>
            <div className="drop-grid">
              <div className="drop-cell">
                <button type="button" className={`drop-card${!eq[key] ? " equipped" : ""}`} disabled={busy || !eq[key]} onClick={() => equip(kind, key, null)}>
                  <span className="cp cp-title">Default</span>
                  <span className="small strong">{none}</span>
                  <span className="micro muted">{!eq[key] ? "Equipped" : "Use the default"}</span>
                </button>
              </div>
              {list.map((c) => {
                const have = owned.includes(c.id), on = eq[key] === c.id;
                const previewing = (kind === "theme" && previewTheme?.id === c.id) || (kind === "banner" && previewBanner === c.id);
                return (
                  <div key={c.id} className="drop-cell">
                    <button type="button" className={`drop-card${have ? " owned" : " locked"}${on ? " equipped" : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }}
                      disabled={busy || !have || on} onClick={() => equip(kind, key, c.id)} title={c.blurb}>
                      <CosmeticPreview c={c} sample={me.name.split(" ")[0]} />
                      <span className="small strong" style={{ color: RARITY_COLOR[c.rarity] }}>{c.name}</span>
                      <span className="micro muted">{on ? "Equipped" : have ? "Click to equip" : `${RARITY_LABEL[c.rarity]} · find it in a chest`}</span>
                    </button>
                    {previewable && !on && (
                      <button type="button" className="btn btn-sm preview-btn" aria-pressed={previewing}
                        onClick={() => (kind === "theme" ? tryTheme(previewing ? null : c) : previewing ? setPreviewBanner(null) : tryBanner(c.id))}>
                        {previewing ? "Stop preview" : "Preview"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="micro muted">Missing something? <Link href="/arcade/chests">Open chests</Link>.</p>

      {previewTheme && (
        <div className="theme-preview-bar" role="status">
          <span className="micro" style={{ opacity: .7 }}>Previewing</span>
          <strong>{previewTheme.name}</strong>
          {owned.includes(previewTheme.id) && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => equip("theme", "theme", previewTheme.id)}>Equip</button>}
          <button type="button" className="btn btn-sm" onClick={() => tryTheme(null)}>Stop</button>
        </div>
      )}
    </div>
  );
}
