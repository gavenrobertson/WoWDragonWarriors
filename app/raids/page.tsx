import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { checksFor, compFor } from "@/lib/raids";
import { getCharacters, getEvents } from "@/lib/store";
import { RaidCalendar, type EventVM } from "./RaidCalendar";

export const metadata: Metadata = { title: "Raids" };

const TZ = "America/Chicago";
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-US", { timeZone: TZ, ...o });

export default async function RaidsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const [viewer, chars, events] = await Promise.all([getViewer(), getCharacters(), getEvents()]);
  const charById = new Map(chars.map((c) => [c.id, c]));
  const myIds = new Set(viewer.characters.map((c) => c.id));
  const mine = chars.filter((c) => myIds.has(c.id) && c.inGuild);

  const vms: EventVM[] = events.map((e) => {
    const d = new Date(e.startsAt);
    const my = e.signups.find((s) => myIds.has(s.characterId));
    return {
      id: e.id, name: e.name, kind: e.kind, sizeLabel: e.sizeLabel, leader: e.leader,
      mon: fmt(d, { month: "short" }).toUpperCase(), day: fmt(d, { day: "numeric" }),
      when: `${fmt(d, { weekday: "short" })} ${fmt(d, { hour: "numeric", minute: "2-digit" })}`,
      full: `${fmt(d, { weekday: "long", month: "short", day: "numeric" })} · ${fmt(d, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`,
      signed: e.signups.filter((s) => s.status !== "declined").length + e.extraSigned,
      comp: compFor(e, charById),
      roster: e.signups.map((s) => {
        const c = charById.get(s.characterId);
        return { name: c?.fullName ?? "Unknown", spec: [c?.spec, c?.className].filter(Boolean).join(" "), className: c?.className ?? "", status: s.status };
      }),
      myStatus: my?.status ?? null,
      myCharacter: my ? charById.get(my.characterId)?.slug ?? null : null,
      myConsumables: my?.consumables ?? false,
      // Readiness checks for each of the viewer's characters, so the client can switch instantly.
      checks: Object.fromEntries(mine.map((c) => [c.slug, { off: checksFor(e, c, false), on: checksFor(e, c, true) }])),
    };
  });

  const initial = Math.max(0, vms.findIndex((v) => v.id === event) >= 0 ? vms.findIndex((v) => v.id === event) : vms.findIndex((v) => v.kind.startsWith("Raid")));
  return (
    <RaidCalendar
      events={vms}
      initial={initial}
      chars={mine.map((c) => ({ slug: c.slug, label: `${c.fullName} · ${[c.spec, c.className].filter(Boolean).join(" ")}`, isMain: c.isMain }))}
      canSignUp={viewer.perms.canSignUp}
      canRunRaids={viewer.perms.canRunRaids}
      signedIn={viewer.signedIn}
    />
  );
}
