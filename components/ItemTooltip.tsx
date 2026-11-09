"use client";
// WoW-style item tooltip. Any element with data-item-id gets one: hover (or keyboard focus) for a moment and it
// appears; click shows it straight away (handy on phones). Mounted once in the root layout.
import { useEffect, useRef, useState } from "react";
import type { ItemTip } from "@/lib/tooltip";
import { qualityColor } from "@/lib/ui";

const HOVER_DELAY = 800; // ms the pointer rests on an item before the tooltip shows
const cache = new Map<number, Promise<ItemTip | null>>();
function load(id: number) {
  if (!cache.has(id)) {
    cache.set(id, fetch(`/api/items/${id}/tooltip`).then((r) => (r.ok ? r.json() : { tip: null })).then((j) => j.tip as ItemTip | null).catch(() => {
      cache.delete(id); return null;
    }));
  }
  return cache.get(id)!;
}

type State = { id: number; tip: ItemTip | null | "loading"; x: number; y: number; anchor: DOMRect | null };

export function ItemTooltip() {
  const [st, setSt] = useState<State | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const open = useRef(false);
  open.current = !!st;

  useEffect(() => {
    const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    const hide = () => { clear(); current.current = null; setSt(null); };
    const show = (el: HTMLElement, fromPointer: boolean) => {
      const id = Number(el.dataset.itemId);
      if (!id) return;
      const anchor = fromPointer ? null : el.getBoundingClientRect();
      setSt({ id, tip: "loading", x: pos.current.x, y: pos.current.y, anchor });
      load(id).then((tip) => setSt((s) => (s && s.id === id ? { ...s, tip } : s)));
    };
    const target = (e: Event) => (e.target as Element | null)?.closest?.("[data-item-id]") as HTMLElement | null;

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = target(e);
      if (el === current.current) return;
      hide();
      if (!el) return;
      current.current = el;
      load(Number(el.dataset.itemId)); // warm the cache while the pointer rests
      timer.current = setTimeout(() => show(el, true), HOVER_DELAY);
    };
    const move = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      setSt((s) => (s && !s.anchor ? { ...s, x: e.clientX, y: e.clientY } : s));
    };
    const out = (e: PointerEvent) => {
      const el = current.current;
      if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hide();
    };
    const click = (e: MouseEvent) => {
      const el = target(e);
      // Rows that are already buttons/links keep their own click; plain item rows open the tooltip instantly.
      if (!el || el.closest("button, a, [role=button]")) return;
      if (open.current && current.current === el) { hide(); return; }
      clear(); current.current = el; pos.current = { x: e.clientX, y: e.clientY }; show(el, e.detail === 0);
    };
    const focus = (e: FocusEvent) => {
      const el = target(e);
      if (!el) return;
      hide(); current.current = el;
      timer.current = setTimeout(() => show(el, false), 600);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", out);
    document.addEventListener("click", click);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      clear();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("click", click);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide);
    };
  }, []);

  // Keep the card on screen: beside the cursor (or below the focused element), flipped at the edges.
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!st || !box.current) { setPlace(null); return; }
    const b = box.current.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 12;
    let left: number, top: number;
    if (st.anchor) { left = st.anchor.left; top = st.anchor.bottom + 8; if (top + b.height > vh - pad) top = st.anchor.top - b.height - 8; }
    else { left = st.x + 18; top = st.y + 18; if (left + b.width > vw - pad) left = st.x - b.width - 14; if (top + b.height > vh - pad) top = st.y - b.height - 14; }
    setPlace({ left: Math.max(pad, Math.min(left, vw - b.width - pad)), top: Math.max(pad, Math.min(top, vh - b.height - pad)) });
  }, [st]);

  if (!st) return null;
  const t = st.tip;
  return (
    <div ref={box} className="wow-tooltip" role="tooltip" style={{ left: place?.left ?? -9999, top: place?.top ?? -9999, visibility: place ? "visible" : "hidden" }}>
      {t === "loading" ? <div className="wt-muted">Loading…</div> : !t ? <div className="wt-muted">No item data yet.</div> : <TipBody t={t} />}
    </div>
  );
}

function TipBody({ t }: { t: ItemTip }) {
  const white = t.stats.filter((x) => !x.green), green = t.stats.filter((x) => x.green);
  return (
    <>
      <div className="wt-name" style={{ color: qualityColor(t.quality) }}>{t.name}</div>
      {t.itemLevel && <div className="wt-ilvl">{t.itemLevel}</div>}
      {t.binding && <div>{t.binding}</div>}
      {t.unique && <div>{t.unique}</div>}
      {(t.slot || t.subclass) && <div className="wt-split"><span>{t.slot}</span><span>{t.subclass}</span></div>}
      {t.weapon && (t.weapon.damage || t.weapon.speed) && <div className="wt-split"><span>{t.weapon.damage}</span><span>{t.weapon.speed}</span></div>}
      {t.weapon?.dps && <div>{t.weapon.dps}</div>}
      {t.armor && <div>{t.armor}</div>}
      {t.block && <div>{t.block}</div>}
      {white.map((x, i) => <div key={`w${i}`}>{x.text}</div>)}
      {t.durability && <div>{t.durability}</div>}
      {t.classes && <div>{t.classes}</div>}
      {t.requires && <div>{t.requires}</div>}
      {green.map((x, i) => <div key={`g${i}`} className="wt-green">{/^equip:/i.test(x.text) ? x.text : `Equip: ${x.text}`}</div>)}
      {t.spells.map((x, i) => <div key={`s${i}`} className="wt-green">{x}</div>)}
      {t.set && (
        <div className="wt-set">
          <div className="wt-gold">{t.set.name}</div>
          {t.set.items.map((n) => <div key={n} className="wt-dim wt-indent">{n}</div>)}
          {t.set.effects.map((x, i) => <div key={i} className={x.active ? "wt-green" : "wt-dim"}>{x.text}</div>)}
        </div>
      )}
      {t.description && <div className="wt-gold">&ldquo;{t.description}&rdquo;</div>}
      {t.sell && (
        <div className="wt-sell">Sell Price: {t.sell.g > 0 && <span className="coin g">{t.sell.g}</span>}{t.sell.s > 0 && <span className="coin s">{t.sell.s}</span>}{t.sell.c > 0 && <span className="coin c">{t.sell.c}</span>}</div>
      )}
      {t.source === "retail" && <div className="wt-note">Stats from Blizzard&apos;s retail data; Forever may differ.</div>}
    </>
  );
}
