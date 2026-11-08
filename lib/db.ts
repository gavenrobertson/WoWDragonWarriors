import "server-only";
import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __dwPool: Pool | undefined;
}

function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalThis.__dwPool) {
    globalThis.__dwPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: process.env.DATABASE_SSL === "false" || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__dwPool;
}

export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function sqlOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
