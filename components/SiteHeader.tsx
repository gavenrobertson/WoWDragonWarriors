import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { NAV, SITE } from "@/lib/config";
import { classColor } from "@/lib/ui";
import { NavLinks } from "./NavLinks";

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
            <img src="/assets/crest-128.png" alt="" width={52} height={52} className="logo" style={{ display: "block", width: 52, height: 52, objectFit: "contain" }} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
              <span className="brand-name">{SITE.name}</span>
              <span className="micro muted">{SITE.tagline}</span>
            </span>
          </Link>
          <NavLinks items={items} />
          {viewer.signedIn && main ? (
            <Link href={`/characters/${main.slug}`} className="account-pill" aria-label={`Your main: ${main.name}`}>
              <span className="avatar" style={{ "--s": "32px", "--c": color } as React.CSSProperties}>{main.avatarUrl ? <img src={main.avatarUrl} alt="" /> : main.name.charAt(0)}</span>
              <span className="account-name strong small" style={{ color }}>{main.name}</span>
            </Link>
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
