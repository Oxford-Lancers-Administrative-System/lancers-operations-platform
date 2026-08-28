// @vitest-environment node
/**
 * Operator invitation, against the real local database and the real local Auth
 * server — LAN-131, matrix rows 1–19 and 21.
 *
 * ## Why this suite talks to Supabase Auth rather than mocking it
 *
 * The three properties this package is judged on are all about what happens
 * *between* the database and the auth server:
 *
 *   * a delivery failure must leave the Person, the account and the role
 *     assignment committed and resendable — provable only by making a real
 *     send fail after real rows were written;
 *   * one Person has one login and one address has one login — enforced in two
 *     places, `operator_accounts` and `auth.users`, and a mock has neither;
 *   * the invitation link must actually arrive, carrying the token hash, at the
 *     path this application answers on.
 *
 * So the identity port is the **real** one, wrapped so the send can be recorded
 * or made to fail. The single exception is the Mailpit case at the end, which
 * lets the real send through and then reads the message the local stack
 * captured — nothing leaves the machine, exactly as `docs/local-development.md`
 * documents for password recovery.
 *
 * ## The case this suite exists to protect, and how it was got wrong once
 *
 * "An IT Officer may not resend or redirect a pending **President**
 * invitation." That is caller check 4 of this package's brief, and it is the
 * hazard `administration-authority.ts` documents as the precondition
 * `WP-invitation` must create or avoid: `resend_invitation` and
 * `correct_invitation` are deliberately not role-scoped, so they are judged on
 * the seats the target *holds* — and `correct_invitation` redirects a
 * credential-establishing link to an address the administrator chooses.
 *
 * An earlier version of this file proved it in two halves and claimed they
 * composed: `readAdministrationSubject` puts a not-yet-started seat into the
 * snapshot when asked, and `assertAdministrationTarget` refuses a snapshot
 * containing that seat. Independent review deleted the one line in
 * `sendAgain` that *asks* for the scheduled snapshot — and all fifty tests
 * still passed, because neither half asserted that `sendAgain` asks. The join
 * was exactly where a defect would live, and it was the only part not covered.
 *
 * The same review also disproved the excuse. The header used to say the case
 * "cannot be staged end-to-end here" because the synthetic seed has a current,
 * open-ended President and `role_assignments_one_holder_per_office` refuses a
 * second concurrent holder. That constraint is an obstacle, not a wall: the
 * seat can be vacated inside the test and restored afterwards, which is what
 * `vacateThePresidency()` below does. It is self-contained — one row, one
 * column, restored in a `finally`, and the database suites run one file at a
 * time since LAN-139, so nothing else can observe the gap.
 *
 * So the case is now staged whole, against real rows, and it is the test that
 * fails if that line is ever removed again.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import path from "node:path";

import pg, { type Client } from "pg";

import {
  assertAdministrationTarget,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, resolveDatabaseUrl, withTransaction } from "@/lib/db";
import { readOperatorAuditHistory } from "./administration-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateOperatorAccount,
  correctOperatorInvitation,
  findOperatorCandidates,
  inviteOperator,
  readAdministrationSubject,
  readOperatorAccountIn,
  resendOperatorInvitation,
  resolveActiveCommitteeYear,
  BACKDATING_REASON_RULE,
  EMAIL_ALREADY_HAS_LOGIN_RULE,
  INVALID_EMAIL_RULE,
  NAME_REQUIRED_RULE,
  NOT_RESENDABLE_RULE,
  PERSON_ALREADY_HAS_LOGIN_RULE,
  ROLE_REQUIRED_RULE,
  UNKNOWN_ROLE_RULE,
} from "./operator-invitations";
import {
  InvitationDeliveryFailure,
  supabaseOperatorIdentity,
  type OperatorIdentityPort,
} from "./operator-identity";

/** This suite's own marker — parallel suites share one database. */
const MARKER = "LAN131Fixture:operator-invitations";

const CALLBACK = "http://localhost:3000/auth/invitation";

let observer: Client;
let actorPersonId: string;

/** Every `auth.users` row this suite caused to exist. */
const authUsers = new Set<string>();
/** Every `people` row this suite caused to exist, including linked ones. */
const people = new Set<string>();

/** Sends the identity wrapper recorded, in order. */
let sends: { email: string; redirectTo: string }[] = [];
/** Logins the identity wrapper was asked to create, in order. */
let logins: string[] = [];
/**
 * Addresses the identity wrapper was asked to move a login to, in order.
 *
 * Recorded because "the login was never touched" is a property in its own
 * right, and the only way to tell the two assertions on the correction path
 * apart: both refuse, so the caller sees the same error either way, and what
 * differs is whether somebody's sign-in address was relocated and put back in
 * between.
 */
let moves: { authUserId: string; email: string }[] = [];

function uniqueAddress(tag: string): string {
  return `lan131-${tag}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

/**
 * The real port, with the send under this suite's control.
 *
 * `createLogin`, `changeLoginEmail` and `deleteLogin` are genuinely performed,
 * so `auth.users` uniqueness, the address move and the compensation path are
 * all exercised against GoTrue rather than against a fake that agrees with the
 * implementation by construction.
 */
function identity(options: { send?: "record" | "fail" | "real"; failure?: string } = {}) {
  const real = supabaseOperatorIdentity();
  const mode = options.send ?? "record";

  const port: OperatorIdentityPort = {
    async createLogin(email) {
      logins.push(email);
      const result = await real.createLogin(email);
      authUsers.add(result.authUserId);
      return result;
    },
    async sendInvitation(email, redirectTo) {
      sends.push({ email, redirectTo });
      if (mode === "fail") {
        throw new InvitationDeliveryFailure(
          options.failure ?? "The mail transport refused the message.",
        );
      }
      if (mode === "real") await real.sendInvitation(email, redirectTo);
    },
    changeLoginEmail(id, email) {
      moves.push({ authUserId: id, email });
      return real.changeLoginEmail(id, email);
    },
    deleteLogin: (id) => real.deleteLogin(id),
  };

  return port;
}

function operator(roleCodes: readonly string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-0000000131aa",
    personId: actorPersonId,
    displayName: "Administrator",
    roleCodes: [...roleCodes],
    isActive: true,
  };
}

/** Holds every seat that carries `role_management` — the strongest actor. */
const administrator = () => operator(capabilityRoleCodes("role_management"));
const itOfficer = () => operator(["it_officer"]);
const secretary = () => operator(["secretary"]);
/**
 * The one seat that may administer the President — `REQ-final-admin-protection`.
 *
 * Named precisely rather than reusing `administrator()`, which holds every
 * `role_management` seat at once and would therefore be permitted for the same
 * reason without proving which rule permitted it.
 */
const generalManager = () => operator(["general_manager"]);

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  people.add(result.rows[0].id);
  return result.rows[0].id;
}

/**
 * A Person with names a human would actually type, for the duplicate check.
 *
 * The other fixtures put `MARKER` in `given_name` so that a suite's rows are
 * identifiable, which is right for everything except the one thing this file
 * tests that is *about* names. Matching is exact, and a search term that is a
 * whole name here and a prefix of another name over there is the shape the
 * exactness rule exists for — so these are ordinary-looking names, deliberately
 * rare enough that the synthetic seed cannot contain one.
 *
 * `alias` writes `person_aliases`, which the duplicate check compares against
 * **all three** name terms. An alias is a name the club holds and the search
 * discloses on, so it is staged here rather than left to a fixture of its own.
 */
async function insertNamedPerson(
  givenName: string,
  familyName: string,
  options: { knownAs?: string; alias?: string; email?: string; phone?: string } = {},
): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name)
     values ($1, $2) returning id`,
    [givenName, familyName],
  );
  const personId = result.rows[0].id;
  people.add(personId);

  // LAN-182: a known-as is an alias flagged as the display name. Staged as one
  // here so the search still has the third name term to match on.
  if (options.knownAs) {
    await observer.query(
      `insert into public.person_aliases (person_id, alias, source, is_display_name)
       values ($1::uuid, $2, 'test fixture', true)
       on conflict (person_id, alias) do nothing`,
      [personId, options.knownAs],
    );
  }

  for (const [kind, value] of [
    ["email", options.email],
    ["phone", options.phone],
  ] as const) {
    if (!value) continue;
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
       values ($1, $2, $3, true)`,
      [personId, kind, value],
    );
  }

  if (options.alias) {
    await observer.query(
      "insert into public.person_aliases (person_id, alias, source) values ($1, $2, 'fixture')",
      [personId, options.alias],
    );
  }

  return personId;
}

/**
 * A role assignment written directly, so a fixture does not depend on the code
 * the test is about. The denormalised columns come from the catalogue row in
 * the same statement, which is what `role_assignments_agree_with_role` requires.
 */
async function giveRole(personId: string, roleCode: string, from: string): Promise<void> {
  const cycle = await observer.query<{ id: string }>(
    `select id from public.committee_years
      where starts_on <= current_date and (ends_on is null or ends_on > current_date)`,
  );
  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status in ('open', 'active')",
  );

  await observer.query(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
        committee_year_id, season_id, effective_from)
     select $1, r.id, r.scope, r.is_constitutional_office, r.is_single_holder_seat,
            case when r.scope = 'committee_year' then $3::uuid end,
            case when r.scope = 'season' then $4::uuid end,
            $5::date
       from public.roles r
      where r.code = $2`,
    [personId, roleCode, cycle.rows[0].id, season.rows[0].id, from],
  );
}

