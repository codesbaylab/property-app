// Applies the SQL files in ../supabase/migrations that have not been applied yet.
//   npm run db:migrate
// Needs DATABASE_URL in web/.env.local (Supabase dashboard > Connect > Session pooler).
// It records what it applied in the same table the Supabase CLI uses, so the CLI can be added later without conflicts.
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing. Add it to web/.env.local (see docs/database-setup.md).");
  process.exit(1);
}

const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const done = new Set((await client.query("select version from supabase_migrations.schema_migrations")).rows.map(r => r.version));

  let applied = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (done.has(version)) continue;
    const sql = readFileSync(new URL(file, dir), "utf8");
    process.stdout.write(`Applying ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)", [version, [sql], rest.join("_")]);
      await client.query("commit");
      console.log("done");
      applied++;
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(`\n${err.message}${err.position ? ` (at character ${err.position})` : ""}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(applied ? `\n${applied} migration(s) applied.` : "Database is already up to date.");
} finally {
  await client.end();
}
