import "server-only";
// Cloudflare D1 (SQLite) access. Queries use Postgres-style $1, $2 placeholders, rewritten to D1's ?1, ?2.
// Values: booleans → 0/1, Dates → ISO strings, arrays/objects → JSON text.
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Row = Record<string, any>;

// Minimal D1 types (the full @cloudflare/workers-types globals clash with the DOM lib).
interface D1Result<T> { results?: T[] }
export interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; all<T = Row>(): Promise<D1Result<T>> }
export interface D1Database { prepare(query: string): D1PreparedStatement; batch(statements: D1PreparedStatement[]): Promise<unknown[]> }

/** The D1 binding, or null when running without one (demo mode / plain `next start`). */
export function d1(): D1Database | null {
  if (process.env.DEMO_MODE === "1") return null;
  try {
    return ((getCloudflareContext().env as unknown as { DB?: D1Database }).DB) ?? null;
  } catch {
    return null;
  }
}

function db(): D1Database {
  const b = d1();
  if (!b) throw new Error("D1 binding DB is not available");
  return b;
}

const toSql = (text: string) => text.replace(/\$(\d+)/g, "?$1");
const bindValue = (v: unknown): unknown => {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v) || (typeof v === "object" && !(v instanceof ArrayBuffer))) return JSON.stringify(v);
  return v;
};
const prepare = (text: string, params: unknown[]) => db().prepare(toSql(text)).bind(...params.map(bindValue));

export async function sql<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await prepare(text, params).all<T>();
  return res.results ?? [];
}

export async function sqlOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await sql<T>(text, params))[0] ?? null;
}

/**
 * D1 has no interactive transactions. Inside `tx`, reads run immediately and every write is
 * queued, then all writes commit together in one atomic batch at the end.
 */
export async function tx<T>(fn: (q: <R extends Row = Row>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const writes: D1PreparedStatement[] = [];
  const out = await fn(async <R extends Row>(text: string, params: unknown[] = []) => {
    if (/^\s*(select|with)\b/i.test(text)) return sql<R>(text, params);
    writes.push(prepare(text, params));
    return [] as R[];
  });
  if (writes.length) await db().batch(writes);
  return out;
}

export const nowIso = () => new Date().toISOString();
export const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();
export const json = <T>(v: unknown, fallback: T): T => {
  if (v == null || v === "") return fallback;
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};
export const newId = () => crypto.randomUUID().replace(/-/g, "");
