"use client";
// Phone and small-tablet navigation: a menu button that opens a full-width panel of large links.
// Closes on Escape, on a tap outside, and whenever the route changes; the page behind doesn't scroll while open.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconDiscord } from "./icons";
import { PlayerName } from "./PlayerName";

const ICONS: Record<string, string> = {
  "/": "inv_misc_rune_01", "/guild": "inv_bannerpvp_02", "/characters": "achievement_character_human_male", "/loot": "inv_misc_bag_10",
  "/bis": "inv_sword_04", "/raids": "achievement_boss_onyxia", "/roster": "inv_misc_note_06", "/admin": "inv_misc_gear_01", "/arcade": "inv_misc_coin_02",
};
const icon = (href: string) => `https://render.worldofwarcraft.com/us/icons/36/${ICONS[href] ?? "inv_misc_questionmark"}.jpg`;

export function MobileNav({ items, discord, account }: {
  items: { href: string; label: string }[];
  discord: string;
  account: { kind: "main"; name: string; className: string | null; slug: string; nameStyle: string | null; avatarUrl: string | null } | { kind: "claim" } | { kind: "signin" };
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  // Close whenever the page changes.
  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
      // Keep keyboard focus inside the open menu.
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a, button")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={`menu-btn${open ? " open" : ""}`} aria-expanded={open} aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
        <span /><span /><span />
      </button>
      <div className={`mobile-menu-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div id="mobile-menu" ref={panel} className={`mobile-menu${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!open} inert={!open}>
        {account.kind === "main" && (
          <Link href={`/characters/${account.slug}`} className="mm-account">
            <span className="avatar" style={{ "--s": "40px" } as React.CSSProperties}>{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : account.name.charAt(0)}</span>
            <span className="stack" style={{ gap: 0 }}>
              <PlayerName name={account.name} className={account.className} nameStyle={account.nameStyle} showTitle={false} as="strong" />
              <span className="micro muted">Your character</span>
            </span>
          </Link>
        )}
        <nav aria-label="Main" className="mm-links">
          {items.map((n, i) => (
            <Link key={n.href} href={n.href} className="mm-link" aria-current={active(n.href) ? "page" : undefined} style={{ ["--i" as string]: i }}>
              <img src={icon(n.href)} alt="" width={30} height={30} />
              <span>{n.label}</span>
              <span className="mm-chev" aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
        <div className="mm-foot">
          <a href={discord} target="_blank" rel="noopener noreferrer" className="btn btn-lg mm-discord"><IconDiscord /> Join our Discord</a>
          {account.kind === "signin" && <Link href="/sign-in" className="btn btn-primary btn-lg">Sign in with Battle.net</Link>}
          {account.kind === "claim" && <Link href="/sign-in?step=claim" className="btn btn-primary btn-lg">Claim your characters</Link>}
        </div>
      </div>
    </>
  );
}
