// Creates one demo account for every kind of user, with fresh random passwords:
//   buyer, owner, verified agent, and the three admin-team roles (super admin, moderator, support).
//   npm run seed:users
// Passwords are NOT stored in the code. They are printed once and saved to web/.demo-accounts.txt (git-ignored).
// Run it again any time to get new passwords. Remove these accounts before launch.
// Run `npm run seed` first so there are listings to hand to the demo owner and agent.
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", process.env.SUPABASE_DB_PASSWORD ?? "");
if (!url || url.includes("[YOUR-PASSWORD]")) { console.error("DATABASE_URL is not set in web/.env.local (see docs/database-setup.md)."); process.exit(1); }

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no look-alike characters
const password = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const USERS = [
  { key: "Buyer",        email: "buyer@nestmap.test",      name: "Demo Buyer",       agent: "none",     admin: null },
  { key: "Owner",        email: "owner@nestmap.test",      name: "Demo Owner",       agent: "none",     admin: null },
  { key: "Agent",        email: "agent@nestmap.test",      name: "Demo Agent",       agent: "verified", admin: null },
  { key: "Super admin",  email: "superadmin@nestmap.test", name: "Demo Super Admin", agent: "none",     admin: "super_admin" },
  { key: "Moderator",    email: "moderator@nestmap.test",  name: "Demo Moderator",   agent: "none",     admin: "moderator" },
  { key: "Support",      email: "support@nestmap.test",    name: "Demo Support",     agent: "none",     admin: "support" },
];

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const made = {};
try {
  await db.query("begin");
  for (const u of USERS) {
    u.password = password();
    let id = (await db.query("select id from auth.users where email = $1", [u.email])).rows[0]?.id;
    if (id) {
      await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), updated_at = now() where id = $1", [id, u.password]);
    } else {
      // empty strings (not NULL) in the token columns keep Supabase Auth happy
      id = (await db.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                                 created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
                 extensions.crypt($2, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
                 jsonb_build_object('name', $3::text), now(), now(), '', '', '', '') returning id`, [u.email, u.password, u.name])).rows[0].id;
    }
    await db.query(
      `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', ($1::uuid)::text, 'email', $2::text, 'email_verified', true), 'email', ($1::uuid)::text, now(), now(), now())
       on conflict (provider_id, provider) do nothing`, [id, u.email]);
    await db.query(
      `insert into public.profiles (id, name, city, agent_status) values ($1, $2, 'Kozhikode', $3)
       on conflict (id) do update set name = excluded.name, city = excluded.city, agent_status = excluded.agent_status`, [id, u.name, u.agent]);
    if (u.admin) await db.query("insert into public.admin_users (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role", [id, u.admin]);
    else await db.query("delete from public.admin_users where user_id = $1", [id]);
    made[u.key] = id;
  }

  // give the demo owner and agent some listings to manage (taken from the sample listings)
  await db.query("update public.listings set owner_id = $1, posted_as = 'owner' where id in (select id from public.listings where source = 'seed' and status = 'live' and type in ('apartment','house','villa') order by id limit 3)", [made.Owner]);
  await db.query("update public.listings set status = 'pending' where id = (select id from public.listings where owner_id = $1 order by id desc limit 1)", [made.Owner]);   // one waiting for review
  await db.query("update public.listings set owner_id = $1, posted_as = 'agent' where id in (select id from public.listings where source = 'seed' and status = 'live' and owner_id <> $1 and owner_id <> $2 order by id desc limit 6)", [made.Agent, made.Owner]);
  await db.query("commit");
} catch (err) {
  await db.query("rollback");
  console.error("Failed, nothing was changed:", err.message);
  process.exit(1);
} finally {
  await db.end();
}

const lines = USERS.map(u => `${u.key.padEnd(12)} ${u.email.padEnd(26)} ${u.password}`);
const text = `Nestmap demo accounts (created ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)\n${"-".repeat(64)}\n${lines.join("\n")}\n\nSign in on the Profile page. Delete these accounts before launch.\n`;
writeFileSync(new URL("../.demo-accounts.txt", import.meta.url), text);
console.log("\n" + text);
