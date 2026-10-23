// Quick health check of the database: tables, security rules, functions, applied migrations.
//   npm run db:check
import pg from "pg";
const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", process.env.SUPABASE_DB_PASSWORD ?? "");
if (!url) { console.error("DATABASE_URL is not set in web/.env.local"); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p) => (await c.query(sql, p)).rows;
console.log("server:", (await q("select version()"))[0].version.split(",")[0]);
console.log("postgis:", (await q("select extversion from pg_extension where extname='postgis'"))[0]?.extversion ?? "MISSING");
console.log("tables + row level security:");
for (const r of await q("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")) console.log("  ", r.relname.padEnd(16), r.relrowsecurity ? "RLS on" : "RLS OFF");
console.log("policies:", (await q("select count(*)::int n from pg_policies where schemaname='public'"))[0].n);
console.log("functions:", (await q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1")).map(r => r.proname).join(", "));
console.log("auth trigger:", (await q("select tgname from pg_trigger where tgname='on_auth_user_created'")).length ? "present" : "MISSING");
console.log("recorded migrations:", (await q("select version, name from supabase_migrations.schema_migrations")).map(r => r.version + " " + r.name).join("; "));
// the pin function must run, even with no data yet
const t = await q("select count(*)::int n from public.listings_in_bounds(75.7,11.2,75.9,11.3,'buy')");
console.log("listings_in_bounds runs, rows:", t[0].n);
await c.end();
