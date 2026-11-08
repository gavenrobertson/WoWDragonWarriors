import type { HubCharacter, HubEvent } from "./store";

const COMP_COLOR: Record<string, string> = { Tanks: "#5AA6FF", Healers: "#4CD964", Melee: "#E3B341", Ranged: "#B77CF0", Damage: "#E3B341" };
const COUNTED = new Set(["accepted", "late", "tentative"]);

/** Role buckets filled by signups vs. what the raid leader asked for. */
export function compFor(e: HubEvent, charById: Map<string, HubCharacter>) {
  const counts: Record<string, number> = {};
  for (const s of e.signups) {
    if (!COUNTED.has(s.status)) continue;
    const role = charById.get(s.characterId)?.role;
    const bucket = role === "tank" ? "Tanks" : role === "healer" ? "Healers" : e.compNeeds.some((c) => c.role === "Damage") ? "Damage" : role === "melee" ? "Melee" : "Ranged";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const totalNeed = e.compNeeds.reduce((a, c) => a + c.need, 0) || 1;
  return e.compNeeds.map((c) => {
    // Demo data only models a few signups in detail; spread the rest across roles.
    const have = (counts[c.role] ?? 0) + Math.round((e.extraSigned * c.need) / totalNeed);
    return { role: c.role, have, need: c.need, color: COMP_COLOR[c.role] ?? "#E3B341" };
  });
}

export type Check = { label: string; src: string; state: "ok" | "warn" | "unknown" };

/** Readiness checks for one character against an event's requirements. */
export function checksFor(e: HubEvent, c: HubCharacter | undefined, consumables: boolean): Check[] {
  if (!e.requirements.length) return [{ label: "No requirements", src: "Open to everyone", state: "ok" }];
  return e.requirements.map((r): Check => {
    const [kind, arg] = r.split(":");
    if (kind === "level") {
      const need = Number(arg);
      return { label: c && c.level >= need ? `Level ${need}${need < 60 ? " or higher" : ""}` : `Level ${c?.level ?? "?"} of ${need}`, src: "Blizzard API · character profile", state: c && c.level >= need ? "ok" : "warn" };
    }
    if (kind === "attune") {
      const done = !!c?.attunements.includes(arg);
      return { label: `${arg[0].toUpperCase() + arg.slice(1)} attunement ${done ? "complete" : "not done"}`, src: "Blizzard API · /quests/completed", state: done ? "ok" : "warn" };
    }
    if (kind === "fireres") {
      const have = c?.fireResistance;
      return { label: `Fire resistance: ${have ?? "?"} of ${arg}`, src: "Blizzard API · /statistics", state: have == null ? "unknown" : have >= Number(arg) ? "ok" : "warn" };
    }
    if (kind === "consumables") return { label: consumables ? "Consumables confirmed" : "Consumables not confirmed", src: "Self-reported on signup", state: consumables ? "ok" : "unknown" };
    return { label: r, src: "Raid leader", state: "unknown" };
  });
}
