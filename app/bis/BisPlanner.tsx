"use client";
// Self-service BiS planner: each member picks their own best-in-slot item for every slot,
// searching Blizzard's item database, and tracks what they still need.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { removeBisItem, setBisItem, setBisStatus, updateBisEntry } from "@/app/actions";
import { Avatar, Bar, ItemIcon, StatusDot, vars } from "@/components/bits";
import { IconPlus, IconX } from "@/components/icons";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import { PAPERDOLL, SLOTS, SOURCE_LABEL, SOURCE_TYPES, type SearchItem, type Slot, type SourceType } from "@/lib/bis";
import { SOURCE_COLORS, classColor, qualityColor } from "@/lib/ui";

export interface BisEntry {
  itemId: number; name: string; quality: string; iconUrl: string | null; itemLevel: number | null;
  sourceType: string | null; note: string; status: "have" | "need"; equipped: boolean; wishlisted: boolean;
  curated: { zone: string; how: string; pin: { label: string; x: number; y: number } | null } | null;
}
export interface BisChar {
  slug: string; name: string; className: string; level: number; avatarUrl: string | null; renderUrl: string | null;
  slots: Record<Slot, BisEntry | null>;
  equipped: Record<Slot, { name: string; quality: string; iconUrl: string | null } | null>;
}

const isHave = (e: BisEntry) => e.status === "have" || e.equipped;

