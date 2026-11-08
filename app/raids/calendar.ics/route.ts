import { SITE } from "@/lib/config";
import { store } from "@/lib/store";

const esc = (s: string) => s.replace(/[\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** iCal feed of upcoming guild events (Subscribe (iCal) on the Raids page). */
export async function GET() {
  const events = await store().events();
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${SITE.name}//Guild Hub//EN`, "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(SITE.name)} raids`,
    ...events.flatMap((e) => {
      const start = new Date(e.startsAt);
      const end = new Date(start.getTime() + 3 * 3600_000);
      return [
        "BEGIN:VEVENT", `UID:${e.id}@${new URL(SITE.url).host}`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(e.name)}`, `DESCRIPTION:${esc(`${e.kind} · ${e.sizeLabel} · Leader: ${e.leader}\nSign up: ${SITE.url}/raids?event=${e.id}`)}`,
        `URL:${SITE.url}/raids?event=${e.id}`, "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="dragon-warriors.ics"', "Cache-Control": "public, max-age=900" },
  });
}
