// Throwaway helper for Brian's manual test of LAN-76 — delete before handoff.
//
//   node demo-roles.tmp.mjs off   → end this operator's calendar seats
//   node demo-roles.tmp.mjs on    → give them back
//   node demo-roles.tmp.mjs       → show what they hold now
//
// Targets .env.local's SUPABASE_DB_URL and refuses anything else. The bare
// default in scripts/lib/local-db.mjs is the PRIMARY slot, which belongs to
// another session; this script must never reach it.
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const url = process.env.SUPABASE_DB_URL;
if (!url || !url.includes("55322")) {
  throw new Error(`refusing: not this session's overflow stack (${url})`);
}

const CALENDAR = ["president", "vice_president", "secretary", "general_manager"];
const c = new pg.Client({ connectionString: url });
await c.connect();

const person = await c.query(
  `select a.person_id, p.given_name || ' ' || coalesce(p.family_name, '') as name
     from public.operator_accounts a
     join public.people p on p.id = a.person_id
    where a.is_active
    limit 1`,
);
if (person.rows.length === 0) throw new Error("no active operator — run npm run db:link-operator");
const { person_id: personId, name } = person.rows[0];

const mode = process.argv[2];

if (mode === "off") {
  // End-date rather than delete: that is how the club really removes a seat,
  // and it is what the application's effective-dating reads.
  await c.query(
    `update public.role_assignments ra
        set effective_to = current_date
       from public.roles r
      where r.id = ra.role_id
        and ra.person_id = $1
        and r.code = any($2)
        and (ra.effective_to is null or ra.effective_to > current_date)`,
    [personId, CALENDAR],
  );
} else if (mode === "on") {
  await c.query(
    `update public.role_assignments ra
        set effective_to = null
       from public.roles r
      where r.id = ra.role_id
        and ra.person_id = $1
        and r.code = any($2)
        and ra.effective_to = current_date`,
    [personId, CALENDAR],
  );
}

const held = await c.query(
  `select r.code
     from public.role_assignments ra
     join public.roles r on r.id = ra.role_id
    where ra.person_id = $1
      and ra.effective_from <= current_date
      and (ra.effective_to is null or ra.effective_to > current_date)
    order by r.code`,
  [personId],
);
const codes = held.rows.map((row) => row.code);
console.log(`${name} currently holds: ${codes.join(", ") || "(no seats)"}`);
console.log(
  codes.some((code) => CALENDAR.includes(code))
    ? "→ may manage the club calendar"
    : "→ may read the calendar and change nothing",
);
await c.end();
