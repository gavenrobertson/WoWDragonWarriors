"use client";
import Link from "next/link";
import { useState } from "react";
import { setSignup } from "@/app/actions";
import { Bar, StatusDot } from "@/components/bits";
import { Toast } from "@/components/Toast";
import { useAction } from "@/components/useAction";
import type { Check } from "@/lib/raids";
import { classColor } from "@/lib/ui";

export interface EventVM {
  id: string; name: string; kind: string; sizeLabel: string; leader: string; mon: string; day: string; when: string; full: string; signed: number;
  comp: { role: string; have: number; need: number; color: string }[];
  roster: { name: string; spec: string; className: string; status: string }[];
  myStatus: string | null; myCharacter: string | null; myConsumables: boolean;
  checks: Record<string, { off: Check[]; on: Check[] }>;
}

const STATUS: Record<string, { label: string; button: string; color: string }> = {
  accepted: { label: "Accepted", button: "Accept", color: "#4CD964" },
  tentative: { label: "Tentative", button: "Tentative", color: "#F2B84B" },
  late: { label: "Late", button: "Late", color: "#F2B84B" },
  bench: { label: "Bench", button: "Bench me", color: "#CEC5DD" },
  declined: { label: "Declined", button: "Decline", color: "#FF8A7A" },
};
const CHECK_COLOR = { ok: "#4CD964", warn: "#F2B84B", unknown: "#75698C" };