/**
 * Every administration action recorded against one Person, **sorted**.
 *
 * Sorted rather than in stored order on purpose. `audit_events.occurred_at`
 * defaults to transaction time, so two events written atomically carry an
 * identical timestamp and fall through to an arbitrary tie-break on a random
 * identifier. Causal order within an instant is `instantOrder` on LAN-130's
 * vocabulary, applied by its projection at read time and tested there; a raw
 * `order by occurred_at, id` here would look like an ordering assertion and be
 * a coin toss.
 */
async function auditActions(personId: string): Promise<string[]> {
  const result = await observer.query<{ action: string }>(
    `select action from public.audit_events
      where context -> 'administration' ->> 'targetPersonId' = $1
      order by action`,
    [personId],
  );
  return result.rows.map((row) => row.action);
}

async function auditRows(
  personId: string,
): Promise<{ action: string; from_state: string | null; to_state: string | null }[]> {
  const result = await observer.query<{
    action: string;
    from_state: string | null;
    to_state: string | null;
  }>(
    `select action, from_state, to_state from public.audit_events
      where context -> 'administration' ->> 'targetPersonId' = $1
      order by occurred_at, id`,
    [personId],
  );
  return result.rows;
}

/**
 * An invitation of a brand-new Person to an ordinary, multi-holder seat.
 *
 * `kit_manager` throughout the happy paths on purpose: it is a real catalogue
 * seat, it carries no privileged capability, and it admits several concurrent
 * holders — so nothing here collides with the synthetic seed's committee, and a
 * failure is about this package rather than about an exclusion constraint.
 */
async function inviteSomebody(
  overrides: {
    email?: string;
    roleCode?: string;
    effectiveFrom?: string;
    reason?: string;
    actor?: ResolvedOperator | null;
    port?: OperatorIdentityPort;
    tag?: string;
  } = {},
) {
  const tag = overrides.tag ?? Math.random().toString(36).slice(2, 8);
  const result = await inviteOperator({
    operator: overrides.actor === undefined ? administrator() : overrides.actor,
    subject: { kind: "new", givenName: MARKER, familyName: tag, phone: "07700 900131" },
    email: overrides.email ?? uniqueAddress(tag),
    roles: [
      {
        roleCode: overrides.roleCode ?? "kit_manager",
        effectiveFrom: overrides.effectiveFrom,
        reason: overrides.reason,
      },
    ],
    callbackUrl: CALLBACK,
    identity: overrides.port ?? identity(),
  });
  people.add(result.personId);
  return result;
}

beforeAll(async () => {
  observer = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await observer.connect();
  actorPersonId = await insertPerson("actor");
});

afterEach(() => {
  sends = [];
  logins = [];
  moves = [];
});

