"use client";
// CS:GO-style case opening: the chest rattles and bursts, then a reel of possible drops slides past the marker
// and stops on what the server rolled. The reel runs in a rAF loop (strong ease-out, randomised final offset,
// ticks as cards pass once it has slowed down); the landing flashes the rarity colour with light beams behind
// the winner (legendary: orange beams, the legendary fanfare and a shake).
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { equipCosmetic, openChest } from "@/app/arcade/actions";
import { DUPLICATE_REFUND, RARITY_COLOR, RARITY_LABEL, itemOdds, themeAttr, type Chest, type Cosmetic, type Rarity } from "@/lib/cosmetics";
import { fmt, useArcade, wowIconUrl } from "./ArcadeShell";
import { CosmeticPreview } from "./CosmeticPreview";
import { Machine, Readout } from "./Machine";
import { ResultStrip, celebrate, type Chip } from "./Celebrate";
import { buzz, play, type Sfx } from "./sfx";

const WIN_AT = 48, LEN = 56;
const ORDER: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_SFX: Record<Rarity, Sfx> = { common: "reveal", uncommon: "win", rare: "bigwin", epic: "epic", legendary: "legendary" };
const CHEST_COLOR: Record<string, string> = { copper: "#d08a4a", gilded: "#FFD100", hoard: "#C08CFF", relic: "#FF9433" };
const REEL_MS = 5600, CHARGE_MS = 1000, BURST_MS = 340;

function pickFiller(chest: Chest, cosmetics: Cosmetic[]) {
  let r = Math.random(), rarity: Rarity = "common";
  for (const k of ORDER) { r -= chest.odds[k]; if (r < 0) { rarity = k; break; } }
  const pool = cosmetics.filter((c) => c.rarity === rarity);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : cosmetics[0];
}

const oneIn = (p: number) => (p >= 0.5 ? "1 in 2" : `1 in ${fmt(Math.round(1 / p))}`);
const kindLabel = (c: Cosmetic) => (c.kind === "marks" ? "marks" : c.kind === "name" ? "name style" : c.kind === "title" ? "title" : c.kind === "banner" ? "profile banner" : "site theme");
const chipLabel = (c: Cosmetic) => (c.kind === "marks" ? `+${fmt(c.marks ?? 0)}` : c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name);
const chipTone = (r: Rarity): Chip["tone"] => (RANK[r] >= 3 ? "big" : RANK[r] >= 1 ? "win" : "neutral");

type Phase = "idle" | "charge" | "burst" | "reel" | "won";
type Won = { item: Cosmetic; duplicate: boolean; refund: number; beamX: number; sparks: { dx: number; dy: number; d: number; s: number }[] };

