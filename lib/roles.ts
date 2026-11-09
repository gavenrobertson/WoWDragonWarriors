// Site roles: granted on the hub per Battle.net account, independent of in-game guild rank.
// A viewer's permissions are their guild rank's permissions plus their role's.
export type SiteRole = "super_admin" | "guild_leader" | "officer" | "raid_leader" | "loot_master";
export type Permission = "canSignUp" | "canWishlist" | "canRunRaids" | "canAwardLoot" | "isAdmin" | "canManageRoles";
export type Perms = Record<Permission, boolean>;

export const NO_PERMS: Perms = { canSignUp: false, canWishlist: false, canRunRaids: false, canAwardLoot: false, isAdmin: false, canManageRoles: false };
const ALL: Perms = { canSignUp: true, canWishlist: true, canRunRaids: true, canAwardLoot: true, isAdmin: true, canManageRoles: true };

export const ROLES: { id: SiteRole; label: string; desc: string; level: number; perms: Perms }[] = [
  { id: "super_admin", label: "Super Admin", desc: "Everything, and can assign any role", level: 5, perms: ALL },
  { id: "guild_leader", label: "Guild Leader", desc: "Everything, and can assign officers, raid leaders and loot masters", level: 4, perms: ALL },
  { id: "officer", label: "Officer", desc: "Admin console, raids, loot awards", level: 3, perms: { ...NO_PERMS, canSignUp: true, canWishlist: true, canRunRaids: true, canAwardLoot: true, isAdmin: true } },
  { id: "raid_leader", label: "Raid Leader", desc: "Create and run raid nights", level: 2, perms: { ...NO_PERMS, canSignUp: true, canWishlist: true, canRunRaids: true } },
  { id: "loot_master", label: "Loot Master", desc: "Record awards and import loot logs", level: 2, perms: { ...NO_PERMS, canSignUp: true, canWishlist: true, canAwardLoot: true } },
];

export const roleOf = (id: string | null | undefined) => ROLES.find((r) => r.id === id);
export const roleLevel = (id: string | null | undefined) => roleOf(id)?.level ?? 0;
export const roleLabel = (id: string | null | undefined) => roleOf(id)?.label ?? "No role";

export function mergePerms(...sets: (Partial<Perms> | null | undefined)[]): Perms {
  const out = { ...NO_PERMS };
  for (const s of sets) if (s) for (const k of Object.keys(out) as Permission[]) out[k] = out[k] || !!s[k];
  return out;
}

/** Which roles `actor` may hand out. Super admins: any. Guild leaders: below guild leader. */
export function assignableRoles(actor: string | null | undefined): (SiteRole | null)[] {
  if (actor === "super_admin") return [null, ...ROLES.map((r) => r.id)];
  if (actor === "guild_leader") return [null, ...ROLES.filter((r) => r.level < 4).map((r) => r.id)];
  return [];
}

/** May `actor` change the role of someone who currently holds `target`? */
export const canChangeRoleOf = (actor: string | null | undefined, target: string | null | undefined) =>
  actor === "super_admin" || (actor === "guild_leader" && roleLevel(target) < 4);
