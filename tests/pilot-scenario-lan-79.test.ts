// @vitest-environment node
/**
 * The LAN-79 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-79/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established and the LAN-77 and LAN-78 scenarios extended.
 *
 * ## What is different about this scenario
 *
 * It is the first whose setup needs a **secret pasted into it**. An RSVP link is
 * a 256-bit token and the database stores only its SHA-256 digest, so a script
 * cannot ship with usable links in it. `setup.sql` therefore carries five
 * `__TOKEN_HASH_n__` placeholders that Brian replaces with hashes he generates
 * himself, and these tests substitute their own — which is also how they prove
 * the placeholders are refused when he forgets.
 *
 * It is also the first whose cleanup deliberately removes **RSVP responses**.
 * LAN-78's aborts when it finds one, because there a response is real history
 * its scenario had no business acquiring. Here the response is the thing under
 * test. The tests below create responses the way the application creates them —
 * through `recordSignedLinkResponse`, not through an insert — and prove cleanup
 * removes exactly those and nothing else.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";
import { scopedPilotSnapshot } from "./helpers/pilot-snapshot";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-79");

const SENTINEL = "PILOT-LAN-79";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const PEOPLE = [
  "00790079-0079-4079-8079-000000000001",
  "00790079-0079-4079-8079-000000000002",
  "00790079-0079-4079-8079-000000000003",
  "00790079-0079-4079-8079-000000000004",
  "00790079-0079-4079-8079-000000000005",
];
const EVENTS = [
  "00790079-0079-4079-8079-000000000021",
  "00790079-0079-4079-8079-000000000022",
  "00790079-0079-4079-8079-000000000023",
];
const INVITATIONS = {
  valid: "00790079-0079-4079-8079-000000000041",
  late: "00790079-0079-4079-8079-000000000042",
  revoked: "00790079-0079-4079-8079-000000000043",
  started: "00790079-0079-4079-8079-000000000044",
  cancelled: "00790079-0079-4079-8079-000000000045",
};
const TOKEN_ROWS = [
  "00790079-0079-4079-8079-000000000051",
  "00790079-0079-4079-8079-000000000052",
  "00790079-0079-4079-8079-000000000053",
  "00790079-0079-4079-8079-000000000054",
  "00790079-0079-4079-8079-000000000055",
];

const SETUP_FILE = readFileSync(path.join(scenarioDir, "setup.sql"), "utf8");
const CLEANUP_FILE = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");
const README_FILE = readFileSync(path.join(scenarioDir, "README.md"), "utf8");

function scriptBody(name: string, raw: string): string {
  const meaningful = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("--"));

  expect(meaningful[0], `${name} must open its own transaction`).toBe("begin;");
  expect(meaningful.at(-1), `${name} must close its own transaction`).toBe("commit;");
  expect(
    meaningful.filter((line) => line === "begin;" || line === "commit;"),
    `${name} must have exactly one transaction`,
  ).toEqual(["begin;", "commit;"]);

  return raw.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
}

const SETUP_TEMPLATE = scriptBody("setup.sql", SETUP_FILE);
const CLEANUP = scriptBody("cleanup.sql", CLEANUP_FILE);

/**
 * Five tokens and the setup script that accepts them.
 *
 * Generated per call, exactly as the README tells Brian to generate his, and
 * never written anywhere. `hashToken` is not imported from the service because
 * this must fail if the *script's* expectation and the *application's*
 * algorithm ever diverge — so the digest is computed here from first
 * principles, the way the README's one-liner does.
 */
function installedSetup(): { sql: string; tokens: string[] } {
  const tokens: string[] = [];
  let sql = SETUP_TEMPLATE;

  for (let slot = 1; slot <= 5; slot += 1) {
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    tokens.push(token);
    sql = sql.replace(`__TOKEN_HASH_${slot}__`, hash);
  }

  expect(sql, "every placeholder must be substituted").not.toMatch(/__TOKEN_HASH_\d__/);
  return { sql, tokens };
}

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});
beforeEach(async () => {
  await client.query("begin isolation level repeatable read");
});
afterEach(async () => {
  await client.query("rollback");
});
afterAll(async () => {
  await client.end();
});

