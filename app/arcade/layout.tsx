import { getViewer } from "@/lib/auth";
import { wallet } from "@/lib/arcade";
import { ArcadeShell } from "@/components/arcade/ArcadeShell";

export default async function ArcadeLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  const w = v.signedIn && !v.demo && v.userId ? await wallet(v.userId) : null;
  return (
    <main id="main" tabIndex={-1} className="container page arcade-page">
      <ArcadeShell initial={w?.marks ?? 0} signedIn={!!w}>{children}</ArcadeShell>
    </main>
  );
}
