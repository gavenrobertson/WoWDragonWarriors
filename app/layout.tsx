import type { Metadata, Viewport } from "next";
// Fonts are self-hosted (served from our own domain, latin only, font-display: swap) instead of Google Fonts.
import "@fontsource/marcellus/latin-400.css";
import "@fontsource/cinzel-decorative/latin-700.css";
import "@fontsource/cinzel-decorative/latin-900.css";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "./globals.css";
import "./styles/skins.css";
import { SITE } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { Embers } from "@/components/Embers";
import { Interactions } from "@/components/Interactions";
import { ItemTooltip } from "@/components/ItemTooltip";
import { DISCORD_INVITE } from "@/lib/links";
import { getViewer } from "@/lib/auth";
import { themeAttr } from "@/lib/cosmetics";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Guild Hub`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  icons: { icon: SITE.favicon, apple: "/assets/apple-touch-icon.png" },
  openGraph: { title: SITE.name, description: SITE.description, url: SITE.url, siteName: SITE.name, images: [{ url: SITE.ogImage, width: 1200, height: 630 }], type: "website" },
  twitter: { card: "summary_large_image", images: [SITE.ogImage] },
};

// Every page depends on who is signed in (header, permissions), so never prerender at build time.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0b0806", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer().catch(() => null);
  const theme = themeAttr(viewer?.cosmetics?.theme);
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <div className="aura" aria-hidden="true"><span /><span /><span /></div>
        <Embers />
        <Interactions />
        <ItemTooltip />
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          {SITE.name} guild hub · fan-made, not affiliated with Blizzard Entertainment ·{" "}
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">Discord</a> · <a href="/data-sources">Data sources</a> · <a href="/brand">Brand</a>
        </footer>
      </body>
    </html>
  );
}
