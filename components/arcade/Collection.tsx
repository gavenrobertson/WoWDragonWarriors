"use client";
import Link from "next/link";
import { useState } from "react";
import { equipCosmetic } from "@/app/arcade/actions";
import { RARITY_COLOR, type Cosmetic, type CosmeticKind } from "@/lib/cosmetics";
import { PlayerName } from "@/components/PlayerName";
import { CosmeticPreview } from "./CosmeticPreview";

const KINDS: { kind: Exclude<CosmeticKind, "marks">; label: string; key: "nameStyle" | "title" | "theme" }[] = [
  { kind: "name", label: "Name styles", key: "nameStyle" },
  { kind: "title", label: "Titles", key: "title" },
  { kind: "theme", label: "Site themes", key: "theme" },
];

export function Collection({ cosmetics, owned, equipped: eq0, me }: {
  cosmetics: Cosmetic[]; owned: string[]; equipped: { nameStyle: string | null; title: string | null; theme: string | null }; me: { name: string; className: string | null };
}) {
  const [eq, setEq] = useState(eq0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const equip = async (kind: "name" | "title" | "theme", key: keyof typeof eq, id: string | null) => {
    setBusy(true); setErr(null);
    const r = await equipCosmetic({ kind, id });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setEq((e) => ({ ...e, [key]: id }));
    if (kind === "theme") location.reload(); // themes restyle the whole page
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel collection-hero">
        <span className="micro muted">How you appear</span>
        <PlayerName name={me.name} className={me.className} nameStyle={eq.nameStyle} title={eq.title} style={{ fontSize: 30, fontFamily: "var(--font-display)" }} />
        {err && <p className="game-err" role="alert">{err}</p>}
      </div>
      {KINDS.map(({ kind, label, key }) => {
        const list = cosmetics.filter((c) => c.kind === kind);
        const mine = list.filter((c) => owned.includes(c.id));
        return (
          <section key={kind} className="panel stack" style={{ gap: 12 }} aria-labelledby={`k-${kind}`}>
            <div className="row between baseline">
              <h2 id={`k-${kind}`}>{label}</h2>
              <span className="micro muted">{mine.length} of {list.length}</span>
            </div>
            <div className="drop-grid">
              <button type="button" className={`drop-card${!eq[key] ? " equipped" : ""}`} disabled={busy || !eq[key]} onClick={() => equip(kind, key, null)}>
                <span className="cp cp-title">Default</span>
                <span className="small strong">{kind === "theme" ? "Dragon Warriors" : kind === "name" ? "Class colour" : "No title"}</span>
                <span className="micro muted">{!eq[key] ? "Equipped" : "Use the default"}</span>
              </button>
              {list.map((c) => {
                const have = owned.includes(c.id), on = eq[key] === c.id;
                return (
                  <button key={c.id} type="button" className={`drop-card${have ? " owned" : " locked"}${on ? " equipped" : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }}
                    disabled={busy || !have || on} onClick={() => equip(kind, key, c.id)}>
                    <CosmeticPreview c={c} sample={me.name.split(" ")[0]} />
                    <span className="small strong" style={{ color: RARITY_COLOR[c.rarity] }}>{c.name}</span>
                    <span className="micro muted">{on ? "Equipped" : have ? "Click to equip" : "Find it in a chest"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="micro muted">Missing something? <Link href="/arcade/chests">Open chests</Link>.</p>
    </div>
  );
}
