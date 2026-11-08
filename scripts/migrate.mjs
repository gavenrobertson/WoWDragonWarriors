// Applies db/*.sql in filename order, once each. Usage: DATABASE_URL=... npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const local = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local || process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false } });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())");
const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
const dir = join(import.meta.dirname, "..", "db");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  if (done.has(f)) continue;
  const sql = await readFile(join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log(`applied ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`failed ${f}:`, e.message);
    process.exit(1);
  }
}
console.log("migrations up to date");
await client.end();
