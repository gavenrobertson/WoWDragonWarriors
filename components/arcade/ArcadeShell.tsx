"use client";
// Shared arcade state: the player's Dragon Marks balance, kept in sync by every game.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { GAMES, wowIconUrl } from "@/lib/arcade-games";
import { CHESTS } from "@/lib/cosmetics";
import { myChests } from "@/app/arcade/actions";
export { GAMES, fmt } from "@/lib/arcade-games";
export { wowIconUrl };

type Chests = Record<string, number>;
const Ctx = createContext<{ balance: number; setBalance: (n: number) => void; signedIn: boolean; flash: (delta: number) => void; chests: Chests; setChests: (c: Chests) => void }>({
  balance: 0, setBalance: () => {}, signedIn: false, flash: () => {}, chests: {}, setChests: () => {},
});
export const useArcade = () => useContext(Ctx);


export function ArcadeShell({ initial, signedIn, chests: chests0 = {}, children }: { initial: number; signedIn: boolean; chests?: Chests; children: React.ReactNode }) {
  const [balance, setBal] = useState(initial);
  const [chests, setChestsS] = useState<Chests>(chests0);
  const chestsRef = useRef(chests0);
  const [found, setFound] = useState<{ id: string; k: number } | null>(null);
  const foundT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checking = useRef(false);
  const setChests = useCallback((c: Chests) => { chestsRef.current = c; setChestsS(c); }, []);
  // Every play ends with a balance update; that's when to check whether a chest dropped.
  const checkChests = useCallback(async () => {
    if (!signedIn || checking.current) return;
    checking.current = true;
    try {
      const r = await myChests();
      if (!r.ok) return;
      const before = chestsRef.current;
      const gained = CHESTS.filter((c) => (r.chests[c.id] ?? 0) > (before[c.id] ?? 0)).sort((a, b) => b.price - a.price)[0];
      setChests(r.chests);
      if (gained) {
        setFound({ id: gained.id, k: Date.now() });
        if (foundT.current) clearTimeout(foundT.current);
        foundT.current = setTimeout(() => setFound(null), 6000);
      }
    } finally { checking.current = false; }
  }, [signedIn, setChests]);
  const [delta, setDelta] = useState<{ n: number; k: number } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setBal(initial), [initial]);
  const setBalance = useCallback((n: number) => { setBal(n); void checkChests(); }, [checkChests]);
  const flash = useCallback((n: number) => {
    if (!n) return;
    setDelta({ n, k: Date.now() });
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setDelta(null), 1800);
  }, []);
  const path = usePathname();
  const chestCount = Object.values(chests).reduce((a, b) => a + b, 0);
  const foundChest = found ? CHESTS.find((c) => c.id === found.id) : null;
  return (
    <Ctx.Provider value={{ balance, setBalance, signedIn, flash, chests, setChests }}>
      <div className="arcade">
        <div className="arcade-bar">
          <nav className="arcade-tabs" aria-label="Arcade">
            <Link href="/arcade" aria-current={path === "/arcade" ? "page" : undefined}>Lobby</Link>
            <GamesMenu path={path} />
            <Link href="/arcade/chests" aria-current={path === "/arcade/chests" ? "page" : undefined} aria-label={`Chests${chestCount ? `, ${chestCount} unopened` : ""}`} className="tab-iconic">
              <img src={wowIconUrl("inv_box_02", 36)} alt="" width={22} height={22} className="tab-icon" /><span className="tab-text">Chests</span>
              {chestCount > 0 && <span className="chest-badge" aria-hidden="true">{chestCount > 99 ? "99+" : chestCount}</span>}
            </Link>
            <Link href="/arcade/collection" aria-current={path === "/arcade/collection" ? "page" : undefined} aria-label="Collection" className="tab-iconic">
              <img src={wowIconUrl("inv_misc_bag_10", 36)} alt="" width={22} height={22} className="tab-icon" /><span className="tab-text">Collection</span>
            </Link>
          </nav>
          <div className="arcade-wallet" aria-live="polite">
            <span className="mark-coin" aria-hidden="true" />
            <span className="arcade-balance">{signedIn ? balance.toLocaleString("en-US") : "—"}</span>
            <span className="micro muted">Dragon Marks</span>
            {delta && <span key={delta.k} className={`arcade-delta ${delta.n > 0 ? "up" : "down"}`}>{delta.n > 0 ? "+" : ""}{delta.n.toLocaleString("en-US")}</span>}
          </div>
        </div>
        {foundChest && (
          <Link key={found!.k} href="/arcade/chests" className="chest-found" role="status" onClick={() => setFound(null)}>
            <img src={wowIconUrl(foundChest.icon, 56)} alt="" width={40} height={40} />
            <span><strong>You found a {foundChest.name}!</strong><span className="micro">It&apos;s waiting in Chests. Tap to open it.</span></span>
          </Link>
        )}
        {!signedIn && (
          <div className="arcade-signin">
            <span>Sign in with Battle.net to claim a <strong>5,000 Dragon Mark welcome bonus</strong> and a free name colour, then spin the daily wheel and play.</span>
            <Link href="/sign-in" className="btn btn-primary btn-sm">Sign in</Link>
          </div>
        )}
        {children}
        <p className="arcade-fine">Dragon Marks are play money for fun and cosmetics. They can&apos;t be bought, sold or cashed out.</p>
      </div>
    </Ctx.Provider>
  );
}

/** "Games" button in the arcade bar: opens a panel of every game with its icon. Shows the current game's name. */
function GamesMenu({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = GAMES.find((g) => path === `/arcade/${g.slug}`);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="games-menu" ref={wrap}>
      <button type="button" className="games-menu-btn" aria-expanded={open} aria-haspopup="true" aria-current={current ? "page" : undefined} onClick={() => setOpen((o) => !o)}>
        {current && <img src={wowIconUrl(current.icon, 36)} alt="" width={18} height={18} />}
        <span className="gm-full">{current ? current.name : "Games"}</span><span className="gm-short">Games</span>
        <span className="games-menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="games-menu-panel" role="menu" aria-label="All games">
          {GAMES.map((g) => (
            <Link key={g.slug} href={`/arcade/${g.slug}`} role="menuitem" className="games-menu-item" aria-current={path === `/arcade/${g.slug}` ? "page" : undefined}>
              <img src={wowIconUrl(g.icon, 36)} alt="" width={30} height={30} />
              <span><strong>{g.name}</strong><span className="micro muted">{g.blurb}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bet amount control with quick halve/double/max buttons. */
export function BetInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const { balance } = useArcade();
  const set = (n: number) => onChange(Math.max(10, Math.min(25000, Math.floor(n) || 10)));
  return (
    <label className="field bet-field">
      Bet
      <span className="bet-row">
        <span className="mark-coin sm" aria-hidden="true" />
        <input type="number" min={10} max={25000} step={10} value={value} disabled={disabled} onChange={(e) => set(Number(e.target.value))} />
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => set(value / 2)}>½</button>
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => set(value * 2)}>2×</button>
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => set(Math.min(25000, balance))}>Max</button>
      </span>
    </label>
  );
}