export function BisPlanner({ chars }: { chars: BisChar[] }) {
  const [ci, setCi] = useState(0);
  const [lists, setLists] = useState(chars);
  const [sel, setSel] = useState<Slot>("Head");
  const [picker, setPicker] = useState<Slot | null>(null);
  const { pending, run, toast } = useAction();
  useEffect(() => setLists(chars), [chars]);

  if (!lists.length) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <Header chars={[]} ci={0} onPick={() => {}} />
        <div className="empty">Claim a character first, then plan its gear here. <Link href="/sign-in?step=claim">Claim characters</Link></div>
      </main>
    );
  }

  const ch = lists[Math.min(ci, lists.length - 1)];
  const entries = SLOTS.map((s) => ch.slots[s]).filter((e): e is BisEntry => !!e);
  const have = entries.filter(isHave).length;
  const e = ch.slots[sel];

  const patch = (slot: Slot, next: BisEntry | null) =>
    setLists((ls) => ls.map((c) => (c.slug === ch.slug ? { ...c, slots: { ...c.slots, [slot]: next } } : c)));

  const choose = (slot: Slot, it: SearchItem) => {
    const prev = ch.slots[slot];
    patch(slot, {
      itemId: it.id, name: it.name, quality: it.quality, iconUrl: it.iconUrl, itemLevel: it.itemLevel, sourceType: null, note: "",
      status: "need", equipped: false, wishlisted: false, curated: null,
    });
    setPicker(null);
    setSel(slot);
    run(() => setBisItem({ character: ch.slug, slot, itemId: it.id }).then((r) => { if (!r.ok) patch(slot, prev); return r; }));
  };

  return (
    <main id="main" tabIndex={-1} className="container page">
      <Header chars={lists} ci={ci} onPick={(i) => { setCi(i); setSel("Head"); }} />

      <section aria-label="Progress" className="row" style={{ alignItems: "stretch", gap: 12 }}>
        <div className="panel" style={{ flex: "2 1 320px", gap: 10, padding: 20 }}>
          <div className="row between small"><span className="soft">BiS collected</span><span className="strong">{have} / {entries.length} chosen · {SLOTS.length - entries.length} slots open</span></div>
          <Bar pct={entries.length ? (have / entries.length) * 100 : 0} height={10} />
        </div>
        {(["raid", "dungeon", "quest", "crafted"] as const).map((t) => (
          <div key={t} className="panel" style={{ flex: "1 1 130px", gap: 4, padding: 16 }}>
            <span className="row small strong" style={{ gap: 8 }}><span className="dot" style={vars({ "--c": SOURCE_COLORS[t][1] })} />{SOURCE_LABEL[t]}</span>
            <span className="small muted">{entries.filter((x) => x.sourceType === t && !isHave(x)).length} left</span>
          </div>
        ))}
      </section>

      <section className="bis-sheet" aria-label={`${ch.name} best-in-slot sheet`}>
        <SlotColumn slots={PAPERDOLL.left} ch={ch} sel={sel} onSelect={setSel} onAdd={setPicker} />

        <div className="bis-center">
          <div className="bis-detail panel" aria-live="polite">
            <div className="row between baseline">
              <span className="eyebrow">{sel}</span>
              {e && <span className="row small strong" style={{ gap: 6, color: isHave(e) ? "#4CD964" : "#A8987A" }}><StatusDot color={isHave(e) ? "#4CD964" : "#A8987A"} />{e.equipped ? "Equipped" : isHave(e) ? "Have" : "Need"}</span>}
            </div>
            {e ? (
              <EntryEditor
                key={`${ch.slug}-${sel}-${e.itemId}`}
                entry={e}
                equipped={ch.equipped[sel]}
                pending={pending}
                onChange={() => setPicker(sel)}
                onRemove={() => { const prev = e; patch(sel, null); run(() => removeBisItem({ character: ch.slug, slot: sel }).then((r) => { if (!r.ok) patch(sel, prev); return r; })); }}
                onToggleHave={() => {
                  const next = e.status === "have" ? "need" : "have";
                  patch(sel, { ...e, status: next });
                  run(() => setBisStatus({ character: ch.slug, slot: sel, status: next }).then((r) => { if (!r.ok) patch(sel, e); return r; }));
                }}
                onSaveSource={(sourceType, note) => {
                  patch(sel, { ...e, sourceType, note });
                  run(() => updateBisEntry({ character: ch.slug, slot: sel, sourceType, note }));
                }}
              />
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                <p className="soft">No BiS item picked for this slot yet.</p>
                {ch.equipped[sel] && <p className="small muted">Equipped now: <span style={{ color: qualityColor(ch.equipped[sel]!.quality) }}>{ch.equipped[sel]!.name}</span></p>}
                <button type="button" className="btn btn-primary" onClick={() => setPicker(sel)}><IconPlus /> Choose an item</button>
              </div>
            )}
          </div>
          <div className="bis-figure" aria-hidden="true">
            {ch.renderUrl ? <img src={ch.renderUrl} alt="" /> : <span className="display" style={{ fontSize: 64, color: classColor(ch.className) }}>{ch.name.charAt(0)}</span>}
          </div>
        </div>

        <SlotColumn slots={PAPERDOLL.right} ch={ch} sel={sel} onSelect={setSel} onAdd={setPicker} />
        <div className="bis-weapons"><SlotColumn slots={PAPERDOLL.bottom} ch={ch} sel={sel} onSelect={setSel} onAdd={setPicker} row /></div>
      </section>

      <p className="small muted">Your list, your call: pick items from Blizzard&apos;s WoW Forever item database. Items you&apos;re wearing count as &quot;Have&quot; automatically after the next profile sync.</p>

      {picker && <ItemPicker slot={picker} onClose={() => setPicker(null)} onChoose={(it) => choose(picker, it)} />}
      <Toast toast={toast} />
    </main>
  );
}

