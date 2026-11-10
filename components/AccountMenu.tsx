"use client";
// The header's profile pill: a small menu (profile, edit appearance, collection, sign out) and the
// appearance editor, where you pick your name colour, profile banner and site theme from what you own.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { equipCosmetic, myLook } from "@/app/arcade/actions";
import { COSMETICS, RARITY_COLOR, themeAttr, type Cosmetic, type EquipKind } from "@/lib/cosmetics";
import { CosmeticPreview } from "./arcade/CosmeticPreview";
import { BannerArt } from "./arcade/BannerArt";
import { PlayerName } from "./PlayerName";

type Look = { nameStyle: string | null; title: string | null; theme: string | null; banner: string | null };
const SECTIONS: { kind: EquipKind; key: keyof Look; label: string; none: string }[] = [
  { kind: "name", key: "nameStyle", label: "Name colour", none: "Class colour" },
  { kind: "banner", key: "banner", label: "Profile banner", none: "Guild frame" },
  { kind: "theme", key: "theme", label: "Site theme", none: "Dragon Warriors" },
  { kind: "title", key: "title", label: "Title", none: "No title" },
];

export function AccountMenu({ name, className, slug, avatarUrl, color, nameStyle }: {
  name: string; className: string | null; slug: string; avatarUrl: string | null; color: string; nameStyle: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="account-menu" ref={wrap}>
      <button type="button" className="account-pill" aria-haspopup="menu" aria-expanded={open} aria-label={`Your account: ${name}`} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" style={{ "--s": "32px", "--c": color } as React.CSSProperties}>{avatarUrl ? <img src={avatarUrl} alt="" /> : name.charAt(0)}</span>
        <span className="account-name strong small"><PlayerName name={name} className={className} nameStyle={nameStyle} showTitle={false} /></span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <Link role="menuitem" href={`/characters/${slug}`} onClick={() => setOpen(false)}>View my profile</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); setEditing(true); }}>✎ Edit appearance</button>
          <Link role="menuitem" href="/arcade/collection" onClick={() => setOpen(false)}>Collection</Link>
          <form action="/auth/logout" method="post"><button role="menuitem" type="submit" className="muted">Sign out</button></form>
        </div>
      )}
      {editing && <AppearanceEditor name={name} className={className} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Modal editor for name colour, banner, theme and title. Changes save the moment you pick them. */
export function AppearanceEditor({ name, className, onClose }: { name: string; className: string | null; onClose: () => void }) {
  const router = useRouter();
  const [owned, setOwned] = useState<string[] | null>(null);
  const [look, setLook] = useState<Look | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<EquipKind>("name");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    myLook().then((r) => { if (r.ok) { setOwned(r.owned); setLook(r.equipped); } else setErr(r.error); }).catch(() => setErr("Couldn't load your collection."));
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    panel.current?.focus();
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [onClose]);

  const pick = async (kind: EquipKind, key: keyof Look, id: string | null) => {
    if (!look || busy) return;
    setBusy(id ?? `none-${kind}`); setErr(null);
    const r = await equipCosmetic({ kind, id });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    setLook({ ...look, [key]: id });
    if (kind === "theme") { const t = themeAttr(id); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
    router.refresh(); // names and banners across the page pick up the change
  };

  const section = SECTIONS.find((s) => s.kind === tab)!;
  const mine: Cosmetic[] = owned ? COSMETICS.filter((c) => c.kind === tab && owned.includes(c.id)) : [];
  const total = COSMETICS.filter((c) => c.kind === tab).length;

  // Portal to <body>: the header's blur would otherwise trap this fixed overlay inside the header.
  return createPortal(
    <div className="appearance-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="appearance panel-royal" role="dialog" aria-modal="true" aria-labelledby="appearance-h" ref={panel} tabIndex={-1}>
        <div className="row between baseline">
          <h2 id="appearance-h">Edit appearance</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="banner-host appearance-preview">
          <BannerArt id={look?.banner} />
          <span className="micro muted">How you appear</span>
          <PlayerName name={name} className={className} nameStyle={look?.nameStyle ?? null} title={look?.title ?? null} style={{ fontSize: 28, fontFamily: "var(--font-display)" }} />
        </div>
        <div className="segmented appearance-tabs" role="tablist">
          {SECTIONS.map((s) => <button key={s.kind} type="button" role="tab" aria-selected={tab === s.kind} onClick={() => setTab(s.kind)}>{s.label}</button>)}
        </div>
        {err && <p className="game-err" role="alert">{err}</p>}
        {!owned ? <p className="muted small">Loading your collection…</p> : (
          <div className="appearance-grid" role="tabpanel" aria-label={section.label}>
            <button type="button" className={`drop-card${look && !look[section.key] ? " equipped" : ""}`} disabled={!!busy} onClick={() => pick(section.kind, section.key, null)}>
              <span className="cp cp-title">Default</span>
              <span className="small strong">{section.none}</span>
            </button>
            {mine.map((c) => {
              const on = look?.[section.key] === c.id;
              return (
                <button key={c.id} type="button" className={`drop-card owned${on ? " equipped" : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }} disabled={!!busy} onClick={() => pick(section.kind, section.key, c.id)} title={c.blurb}>
                  <CosmeticPreview c={c} sample={name.split(" ")[0]} />
                  <span className="small strong" style={{ color: RARITY_COLOR[c.rarity] }}>{c.name}</span>
                  {busy === c.id && <span className="micro muted">Saving…</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="micro muted">You own {mine.length} of {total}. <Link href="/arcade/chests" onClick={onClose}>Open chests</Link> to find more, or browse everything in your <Link href="/arcade/collection" onClick={onClose}>collection</Link>.</p>
      </div>
    </div>,
    document.body,
  );
}