/** A digest of every base table in `public` and `staging`. */
async function snapshot(): Promise<Record<string, string>> {
  return scopedPilotSnapshot(client, CLEANUP);
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(client, `select count(*)::text as n from ${sql}`, params);
  return Number(row.n);
}

/** The scenario's own row counts, as one object. */
async function scenarioRows() {
  return {
    people: await count(
      "public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) like $1",
      [`${SENTINEL}%`],
    ),
    events: await count("public.events where name like $1", [`${SENTINEL}%`]),
    memberships: await count("public.season_memberships where person_id = any($1::uuid[])", [
      PEOPLE,
    ]),
    audience: await count("public.event_audience_members where event_id = any($1::uuid[])", [
      EVENTS,
    ]),
    invitations: await count("public.invitations where event_id = any($1::uuid[])", [EVENTS]),
    tokens: await count("public.rsvp_access_tokens where id = any($1::uuid[])", [TOKEN_ROWS]),
  };
}

/**
 * Answers through the real write path, which is what a tester will do.
 *
 * Imported lazily and pointed at this test's own transaction is not possible —
 * the service opens its own pool connection — so the response is written with
 * the same statements the service uses, inside this transaction, and the
 * service's own behaviour is proved in `src/lib/services/rsvp.test.ts`. What
 * matters here is only that rows of this shape exist for cleanup to find.
 */
