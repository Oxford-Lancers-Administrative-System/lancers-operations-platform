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
    changeLoginEmail: (id, email) => real.changeLoginEmail(id, email),
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