export function ChestOpener({ chests, cosmetics, owned: owned0, drop }: {
  chests: Chest[]; cosmetics: Cosmetic[]; owned: string[]; drop: { daily: number; chance: Record<string, { at100: number; at1000: number }> };
}) {
  const { signedIn, balance, setBalance, flash, chests: inv, setChests } = useArcade();
  const [owned, setOwned] = useState(owned0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState<Chest | null>(null);
  const [items, setItems] = useState<Cosmetic[] | null>(null);
  const [won, setWon] = useState<Won | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [equipped, setEquipped] = useState(false);
  const [chips, setChips] = useState<Chip[]>([]);
  const [opened, setOpened] = useState(0);
  const [best, setBest] = useState<Rarity | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimers(); }, []);
  // the reel starts once its strip is in the DOM (it needs to measure where the winning card sits)
  const pendingRun = useRef<null | (() => void)>(null);
  useLayoutEffect(() => { if (items && pendingRun.current) { const f = pendingRun.current; pendingRun.current = null; f(); } }, [items]);

  const open = async (chest: Chest, fromInv = false) => {
    if (spinning) return;
    play("click");
    clearTimers(); cancelAnimationFrame(raf.current);
    setErr(null); setWon(null); setEquipped(false); setSpinning(true); setActive(chest);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(reduced ? "idle" : "charge"); setItems(null);
    box.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    const t0 = performance.now();
    if (!reduced) [0, 260, 480, 660, 800].forEach((ms, i) => later(ms, () => { play("thud", { pitch: 1 + i * 0.14, vol: 0.6 + i * 0.1 }); buzz("tap"); }));

    const r = await openChest({ chest: chest.id, owned: fromInv });
    if (!r.ok) { clearTimers(); setSpinning(false); setPhase("idle"); play("error"); return setErr(r.error); }
    setChests(r.chests);
    setBalance(r.balance - r.refund); // show the price leaving now; the refund lands with the reveal
    const reel = Array.from({ length: LEN }, () => pickFiller(chest, cosmetics));
    reel[WIN_AT] = r.item;

    const land = (beamX: number) => {
      const rk = RANK[r.item.rarity];
      const sparks = reduced || rk < 2 ? [] : Array.from({ length: 10 + rk * 8 }, () => {
        const a = Math.random() * Math.PI * 2, dist = 70 + Math.random() * (60 + rk * 30);
        return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist * 0.75, d: Math.random() * 120, s: 3 + Math.random() * 4 };
      });
      setPhase("won"); setSpinning(false);
      setWon({ item: r.item, duplicate: r.duplicate, refund: r.refund, beamX, sparks });
      setBalance(r.balance); if (r.refund) flash(r.refund);
      if (!r.duplicate && r.item.kind !== "marks") setOwned((o) => [...o, r.item.id]);
      // a new epic/legendary cosmetic gets the kit's rarity banner (which plays its own sound); everything else plays the rarity sound
      const newHighDrop = !r.duplicate && r.item.kind !== "marks" && (r.item.rarity === "epic" || r.item.rarity === "legendary");
      if (newHighDrop) later(320, () => celebrate({ mult: 0, won: 0, rarity: r.item.rarity as "epic" | "legendary", label: `${RARITY_LABEL[r.item.rarity]}: ${r.item.name}` }));
      else { play(RARITY_SFX[r.item.rarity]); buzz(rk >= 3 ? "big" : "win"); }
      if (r.refund > 0) later(rk >= 3 ? 900 : 380, () => celebrate({ mult: r.refund / chest.price, won: r.refund, noMult: true, label: r.duplicate && rk >= 2 ? `${RARITY_LABEL[r.item.rarity]} duplicate` : undefined }));
      setChips((c) => [{ k: performance.now(), label: chipLabel(r.item), tone: chipTone(r.item.rarity) }, ...c].slice(0, 14));
      setOpened((n) => n + 1);
      setBest((b) => (!b || RANK[r.item.rarity] > RANK[b] ? r.item.rarity : b));
    };

    const startReel = () => {
      pendingRun.current = () => {
        const vp = view.current, st = strip.current;
        const card = st?.querySelector<HTMLElement>("[data-win]"), first = st?.querySelector<HTMLElement>(".co-card");
        const second = first?.nextElementSibling as HTMLElement | null;
        if (!vp || !st || !card || !first) { land(0); return; }
        const w = vp.clientWidth, cw = card.offsetWidth, pitch = second ? second.offsetLeft - first.offsetLeft : cw + 10;
        const centre = card.offsetLeft + cw / 2;
        const target = centre - w / 2 + (Math.random() * 2 - 1) * 0.42 * cw;
        if (reduced) { st.style.transform = `translate3d(${-target}px,0,0)`; later(500, () => land(centre)); return; }
        play("spin");
        let lastX = 0, lastT = performance.now(), idx = -1, fast = false;
        const s0 = lastT;
        const step = (t: number) => {
          const u = Math.min(1, (t - s0) / REEL_MS), x = target * (1 - Math.pow(1 - u, 3.4));
          st.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
          const v = (x - lastX) / Math.max(1, t - lastT); lastX = x; lastT = t; // px per ms
          const under = Math.floor((x + w / 2 - first.offsetLeft) / pitch);
          if (under !== idx) {
            idx = under;
            if (v < 2.4) { play("tick", { pitch: 0.85 + Math.min(0.5, v * 0.22), vol: 0.45 + Math.min(0.55, v * 0.25) }); if (v < 0.5) buzz("tick"); }
          }
          const f = v > 2.6;
          if (f !== fast) { fast = f; st.classList.toggle("fast", f); }
          if (u < 1) raf.current = requestAnimationFrame(step);
          else { st.classList.remove("fast"); play("stop"); land(centre); }
        };
        raf.current = requestAnimationFrame(step);
      };
      setItems(reel); setPhase("reel");
    };

    if (reduced) { startReel(); return; }
    later(Math.max(0, CHARGE_MS - (performance.now() - t0)), () => {
      setPhase("burst"); play("whoosh"); play("reveal", { pitch: 0.8 }); buzz("tap");
      later(BURST_MS, startReel);
    });
  };

  const equip = async () => {
    if (!won || won.item.kind === "marks") return;
    const r = await equipCosmetic({ kind: won.item.kind, id: won.item.id });
    if (r.ok) { play("coin"); setEquipped(true); if (won.item.kind === "theme") { const t = themeAttr(won.item.id); if (t) document.documentElement.dataset.theme = t; } }
    else { play("error"); setErr(r.error); }
  };

  const ownedChests = chests.filter((c) => (inv[c.id] ?? 0) > 0);
  const again = active && phase === "won" ? active : null;
  const wr = won?.item.rarity;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div ref={box} className={`co-cabinet${wr ? ` r-${wr}` : ""}${phase === "won" && wr === "legendary" ? " quake" : ""}`}>
        <Machine theme="hoard" label="Chest opener" className="co-machine" hud={<>
          <Readout label="Chest" tone="gold">{active ? active.name.replace(" Chest", "").replace("Dragonlord's ", "") : "—"}</Readout>
          <Readout label="Opened">{opened}</Readout>
          <Readout label="Best">{best ? <span style={{ color: RARITY_COLOR[best] }}>{RARITY_LABEL[best]}</span> : "—"}</Readout>
          <ResultStrip items={chips} label="Recent drops" />
        </>}>
          <div className="co-screen">
            <div ref={view} className={`co-view ph-${phase}`} aria-hidden="true">
              {items ? (
                <div key="reel" ref={strip} className="co-strip">
                  {won && phase === "won" && wr !== "common" && <span className={`co-beam r-${wr}`} style={{ left: won.beamX, ["--r" as string]: RARITY_COLOR[won.item.rarity] }} />}
                  {won && phase === "won" && won.sparks.map((p, i) => (
                    <span key={i} className="co-spark" style={{ left: won.beamX, ["--dx" as string]: `${p.dx.toFixed(0)}px`, ["--dy" as string]: `${p.dy.toFixed(0)}px`, ["--d" as string]: `${p.d.toFixed(0)}ms`, ["--s" as string]: `${p.s.toFixed(1)}px`, ["--r" as string]: RARITY_COLOR[won.item.rarity] }} />
                  ))}
                  {items.map((c, i) => (
                    <div key={i} data-win={i === WIN_AT ? "" : undefined} className={`co-card${phase === "won" ? (i === WIN_AT ? " winner" : " lost") : ""}`} style={{ ["--r" as string]: RARITY_COLOR[c.rarity] }}>
                      <span className="co-card-art"><CosmeticPreview c={c} /></span>
                      <span className="co-card-name">{c.name}</span>
                      <span className="co-card-rar">{RARITY_LABEL[c.rarity]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div key="ghosts" className="co-strip co-ghosts">{Array.from({ length: 9 }, (_, i) => <div key={i} className="co-card ghost" style={{ ["--i" as string]: i }}><span className="co-ghost-q">?</span></div>)}</div>
              )}
              <span className="co-marker" />
              {(phase === "charge" || phase === "burst") && active && (
                <div className={`co-charge${phase === "burst" ? " burst" : ""}`} style={{ ["--cc" as string]: CHEST_COLOR[active.id] ?? "#FFD100" }}>
                  <span className="co-rays" />
                  <span className="co-chest"><img src={wowIconUrl(active.icon)} alt="" width={56} height={56} /></span>
                </div>
              )}
              {phase === "won" && wr && <span className="co-flash" style={{ ["--r" as string]: RARITY_COLOR[wr] }} />}
            </div>

            {phase === "won" && won ? (
              <div className="co-result" role="status" style={{ ["--r" as string]: RARITY_COLOR[won.item.rarity] }}>
                <div className="co-result-art"><CosmeticPreview c={won.item} sample="Your Name" /></div>
                <div className="co-result-text">
                  <span className="co-result-kind">{RARITY_LABEL[won.item.rarity]} {kindLabel(won.item)}{won.duplicate ? " · duplicate" : ""}</span>
                  <h2 style={{ color: RARITY_COLOR[won.item.rarity] }}>{won.item.name}</h2>
                  <span className="soft small">{won.item.kind === "marks" ? `${fmt(won.refund)} Dragon Marks added.` : won.duplicate ? `You already own this, so it became ${fmt(won.refund)} marks.` : won.item.blurb}</span>
                </div>
                <div className="co-result-actions">
                  {!won.duplicate && won.item.kind !== "marks" && <>
                    <button type="button" className="btn btn-primary" onClick={equip} disabled={equipped}>{equipped ? "Equipped ✓" : "Equip now"}</button>
                    <Link href="/arcade/collection" className="btn">Collection</Link>
                  </>}
                  {again && ((inv[again.id] ?? 0) > 0
                    ? <button type="button" className="btn" onClick={() => open(again, true)}>Open another <span className="chest-owned-n">×{inv[again.id]}</span></button>
                    : <button type="button" className="btn" onClick={() => open(again)} disabled={!signedIn || balance < again.price}>Buy another · <span className="mark-coin sm" aria-hidden="true" /> {fmt(again.price)}</button>)}
                </div>
              </div>
            ) : (
              <div className="co-hint" aria-live="polite">
                {spinning ? <span className="co-hint-text">{phase === "reel" ? "Rolling…" : `Unlocking the ${active?.name ?? "chest"}…`}</span> : (
                  <>
                    <span className="co-hint-text">{signedIn ? "Choose a chest to open" : "Sign in to open chests"}</span>
                    {ownedChests.length > 0 && (
                      <div className="co-quick">
                        {ownedChests.map((c) => (
                          <button key={c.id} type="button" className="co-quick-btn" onClick={() => open(c, true)} style={{ ["--cc" as string]: CHEST_COLOR[c.id] ?? "#FFD100" }}>
                            <img src={wowIconUrl(c.icon, 36)} alt="" width={30} height={30} />
                            <span>Open {c.name.replace(" Chest", "").replace("Dragonlord's ", "")}</span>
                            <strong>×{inv[c.id]}</strong>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Machine>
      </div>
      {err && <p className="game-err" role="alert">{err}</p>}

      <div className="row between baseline co-grid-head">
        <h2>Pick a chest</h2>
        <span className="micro muted">{signedIn ? `You can find up to ${drop.daily} a day while playing.` : "Sign in to open chests."}</span>
      </div>
      <div className="chest-grid co-chest-grid">
        {chests.map((c) => {
          const n = inv[c.id] ?? 0;
          return (
            <article key={c.id} id={c.id} className={`panel chest-panel co-chest-card${n > 0 ? " has" : ""}${active?.id === c.id && spinning ? " opening" : ""}`} style={{ ["--cc" as string]: CHEST_COLOR[c.id] ?? "#FFD100" }}>
              <div className="co-cc-head">
                <span className="co-cc-icon">
                  <img src={wowIconUrl(c.icon)} alt="" width={56} height={56} />
                  {n > 0 && <span className="co-cc-badge">×{n}</span>}
                </span>
                <div className="stack" style={{ gap: 3 }}>
                  <h2>{c.name}</h2>
                  <span className="micro muted">{c.blurb}</span>
                  {signedIn && <span className={`co-cc-own${n > 0 ? " has" : ""}`}>{n > 0 ? `${n} unopened` : "None unopened"}</span>}
                </div>
              </div>
              <div className="co-odds-bar" aria-hidden="true">
                {ORDER.filter((r) => c.odds[r] > 0).reverse().map((r) => <span key={r} style={{ flexGrow: c.odds[r], background: RARITY_COLOR[r] }} />)}
              </div>
              <ul className="chest-odds">
                {ORDER.filter((r) => c.odds[r] > 0).map((r) => (
                  <li key={r}><span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span><span>{(c.odds[r] * 100).toFixed(c.odds[r] < 0.01 ? 1 : 0)}%</span></li>
                ))}
              </ul>
              <p className="micro muted chest-drop-odds">Found while playing: {oneIn(drop.chance[c.id].at100)} bets of 100, {oneIn(drop.chance[c.id].at1000)} of 1,000</p>
              {n > 0 ? (
                <div className="stack co-cc-btns" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-primary" onClick={() => open(c, true)} disabled={!signedIn || spinning}>
                    Open yours <span className="chest-owned-n">×{n}</span>
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => open(c)} disabled={!signedIn || spinning || balance < c.price}>
                    Buy another · <span className="mark-coin sm" aria-hidden="true" /> {fmt(c.price)}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary co-cc-btns" onClick={() => open(c)} disabled={!signedIn || spinning || balance < c.price}>
                  Open · <span className="mark-coin sm" aria-hidden="true" /> {fmt(c.price)}
                </button>
              )}
            </article>
          );
        })}
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