function Header({ chars, ci, onPick }: { chars: BisChar[]; ci: number; onPick: (i: number) => void }) {
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Best in slot</span>
        <h1>BiS Planner</h1>
        <p className="soft" style={{ fontSize: 16 }}>Plan your own best gear for every slot, see where it drops, and track what you still need.</p>
      </div>
      {chars.length > 1 && (
        <div className="row" role="group" aria-label="Character">
          {chars.map((c, i) => (
            <button key={c.slug} type="button" className="select-card" aria-pressed={i === ci} onClick={() => onPick(i)} style={{ padding: "8px 14px 8px 8px" }}>
              <Avatar name={c.name} className={c.className} size={36} url={c.avatarUrl} />
              <span className="strong" style={{ color: classColor(c.className) }}>{c.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SlotColumn({ slots, ch, sel, onSelect, onAdd, row }: {
  slots: Slot[]; ch: BisChar; sel: Slot; onSelect: (s: Slot) => void; onAdd: (s: Slot) => void; row?: boolean;
}) {
  return (
    <ul className={row ? "bis-col bis-row" : "bis-col"}>
      {slots.map((s) => {
        const e = ch.slots[s];
        return (
          <li key={s}>
            <button type="button" className="bis-slot" data-item-id={e?.itemId || undefined} aria-pressed={sel === s} onClick={() => { onSelect(s); if (!e) onAdd(s); }}
              aria-label={e ? `${s}: ${e.name}` : `${s}: choose an item`}>
              {e ? <ItemIcon slot={s.replace(/ \d$/, "")} quality={e.quality} iconUrl={e.iconUrl} /> : <span className="bis-empty-icon" aria-hidden="true"><IconPlus /></span>}
              <span className="stack grow" style={{ gap: 0, lineHeight: 1.25, minWidth: 0 }}>
                <span className="micro muted">{s}</span>
                <span className="small strong bis-name" style={{ color: e ? qualityColor(e.quality) : "var(--dw-text-muted)" }}>{e ? e.name : "Choose item"}</span>
              </span>
              {e && <StatusDot color={isHave(e) ? "#4CD964" : e.wishlisted ? "#F2CF6B" : "#6f6656"} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EntryEditor({ entry: e, equipped, pending, onChange, onRemove, onToggleHave, onSaveSource }: {
  entry: BisEntry; equipped: { name: string; quality: string; iconUrl: string | null } | null; pending: boolean;
  onChange: () => void; onRemove: () => void; onToggleHave: () => void; onSaveSource: (t: string | null, note: string) => void;
}) {
  const [type, setType] = useState(e.sourceType ?? "");
  const [note, setNote] = useState(e.note ?? "");
  const dirty = type !== (e.sourceType ?? "") || note !== (e.note ?? "");
  const [bg, fg] = SOURCE_COLORS[type] ?? ["#1d160d", "#D9CCAE"];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
        <ItemIcon slot="" quality={e.quality} iconUrl={e.iconUrl} size={56} itemId={e.itemId} />
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2 style={{ fontSize: 20, color: qualityColor(e.quality), fontFamily: "var(--font-body)", fontWeight: 700 }}>{e.name}</h2>
          <span className="small muted">{e.itemLevel ? `Item level ${e.itemLevel}` : "WoW Forever item"}{type && <> · <span style={{ background: bg, color: fg, padding: "0 6px", borderRadius: 6 }}>{SOURCE_LABEL[type as SourceType]}</span></>}</span>
        </div>
      </div>

      {e.curated?.pin && <MiniMap pin={e.curated.pin} />}
      {e.curated?.how && <p className="soft small">{e.curated.how}</p>}

      <div className="grid-auto" style={{ ["--min" as string]: "150px", gap: 10 }}>
        <label className="field">Where it comes from
          <select value={type} onChange={(ev) => setType(ev.target.value)}>
            <option value="">Not set</option>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="field">Boss, zone or note
          <input type="text" maxLength={120} value={note} placeholder="e.g. Onyxia, or Revered with Argent Dawn" onChange={(ev) => setNote(ev.target.value)} />
        </label>
      </div>
      {dirty && <div><button type="button" className="btn btn-sm" disabled={pending} onClick={() => onSaveSource(type || null, note)}>Save source</button></div>}

      {equipped && !e.equipped && <p className="small muted">Equipped now: <span style={{ color: qualityColor(equipped.quality) }}>{equipped.name}</span></p>}
      {e.wishlisted && <p className="small" style={{ color: "#F2CF6B" }}>On your raid wishlist.</p>}

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className={isHave(e) ? "btn" : "btn btn-primary"} disabled={pending || e.equipped} onClick={onToggleHave}>
          {e.equipped ? "Equipped" : e.status === "have" ? "Mark as still needed" : "Mark as obtained"}
        </button>
        <button type="button" className="btn" onClick={onChange}>Change item</button>
        <button type="button" className="btn btn-danger" disabled={pending} onClick={onRemove}><IconX /> Remove</button>
        {e.sourceType === "raid" && <Link href="/loot" className="btn">Raid wishlist</Link>}
        {e.sourceType === "crafted" && <Link href="/roster?tab=craft" className="btn">Request a craft</Link>}
      </div>
    </div>
  );
}

function MiniMap({ pin }: { pin: { label: string; x: number; y: number } }) {
  return (
    <div className="schematic-map" role="img" aria-label={`Map pin: ${pin.label}`} style={{ aspectRatio: "5 / 2.4" }}>
      <svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <path d="M120 90 C200 40 300 70 340 130 C390 200 360 260 400 330 C430 400 390 480 330 530 C260 580 180 550 150 480 C110 400 60 360 70 280 C80 200 60 140 120 90 Z" fill="#2a1f10" stroke="#7A5E22" strokeWidth="3" />
        <path d="M640 70 C720 40 820 60 860 120 C900 180 860 230 880 290 C910 360 880 430 820 480 C760 540 690 520 660 460 C630 400 600 380 610 310 C620 240 580 200 600 140 C610 105 620 82 640 70 Z" fill="#2a1f10" stroke="#7A5E22" strokeWidth="3" />
      </svg>
      <span className="map-pin" style={{ left: `${pin.x}%`, top: `${pin.y}%`, cursor: "default" }}>
        <span className="map-pin-tag" style={{ background: "#2E2414", borderColor: "var(--dw-gold)" }}>{pin.label}</span>
        <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden="true"><path d="M11 27 C11 27 2 16 2 10 A9 9 0 0 1 20 10 C20 16 11 27 11 27 Z" fill="#E3B341" stroke="#0b0806" strokeWidth="2" /><circle cx="11" cy="10" r="3.5" fill="#0b0806" /></svg>
      </span>
    </div>
  );
}

function ItemPicker({ slot, onClose, onChoose }: { slot: Slot; onClose: () => void; onChoose: (it: SearchItem) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ loading: boolean; items: SearchItem[]; error?: string; note?: string; searched?: string }>({ loading: false, items: [] });

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setState({ loading: false, items: [] }); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetch(`/api/items/search?slot=${encodeURIComponent(slot)}&q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        const j = await res.json();
        setState({ loading: false, items: j.items ?? [], error: j.error, note: j.note, searched: q.trim() });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState({ loading: false, items: [], error: "Search failed. Try again." });
      }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, slot]);

  const sorted = useMemo(() => state.items, [state.items]);
  return (
    <dialog ref={ref} className="picker" onClose={onClose} aria-labelledby="picker-title"
      onClick={(ev) => { if (ev.target === ref.current) ref.current?.close(); }}
      onKeyDown={(ev) => { if (ev.key === "Escape") { ev.preventDefault(); ref.current?.close(); } }}>
      <div className="picker-inner">
        <div className="row between">
          <h2 id="picker-title" style={{ fontSize: 20 }}>Choose {slot}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}><IconX /></button>
        </div>
        <label className="field">Search WoW Forever items
          <input type="search" autoFocus placeholder="Type full words, e.g. lionheart, onyxia, robe" value={q} onChange={(ev) => setQ(ev.target.value)} />
        </label>
        <p className="micro muted">Searches Blizzard&apos;s item database for items that fit this slot. Use whole words; names you&apos;ve searched before also match partially.</p>
        <ul className="picker-results" aria-busy={state.loading}>
          {state.loading && <li className="muted small">Searching…</li>}
          {!state.loading && state.error && <li className="small" style={{ color: "var(--dw-bad)" }}>{state.error}</li>}
          {!state.loading && state.searched && !state.error && sorted.length === 0 && <li className="muted small">No {slot.toLowerCase()} items match “{state.searched}”.</li>}
          {sorted.map((it) => (
            <li key={it.id}>
              <button type="button" className="list-row picker-item" data-item-id={it.id} onClick={() => onChoose(it)}>
                <ItemIcon slot="" quality={it.quality} iconUrl={it.iconUrl} />
                <span className="stack grow" style={{ gap: 0, lineHeight: 1.3, textAlign: "left" }}>
                  <span className="strong" style={{ color: qualityColor(it.quality) }}>{it.name}</span>
                  <span className="micro muted">{[it.itemLevel && `Item level ${it.itemLevel}`, it.requiredLevel && `Requires level ${it.requiredLevel}`].filter(Boolean).join(" · ") || "WoW Forever item"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {state.note && <p className="micro muted">{state.note}</p>}
      </div>
    </dialog>
  );
}