export function RaidCalendar({ events, initial, chars, canSignUp, canRunRaids, signedIn }: {
  events: EventVM[]; initial: number; chars: { slug: string; label: string; isMain: boolean }[]; canSignUp: boolean; canRunRaids: boolean; signedIn: boolean;
}) {
  const [idx, setIdx] = useState(initial);
  const [mine, setMine] = useState<Record<string, { status: string | null; character: string; consumables: boolean }>>(() =>
    Object.fromEntries(events.map((e) => [e.id, { status: e.myStatus, character: e.myCharacter ?? chars.find((c) => c.isMain)?.slug ?? chars[0]?.slug ?? "", consumables: e.myConsumables }])),
  );
  const { pending, run, toast } = useAction();

  if (!events.length) {
    return (
      <main id="main" tabIndex={-1} className="container page">
        <Head canRunRaids={canRunRaids} />
        <div className="empty">No events scheduled yet. Raid leaders create them in Admin › Events &amp; news.</div>
      </main>
    );
  }

  const ev = events[Math.min(idx, events.length - 1)];
  const me = mine[ev.id];
  const update = (patch: Partial<typeof me>) => {
    const next = { ...me, ...patch };
    if (!next.status || !next.character) { setMine({ ...mine, [ev.id]: next }); return; }
    const prev = me;
    setMine({ ...mine, [ev.id]: next });
    run(() => setSignup({ eventId: ev.id, character: next.character, status: next.status!, consumables: next.consumables }).then((r) => {
      if (!r.ok) setMine((m) => ({ ...m, [ev.id]: prev }));
      return r;
    }));
  };
  const checks = me.character ? ev.checks[me.character]?.[me.consumables ? "on" : "off"] ?? [] : [];

  return (
    <main id="main" tabIndex={-1} className="container page">
      <Head canRunRaids={canRunRaids} />

      <div className="split" style={{ gap: 16 }}>
        <ul aria-label="Upcoming events" className="side-col stack" style={{ gap: 8, flexBasis: 340, flexGrow: 1 }}>
          {events.map((e, i) => {
            const s = mine[e.id].status;
            return (
              <li key={e.id}>
                <button type="button" className="select-card" aria-pressed={i === idx} onClick={() => setIdx(i)} style={{ width: "100%", padding: "12px 14px" }}>
                  <span className="date-badge"><span className="micro bold muted">{e.mon}</span><span className="display bold" style={{ fontSize: 22, lineHeight: 1 }}>{e.day}</span></span>
                  <span className="stack grow" style={{ gap: 0, lineHeight: 1.3 }}>
                    <span className="strong">{e.name}</span>
                    <span className="micro muted">{e.when} · {e.sizeLabel}</span>
                    <span className="micro strong" style={{ color: s ? STATUS[s].color : "var(--dw-text-muted)" }}>{s ? `You: ${STATUS[s].label}` : "Not signed up"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="ev-title" className="main-col panel" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{ev.kind}</span>
            <h2 id="ev-title" style={{ fontSize: 28 }}>{ev.name}</h2>
            <span className="soft small">{ev.full} · {ev.sizeLabel} · Leader: {ev.leader}</span>
            <span className="small strong gold">{ev.signed} signed up</span>
          </div>

          <div className="tile stack" style={{ gap: 12, padding: 18 }}>
            <h3>Your signup</h3>
            {!signedIn ? (
              <p className="soft small"><Link href="/sign-in">Sign in</Link> to sign up for raids.</p>
            ) : !chars.length ? (
              <p className="soft small">Claim a character in the guild to sign up. <Link href="/sign-in?step=claim">Claim characters</Link></p>
            ) : !canSignUp ? (
              <p className="soft small">Your guild rank can&apos;t sign up for events yet.</p>
            ) : (
              <>
                <label className="field">Character
                  <select value={me.character} onChange={(e) => update({ character: e.target.value })}>
                    {chars.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </label>
                <div className="row" role="group" aria-label="Signup status" style={{ gap: 8 }}>
                  {Object.entries(STATUS).map(([k, s]) => (
                    <button key={k} type="button" className="chip" aria-pressed={me.status === k} disabled={pending} onClick={() => update({ status: k })}
                      style={me.status === k ? { borderColor: s.color, color: s.color, background: "#2A1F3B" } : undefined}>{s.button}</button>
                  ))}
                </div>
                {ev.checks[me.character]?.on.some((c) => c.src.startsWith("Self-reported")) && (
                  <label className="check"><input type="checkbox" checked={me.consumables} onChange={(e) => update({ consumables: e.target.checked })} /> I&apos;ll bring my consumables</label>
                )}
              </>
            )}
          </div>

          {ev.comp.length > 0 && (
            <div className="grid-auto" style={{ ["--min" as string]: "160px", gap: 12 }}>
              {ev.comp.map((c) => (
                <div key={c.role} className="stack" style={{ gap: 6 }}>
                  <div className="row between small"><span className="soft">{c.role}</span><span className="strong">{c.have} / {c.need}</span></div>
                  <Bar pct={(c.have / c.need) * 100} color={c.color} />
                </div>
              ))}
            </div>
          )}

          <div className="split" style={{ gap: 20 }}>
            <div className="main-col stack" style={{ gap: 10, flexBasis: 280 }}>
              <h3>Signups</h3>
              {ev.roster.length === 0 ? <p className="soft small">Signups show here as people respond.</p> : (
                <ul className="divided">
                  {ev.roster.map((p) => (
                    <li key={p.name} className="row between" style={{ padding: "10px 0" }}>
                      <span className="stack" style={{ gap: 0, lineHeight: 1.3 }}><span className="strong" style={{ color: classColor(p.className) }}>{p.name}</span><span className="micro muted">{p.spec}</span></span>
                      <span className="small strong" style={{ color: STATUS[p.status]?.color }}>{STATUS[p.status]?.label ?? p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="side-col stack" style={{ gap: 10, flexBasis: 260 }}>
              <h3>Your readiness</h3>
              {checks.length === 0 ? <p className="soft small">Pick a character to see readiness checks.</p> : (
                <ul className="stack" style={{ gap: 8 }}>
                  {checks.map((k) => (
                    <li key={k.label} className="row" style={{ gap: 10, flexWrap: "nowrap", alignItems: "flex-start" }}>
                      <span style={{ paddingTop: 7 }}><StatusDot color={CHECK_COLOR[k.state]} /></span>
                      <span className="stack" style={{ gap: 0, lineHeight: 1.3 }}><span className="strong small">{k.label}</span><span className="micro muted">{k.src}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="att-title" className="panel">
        <div className="row between baseline"><h2 id="att-title">Attendance &amp; logs</h2><span className="src">Warcraft Logs API · reports tagged to Dragon Warriors</span></div>
        <p className="soft">After each raid, the hub pulls the night&apos;s Warcraft Logs report to mark who was present, benched or late, and links every boss kill to its parses. Nothing logged yet: the first report arrives December 9.</p>
      </section>
      <Toast toast={toast} />
    </main>
  );
}

function Head({ canRunRaids }: { canRunRaids: boolean }) {
  return (
    <section className="panel-royal page-head">
      <div className="stack" style={{ gap: 8 }}>
        <h1>Raid calendar</h1>
        <p className="soft" style={{ fontSize: 16 }}>Sign up once, pick the character, and the raid leader builds the comp from here.</p>
      </div>
      <div className="row">
        {canRunRaids && <Link href="/admin?section=events" className="btn">New event · post to Discord</Link>}
        <a href="/raids/calendar.ics" className="btn">Subscribe (iCal)</a>
      </div>
    </section>
  );
}