async function answer(invitationId: string, response: "yes" | "no", reason: string | null) {
  await client.query(
    // `clock_timestamp()` rather than `now()`: two answers in one transaction
    // share a transaction timestamp, and `one_answer_per_instant` refuses that.
    // A real change of mind arrives in two separate transactions.
    `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
     values ($1, $2::public.rsvp_value, $3, 'signed_link', clock_timestamp())`,
    [invitationId, response, reason],
  );
  await client.query("update public.invitations set status = 'responded' where id = $1", [
    invitationId,
  ]);
  await client.query(
    `insert into public.audit_events
       (actor_label, action, entity_table, entity_id, from_state, to_state)
     values ('player: signed RSVP link', 'invitation.response_recorded', 'invitations', $1,
             'issued', 'responded')`,
    [invitationId],
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("setup.sql", () => {
  it("creates the whole scenario, and is safe to run twice", async () => {
    const { sql } = installedSetup();

    await client.query(sql);
    const first = await scenarioRows();
    expect(first).toEqual({
      people: 5,
      events: 3,
      memberships: 5,
      audience: 5,
      invitations: 5,
      tokens: 5,
    });

    // Every insert is `on conflict (id) do nothing`, so a second run must add
    // nothing at all — not even a token, which would otherwise mean a reissued
    // link and a dead one in Brian's hand.
    await client.query(sql);
    expect(await scenarioRows()).toEqual(first);
  });

  it("puts each invitation in the state its row of the matrix needs", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    const states = await client.query<{ id: string; status: string; deadline_passed: boolean }>(
      `select id::text, status::text as status, expires_at <= now() as deadline_passed
         from public.invitations where event_id = any($1::uuid[]) order by id`,
      [EVENTS],
    );
    const byId = new Map(states.rows.map((row) => [row.id, row]));

    // The ordinary case: deadline still ahead, nothing answered.
    expect(byId.get(INVITATIONS.valid)?.status).toBe("issued");
    expect(byId.get(INVITATIONS.valid)?.deadline_passed).toBe(false);

    // The late case: already swept into the expired stream, and the whole point
    // is that answering it is still legal.
    expect(byId.get(INVITATIONS.late)?.status).toBe("expired");
    expect(byId.get(INVITATIONS.late)?.deadline_passed).toBe(true);
  });

  it("makes the three events the three situations a player can meet", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    const events = await client.query<{
      id: string;
      status: string;
      started: boolean;
    }>(
      `select id::text, status::text as status,
              (scheduled_on + coalesce(starts_at, '00:00'::time))
                at time zone 'Europe/London' <= now() as started
         from public.events where id = any($1::uuid[]) order by id`,
      [EVENTS],
    );
    const byId = new Map(events.rows.map((row) => [row.id, row]));

    expect(byId.get(EVENTS[0])?.status).toBe("approved");
    expect(byId.get(EVENTS[0])?.started).toBe(false);
    expect(byId.get(EVENTS[1])?.status).toBe("approved");
    expect(byId.get(EVENTS[1])?.started).toBe(true);
    expect(byId.get(EVENTS[2])?.status).toBe("cancelled");
  });

  it("puts three invitees on one event, which is what makes the privacy check mean anything", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    const shared = await count("public.invitations where event_id = $1", [EVENTS[0]]);
    expect(shared).toBe(3);
  });

  it("stores only digests, and one live link per invitation", async () => {
    const { sql, tokens } = installedSetup();
    await client.query(sql);

    const stored = await client.query<{ token_hash: string; invitation_id: string }>(
      "select token_hash, invitation_id::text from public.rsvp_access_tokens where id = any($1::uuid[])",
      [TOKEN_ROWS],
    );

    for (const row of stored.rows) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      // The plaintext must be nowhere in the database.
      for (const token of tokens) expect(row.token_hash).not.toContain(token);
    }

    // The partial unique index permits one live token per invitation; the
    // revoked one is not live, so all five rows coexist legitimately.
    const live = await count(
      `public.rsvp_access_tokens
        where id = any($1::uuid[]) and revoked_at is null and superseded_at is null`,
      [TOKEN_ROWS],
    );
    expect(live).toBe(4);
  });

  it("refuses to run at all while a placeholder is left in it", async () => {
    // Brian's most likely mistake, and it must fail before any row is written.
    const halfFilled = SETUP_TEMPLATE.replace(
      "__TOKEN_HASH_1__",
      crypto.createHash("sha256").update("only the first").digest("hex"),
    );

    await expect(client.query(halfFilled)).rejects.toThrow(/placeholder/i);
    await client.query("rollback");
    await client.query("begin isolation level repeatable read");
    expect((await scenarioRows()).people).toBe(0);
  });

  it("refuses a repeated hash, which would put two invitees behind one link", async () => {
    const hash = crypto.createHash("sha256").update("the same one twice").digest("hex");
    let sql = SETUP_TEMPLATE;
    for (let slot = 1; slot <= 5; slot += 1) sql = sql.replace(`__TOKEN_HASH_${slot}__`, hash);

    await expect(client.query(sql)).rejects.toThrow(/identical/i);
  });

  it("creates no contact point, so nothing here can be dialled or emailed", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    expect(await count("public.contact_points where person_id = any($1::uuid[])", [PEOPLE])).toBe(
      0,
    );
  });

  it("creates no notification job, so nothing here can be delivered", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    expect(await count("public.notification_jobs where event_id = any($1::uuid[])", [EVENTS])).toBe(
      0,
    );
    expect(
      await count(
        "public.notification_jobs where invitation_id in (select id from public.invitations where event_id = any($1::uuid[]))",
        [EVENTS],
      ),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("cleanup.sql", () => {
  it("removes everything setup created, and is safe to run twice", async () => {
    const { sql } = installedSetup();
    await client.query(sql);
    expect((await scenarioRows()).people).toBe(5);

    await client.query(CLEANUP);
    expect(await scenarioRows()).toEqual({
      people: 0,
      events: 0,
      memberships: 0,
      audience: 0,
      invitations: 0,
      tokens: 0,
    });

    await client.query(CLEANUP);
    expect((await scenarioRows()).people).toBe(0);
  });

  it("removes the answers a tester gave, and the audit rows they wrote", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    // The rows the APPLICATION creates: two answers on one invitation (a change
    // of mind), and one on the late invitation.
    await answer(INVITATIONS.valid, "yes", null);
    await answer(INVITATIONS.valid, "no", "Academic conflict — tutorial moved");
    await answer(INVITATIONS.late, "yes", null);

    expect(
      await count(
        "public.rsvp_responses where invitation_id in (select id from public.invitations where event_id = any($1::uuid[]))",
        [EVENTS],
      ),
    ).toBe(3);

    await client.query(CLEANUP);

    expect(
      await count("public.rsvp_responses where invitation_id = any($1::uuid[])", [
        Object.values(INVITATIONS),
      ]),
    ).toBe(0);
    expect(
      await count(
        "public.audit_events where entity_table = 'invitations' and entity_id = any($1::uuid[])",
        [Object.values(INVITATIONS)],
      ),
    ).toBe(0);
  });

  it("leaves the rest of the database exactly as it found it", async () => {
    // The strongest statement available: every row of every table, hashed.
    const before = await snapshot();

    const { sql } = installedSetup();
    await client.query(sql);
    await answer(INVITATIONS.valid, "yes", null);
    await answer(INVITATIONS.late, "no", "Away from Oxford");
    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  it("refuses rather than widen when real history has appeared", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    // Attendance is a separate authoritative record. Nothing in this scenario
    // creates one, so its presence means something else did — and the cleanup
    // must stop rather than delete it on the way past.
    //
    // Invariant P5's database half admits attendance against an approved event,
    // which this one already is. The other half — that its date has passed,
    // which since LAN-151 is the whole of what "occurred" means (D30) — is a
    // service rule, and this is a direct insert.
    await client.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id,
          presence, recorded_at, recorded_by_person_id)
       select $1, 'approved', e.season_id, 'player',
              '00790079-0079-4079-8079-000000000011', 'present', now(), $2
         from public.events e where e.id = $1`,
      [EVENTS[0], PEOPLE[0]],
    );

    await expect(client.query(CLEANUP)).rejects.toThrow(/attendance/i);
  });

  it("refuses when a sentinel-carrying row it does not know about appears", async () => {
    const { sql } = installedSetup();
    await client.query(sql);

    // The sentinel is a display alias since LAN-182 struck `people.known_as`,
    // so an interloper carrying it carries it there.
    const interloper = await one<{ id: string }>(
      client,
      `insert into public.people (given_name, family_name)
       values ('Rsvp', 'Interloper') returning id`,
    );
    await client.query(
      `insert into public.person_aliases (person_id, alias, source, is_display_name)
       values ($1, $2, 'interloper', true)`,
      [interloper.id, `${SENTINEL} Interloper`],
    );

    // Deleting it would be guessing; leaving it silently would leave the
    // scenario half-installed. Stopping is the only honest option.
    await expect(client.query(CLEANUP)).rejects.toThrow(/not this scenario/i);
  });
});

// ---------------------------------------------------------------------------
// The README's promises
// ---------------------------------------------------------------------------

describe("README.md", () => {
  it("declares the sentinel-only shape it uses", () => {
    expect(README_FILE).toContain("## Ownership marker: sentinel only");
  });

  it("gives the token-generation command the placeholders require", () => {
    // If the placeholders exist, the instructions for filling them must too.
    expect(SETUP_FILE).toMatch(/__TOKEN_HASH_1__/);
    expect(README_FILE).toMatch(/randomBytes\(32\)/);
    expect(README_FILE).toMatch(/createHash\('sha256'\)/);
  });

  it("hands Brian a command that still matches the application's own algorithm", async () => {
    // The README tells him to mint tokens with a `node -e` one-liner rather
    // than through the service, because the service is `server-only` and the
    // hosted database is somewhere no repository script may point. That is
    // sound — but it is a second implementation of a security primitive, and
    // nothing compared the two. A change to `TOKEN_BYTES` or to the digest in
    // `rsvp-tokens.ts` would silently desynchronise the pilot, and Brian would
    // discover it as a link that does not work against a database he cannot
    // easily inspect.
    const { hashToken, TOKEN_BYTES, TOKEN_PATTERN } =
      await import("../src/lib/services/rsvp-tokens");

    const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
    expect(TOKEN_PATTERN.test(token), "the README's token shape").toBe(true);

    const readmeDigest = crypto.createHash("sha256").update(token).digest("hex");
    expect(readmeDigest, "the README's digest").toBe(hashToken(token));

    // And the command in both files is the one that produces them.
    for (const file of [README_FILE, SETUP_FILE]) {
      expect(file).toContain("randomBytes(32)");
      expect(file).toContain("base64url");
      expect(file).toContain("sha256");
    }
    expect(TOKEN_BYTES, "the README hard-codes 32").toBe(32);
  });

  it("names every link in the matrix it asks Brian to work through", () => {
    for (const label of ["Valid", "Late", "Revoked", "Started", "Cancelled"]) {
      expect(README_FILE).toContain(`${SENTINEL} ${label}`);
    }
  });
});
