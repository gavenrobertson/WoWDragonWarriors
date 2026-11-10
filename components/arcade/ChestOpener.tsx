"use client";
// CS:GO-style case opening: a reel of possible drops slides past and stops on what the server rolled.
import Link from "next/link";
import { useRef, useState } from "react";
import { equipCosmetic, openChest } from "@/app/arcade/actions";
import { DUPLICATE_REFUND, RARITY_COLOR, RARITY_LABEL, itemOdds, themeAttr, type Chest, type Cosmetic, type Rarity } from "@/lib/cosmetics";
import { fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { CosmeticPreview } from "./CosmeticPreview";

const CARD = 150, GAP = 10, WIN_AT = 48, LEN = 56;
const ORDER: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];

function pickFiller(chest: Chest, cosmetics: Cosmetic[]) {
  let r = Math.random(), rarity: Rarity = "common";
  for (const k of ORDER) { r -= chest.odds[k]; if (r < 0) { rarity = k; break; } }
  const pool = cosmetics.filter((c) => c.rarity === rarity);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : cosmetics[0];
}

export function ChestOpener({ chests, cosmetics, owned: owned0 }: { chests: Chest[]; cosmetics: Cosmetic[]; owned: string[] }) {
  const { signedIn, balance, setBalance, flash } = useArcade();
  const [owned, setOwned] = useState(owned0);
  const [reel, setReel] = useState<{ chest: Chest; items: Cosmetic[]; x: number; go: boolean } | null>(null);
  const [won, setWon] = useState<{ item: Cosmetic; duplicate: boolean; refund: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [equipped, setEquipped] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const open = async (chest: Chest) => {
    if (spinning) return;
    setErr(null); setWon(null); setEquipped(false);
    setSpinning(true);
    box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const r = await openChest({ chest: chest.id });
    if (!r.ok) { setSpinning(false); return setErr(r.error); }
    setBalance(r.balance - r.refund); // show the price leaving now; the refund lands with the reveal
    const items = Array.from({ length: LEN }, () => pickFiller(chest, cosmetics));
    items[WIN_AT] = r.item;
    const w = box.current?.clientWidth ?? 800;
    const jitter = (Math.random() - 0.5) * CARD * 0.7;
    const x = WIN_AT * (CARD + GAP) + CARD / 2 - w / 2 + jitter;
    setReel({ chest, items, x: 0, go: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setReel({ chest, items, x, go: true })));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setSpinning(false);
      setWon({ item: r.item, duplicate: r.duplicate, refund: r.refund });
      setBalance(r.balance); if (r.refund) flash(r.refund);
      if (!r.duplicate && r.item.kind !== "marks") setOwned((o) => [...o, r.item.id]);
    }, reduced ? 600 : 6600);
  };

  const equip = async () => {
    if (!won || won.item.kind === "marks") return;
    const r = await equipCosmetic({ kind: won.item.kind, id: won.item.id });
    if (r.ok) { setEquipped(true); if (won.item.kind === "theme") { const t = themeAttr(won.item.id); if (t) document.documentElement.dataset.theme = t; } }
    else setErr(r.error);
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div ref={box} className={`chest-reel-wrap${reel ? " live" : ""}${spinning ? " spinning" : ""}`} aria-hidden={!reel}>
        <span className="chest-reel-marker" aria-hidden="true" />
        <span className="chest-reel-window" aria-hidden="true" />
        {reel ? (
          <div className="chest-reel" style={{ transform: `translateX(-${reel.x}px)`, transition: reel.go ? "transform 6.4s cubic-bezier(.08,.62,.12,1)" : "none" }}>
            {reel.items.map((c, i) => (
              <div key={i} className={`chest-card${won && i === WIN_AT ? " winner" : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }}>
                <CosmeticPreview c={c} />
                <span className="chest-card-name">{c.name}</span>
              </div>
            ))}
          </div>
        ) : <div className="chest-reel-idle">Pick a chest below to spin the reel</div>}
      </div>

      {won && (
        <div className="chest-won" role="status" style={{ ["--r" as string]: RARITY_COLOR[won.item.rarity] }}>
          <div className="chest-won-art"><CosmeticPreview c={won.item} sample="Your Name" /></div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow" style={{ color: RARITY_COLOR[won.item.rarity] }}>{RARITY_LABEL[won.item.rarity]} {won.item.kind === "marks" ? "marks" : won.item.kind === "name" ? "name style" : won.item.kind === "title" ? "title" : won.item.kind === "banner" ? "profile banner" : "site theme"}</span>
            <h2 style={{ color: RARITY_COLOR[won.item.rarity] }}>{won.item.name}</h2>
            <span className="soft">{won.item.kind === "marks" ? `${fmt(won.refund)} Dragon Marks added.` : won.duplicate ? `You already own this, so it became ${fmt(won.refund)} marks.` : won.item.blurb}</span>
            {!won.duplicate && won.item.kind !== "marks" && (
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-primary" onClick={equip} disabled={equipped}>{equipped ? "Equipped ✓" : "Equip now"}</button>
                <Link href="/arcade/collection" className="btn">Collection</Link>
              </div>
            )}
          </div>
        </div>
      )}
      {err && <p className="game-err" role="alert">{err}</p>}

      <div className="chest-grid">
        {chests.map((c) => (
          <article key={c.id} id={c.id} className="panel chest-panel">
            <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
              <span className="hof-icon chest-icon"><img src={wowIconUrl(c.icon)} alt="" /></span>
              <div className="stack" style={{ gap: 2 }}>
                <h2 style={{ fontSize: 20 }}>{c.name}</h2>
                <span className="micro muted">{c.blurb}</span>
              </div>
            </div>
            <ul className="chest-odds">
              {ORDER.filter((r) => c.odds[r] > 0).map((r) => (
                <li key={r}><span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span><span>{(c.odds[r] * 100).toFixed(c.odds[r] < 0.01 ? 1 : 0)}%</span></li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" onClick={() => open(c)} disabled={!signedIn || spinning || balance < c.price}>
              Open · <span className="mark-coin sm" aria-hidden="true" /> {fmt(c.price)}
            </button>
          </article>
        ))}
      </div>

      <section className="panel stack" style={{ gap: 10 }} aria-labelledby="drops-h">
        <div className="row between baseline"><h2 id="drops-h">Everything you can find</h2><span className="micro muted">Exact odds per chest shown on every item</span><span className="micro muted">{owned.length} of {cosmetics.filter((c) => c.kind !== "marks").length} collected · duplicates refund {fmt(DUPLICATE_REFUND.rare)} marks for a rare</span></div>
        <div className="drop-grid">
          {ORDER.flatMap((r) => cosmetics.filter((c) => c.rarity === r)).map((c) => (
            <div key={c.id} className={`drop-card${owned.includes(c.id) ? " owned" : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }}>
              <CosmeticPreview c={c} />
              <span className="small strong" style={{ color: RARITY_COLOR[c.rarity] }}>{c.name}</span>
              <span className="micro muted">{owned.includes(c.id) ? "Owned" : c.blurb}</span>
              <span className="drop-odds">{chests.map((ch) => { const o = itemOdds(ch, c); return <span key={ch.id} title={`${ch.name}: ${o ? `1 in ${Math.round(1 / o).toLocaleString("en-US")}` : "can't drop"}`}>{({ copper: "Copper", gilded: "Gilded", hoard: "Hoard" } as Record<string, string>)[ch.id] ?? ch.name} {o ? `${(o * 100).toFixed(o < 0.001 ? 3 : o < 0.01 ? 2 : 1)}%` : "—"}</span>; })}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
