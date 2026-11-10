import { getViewer } from "@/lib/auth";
import { chestInventory, wallet } from "@/lib/arcade";
import { ArcadeShell } from "@/components/arcade/ArcadeShell";

export default async function ArcadeLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  const uid = v.signedIn && !v.demo && v.userId ? v.userId : null;
  const [w, chests] = uid ? await Promise.all([wallet(uid), chestInventory(uid).catch(() => ({}))]) : [null, {}];
  return (
    <main id="main" tabIndex={-1} className="container page arcade-page">
      <ArcadeShell initial={w?.marks ?? 0} signedIn={!!w} chests={chests}>{children}</ArcadeShell>
    </main>
  );
}
