import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { NAV, SITE } from "@/lib/config";
import { classColor } from "@/lib/ui";
import { NavLinks } from "./NavLinks";
import { MobileNav } from "./MobileNav";
import { IconDiscord } from "./icons";
import { AccountMenu } from "./AccountMenu";
import { DISCORD_INVITE } from "@/lib/links";

export async function SiteHeader() {
  const viewer = await getViewer();
  const items = NAV.filter((n) => !("adminOnly" in n) || viewer.perms.isAdmin).map(({ href, label }) => ({ href, label }));
  const main = viewer.main;
  const color = classColor(main?.className);
  return (
    <>
      {viewer.demo && (
        <div className="demo-banner" role="note">
          Demo mode: showing sample guild data. Set <span className="mono">DATABASE_URL</span> and Battle.net keys to go live. Changes aren&apos;t saved.
        </div>
      )}
      <header className="site-header">
        <div className="bar-inner">
          <Link href="/" className="brand">
            <img src="/assets/crest-128.webp" alt="" width={52} height={52} className="logo" style={{ display: "block", width: 52, height: 52, objectFit: "contain" }} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
              <span className="brand-name">{SITE.name}</span>
              <span className="micro muted">{SITE.tagline}</span>
            </span>
          </Link>
          <NavLinks items={items} />
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="discord-link" aria-label="Join our Discord (opens in a new tab)" title="Join our Discord">
            <IconDiscord size={20} />
          </a>
          <MobileNav items={items} discord={DISCORD_INVITE}
            account={viewer.signedIn && main ? { kind: "main", name: main.name, className: main.className, slug: main.slug, nameStyle: viewer.cosmetics.nameStyle, avatarUrl: main.avatarUrl ?? null }
              : viewer.signedIn ? { kind: "claim" } : { kind: "signin" }} />
          {viewer.signedIn && main ? (
            <AccountMenu name={main.name} className={main.className} slug={main.slug} avatarUrl={main.avatarUrl ?? null} color={color} nameStyle={viewer.cosmetics.nameStyle} />
          ) : viewer.signedIn ? (
            <Link href="/sign-in?step=claim" className="btn btn-sm">Claim characters</Link>
          ) : (
            <Link href="/sign-in" className="btn btn-primary btn-sm">Sign in</Link>
          )}
        </div>
      </header>
    </>
  );
}
