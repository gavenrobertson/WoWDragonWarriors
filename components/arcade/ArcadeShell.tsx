"use client";
// Shared arcade state: the player's Dragon Marks balance, kept in sync by every game.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { GAMES } from "@/lib/arcade-games";
export { GAMES, fmt, wowIconUrl } from "@/lib/arcade-games";

const Ctx = createContext<{ balance: number; setBalance: (n: number) => void; signedIn: boolean; flash: (delta: number) => void }>({
  balance: 0, setBalance: () => {}, signedIn: false, flash: () => {},
});
export const useArcade = () => useContext(Ctx);


export function ArcadeShell({ initial, signedIn, children }: { initial: number; signedIn: boolean; children: React.ReactNode }) {
  const [balance, setBal] = useState(initial);
  const [delta, setDelta] = useState<{ n: number; k: number } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setBal(initial), [initial]);
  const setBalance = useCallback((n: number) => setBal(n), []);
  const flash = useCallback((n: number) => {
    if (!n) return;
    setDelta({ n, k: Date.now() });
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setDelta(null), 1800);
  }, []);
  const path = usePathname();
  return (
    <Ctx.Provider value={{ balance, setBalance, signedIn, flash }}>
      <div className="arcade">
        <div className="arcade-bar">
          <nav className="arcade-tabs" aria-label="Arcade">
            <Link href="/arcade" aria-current={path === "/arcade" ? "page" : undefined}>Lobby</Link>
            {GAMES.map((g) => <Link key={g.slug} href={`/arcade/${g.slug}`} aria-current={path === `/arcade/${g.slug}` ? "page" : undefined}>{g.name}</Link>)}
            <Link href="/arcade/chests" aria-current={path === "/arcade/chests" ? "page" : undefined}>Chests</Link>
            <Link href="/arcade/collection" aria-current={path === "/arcade/collection" ? "page" : undefined}>Collection</Link>
          </nav>
          <div className="arcade-wallet" aria-live="polite">
            <span className="mark-coin" aria-hidden="true" />
            <span className="arcade-balance">{signedIn ? balance.toLocaleString("en-US") : "—"}</span>
            <span className="micro muted">Dragon Marks</span>
            {delta && <span key={delta.k} className={`arcade-delta ${delta.n > 0 ? "up" : "down"}`}>{delta.n > 0 ? "+" : ""}{delta.n.toLocaleString("en-US")}</span>}
          </div>
        </div>
        {!signedIn && (
          <div className="arcade-signin">
            <span>Sign in with Battle.net to claim a <strong>2,500 Dragon Mark welcome bonus</strong> and a free name colour, then spin the daily wheel and play.</span>
            <Link href="/sign-in" className="btn btn-primary btn-sm">Sign in</Link>
          </div>
        )}
        {children}
        <p className="arcade-fine">Dragon Marks are play money for fun and cosmetics. They can&apos;t be bought, sold or cashed out.</p>
      </div>
    </Ctx.Provider>
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

