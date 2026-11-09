"use client";
import Link from "next/link";
import { useState } from "react";
import { claimCharacters, submitApplication } from "@/app/actions";
import { IconCheck, IconDiscord, IconKey } from "@/components/icons";
import { DISCORD_INVITE } from "@/lib/links";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { AccountChar } from "@/lib/account";
import { classColor } from "@/lib/ui";

type Step = "welcome" | "chars" | "apply" | "done";

export function SignInFlow({ initialStep, signedIn, demo, battletag, chars }: {
  initialStep: Exclude<Step, "done">; signedIn: boolean; demo: boolean; battletag?: string; chars: AccountChar[];
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [mode, setMode] = useState<"login" | "join">(initialStep === "apply" ? "join" : "login");
  const [claimed, setClaimed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(chars.map((c) => [c.slug, c.claimed || c.inGuild])),
  );
  const [main, setMain] = useState(() => chars.find((c) => c.isMain)?.slug ?? chars.find((c) => c.inGuild)?.slug ?? chars[0]?.slug ?? "");
  const [applied, setApplied] = useState(false);
  const { pending, run, toast } = useAction();
  const outsiders = chars.filter((c) => !c.inGuild);
  const applyChars = outsiders.length ? outsiders : chars;
  const [app, setApp] = useState({ characterSlug: applyChars[0]?.slug ?? "", role: "melee", logsUrl: "", availability: "", about: "" });
  const mainChar = chars.find((c) => c.slug === main);
  const canAct = signedIn || demo;

  const enter = () =>
    run(() => claimCharacters({ claimed: Object.keys(claimed).filter((k) => claimed[k]), main }), () => { setApplied(false); setStep("done"); });
  const sendApplication = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => submitApplication(app), () => { setApplied(true); setStep("done"); });
  };

  return (
    <>
      {step === "welcome" && (
        <div className="stack" style={{ gap: 24 }}>
          <div role="tablist" aria-label="Account" className="segmented">
            {([["login", "Log in"], ["join", "Sign up"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 30, fontWeight: 700 }}>{mode === "login" ? "Welcome back" : "Create your hub account"}</h2>
            <p className="soft">
              {mode === "login"
                ? "Sign in to see your characters, wishlist and raid signups."
                : "Sign up with Battle.net. If your characters are already in the guild, you’re in. If not, you can apply."}
            </p>
          </div>
          {signedIn ? (
            <>
              <p className="notice">Signed in as <strong>{battletag}</strong>.</p>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep("chars")}>Manage your characters</button>
              <form action="/auth/logout" method="post"><button type="submit" className="btn btn-block">Sign out</button></form>
            </>
          ) : (
            <a href="/auth/battlenet/login" className="btn btn-primary btn-lg" style={{ minHeight: 56, fontSize: 16 }}>
              <IconKey /> Continue with Battle.net
            </a>
          )}
          <a href="/auth/discord/login" className="btn btn-lg" aria-disabled={!signedIn || undefined}>Link Discord after sign-in (optional)</a>
          <p className="small muted">
            Battle.net OAuth with scopes <span className="mono soft">openid wow.profile</span>. We read your account&apos;s Forever characters from /profile/user/wow and never see your password.
          </p>
          {mode === "join" && (
            <button type="button" className="btn btn-lg btn-ghost" onClick={() => setStep("apply")} disabled={!canAct}>
              Not in the guild yet? Apply to join
            </button>
          )}
          {mode === "join" && !canAct && <p className="micro muted">Sign in with Battle.net first so we can see which character is applying.</p>}
        </div>
      )}

      {step === "chars" && (
        <div className="stack" style={{ gap: 18 }}>
          <span className="eyebrow">Step 2 of 2</span>
          <h2 style={{ fontSize: 30, fontWeight: 700 }}>Claim your characters</h2>
          <p className="soft">These are on your Battle.net account. Characters in Dragon Warriors are selected for you. Pick one as your main.</p>
          {chars.length === 0 ? (
            <p className="empty">No WoW Forever characters found on this account yet.</p>
          ) : (
            <ul className="stack" style={{ gap: 8 }}>
              {chars.map((c) => {
                const on = !!claimed[c.slug];
                const isMain = main === c.slug;
                return (
                  <li key={c.slug} className={isMain ? "claim-row is-main" : "claim-row"}>
                    <button type="button" className="check-box" aria-pressed={on} aria-label={`Claim ${c.name}`}
                      onClick={() => { setClaimed({ ...claimed, [c.slug]: !on }); if (on && isMain) setMain(chars.find((x) => x.slug !== c.slug && claimed[x.slug])?.slug ?? ""); }}>
                      <IconCheck />
                    </button>
                    <span className="stack" style={{ gap: 0, lineHeight: 1.3, minWidth: 0 }}>
                      <span className="bold" style={{ color: classColor(c.className) }}>{c.name}</span>
                      <span className="micro muted">Level {c.level} {c.className} · {c.inGuild ? "In Dragon Warriors" : "Not in guild"}</span>
                    </span>
                    <button type="button" className="main-toggle" aria-pressed={isMain} onClick={() => { setMain(c.slug); setClaimed({ ...claimed, [c.slug]: true }); }}>
                      {isMain ? "Main" : "Set as main"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="small muted">Missing one? Characters show up after level 10 and a logout. Renders can take a day to appear.</p>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-lg" onClick={() => setStep("welcome")}>Back</button>
            <button type="button" className="btn btn-primary btn-lg grow" onClick={enter} disabled={pending || !main}>
              {pending ? "Saving…" : "Enter the hub"}
            </button>
          </div>
        </div>
      )}

      {step === "apply" && (
        <form className="stack" style={{ gap: 14 }} onSubmit={sendApplication}>
          <span className="eyebrow">Guild application</span>
          <h2 style={{ fontSize: 30, fontWeight: 700 }}>Apply to Dragon Warriors</h2>
          {!canAct && <p className="notice">Sign in with Battle.net first so we know which character is applying.</p>}
          <label className="field">Character
            <select required value={app.characterSlug} onChange={(e) => setApp({ ...app, characterSlug: e.target.value })}>
              {applyChars.length === 0 && <option value="">No characters found</option>}
              {applyChars.map((c) => <option key={c.slug} value={c.slug}>{c.name} · Level {c.level} {c.className}</option>)}
            </select>
          </label>
          <label className="field">Role you want to raid as
            <select value={app.role} onChange={(e) => setApp({ ...app, role: e.target.value })}>
              <option value="melee">Melee damage</option><option value="ranged">Ranged damage</option><option value="healer">Healer</option><option value="tank">Tank</option>
            </select>
          </label>
          <label className="field">Warcraft Logs profile (optional)
            <input type="url" placeholder="https://www.warcraftlogs.com/character/..." value={app.logsUrl} onChange={(e) => setApp({ ...app, logsUrl: e.target.value })} />
          </label>
          <label className="field">Raid nights you can make
            <input type="text" required placeholder="e.g. Wed and Thu evenings" value={app.availability} onChange={(e) => setApp({ ...app, availability: e.target.value })} />
          </label>
          <label className="field">Tell us about yourself
            <textarea rows={4} required placeholder="Raid experience, what you're looking for in a guild" value={app.about} onChange={(e) => setApp({ ...app, about: e.target.value })} />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-lg" onClick={() => setStep("welcome")}>Back</button>
            <button type="submit" className="btn btn-primary btn-lg grow" disabled={pending || !canAct || !app.characterSlug}>{pending ? "Sending…" : "Send application"}</button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="stack" style={{ gap: 16 }}>
          <h2 style={{ fontSize: 34, fontWeight: 700 }}>{applied ? "Application sent" : `Welcome, ${mainChar?.name.split(" ")[0] ?? "raider"}`}</h2>
          <p className="soft">
            {applied
              ? "Officers review applications in the admin queue. You’ll see their decision here, plus a Discord ping if you linked Discord."
              : "Your characters are linked. Your guild rank sets what you can see, and officers get the admin console."}
          </p>
          <Link href="/" className="btn btn-primary btn-lg" style={{ minHeight: 56 }}>Go to guild home</Link>
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-discord"><IconDiscord /> Join the guild Discord</a>
          <button type="button" className="btn btn-lg" onClick={() => { setApplied(false); setStep("welcome"); }}>Start over</button>
        </div>
      )}
      <Toast toast={toast} />
    </>
  );
}
