import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { Embers } from "@/components/Embers";
import { Interactions } from "@/components/Interactions";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Guild Hub`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  icons: { icon: SITE.favicon, apple: "/assets/crest-256.jpg" },
  openGraph: { title: SITE.name, description: SITE.description, url: SITE.url, siteName: SITE.name, images: [{ url: SITE.ogImage, width: 1200, height: 630 }], type: "website" },
  twitter: { card: "summary_large_image", images: [SITE.ogImage] },
};

// Every page depends on who is signed in (header, permissions), so never prerender at build time.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0b0806", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Marcellus&family=Alegreya+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="aura" aria-hidden="true"><span /><span /><span /></div>
        <Embers />
        <Interactions />
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          {SITE.name} guild hub · fan-made, not affiliated with Blizzard Entertainment ·{" "}
          <a href="/data-sources">Data sources</a> · <a href="/brand">Brand</a>
        </footer>
      </body>
    </html>
  );
}
