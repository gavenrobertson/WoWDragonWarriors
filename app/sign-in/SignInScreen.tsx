import { getViewer } from "@/lib/auth";
import { accountCharacters } from "@/lib/account";
import { SITE } from "@/lib/config";
import { SignInFlow } from "./SignInFlow";

export async function SignInScreen({ initialStep, error, discord }: { initialStep: "welcome" | "chars" | "apply"; error?: string; discord?: string }) {
  const viewer = await getViewer();
  const chars = await accountCharacters(viewer);
  // Claiming needs a Battle.net session; without one, start at the welcome step.
  const step = !viewer.signedIn && initialStep !== "welcome" ? "welcome" : initialStep;
  return (
    <main id="main" tabIndex={-1} className="signin">
      <section aria-label={SITE.name} className="signin-brand">
        <div className="row" style={{ gap: 14 }}>
          <img src="/assets/crest-256.jpg" alt="" width={64} height={64} className="logo" style={{ width: 64, height: 64, objectFit: "cover", display: "block" }} />
          <span className="brand-name" style={{ fontSize: 24 }}>{SITE.name}</span>
        </div>
        <div className="stack" style={{ maxWidth: 520, gap: 16 } as React.CSSProperties}>
          <h1 className="title-xl gold" style={{ fontSize: 54 }}>The guild&apos;s war room</h1>
          <p className="lead">Your characters, gear, wishlists and raid signups in one place, synced straight from your Battle.net account.</p>
        </div>
        <ul className="stack soft" style={{ fontSize: 14 }}>
          {["No new password. You sign in with Battle.net.", "We only ask to read your WoW characters.", "Officers get admin tools based on guild rank."].map((t) => (
            <li key={t} className="row" style={{ gap: 10 }}><span className="dot" />{t}</li>
          ))}
        </ul>
      </section>
      <section aria-label="Account" className="signin-form">
        <div style={{ width: "100%", maxWidth: 480 }}>
          {error && <p role="alert" className="notice" style={{ borderColor: "var(--dw-bad)", marginBottom: 16 }}>{error}</p>}
          {discord === "unavailable" && <p role="status" className="notice" style={{ marginBottom: 16 }}>Discord linking isn&apos;t set up on this hub yet.</p>}
          <SignInFlow
            initialStep={step}
            signedIn={viewer.signedIn && !viewer.demo}
            demo={viewer.demo}
            battletag={viewer.battletag}
            chars={chars}
          />
        </div>
      </section>
    </main>
  );
}