afterAll(async () => {
  const ids = [...people];
  if (ids.length > 0) {
    await observer.query(
      // The envelope's `targetPersonId` is JSON text, so it is compared
      // against a text array. `any($1::uuid[])` on that side is
      // `text = uuid`, which PostgreSQL has no operator for and which fails
      // the whole cleanup — leaving this suite's rows behind for the next run
      // to trip over.
      `delete from public.audit_events
        where actor_person_id = any($1::uuid[])
           or context -> 'administration' ->> 'targetPersonId' = any($1::text[])`,
      [ids],
    );
    await observer.query("delete from public.role_assignments where person_id = any($1::uuid[])", [
      ids,
    ]);
    await observer.query("delete from public.operator_accounts where person_id = any($1::uuid[])", [
      ids,
    ]);
    await observer.query("delete from public.contact_points where person_id = any($1::uuid[])", [
      ids,
    ]);
    await observer.query("delete from public.people where id = any($1::uuid[])", [ids]);
  }

  const admin = createAdminClient();
  for (const id of authUsers) await admin.auth.admin.deleteUser(id).catch(() => undefined);

  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------

describe("row 1, 2 — create-or-link, and the minimal Person", () => {
  it("creates the Person, the login and the role assignment in one act", async () => {
    const email = uniqueAddress("create");
    const result = await inviteSomebody({ email });

    expect(result.personCreated).toBe(true);
    expect(result.delivered).toBe(true);
    expect(result.state).toBe("invitation_pending");
    expect(result.roleAssignmentIds).toHaveLength(1);

    const account = await observer.query(
      "select login_email, invited_at, activated_at from public.operator_accounts where id = $1",
      [result.operatorAccountId],
    );
    expect(account.rows[0].login_email).toBe(email);
    expect(account.rows[0].invited_at).not.toBeNull();
    expect(account.rows[0].activated_at).toBeNull();
  });

  it("records the email and the optional phone as the new Person's contacts", async () => {
    const email = uniqueAddress("contacts");
    const result = await inviteSomebody({ email });

    const contacts = await observer.query<{ kind: string; raw_value: string; preferred: boolean }>(
      "select kind::text as kind, raw_value, is_preferred as preferred from public.contact_points where person_id = $1 order by kind",
      [result.personId],
    );
    expect(contacts.rows).toEqual([
      { kind: "email", raw_value: email, preferred: true },
      { kind: "phone", raw_value: "07700 900131", preferred: true },
    ]);
  });

  it("links an existing Person instead of minting a second one", async () => {
    const personId = await insertPerson("returning-player");

    const result = await inviteOperator({
      operator: administrator(),
      subject: { kind: "existing", personId },
      email: uniqueAddress("link"),
      roles: [{ roleCode: "kit_manager" }],
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    expect(result.personId).toBe(personId);
    expect(result.personCreated).toBe(false);

    const count = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
      [MARKER, "returning-player"],
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("leaves an existing Person's contact points completely alone", async () => {
    const personId = await insertPerson("has-own-email");
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
       values ($1, 'email', 'old.address@example.test', true)`,
      [personId],
    );

    await inviteOperator({
      operator: administrator(),
      subject: { kind: "existing", personId },
      email: uniqueAddress("untouched"),
      roles: [{ roleCode: "kit_manager" }],
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    const contacts = await observer.query<{ raw_value: string }>(
      "select raw_value from public.contact_points where person_id = $1",
      [personId],
    );
    // Profile editing is deferred to a later mission. Being given a login is
    // not permission to rewrite somebody's contact details.
    expect(contacts.rows).toEqual([{ raw_value: "old.address@example.test" }]);
  });
});

describe("rows 3, 4, 18 — what an invitation is refused for", () => {
  it("refuses a new Person with no surname, and says what to do instead", async () => {
    await expect(
      inviteOperator({
        operator: administrator(),
        subject: { kind: "new", givenName: MARKER, familyName: "  " },
        email: uniqueAddress("noname"),
        roles: [{ roleCode: "kit_manager" }],
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toMatchObject({ rule: NAME_REQUIRED_RULE });
  });

  it("refuses an invitation with no role at all", async () => {
    await expect(
      inviteOperator({
        operator: administrator(),
        subject: { kind: "new", givenName: MARKER, familyName: "norole" },
        email: uniqueAddress("norole"),
        roles: [],
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toMatchObject({ rule: ROLE_REQUIRED_RULE });
  });

  it("refuses an address that is not an address", async () => {
    await expect(inviteSomebody({ email: "not an address" })).rejects.toMatchObject({
      rule: INVALID_EMAIL_RULE,
    });
  });

  it.each([
    ["a padded code", " kit_manager "],
    ["a shouted code", "KIT_MANAGER"],
    ["a label rather than a code", "Kit Manager"],
    ["a hyphenated code", "kit-manager"],
    ["an invented seat", "chief_of_staff"],
  ])("refuses %s rather than guessing which seat was meant", async (_name, roleCode) => {
    // The exact `roles.code` is the contract. Normalising here would be this
    // module guessing at a caller's intent about who gets authority.
    await expect(inviteSomebody({ roleCode })).rejects.toMatchObject({ rule: UNKNOWN_ROLE_RULE });
  });

  it("creates nothing at all when it refuses", async () => {
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.people where given_name = $1",
      [MARKER],
    );
    await expect(inviteSomebody({ roleCode: "not_a_role" })).rejects.toThrow();
    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.people where given_name = $1",
      [MARKER],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(sends).toHaveLength(0);
  });
});

describe("rows 5, 6, 7 — the role assignment the invitation materialises", () => {
  it("takes scope, office status and the single-holder flag from the catalogue", async () => {
    const result = await inviteSomebody();

    const assignment = await observer.query<{
      scope: string;
      office: boolean;
      single: boolean;
      committee_year_id: string | null;
      season_id: string | null;
      effective_from: string;
      effective_to: string | null;
    }>(
      `select ra.scope::text as scope,
              ra.is_constitutional_office as office,
              ra.is_single_holder_seat as single,
              ra.committee_year_id,
              ra.season_id,
              ra.effective_from::text as effective_from,
              ra.effective_to::text as effective_to
         from public.role_assignments ra where ra.id = $1`,
      [result.roleAssignmentIds[0]],
    );

    // There is no trigger filling these in — LAN-128 decided that deliberately
    // — so an insert that took them from anywhere but the catalogue row is
    // refused by a composite foreign key. This asserts the values that got
    // through are the catalogue's.
    const row = assignment.rows[0];
    expect(row.scope).toBe("committee_year");
    expect(row.office).toBe(false);
    expect(row.single).toBe(false);
    expect(row.committee_year_id).not.toBeNull();
    expect(row.season_id).toBeNull();
    expect(row.effective_to).toBeNull();
  });

  it("defaults effective-from to today and asks for no end date", async () => {
    const result = await inviteSomebody();
    const row = await observer.query<{ same: boolean; effective_to: string | null }>(
      `select effective_from = current_date as same, effective_to::text as effective_to
         from public.role_assignments where id = $1`,
      [result.roleAssignmentIds[0]],
    );
    expect(row.rows[0].same).toBe(true);
    expect(row.rows[0].effective_to).toBeNull();
  });

  it("permits a future start, and records it as scheduled rather than effective", async () => {
    const result = await inviteSomebody({ effectiveFrom: futureDate(30) });
    const events = await auditRows(result.personId);
    const assigned = events.find((row) => row.action === "administration.role.assigned");
    expect(assigned?.to_state).toBe("scheduled");
  });

  it("permits backdating only with a reason, which the ledger then carries", async () => {
    await expect(inviteSomebody({ effectiveFrom: pastDate(30) })).rejects.toMatchObject({
      rule: BACKDATING_REASON_RULE,
    });

    const result = await inviteSomebody({
      effectiveFrom: pastDate(30),
      reason: "Recorded late after the AGM minutes were circulated.",
    });
    const row = await observer.query<{ reason: string | null; backdated: boolean }>(
      `select reason, (context -> 'administration' ->> 'backdated')::boolean as backdated
         from public.audit_events
        where action = 'administration.role.assigned'
          and context -> 'administration' ->> 'targetPersonId' = $1`,
      [result.personId],
    );
    expect(row.rows[0].backdated).toBe(true);
    expect(row.rows[0].reason).toContain("AGM minutes");
  });

  it("hangs a coaching seat off the season and a committee seat off the committee year", async () => {
    const coach = await inviteSomebody({ roleCode: "head_coach", tag: "coach" });
    const row = await observer.query<{
      committee_year_id: string | null;
      season_id: string | null;
    }>("select committee_year_id, season_id from public.role_assignments where id = $1", [
      coach.roleAssignmentIds[0],
    ]);
    // Register D8: coaches are appointed around seasons and do not turn over at
    // the AGM, so the cycle is read from the role rather than asked for.
    expect(row.rows[0].season_id).not.toBeNull();
    expect(row.rows[0].committee_year_id).toBeNull();
  });
});

describe("rows 8, 9 — one login per Person, one login per address", () => {
  it("refuses a second login for the same Person, and says where to go instead", async () => {
    const personId = await insertPerson("already-has-one");
    await inviteOperator({
      operator: administrator(),
      subject: { kind: "existing", personId },
      email: uniqueAddress("first"),
      roles: [{ roleCode: "kit_manager" }],
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    const second = inviteOperator({
      operator: administrator(),
      subject: { kind: "existing", personId },
      email: uniqueAddress("second"),
      roles: [{ roleCode: "kit_manager" }],
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    await expect(second).rejects.toMatchObject({ rule: PERSON_ALREADY_HAS_LOGIN_RULE });
    await expect(second).rejects.toThrow(/open their operator record/i);
  });

  it("refuses a second login for the same address, however it is spelled", async () => {
    const email = uniqueAddress("shared");
    await inviteSomebody({ email });

    await expect(inviteSomebody({ email: email.toUpperCase() })).rejects.toMatchObject({
      rule: EMAIL_ALREADY_HAS_LOGIN_RULE,
    });
  });

  it("leaves no orphan login behind when the database refuses", async () => {
    const personId = await insertPerson("orphan-check");
    await inviteOperator({
      operator: administrator(),
      subject: { kind: "existing", personId },
      email: uniqueAddress("orphan-first"),
      roles: [{ roleCode: "kit_manager" }],
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    // The address is free, so the login is created; the Person already has one,
    // so the transaction fails. The compensation must remove the login it just
    // made, or the honest retry would be refused for the wrong reason.
    const address = uniqueAddress("orphan-second");
    await expect(
      inviteOperator({
        operator: administrator(),
        subject: { kind: "existing", personId },
        email: address,
        roles: [{ roleCode: "kit_manager" }],
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toThrow();

    // Proof: the address can be used again, which it could not if the login had
    // survived — `auth.users.email` is unique.
    const reused = await inviteSomebody({ email: address, tag: "reuse" });
    expect(reused.loginEmail).toBe(address);
  });
});

describe("row 10 — a delivery failure preserves everything and duplicates nothing", () => {
  it("commits the Person, the account and the assignment, and reports the failure", async () => {
    const email = uniqueAddress("undeliverable");
    const result = await inviteSomebody({
      email,
      port: identity({ send: "fail", failure: "550 mailbox unavailable" }),
    });

    expect(result.delivered).toBe(false);
    expect(result.state).toBe("delivery_failed");
    expect(result.deliveryFailureReason).toContain("550");

    const account = await observer.query<{ id: string; failed_at: Date | null; reason: string }>(
      `select id, invitation_delivery_failed_at as failed_at,
              invitation_delivery_failure_reason as reason
         from public.operator_accounts where person_id = $1`,
      [result.personId],
    );
    expect(account.rows).toHaveLength(1);
    expect(account.rows[0].failed_at).not.toBeNull();

    const assignments = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.role_assignments where person_id = $1",
      [result.personId],
    );
    expect(Number(assignments.rows[0].count)).toBe(1);

    expect(await auditActions(result.personId)).toContain(
      "administration.operator.invitation_delivery_failed",
    );
  });

  it("records the failure as a transition out of Invitation pending", async () => {
    const result = await inviteSomebody({ port: identity({ send: "fail" }) });
    const failure = (await auditRows(result.personId)).find(
      (row) => row.action === "administration.operator.invitation_delivery_failed",
    );
    expect(failure).toMatchObject({
      from_state: "invitation_pending",
      to_state: "delivery_failed",
    });
  });

  it("resends onto the same Person and the same account, creating no second one", async () => {
    const result = await inviteSomebody({ port: identity({ send: "fail" }) });

    const resent = await resendOperatorInvitation({
      operator: administrator(),
      operatorAccountId: result.operatorAccountId,
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    expect(resent.operatorAccountId).toBe(result.operatorAccountId);
    expect(resent.delivered).toBe(true);
    expect(resent.state).toBe("invitation_pending");

    const counts = await observer.query<{ accounts: string; people: string }>(
      `select (select count(*)::text from public.operator_accounts where person_id = $1) as accounts,
              (select count(*)::text from public.people where id = $1) as people`,
      [result.personId],
    );
    expect(counts.rows[0]).toEqual({ accounts: "1", people: "1" });
  });
});

describe("rows 11, 12, 13 — resend, correct, and when neither is offered", () => {
  it("clears the failure and records the attempt", async () => {
    const result = await inviteSomebody({ port: identity({ send: "fail" }) });
    await resendOperatorInvitation({
      operator: administrator(),
      operatorAccountId: result.operatorAccountId,
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );
    expect(account?.deliveryFailedAt).toBeNull();
    expect(account?.deliveryFailureReason).toBeNull();
    expect(account?.state).toBe("invitation_pending");
    expect(await auditActions(result.personId)).toContain(
      "administration.operator.invitation_resent",
    );
  });

  it("sends the invitation to the destination the application answers on", async () => {
    const result = await inviteSomebody();
    await resendOperatorInvitation({
      operator: administrator(),
      operatorAccountId: result.operatorAccountId,
      callbackUrl: CALLBACK,
      identity: identity(),
    });
    expect(sends.at(-1)).toEqual({ email: result.loginEmail, redirectTo: CALLBACK });
  });

  it("moves the address on the login and on the account together", async () => {
    const result = await inviteSomebody();
    const corrected = uniqueAddress("corrected");

    const outcome = await correctOperatorInvitation({
      operator: administrator(),
      operatorAccountId: result.operatorAccountId,
      email: corrected,
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    expect(outcome.loginEmail).toBe(corrected);
    expect(sends.at(-1)?.email).toBe(corrected);

    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );
    expect(account?.loginEmail).toBe(corrected);

    // The address really moved on the auth side too, which is what decides
    // where the emailed link's token can be redeemed.
    const admin = createAdminClient();
    const user = await admin.auth.admin.getUserById(account!.authUserId);
    expect(user.data.user?.email).toBe(corrected);
  });

  it("keeps the address it was corrected away from in the audit record", async () => {
    const result = await inviteSomebody();
    await correctOperatorInvitation({
      operator: administrator(),
      operatorAccountId: result.operatorAccountId,
      email: uniqueAddress("corrected-2"),
      callbackUrl: CALLBACK,
      identity: identity(),
    });

    const row = await observer.query<{ previous: string }>(
      `select context -> 'administration' -> 'detail' ->> 'previousLoginEmail' as previous
         from public.audit_events
        where action = 'administration.operator.invitation_corrected'
          and context -> 'administration' ->> 'targetPersonId' = $1`,
      [result.personId],
    );
    expect(row.rows[0].previous).toBe(result.loginEmail);
  });

  it("refuses to correct an address onto an account that already has it", async () => {
    const taken = uniqueAddress("taken");
    await inviteSomebody({ email: taken });
    const other = await inviteSomebody();

    await expect(
      correctOperatorInvitation({
        operator: administrator(),
        operatorAccountId: other.operatorAccountId,
        email: taken,
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toMatchObject({ rule: EMAIL_ALREADY_HAS_LOGIN_RULE });
  });

  it("refuses a correction onto an address held by a login outside this table", async () => {
    // The one race the service's own `login_email` pre-check cannot close: an
    // address held by an `auth.users` row that no `operator_accounts` row
    // points at. GoTrue refuses the move, and it refuses it with a bare 500
    // carrying no code and the message "Error updating user" — the same answer
    // it gives for any failed update — which is why the sentence names both
    // reachable causes instead of asserting one. LAN131-A2.
    const admin = createAdminClient();
    const dangling = uniqueAddress("dangling");
    const created = await admin.auth.admin.createUser({
      email: dangling,
      email_confirm: false,
    });
    authUsers.add(created.data.user!.id);

    const result = await inviteSomebody({ tag: "collides" });

    await expect(
      correctOperatorInvitation({
        operator: administrator(),
        operatorAccountId: result.operatorAccountId,
        email: dangling,
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toThrow(/nothing was saved/i);

    // Nothing moved, on either side. A refusal that had already changed the
    // address, or written an event saying it had, would be the defect.
    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );
    expect(account?.loginEmail).toBe(result.loginEmail);
    expect(await auditActions(result.personId)).not.toContain(
      "administration.operator.invitation_corrected",
    );
  });

  it("refuses both once the operator has established credentials", async () => {
    const result = await inviteSomebody();
    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );
    await activateOperatorAccount(account!.authUserId);

    for (const attempt of [
      () =>
        resendOperatorInvitation({
          operator: administrator(),
          operatorAccountId: result.operatorAccountId,
          callbackUrl: CALLBACK,
          identity: identity(),
        }),
      () =>
        correctOperatorInvitation({
          operator: administrator(),
          operatorAccountId: result.operatorAccountId,
          email: uniqueAddress("too-late"),
          callbackUrl: CALLBACK,
          identity: identity(),
        }),
    ]) {
      // Changing a working account's address is `REQ-rehome-email`'s recovery
      // flow, with its own reason, its own verification and its own state.
      await expect(attempt()).rejects.toMatchObject({ rule: NOT_RESENDABLE_RULE });
    }
  });

  /**
   * The window between the two transactions — LAN-141 finding 3.
   *
   * A correction decides in one transaction, moves the address on the Auth
   * server outside any transaction, and writes in a second. Everything the
   * first transaction checked is therefore a snapshot from before an unbounded
   * network call. `startOperatorEmailRehome` closes the identical window
   * (LAN132-B3) and this path was missed; this module's own note argued the
   * window "confers nothing", and these two cases are what that argument
   * missed.
   *
   * Both are staged deterministically by making the Auth call itself the moment
   * the world changes — the same technique LAN132-B3's test uses, because a
   * genuine race cannot be written down.
   */
  describe("the window between deciding and writing", () => {
    it("refuses a correction the holder's activation invalidated inside it", async () => {
      // The sharp case. `refuseUnlessResendable` passed on a pending account;
      // by the write the holder has followed the link they already had and set
      // a password. Without the re-assertion "correct the invitation" silently
      // becomes an address change on an **Active** account — `REQ-rehome-email`
      // without its `recover_email` authority list, without a reason and
      // without Email change pending.
      const invited = await inviteSomebody({ tag: "window-activation" });
      const real = supabaseOperatorIdentity();
      let opened = false;

      const port: OperatorIdentityPort = {
        createLogin: (email) => real.createLogin(email),
        async sendInvitation() {
          throw new Error("no invitation may be sent for a refused correction");
        },
        async changeLoginEmail(id, email) {
          await real.changeLoginEmail(id, email);
          if (opened) return;
          opened = true;
          await activateOperatorAccount(invited.authUserId);
        },
        deleteLogin: (id) => real.deleteLogin(id),
      };

      await expect(
        correctOperatorInvitation({
          operator: administrator(),
          operatorAccountId: invited.operatorAccountId,
          email: uniqueAddress("window-activation-new"),
          callbackUrl: CALLBACK,
          identity: port,
        }),
      ).rejects.toMatchObject({ rule: NOT_RESENDABLE_RULE });

      // The address is back on both sides. A refusal that had already moved
      // somebody's sign-in is a half-performed correction, not a refusal.
      const account = await withTransaction((tx) =>
        readOperatorAccountIn(tx, invited.operatorAccountId),
      );
      expect(account?.loginEmail).toBe(invited.loginEmail);

      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(invited.authUserId);
      expect(data?.user?.email, "the login must be back too").toBe(invited.loginEmail);

      expect(await auditActions(invited.personId)).not.toContain(
        "administration.operator.invitation_corrected",
      );
    });

    it("refuses a correction a seat recorded inside it put out of reach", async () => {
      // The guard's half, and the reason the seats are re-read rather than
      // carried forward: at the decision the target holds an ordinary seat and
      // an IT Officer may redirect their invitation; by the write they are the
      // President-elect, and redirecting a credential-establishing link to an
      // address of one's choosing is how somebody takes that seat.
      const restorePresidency = await vacateThePresidency();
      let invited: Awaited<ReturnType<typeof inviteOperator>> | null = null;

      try {
        invited = await inviteSomebody({ tag: "window-seat" });
        const real = supabaseOperatorIdentity();
        let opened = false;

        const port: OperatorIdentityPort = {
          createLogin: (email) => real.createLogin(email),
          async sendInvitation() {
            throw new Error("no invitation may be sent for a refused correction");
          },
          async changeLoginEmail(id, email) {
            await real.changeLoginEmail(id, email);
            if (opened) return;
            opened = true;
            // Dated to the handover, which is the shape an AGM decision takes
            // and the shape a "currently effective" snapshot cannot see.
            await giveRole(invited!.personId, "president", futureDate(45));
          },
          deleteLogin: (id) => real.deleteLogin(id),
        };

        await expect(
          correctOperatorInvitation({
            operator: itOfficer(),
            operatorAccountId: invited.operatorAccountId,
            email: uniqueAddress("window-seat-new"),
            callbackUrl: CALLBACK,
            identity: port,
          }),
        ).rejects.toMatchObject({ kind: "not_permitted" });

        const account = await withTransaction((tx) =>
          readOperatorAccountIn(tx, invited!.operatorAccountId),
        );
        expect(account?.loginEmail).toBe(invited.loginEmail);

        const admin = createAdminClient();
        const { data } = await admin.auth.admin.getUserById(invited.authUserId);
        expect(data?.user?.email).toBe(invited.loginEmail);

        expect(await auditActions(invited.personId)).not.toContain(
          "administration.operator.invitation_corrected",
        );
      } finally {
        if (invited) {
          await observer.query(
            `delete from public.role_assignments ra
              using public.roles r
              where r.id = ra.role_id and r.code = 'president' and ra.person_id = $1`,
            [invited.personId],
          );
        }
        await restorePresidency();
      }
    });

    it("still corrects the address when nothing changed inside the window", async () => {
      // The counterweight. Two of the three re-assertions above refuse; a
      // correction that had quietly stopped working would satisfy them both.
      const invited = await inviteSomebody({ tag: "window-clear" });
      const replacement = uniqueAddress("window-clear-new");

      const corrected = await correctOperatorInvitation({
        operator: administrator(),
        operatorAccountId: invited.operatorAccountId,
        email: replacement,
        callbackUrl: CALLBACK,
        identity: identity(),
      });

      expect(corrected.loginEmail).toBe(replacement);
      expect(corrected.delivered).toBe(true);
      expect(await auditActions(invited.personId)).toContain(
        "administration.operator.invitation_corrected",
      );
    });
  });
});

describe("rows 14, 15, 16 — the guard is the target-level one, not the capability floor", () => {
  it("refuses every entry point to an operator without role_management", async () => {
    const result = await inviteSomebody();

    await expect(inviteSomebody({ actor: secretary() })).rejects.toMatchObject({
      kind: "not_permitted",
    });
    await expect(
      resendOperatorInvitation({
        operator: secretary(),
        operatorAccountId: result.operatorAccountId,
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    await expect(
      correctOperatorInvitation({
        operator: secretary(),
        operatorAccountId: result.operatorAccountId,
        email: uniqueAddress("refused"),
        callbackUrl: CALLBACK,
        identity: identity(),
      }),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    await expect(findOperatorCandidates(secretary(), { givenName: MARKER })).rejects.toMatchObject({
      kind: "not_permitted",
    });
  });

  it("refuses an unauthenticated caller identically", async () => {
    await expect(inviteSomebody({ actor: null })).rejects.toMatchObject({
      kind: "not_permitted",
    });
  });

  it("refuses an IT Officer inviting somebody straight into the President seat", async () => {
    // The whole point of the target-level guard. `role_management` alone would
    // have permitted this, and the capability floor is what a service that
    // stopped at `assertCapability` would have checked.
    await expect(
      inviteSomebody({ actor: itOfficer(), roleCode: "president" }),
    ).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("refuses everybody, including the strongest actor, the General Manager seat", async () => {
    await expect(
      inviteSomebody({ actor: administrator(), roleCode: "general_manager" }),
    ).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("creates no login and sends nothing when the guard refuses", async () => {
    await expect(inviteSomebody({ actor: itOfficer(), roleCode: "president" })).rejects.toThrow();
    // The pre-flight guard runs before the Auth call, so a refused invitation
    // costs nothing, leaves nothing to clean up, and cannot be detected by the
    // person who was not invited.
    expect(logins).toEqual([]);
    expect(sends).toEqual([]);
  });
});

describe("row 17b — the seats an invitation's own guard is judged on", () => {
  /**
   * LAN-141, "also in scope": `inviteOperator`'s two guard snapshots omitted
   * `includeScheduled`, and neither behaviour was pinned — adding the option
   * passed 1338 tests, so no test said which was intended.
   *
   * It is intended. The narrow snapshot is the same defect this mission has
   * now found three times, and the consequence here is the sharpest of them: a
   * Person holding a seat dated to begin at the handover and *no login yet* is
   * exactly the target this flow reaches. Invisible to the leadership rule,
   * they can be given another seat **and** an account at an address the
   * inviter picks, by an actor who may not administer the seat they are about
   * to hold. `includeScheduled` can only ever make the guard stricter, so the
   * only question was whether anyone had asked it. This is the asking.
   */
  it("refuses inviting a Person whose seat begins at a future handover", async () => {
    const restorePresidency = await vacateThePresidency();
    const elect = await insertPerson("invite-president-elect");

    try {
      await giveRole(elect, "president", futureDate(45));

      // The precondition: today, they hold nothing.
      const asOfToday = await withTransaction((tx) => readAdministrationSubject(tx, elect));
      expect(asOfToday.roleCodes).toEqual([]);

      await expect(
        inviteOperator({
          operator: itOfficer(),
          subject: { kind: "existing", personId: elect },
          email: uniqueAddress("invite-elect-refused"),
          roles: [{ roleCode: "kit_manager" }],
          callbackUrl: CALLBACK,
          identity: identity(),
        }),
      ).rejects.toMatchObject({ kind: "not_permitted" });

      // The pre-flight assertion is what makes this cost nothing. Without the
      // widening *there*, the login is created and then deleted again — a
      // refused invitation that minted and destroyed an Auth user.
      expect(logins, "a refused invitation must create no login").toEqual([]);
      expect(sends).toEqual([]);

      const account = await observer.query(
        "select 1 from public.operator_accounts where person_id = $1",
        [elect],
      );
      expect(account.rowCount).toBe(0);

      // And the General Manager, who may assign the seat they are about to
      // hold, may invite them — so the refusal is the leadership rule rather
      // than a blanket denial.
      const invited = await inviteOperator({
        operator: generalManager(),
        subject: { kind: "existing", personId: elect },
        email: uniqueAddress("invite-elect-permitted"),
        roles: [{ roleCode: "kit_manager" }],
        callbackUrl: CALLBACK,
        identity: identity(),
      });
      expect(invited.personId).toBe(elect);
    } finally {
      await observer.query(
        `delete from public.role_assignments ra
          using public.roles r
          where r.id = ra.role_id and r.code = 'president' and ra.person_id = $1`,
        [elect],
      );
      await restorePresidency();
    }
  });

  it("refuses an invitation a seat recorded inside the login window put out of reach", async () => {
    // The **second** of `inviteOperator`'s two assertions, which the case above
    // cannot reach because the first one already refuses. `createLogin` is the
    // network call between them, so it is where the world is made to change —
    // the same technique LAN132-B3 uses on the re-home.
    const restorePresidency = await vacateThePresidency();
    const elect = await insertPerson("invite-window-elect");
    const real = supabaseOperatorIdentity();
    let opened = false;

    try {
      const port: OperatorIdentityPort = {
        async createLogin(email) {
          const result = await real.createLogin(email);
          authUsers.add(result.authUserId);
          logins.push(email);
          if (!opened) {
            opened = true;
            await giveRole(elect, "president", futureDate(45));
          }
          return result;
        },
        async sendInvitation() {
          throw new Error("nothing may be sent for a refused invitation");
        },
        changeLoginEmail: (id, email) => real.changeLoginEmail(id, email),
        deleteLogin: (id) => real.deleteLogin(id),
      };

      await expect(
        inviteOperator({
          operator: itOfficer(),
          subject: { kind: "existing", personId: elect },
          email: uniqueAddress("invite-window-refused"),
          roles: [{ roleCode: "kit_manager" }],
          callbackUrl: CALLBACK,
          identity: port,
        }),
      ).rejects.toMatchObject({ kind: "not_permitted" });

      // Nothing was written, and the login created inside the window was
      // compensated away — the module's one compensation, doing its job.
      const account = await observer.query(
        "select 1 from public.operator_accounts where person_id = $1",
        [elect],
      );
      expect(account.rowCount).toBe(0);
      expect(sends).toEqual([]);
    } finally {
      await observer.query(
        `delete from public.role_assignments ra
          using public.roles r
          where r.id = ra.role_id and r.code = 'president' and ra.person_id = $1`,
        [elect],
      );
      await restorePresidency();
    }
  });

  it("asks for the widened snapshot at every site in this module", () => {
    // Behaviour is asserted above and in row 17; this is the guard against a
    // fifth call site being added later on the default. Six of the mission's
    // ten sites were unwidened before LAN-141, and every one of them looked
    // fine in isolation.
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/services/operator-invitations.ts"),
      "utf8",
    );
    const callSites = source.split("readAdministrationSubject(tx").slice(1);

    expect(callSites.length, "invite twice, and send-again twice").toBe(4);
    for (const site of callSites) {
      expect(site.slice(0, 200)).toMatch(/includeScheduled:\s*true/);
    }
  });
});

describe("row 17 — a pending invitation's seat reaches the guard", () => {
  it("puts a not-yet-started assignment into the snapshot when asked", async () => {
    const result = await inviteSomebody({ effectiveFrom: futureDate(45) });

    const current = await withTransaction((tx) => readAdministrationSubject(tx, result.personId));
    const withScheduled = await withTransaction((tx) =>
      readAdministrationSubject(tx, result.personId, { includeScheduled: true }),
    );

    expect(current.roleCodes).toEqual([]);
    expect(withScheduled.roleCodes).toEqual(["kit_manager"]);
  });

  it("refuses the guard a snapshot that omits the pending seat", () => {
    // The guard's own half, kept because it is what makes the end-to-end case
    // below diagnosable: if that one fails, this says whether the rule changed
    // or the snapshot did.
    const pendingPresident: AdministrationSubject = {
      personId: "00000000-0000-4000-8000-0000000131bb",
      roleCodes: ["president"],
    };
    const noSeatYet: AdministrationSubject = { ...pendingPresident, roleCodes: [] };

    for (const action of ["resend_invitation", "correct_invitation"] as const) {
      expect(() =>
        assertAdministrationTarget(itOfficer(), { action, target: pendingPresident }),
      ).toThrow(/President/);

      // And the reason the snapshot is load-bearing rather than incidental:
      // with the seat missing, the very same call is permitted. Nothing else
      // in the guard refuses it — `resend_invitation` and `correct_invitation`
      // are not role-scoped, so the seats the target holds are the whole
      // input, and an IT Officer clears the capability floor.
      expect(() =>
        assertAdministrationTarget(itOfficer(), { action, target: noSeatYet }),
      ).not.toThrow();
    }
  });

  it("refuses an IT Officer resending or redirecting a pending President invitation", async () => {
    // The end-to-end case, staged against real rows — the one that fails if
    // `sendAgain` stops asking for the scheduled snapshot.
    //
    // The seat is dated to begin in forty-five days, so it is deliberately
    // *not* currently effective: this is the shape a handover recorded at an
    // AGM actually takes, and it is the shape a "currently effective" snapshot
    // cannot see.
    const restorePresidency = await vacateThePresidency();
    let invited: Awaited<ReturnType<typeof inviteOperator>> | null = null;

    try {
      invited = await inviteOperator({
        operator: generalManager(),
        subject: { kind: "new", givenName: MARKER, familyName: "president-elect" },
        email: uniqueAddress("president-elect"),
        roles: [{ roleCode: "president", effectiveFrom: futureDate(45) }],
        callbackUrl: CALLBACK,
        identity: identity(),
      });
      people.add(invited.personId);

      // The precondition that makes this dangerous: today, they hold nothing.
      const asOfToday = await withTransaction((tx) =>
        readAdministrationSubject(tx, invited!.personId),
      );
      expect(asOfToday.roleCodes).toEqual([]);

      const asItOfficer = {
        operator: itOfficer(),
        operatorAccountId: invited.operatorAccountId,
        callbackUrl: CALLBACK,
        identity: identity(),
      };

      // Redirecting the link is the sharp one: `correct_invitation` sends the
      // credential-establishing link to an address the administrator chooses,
      // so whoever may correct this invitation may take the presiding seat.
      await expect(resendOperatorInvitation(asItOfficer)).rejects.toMatchObject({
        kind: "not_permitted",
      });
      await expect(resendOperatorInvitation(asItOfficer)).rejects.toThrow(/President/);
      await expect(
        correctOperatorInvitation({ ...asItOfficer, email: uniqueAddress("redirected") }),
      ).rejects.toMatchObject({ kind: "not_permitted" });
      await expect(
        correctOperatorInvitation({ ...asItOfficer, email: uniqueAddress("redirected") }),
      ).rejects.toThrow(/President/);

      // Nothing moved. A refusal that had already changed the address would be
      // the whole defect wearing a refusal's clothes.
      const account = await withTransaction((tx) =>
        readOperatorAccountIn(tx, invited!.operatorAccountId),
      );
      expect(account?.loginEmail).toBe(invited.loginEmail);

      // And the login was never touched at all — which is what the **first**
      // of the two assertions buys, now that the second one exists. Both
      // refuse, so the caller cannot tell them apart from the error; what
      // separates them is whether the President-elect's sign-in address was
      // relocated on the Auth server and moved back again in between.
      expect(moves, "a refused correction must touch no login").toEqual([]);

      // And the refusal is about the seat, not about invitations: the General
      // Manager, who is the one role that may assign the President seat, may
      // resend it. Without this the test would pass just as well if resend
      // were broken for everybody.
      const resent = await resendOperatorInvitation({
        operator: generalManager(),
        operatorAccountId: invited.operatorAccountId,
        callbackUrl: CALLBACK,
        identity: identity(),
      });
      expect(resent.delivered).toBe(true);
    } finally {
      // Order matters: the invited person's future-dated President assignment
      // has to go before the seed's open-ended one is restored, or restoring
      // it re-creates the overlap `role_assignments_one_holder_per_office`
      // exists to refuse.
      if (invited) {
        await observer.query("delete from public.role_assignments where person_id = $1", [
          invited.personId,
        ]);
      }
      await restorePresidency();
    }
  });
});

describe("row 19 — activation ends the invitation, once", () => {
  it("records the moment credentials were established", async () => {
    const result = await inviteSomebody();
    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );

    const activation = await activateOperatorAccount(account!.authUserId);

    expect(activation).toMatchObject({ activated: true, state: "active" });
    expect(await auditActions(result.personId)).toContain("administration.operator.activated");
  });

  it("is idempotent — a later password change is not a second activation", async () => {
    const result = await inviteSomebody();
    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );

    await activateOperatorAccount(account!.authUserId);
    const again = await activateOperatorAccount(account!.authUserId);

    expect(again).toMatchObject({ activated: false, state: "active" });
    const events = (await auditActions(result.personId)).filter(
      (action) => action === "administration.operator.activated",
    );
    expect(events).toHaveLength(1);
  });

  it("does not restore a deactivated account", async () => {
    const result = await inviteSomebody();
    const account = await withTransaction((tx) =>
      readOperatorAccountIn(tx, result.operatorAccountId),
    );
    await observer.query(
      `update public.operator_accounts
          set is_active = false, disabled_at = now(), disabled_reason = 'Test fixture'
        where id = $1`,
      [result.operatorAccountId],
    );

    const activation = await activateOperatorAccount(account!.authUserId);

    // Setting a password is not permission to sign in. Restoration is an
    // administrator's act (`REQ-deactivate-and-reinstate`).
    expect(activation?.state).toBe("deactivated");
    expect(await auditActions(result.personId)).not.toContain("administration.operator.activated");
  });

  it("reports nothing for a login with no operator account", async () => {
    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
      email: uniqueAddress("unlinked"),
      email_confirm: false,
    });
    authUsers.add(created.data.user!.id);

    expect(await activateOperatorAccount(created.data.user!.id)).toBeNull();
  });
});

describe("row 21 — one act, one ledger, in causal order", () => {
  it("writes exactly two events — the invitation, and the assignment it carries", async () => {
    const result = await inviteSomebody();

    // Two facts, two rows. Not three: whether the Person was created or linked
    // is `detail` on the invitation, not a second event, and a second row
    // shaped for a second screen is the duplication `DEC-audit-boundary`
    // refuses. Their causal order within the instant belongs to LAN-130's
    // projection — see `auditActions`.
    expect(await auditActions(result.personId)).toEqual([
      "administration.operator.invited",
      "administration.role.assigned",
    ]);
  });

  it("renders the invitation above the assignment in the history projection", async () => {
    const result = await inviteSomebody();

    // The ordering assertion, made where ordering is actually decided:
    // `instantOrder` puts a role assignment last within an instant, and the
    // projection is newest-first, so the assignment is the first entry.
    const history = await readOperatorAuditHistory(administrator(), result.personId);
    expect(history.map((entry) => entry.action)).toEqual([
      "administration.role.assigned",
      "administration.operator.invited",
    ]);
  });

  it("correlates the two events one administrator action produced", async () => {
    const result = await inviteSomebody();
    const rows = await observer.query<{ correlation: string | null }>(
      `select distinct context -> 'administration' ->> 'correlationId' as correlation
         from public.audit_events
        where context -> 'administration' ->> 'targetPersonId' = $1`,
      [result.personId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].correlation).not.toBeNull();
  });

  it("records the authority the administrator held at the time", async () => {
    const result = await inviteSomebody();
    const row = await observer.query<{ capability: string; roles: string[] }>(
      `select context -> 'administration' -> 'authority' ->> 'capability' as capability,
              array(select jsonb_array_elements_text(
                     context -> 'administration' -> 'authority' -> 'roleCodes')) as roles
         from public.audit_events
        where action = 'administration.operator.invited'
          and context -> 'administration' ->> 'targetPersonId' = $1`,
      [result.personId],
    );
    expect(row.rows[0].capability).toBe("role_management");
    expect(row.rows[0].roles).toEqual([...capabilityRoleCodes("role_management")]);
  });

  it("writes no administration event for a refused invitation", async () => {
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.audit_events where actor_person_id = $1",
      [actorPersonId],
    );
    await expect(inviteSomebody({ actor: secretary() })).rejects.toThrow();
    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.audit_events where actor_person_id = $1",
      [actorPersonId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});

describe("the duplicate check the flow starts with", () => {
  it("finds an existing Person and says whether they already have a login", async () => {
    const invited = await inviteSomebody({ tag: "searchable" });

    const candidates = await findOperatorCandidates(administrator(), {
      givenName: MARKER,
      familyName: "searchable",
    });

    const found = candidates.find((candidate) => candidate.personId === invited.personId);
    expect(found?.operatorAccount).toMatchObject({ state: "invitation_pending" });
    expect(found?.matchedOn).toContain("given name");
  });

  it("reports no operator account for somebody who has never been invited", async () => {
    const personId = await insertPerson("never-invited");
    const candidates = await findOperatorCandidates(administrator(), {
      givenName: MARKER,
      familyName: "never-invited",
    });
    expect(candidates.find((c) => c.personId === personId)?.operatorAccount).toBeNull();
  });

  /**
   * The address an operator signs in with is an address the club holds, and
   * nothing copies it into `contact_points`. Searching for it used to match
   * nothing at all, so the screen promised a new record and the send then
   * failed on the unique index — a refusal `REQ-invitation-states` requires to
   * be actionable, arriving as a constraint name instead.
   */
  it("matches an address that is only ever an operator login", async () => {
    const invited = await inviteSomebody({ tag: "login-only" });
    const login = await observer.query<{ login_email: string }>(
      "select login_email from public.operator_accounts where person_id = $1",
      [invited.personId],
    );
    const address = login.rows[0].login_email;

    // Stage the shape Brian hit: the address survives as the login and as
    // nothing else. An invitation happens to leave a contact point behind, but
    // an operator entered any other way — or one whose contact details were
    // later corrected — has only the login, and that is the case that failed.
    await observer.query(
      `delete from public.contact_points
        where person_id = $1 and lower(btrim(raw_value)) = lower(btrim($2))`,
      [invited.personId, address],
    );

    const held = await observer.query<{ count: string }>(
      `select count(*)::text as count
         from public.contact_points
        where person_id = $1 and lower(btrim(raw_value)) = lower(btrim($2))`,
      [invited.personId, address],
    );
    expect(held.rows[0].count, "the address must exist only as a login").toBe("0");

    const candidates = await findOperatorCandidates(administrator(), { email: address });
    const found = candidates.find((candidate) => candidate.personId === invited.personId);

    expect(found, "an address already in use as a login must match").toBeDefined();
    expect(found?.matchedOn).toContain("email");
  });

  /**
   * The exactness rule, from the side that was never asserted — LAN-141
   * finding 5.
   *
   * Every case above asks whether the intended person **is** found. None asked
   * whether anybody else is **excluded**, so widening
   * `lower(btrim(p.given_name)) = w.given_name` to a `like … || '%'` prefix
   * match passed the whole suite.
   *
   * That is not a cosmetic difference. The projection returns given, family and
   * known-as names plus a preferred email and a preferred phone for every row
   * it returns. Exact, it answers "is this person already in the club's
   * records?". Prefixed — which is exactly what "it cannot find Jonny when I
   * type Jon" would be asked for — it is a contact directory, readable by the
   * three seats that hold `role_management`.
   *
   * **The matching behaviour is correct and is not changed here.** What is
   * added is the half that binds it.
   */
  describe("matches whole values, and discloses nobody else", () => {
    /**
     * Two people whose every searchable value is a prefix of the other's, so a
     * search for the shorter one finds the longer one under any widening and
     * only under a widening.
     */
    async function twoSimilarPeople(tag: string) {
      const shorter = await insertNamedPerson(`Jonquil${tag}`, `Ashgrovemoor${tag}`, {
        knownAs: `Bexley${tag}`,
        alias: `Quillon${tag}`,
        email: `jonquil${tag}@lan141.example`,
        phone: "07700 900123",
      });
      const longer = await insertNamedPerson(`Jonquil${tag}ine`, `Ashgrovemoor${tag}land`, {
        knownAs: `Bexley${tag}ham`,
        alias: `Quillon${tag}dale`,
        email: `jonquil${tag}@lan141.example.test`,
        phone: "07700 900133",
      });
      return { shorter, longer };
    }

    /**
     * The same shape, staged the one way the fixture above cannot stage it:
     * the two addresses exist **only** as operator logins.
     *
     * `insertNamedPerson` writes `contact_points`, so every address case here
     * reaches the `c.raw_value` branch and stops there. `oa.login_email` is a
     * separate branch of the same `where` clause, and it exists precisely
     * because nothing copies a login into `contact_points` — a person whose
     * only address is their login is reachable through it and through nothing
     * else. Widening it to a prefix match therefore passed every one of the
     * sixty-six tests this file had: LAN-141 finding F1.
     */
    async function twoSimilarLogins(tag: string) {
      const address = `marrowvale${tag}@lan141.example`;
      const shorter = await insertNamedPerson(`Marrowvale${tag}`, `Underhaywood${tag}`);
      const longer = await insertNamedPerson(`Marrowvale${tag}ford`, `Underhaywood${tag}mere`);
      await giveLoginOnly(shorter, address);
      await giveLoginOnly(longer, `${address}.test`);
      return { shorter, longer, address };
    }

    /** A real login for this Person, and no contact point carrying its address. */
    async function giveLoginOnly(personId: string, email: string): Promise<void> {
      const { authUserId } = await supabaseOperatorIdentity().createLogin(email);
      authUsers.add(authUserId);
      await observer.query(
        `insert into public.operator_accounts (auth_user_id, person_id, login_email, invited_at)
         values ($1, $2, $3, now())`,
        [authUserId, personId, email],
      );
    }

    it("finds a whole given name and not the longer name it begins", async () => {
      const { shorter, longer } = await twoSimilarPeople("gn");
      const found = await findOperatorCandidates(administrator(), { givenName: "Jonquilgn" });
      const ids = found.map((candidate) => candidate.personId);

      expect(ids, "the person searched for must be found").toContain(shorter);
      expect(ids, "a name this one merely begins must not be disclosed").not.toContain(longer);
    });

    it("finds a whole family name and not the longer name it begins", async () => {
      const { shorter, longer } = await twoSimilarPeople("fn");
      const found = await findOperatorCandidates(administrator(), {
        familyName: "Ashgrovemoorfn",
      });
      const ids = found.map((candidate) => candidate.personId);

      expect(ids).toContain(shorter);
      expect(ids).not.toContain(longer);
    });

    it("finds a whole known-as name and not the longer name it begins", async () => {
      const { shorter, longer } = await twoSimilarPeople("ka");
      const found = await findOperatorCandidates(administrator(), { knownAs: "Bexleyka" });
      const ids = found.map((candidate) => candidate.personId);

      expect(ids).toContain(shorter);
      expect(ids).not.toContain(longer);
    });

    it("finds a whole address and not the longer address it begins", async () => {
      const { shorter, longer } = await twoSimilarPeople("em");
      const found = await findOperatorCandidates(administrator(), {
        email: "jonquilem@lan141.example",
      });
      const ids = found.map((candidate) => candidate.personId);

      expect(ids).toContain(shorter);
      expect(ids).not.toContain(longer);
    });

    it("compares a phone on its last nine digits, exactly", async () => {
      const { shorter, longer } = await twoSimilarPeople("ph");

      // Formatting is not part of the comparison, and that is intended: the
      // international and national spellings of one number share their last
      // nine digits and are one number.
      const found = await findOperatorCandidates(administrator(), { phone: "+44 7700 900123" });
      const ids = found.map((candidate) => candidate.personId);
      expect(ids, "the same number spelled differently must still match").toContain(shorter);

      // A different number is a different number, however close.
      expect(ids, "a neighbouring number must not be disclosed").not.toContain(longer);

      // And a number nobody holds discloses nobody — the case a prefix or
      // fuzzy comparison on the tail would break.
      const near = await findOperatorCandidates(administrator(), { phone: "07700 900129" });
      const nearIds = near.map((candidate) => candidate.personId);
      expect(nearIds).not.toContain(shorter);
      expect(nearIds).not.toContain(longer);
    });

    /**
     * LAN-141 finding F1, and the reason the case above does not cover it: the
     * address searched for is held as a **login** and by nothing else, so the
     * only branch that can return either person is `oa.login_email`.
     */
    it("finds a whole login address and not the longer login it begins", async () => {
      const { shorter, longer, address } = await twoSimilarLogins("lg");

      const found = await findOperatorCandidates(administrator(), { email: address });
      const ids = found.map((candidate) => candidate.personId);

      expect(ids, "the operator whose login this is must be found").toContain(shorter);
      expect(ids, "a login this address merely begins must not be disclosed").not.toContain(longer);
    });

    /**
     * A name typed in the wrong box still finds the person — a known-as name
     * from the given-name field and the other way round — and the two branches
     * that do it are exact in the same way as the rest.
     */
    it("crosses the name fields whole, and never by prefix", async () => {
      const { shorter, longer } = await twoSimilarPeople("xf");

      for (const [what, query] of [
        ["a known-as name typed as the given name", { givenName: "Bexleyxf" }],
        ["a given name typed as the known-as name", { knownAs: "Jonquilxf" }],
      ] as const) {
        const ids = (await findOperatorCandidates(administrator(), query)).map(
          (candidate) => candidate.personId,
        );
        expect(ids, `${what} must find the person who holds it`).toContain(shorter);
        expect(ids, `${what} must not disclose the name it merely begins`).not.toContain(longer);
      }
    });

    /**
     * An alias is a fourth name, compared against all three name terms, and it
     * discloses exactly as much as the other three do.
     */
    it("matches a recorded alias whole, from every name field", async () => {
      const { shorter, longer } = await twoSimilarPeople("al");

      for (const query of [
        { givenName: "Quillonal" },
        { familyName: "Quillonal" },
        { knownAs: "Quillonal" },
      ]) {
        const ids = (await findOperatorCandidates(administrator(), query)).map(
          (candidate) => candidate.personId,
        );
        const where = Object.keys(query)[0];
        expect(ids, `an alias searched as ${where} must find its holder`).toContain(shorter);
        expect(ids, `an alias this term merely begins must not be disclosed`).not.toContain(longer);
      }
    });

    /**
     * The labels, which are a second copy of the same equality rules — LAN-141
     * finding F4.
     *
     * `matched_on` is why a person was returned, and each of its five parts
     * repeats a comparison the `where` clause already makes. Widening one of
     * those copies discloses nobody extra, so it is not the same hazard; it
     * makes the screen say an administrator's search term *is* somebody's name
     * or address when it is only the start of one, which is the sentence the
     * administrator decides "same person or not" on.
     *
     * Each search below returns the longer person for exactly one whole-value
     * reason, while every other term is a strict prefix of one of their values.
     * The complete label set is therefore the assertion: a widened copy adds a
     * word to it.
     */
    it("names only the fields that matched whole", async () => {
      const { longer } = await twoSimilarPeople("lb");
      const login = await twoSimilarLogins("lbl");

      for (const [what, personId, query, expected] of [
        [
          "an exact given name, every other term a prefix",
          longer,
          {
            givenName: "Jonquillbine",
            familyName: "Ashgrovemoorlb",
            knownAs: "Bexleylb",
            email: "jonquillb@lan141.example",
            phone: "07700 900123",
          },
          ["given name"],
        ],
        [
          "a given name that begins theirs",
          longer,
          { familyName: "Ashgrovemoorlbland", givenName: "Jonquillb" },
          ["family name"],
        ],
        [
          "a given-name term that begins their known-as name",
          longer,
          { familyName: "Ashgrovemoorlbland", givenName: "Bexleylb" },
          ["family name"],
        ],
        [
          "a known-as term that begins their given name",
          longer,
          { familyName: "Ashgrovemoorlbland", knownAs: "Jonquillb" },
          ["family name"],
        ],
        [
          "an address that begins their login",
          login.longer,
          { givenName: "Marrowvalelblford", email: login.address },
          ["given name"],
        ],
      ] as const) {
        const found = await findOperatorCandidates(administrator(), query);
        const candidate = found.find((row) => row.personId === personId);
        expect(candidate?.matchedOn, what).toEqual(expected);
      }
    });

    it("discloses nobody at all for a term the club does not hold", async () => {
      await twoSimilarPeople("no");
      const found = await findOperatorCandidates(administrator(), {
        givenName: "Quorlimbethsayle",
      });
      expect(found).toEqual([]);
    });

    /**
     * The clause that decides which rows are eligible **at all** — LAN-141,
     * from the independent review of PR #61.
     *
     * The eleven predicates above decide *which* people a search term reaches.
     * `p.merged_into_person_id is null` decides which people the search may
     * return under any term whatsoever, and it sat in the same `where` clause
     * with nothing holding it: replacing it with `(true or …)` passed all
     * seventy tests in this file. It is as privacy-bearing as the eleven, and
     * it was the one nobody had asked about.
     *
     * Invariant I6 is why a merged row is still there to leak. "A merge is an
     * audited operation that preserves both source identities. The losing row
     * is never deleted; it points at the survivor so every imported row keeps
     * its provenance." So the superseded Person keeps its name, its address and
     * its phone number for ever, and the only thing standing between those and
     * the duplicate-check projection is this clause.
     *
     * Two harms, and the second is worse than disclosure. The administrator is
     * shown two identical-looking candidates with no way to tell which is
     * current — and `assign_role` and the invitation flow take a `personId`, so
     * choosing the wrong one attaches a login and a committee seat to a record
     * the club has already declared superseded.
     *
     * The seed already contains one (`Alwyn Cholmondley`, with an address and a
     * phone). This stages its own so the test does not depend on the generator
     * continuing to produce one.
     */
    it("never returns a Person the club has merged away", async () => {
      const survivor = await insertNamedPerson("Perrivale", "Thornbarrow", {
        knownAs: "Perri",
        email: "perrivale@lan141.example",
        phone: "07700 900771",
      });

      // The superseded record is a *duplicate* of the survivor, which is what
      // makes it dangerous: every term that finds one finds the other, so the
      // exactness rules above cannot separate them and only eligibility can.
      const merged = await insertNamedPerson("Perrivale", "Thornbarrow", {
        knownAs: "Perri",
        email: "perrivale@lan141.example",
        phone: "07700 900771",
      });
      await observer.query(
        `update public.people
            set merged_into_person_id = $2,
                merged_at             = now(),
                merged_by_person_id   = $3,
                merge_reason          = 'LAN-141 fixture: duplicate record from an import'
          where id = $1`,
        [merged, survivor, actorPersonId],
      );

      // Every field the projection would disclose, one search each. A clause
      // that survived on the name terms but not on the address would be a
      // partial fix that reads as a whole one.
      for (const [what, query] of [
        ["the given name", { givenName: "Perrivale" }],
        ["the family name", { familyName: "Thornbarrow" }],
        ["the known-as name", { knownAs: "Perri" }],
        ["the address", { email: "perrivale@lan141.example" }],
        ["the phone number", { phone: "07700 900771" }],
      ] as const) {
        const ids = (await findOperatorCandidates(administrator(), query)).map(
          (candidate) => candidate.personId,
        );

        expect(ids, `${what} must still find the surviving Person`).toContain(survivor);
        expect(ids, `${what} must not disclose the record merged away`).not.toContain(merged);
      }
    });

    /**
     * And the seeded one, because a fixture this suite creates proves the rule
     * holds for rows this suite understands. The synthetic dataset carries a
     * merged-away Person with a full contact record, which is the shape a real
     * import produces, and it must be just as unreachable.
     */
    it("never returns the merged-away Person the synthetic dataset carries", async () => {
      const seeded = await observer.query<{
        id: string;
        given_name: string;
        family_name: string | null;
      }>(
        `select id, given_name, family_name
           from public.people
          where merged_into_person_id is not null
          order by id
          limit 1`,
      );

      // Not an assumption about the generator: if the seed stops carrying one,
      // this says so rather than passing on an empty search.
      expect(
        seeded.rows.length,
        "the synthetic dataset should carry a merged-away Person; if it no longer does, " +
          "this case needs restaging rather than deleting",
      ).toBe(1);

      const { id, given_name, family_name } = seeded.rows[0];
      const ids = (
        await findOperatorCandidates(administrator(), {
          givenName: given_name,
          familyName: family_name ?? undefined,
        })
      ).map((candidate) => candidate.personId);

      expect(ids, "a merged-away Person from the seed must not be disclosed").not.toContain(id);
    });
  });

  it("reports an operator pending email verification as pending, not Active", async () => {
    // LAN-141 finding 16. `toCandidate` hard-coded `emailChangePending: false`
    // and the query never selected the column, so an operator whose sign-in is
    // refused until they verify a replacement address was reported **Active**
    // here and in the successor picker this search feeds — the one state in
    // which the honest answer changes what an administrator should do next.
    const invited = await inviteSomebody({ tag: "pending-verification" });
    await observer.query(
      `update public.operator_accounts
          set activated_at = coalesce(activated_at, now()),
              email_rehome_pending_at = now()
        where id = $1`,
      [invited.operatorAccountId],
    );

    const candidates = await findOperatorCandidates(administrator(), {
      givenName: MARKER,
      familyName: "pending-verification",
    });
    const found = candidates.find((candidate) => candidate.personId === invited.personId);

    expect(found?.operatorAccount?.state).toBe("email_change_pending");
  });
});

describe("the operating year is inherited, never asked for", () => {
  it("stamps every event with the one active committee year", async () => {
    const active = await withTransaction((tx) => resolveActiveCommitteeYear(tx));
    const result = await inviteSomebody();

    const row = await observer.query<{ id: string; label: string; scope: string }>(
      `select context -> 'administration' -> 'operatingYear' ->> 'id' as id,
              context -> 'administration' -> 'operatingYear' ->> 'label' as label,
              context -> 'administration' -> 'operatingYear' ->> 'scope' as scope
         from public.audit_events
        where action = 'administration.operator.invited'
          and context -> 'administration' ->> 'targetPersonId' = $1`,
      [result.personId],
    );
    expect(row.rows[0]).toEqual({ id: active.id, label: active.label, scope: "committee_year" });
  });
});

describe("the invitation email really arrives, and carries a usable link", () => {
  it("lands in the local mail capture with a token-hash link to this application", async () => {
    const email = uniqueAddress("mailpit");
    await inviteSomebody({ email, port: identity({ send: "real" }) });

    const message = await fetchCapturedInvitation(email);

    expect(message, `no captured invitation for ${email}`).not.toBeNull();
    expect(message!.subject).toMatch(/lancers/i);
    // The two things the whole path depends on: the link points at this
    // application's invitation callback, and it carries a token hash rather
    // than a PKCE code or a link to Supabase's own /verify endpoint.
    expect(message!.body).toContain("/auth/invitation?token_hash=");
    expect(message!.body).toContain("type=invite");
    expect(message!.body).not.toContain("/verify?");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Empties the President seat for the duration of one test, and gives back the
 * function that puts it back.
 *
 * The synthetic seed appoints a President from the current committee year with
 * no end date, and `role_assignments_one_holder_per_office` refuses a second
 * concurrent holder — correctly. An earlier version of this suite treated that
 * as a reason the pending-President case could not be staged. It is not: the
 * seat can be vacated and restored, which is all this does.
 *
 * It end-dates rather than deletes, so nothing is destroyed and the row keeps
 * its identity and its history. `current_date` as the end date makes the range
 * `[start, today)` — half-open, so it excludes today and cannot overlap an
 * assignment beginning today or later.
 *
 * Safe to run here because LAN-139 serializes the database suites: one file
 * runs at a time, so no other suite can observe the gap. The restore is in a
 * `finally`, and it will refuse loudly rather than silently if the caller has
 * left an overlapping assignment behind — which is exactly what it should do.
 */
async function vacateThePresidency(): Promise<() => Promise<void>> {
  const sitting = await observer.query<{ id: string; effective_to: string | null }>(
    `select ra.id, ra.effective_to::text as effective_to
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where r.code = 'president'
        and ra.effective_from <= current_date
        and (ra.effective_to is null or ra.effective_to > current_date)`,
  );

  // Read the end date before changing it, so the restore puts back what was
  // there rather than what the seed is assumed to contain. There is exactly one
  // sitting President — `role_assignments_one_holder_per_office` guarantees it
  // — but the loop costs nothing and does not depend on that being true.
  const previous = sitting.rows.map((row) => ({ id: row.id, effectiveTo: row.effective_to }));
  expect(previous.length, "the seed should have a sitting President to vacate").toBe(1);

  for (const row of previous) {
    await observer.query(
      "update public.role_assignments set effective_to = current_date where id = $1",
      [row.id],
    );
  }

  return async () => {
    for (const row of previous) {
      await observer.query(
        "update public.role_assignments set effective_to = $2::date where id = $1",
        [row.id, row.effectiveTo],
      );
    }
  };
}

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pastDate(days: number): string {
  return futureDate(-days);
}

/**
 * The captured message for one address, from the local mail server.
 *
 * The Mailpit port is derived from the API port the stack is running on — they
 * are three apart in every slot the coordinator allocates (54321/54324 on
 * primary, 55321/55324 on overflow) — so this works on either slot and in CI
 * without reading the coordinator's registry from inside a test.
 */
async function fetchCapturedInvitation(
  address: string,
): Promise<{ subject: string; body: string } | null> {
  const apiUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const mailpit = `http://127.0.0.1:${Number(apiUrl.port) + 3}`;

  const search = await fetch(
    `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  if (!search.ok) throw new Error(`Mailpit is not answering on ${mailpit}: ${search.status}`);

  const found = (await search.json()) as { messages?: { ID: string; Subject: string }[] };
  const first = found.messages?.[0];
  if (!first) return null;

  const message = await fetch(`${mailpit}/api/v1/message/${first.ID}`);
  const detail = (await message.json()) as { HTML?: string; Text?: string };
  return { subject: first.Subject, body: `${detail.HTML ?? ""}${detail.Text ?? ""}` };
}
