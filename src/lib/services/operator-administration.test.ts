// @vitest-environment node
/**
 * Role assignment, replacement and ending; deactivation and restoration; the
 * administrator email re-home — LAN-132, against the real local database.
 *
 * ## Why this suite talks to the real database
 *
 * Everything this package is judged on is a property of rows:
 *
 *   * an ended assignment is *updated*, and the outgoing row is still there
 *     afterwards with its own start date — provable only by counting rows;
 *   * a replacement's two assignments meet on one date, which the GiST
 *     exclusion constraints accept and a one-day overlap does not. A fake
 *     would agree with whatever the implementation did;
 *   * deactivating access changes `operator_accounts` and touches
 *     `role_assignments` not at all, which is `REQ-deactivate-and-reinstate`'s
 *     central claim and is a statement about two tables;
 *   * the leadership rules stand on a snapshot read inside the writing
 *     transaction, and the whole point of the last package's blocking finding
 *     was that proving the halves separately proves nothing about the join.
 *
 * The Auth server is real for the one test that needs it — moving a login to a
 * replacement address, which is what "disables the old login path" means — and
 * a recording double elsewhere, so a delivery failure can be posed on demand.
 *
 * ## What the fixtures do to the seed, and how they put it back
 *
 * Two helpers borrow seeded state and restore it in a `finally`:
 * {@link vacateThePresidency} frees the one Office seat needed to stage a
 * protected target, and {@link withOnlyOneAdministrator} suspends every other
 * operator account so that "the club's last usable administration path" is a
 * real state rather than an assertion about a mock. Both are self-contained,
 * both restore what they read rather than what the seed is assumed to hold,
 * and the database suites run one file at a time (ADR 0029) so nothing else can
 * observe the gap.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import path from "node:path";

import pg, { type Client } from "pg";

import { FINAL_ADMINISTRATION_PATH_RULE } from "@/lib/auth/administration-authority";
import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, isServiceError, resolveDatabaseUrl } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { readHolderHistory, readOperatorAuditHistory } from "./administration-audit";
import {
  ALREADY_ENDED_RULE,
  ALREADY_HOLDS_ROLE_RULE,
  assignRole,
  BACKDATING_REASON_RULE,
  deactivateOperatorAccess,
  DEACTIVATION_REASON_RULE,
  EmailRehomeDeliveryFailure,
  END_BEFORE_START_RULE,
  END_REASON_RULE,
  endRoleAssignment,
  MERGED_PERSON_RULE,
  PERSON_NOT_FOUND_RULE,
  readRoleHolders,
  REHOME_EMAIL_TAKEN_RULE,
  REHOME_NOT_AVAILABLE_RULE,
  REHOME_REASON_RULE,
  REHOME_SAME_ADDRESS_RULE,
  replaceRoleHolder,
  restoreOperatorAccess,
  startOperatorEmailRehome,
  UNKNOWN_ROLE_RULE,
  verifyOperatorEmailRehome,
  type OperatorEmailRecoveryPort,
} from "./operator-administration";
import { supabaseOperatorIdentity } from "./operator-identity";

/** This suite's own marker on every Person it creates. */
const MARKER = "LAN132Fixture:operator-administration";

/** Where the emailed verification link points. The real recovery callback. */
const CALLBACK = "http://localhost:3000/auth/recovery";

let observer: Client;
let actorPersonId: string;
let activeCommitteeYearId: string;
let activeSeasonId: string;
let today: string;

const people = new Set<string>();
const authUsers = new Set<string>();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function uniqueAddress(tag: string): string {
  return `lan132-${tag}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

function operator(roleCodes: readonly string[], personId?: string): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-0000000132aa",
    personId: personId ?? actorPersonId,
    displayName: "Administrator",
    roleCodes: [...roleCodes],
    isActive: true,
  };
}

/** Holds every seat that carries `role_management` — the strongest actor. */
const administrator = () => operator(capabilityRoleCodes("role_management"));
const generalManager = () => operator(["general_manager"]);
const itOfficer = () => operator(["it_officer"]);
const president = () => operator(["president"]);
const secretary = () => operator(["secretary"]);

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  people.add(result.rows[0].id);
  return result.rows[0].id;
}

/**
 * A role assignment written directly, so that the fixtures for a test do not
 * depend on the code the test is about.
 *
 * The three denormalised columns come from the catalogue row in the same
 * statement, which is the only way to satisfy `role_assignments_agree_with_role`
 * and `role_assignments_agree_with_single_holder_rule` — there is no trigger,
 * by LAN-128's decision.
 */
async function giveRole(
  personId: string,
  roleCode: string,
  options: { from?: string; to?: string | null; committeeYearId?: string } = {},
): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
        committee_year_id, season_id, effective_from, effective_to)
     select $1, r.id, r.scope, r.is_constitutional_office, r.is_single_holder_seat,
            case when r.scope = 'committee_year' then $3::uuid end,
            case when r.scope = 'season' then $4::uuid end,
            $5::date, $6::date
       from public.roles r
      where r.code = $2
     returning id`,
    [
      personId,
      roleCode,
      options.committeeYearId ?? activeCommitteeYearId,
      activeSeasonId,
      options.from ?? today,
      options.to ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * A real Auth login plus the `operator_accounts` row pointing at it, in the
 * state the test needs.
 *
 * The login is real because `login_email` is unique against `auth.users` as
 * well as against this table, and because the re-home tests move an address on
 * a login GoTrue owns.
 */
async function giveOperatorAccount(
  personId: string,
  options: { activated?: boolean; active?: boolean; email?: string } = {},
): Promise<{ id: string; authUserId: string; email: string }> {
  const email = options.email ?? uniqueAddress("account");
  const { authUserId } = await supabaseOperatorIdentity().createLogin(email);
  authUsers.add(authUserId);

  const activated = options.activated ?? true;
  const active = options.active ?? true;

  const result = await observer.query<{ id: string }>(
    `insert into public.operator_accounts
       (auth_user_id, person_id, login_email, invited_at, activated_at, is_active,
        disabled_at, disabled_reason)
     values ($1, $2, $3, now(), case when $4 then now() end, $5,
             case when $5 then null else now() end,
             case when $5 then null else 'fixture' end)
     returning id`,
    [authUserId, personId, email, activated, active],
  );

  return { id: result.rows[0].id, authUserId, email };
}

function futureDate(days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const pastDate = (days: number) => futureDate(-days);

/** The refusal a service threw, as `{ kind, rule }`, or a failure. */
async function refusalOf(action: Promise<unknown>): Promise<{ kind: string; rule?: string }> {
  try {
    await action;
  } catch (error) {
    if (isServiceError(error)) return { kind: error.kind, rule: error.rule };
    throw error;
  }
  throw new Error("The action was permitted, and should not have been.");
}

async function assignmentRow(id: string) {
  const result = await observer.query<{
    person_id: string;
    effective_from: string;
    effective_to: string | null;
    committee_year_id: string | null;
    season_id: string | null;
    is_single_holder_seat: boolean;
    scope: string;
  }>(
    `select person_id, effective_from::text as effective_from, effective_to::text as effective_to,
            committee_year_id, season_id, is_single_holder_seat, scope::text as scope
       from public.role_assignments where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function accountRow(id: string) {
  const result = await observer.query<{
    login_email: string | null;
    is_active: boolean;
    disabled_reason: string | null;
    activated_at: Date | null;
    email_rehome_pending_at: Date | null;
  }>(
    `select login_email, is_active, disabled_reason, activated_at, email_rehome_pending_at
       from public.operator_accounts where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Every administration action recorded against one Person, sorted. */
async function auditActions(personId: string): Promise<string[]> {
  const result = await observer.query<{ action: string }>(
    `select action from public.audit_events
      where context -> 'administration' ->> 'targetPersonId' = $1
      order by action`,
    [personId],
  );
  return result.rows.map((row) => row.action);
}

/**
 * Frees the sitting President for the length of one test, and puts the seat
 * back exactly as it was.
 *
 * `role_assignments_one_holder_per_office` refuses a second concurrent holder,
 * which is an obstacle rather than a wall — and staging a protected target for
 * real is worth more than asserting that two halves would compose.
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
  const previous = sitting.rows.map((row) => ({ id: row.id, effectiveTo: row.effective_to }));
  expect(previous.length, "the seed should have a sitting President to vacate").toBe(1);

  for (const row of previous) {
    await observer.query(
      "update public.role_assignments set effective_to = current_date where id = $1",
      [row.id],
    );
  }

  return async () => {
    // Anything this suite put in the vacated seat goes first. Restoring the
    // seeded assignment while a fixture still occupies the same period would
    // be refused by `role_assignments_one_holder_per_office` — and the seed
    // would then stay vacated for every later test in the file, which is
    // exactly how the first version of this suite failed.
    await observer.query(
      `delete from public.role_assignments ra
        using public.roles r
        where r.id = ra.role_id
          and r.code = 'president'
          and ra.person_id = any($1::uuid[])`,
      [[...people]],
    );

    for (const row of previous) {
      await observer.query(
        "update public.role_assignments set effective_to = $2::date where id = $1",
        [row.id, row.effectiveTo],
      );
    }
  };
}

/**
 * Makes one operator account the club's only usable administration path.
 *
 * Every other active account is suspended for the length of the callback and
 * restored afterwards — the ids are read first, so the restore puts back what
 * was there. This is the only honest way to reach
 * `REQ-final-admin-protection`'s last line: the rule is about the club as a
 * whole, and a snapshot that still contains the seeded review operator can
 * never trigger it.
 */
async function withOnlyOneAdministrator<T>(
  keepActive: readonly string[],
  run: () => Promise<T>,
): Promise<T> {
  const others = await observer.query<{ id: string }>(
    "select id from public.operator_accounts where is_active and id <> all($1::uuid[])",
    [[...keepActive]],
  );

  await observer.query(
    "update public.operator_accounts set is_active = false, disabled_at = now() where id = any($1::uuid[])",
    [others.rows.map((row) => row.id)],
  );

  try {
    return await run();
  } finally {
    await observer.query(
      `update public.operator_accounts
          set is_active = true, disabled_at = null, disabled_reason = null
        where id = any($1::uuid[])`,
      [others.rows.map((row) => row.id)],
    );
  }
}

/**
 * Frees the General Manager seat for the length of one block.
 *
 * Separate from {@link vacateThePresidency} because the two are constrained by
 * different rules — the Office exclusion and the single-holder exclusion — and
 * because the seat is *never* administered through the application: nobody may
 * assign, replace, end or deactivate it, so the fixture has to write the rows
 * the guard refuses to.
 *
 * Anything this suite put in the seat is removed before the seeded assignment
 * is restored, and the seeded row is never re-pointed at a fixture Person: the
 * cleanup in `afterAll` deletes assignments by `person_id`, so a borrowed
 * seeded row would be deleted with them and the seed would be short a General
 * Manager for every later run.
 */
async function vacateTheGeneralManagership(): Promise<() => Promise<void>> {
  const sitting = await observer.query<{ id: string; effective_to: string | null }>(
    `select ra.id, ra.effective_to::text as effective_to
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where r.code = 'general_manager'
        and ra.effective_from <= current_date
        and (ra.effective_to is null or ra.effective_to > current_date)`,
  );
  const previous = sitting.rows.map((row) => ({ id: row.id, effectiveTo: row.effective_to }));
  expect(previous.length, "the seed should have a sitting General Manager").toBe(1);

  for (const row of previous) {
    await observer.query(
      "update public.role_assignments set effective_to = $2::date where id = $1",
      [row.id, pastDate(1)],
    );
  }

  return async () => {
    await observer.query(
      `delete from public.role_assignments ra
        using public.roles r
        where r.id = ra.role_id
          and r.code = 'general_manager'
          and ra.person_id = any($1::uuid[])`,
      [[...people]],
    );
    for (const row of previous) {
      await observer.query(
        "update public.role_assignments set effective_to = $2::date where id = $1",
        [row.id, row.effectiveTo],
      );
    }
  };
}

/** A recovery port whose send is under this suite's control. */
function recovery(options: { send?: "record" | "fail"; failure?: string } = {}) {
  const real = supabaseOperatorIdentity();
  const sends: { email: string; redirectTo: string }[] = [];
  const moves: { authUserId: string; email: string }[] = [];

  const port: OperatorEmailRecoveryPort = {
    async changeLoginEmail(authUserId, email) {
      moves.push({ authUserId, email });
      await real.changeLoginEmail(authUserId, email);
    },
    async sendVerification(email, redirectTo) {
      sends.push({ email, redirectTo });
      if (options.send === "fail") {
        throw new EmailRehomeDeliveryFailure(
          options.failure ?? "The mail transport refused the message.",
        );
      }
    },
  };

  return { port, sends, moves };
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  observer = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await observer.connect();

  const dates = await observer.query<{ today: string }>("select current_date::text as today");
  today = dates.rows[0].today;

  const year = await observer.query<{ id: string }>(
    `select id from public.committee_years
      where starts_on <= current_date and (ends_on is null or ends_on > current_date)`,
  );
  activeCommitteeYearId = year.rows[0].id;

  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status in ('open', 'active')",
  );
  activeSeasonId = season.rows[0].id;

  actorPersonId = await insertPerson("actor");
});

afterAll(async () => {
  const ids = [...people];
  if (ids.length > 0) {
    await observer.query(
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
// Assignment
// ---------------------------------------------------------------------------

describe("A — assigning a role", () => {
  it("inherits the active committee year and starts today, with nothing asked", async () => {
    const personId = await insertPerson("assign-happy");
    const result = await assignRole({
      operator: administrator(),
      personId,
      roleCode: "kit_manager",
    });

    expect(result.effectiveFrom).toBe(today);
    expect(result.scheduled).toBe(false);
    expect(result.operatingYear.scope).toBe("committee_year");
    expect(result.operatingYear.id).toBe(activeCommitteeYearId);

    const row = await assignmentRow(result.roleAssignmentId);
    expect(row?.committee_year_id).toBe(activeCommitteeYearId);
    expect(row?.season_id).toBeNull();
    expect(row?.effective_to).toBeNull();
    expect(await auditActions(personId)).toEqual(["administration.role.assigned"]);
  });

  it("hangs a coaching seat off the season instead, because the role says so", async () => {
    const personId = await insertPerson("assign-coach");
    const result = await assignRole({
      operator: administrator(),
      personId,
      roleCode: "linebackers_coach",
    });

    expect(result.operatingYear.scope).toBe("season");
    const row = await assignmentRow(result.roleAssignmentId);
    expect(row?.season_id).toBe(activeSeasonId);
    expect(row?.committee_year_id).toBeNull();
  });

  it("copies the single-holder flag from the catalogue rather than defaulting it", async () => {
    // There is no trigger — LAN-128 decided that deliberately — so a value
    // taken from anywhere but the catalogue row is refused by the composite
    // foreign key. This is the assertion that the right value is read.
    const restore = await vacateThePresidency();
    try {
      const personId = await insertPerson("assign-office");
      const result = await assignRole({
        operator: generalManager(),
        personId,
        roleCode: "president",
      });
      const row = await assignmentRow(result.roleAssignmentId);
      expect(row?.is_single_holder_seat).toBe(false);
      expect(row?.scope).toBe("committee_year");
    } finally {
      await restore();
    }
  });

  it("schedules a future start without asking for a reason", async () => {
    const personId = await insertPerson("assign-future");
    const result = await assignRole({
      operator: administrator(),
      personId,
      roleCode: "kit_manager",
      effectiveFrom: futureDate(30),
    });

    expect(result.scheduled).toBe(true);
    expect((await assignmentRow(result.roleAssignmentId))?.effective_from).toBe(futureDate(30));

    const events = await observer.query<{ to_state: string | null }>(
      `select to_state from public.audit_events
        where context -> 'administration' ->> 'roleAssignmentId' = $1`,
      [result.roleAssignmentId],
    );
    expect(events.rows[0].to_state).toBe("scheduled");

    // And it is in Holder history, which is the role's own projection.
    const kitManagerId = await roleId("kit_manager");
    const history = await readHolderHistory(administrator(), kitManagerId);
    expect(history.some((entry) => entry.role?.assignmentId === result.roleAssignmentId)).toBe(
      true,
    );
  });

  it("refuses a backdated start with no reason, and audits one that has a reason", async () => {
    const personId = await insertPerson("assign-backdated");

    expect(
      await refusalOf(
        assignRole({
          operator: administrator(),
          personId,
          roleCode: "kit_manager",
          effectiveFrom: pastDate(20),
        }),
      ),
    ).toEqual({ kind: "constraint_violated", rule: BACKDATING_REASON_RULE });

    const result = await assignRole({
      operator: administrator(),
      personId,
      roleCode: "kit_manager",
      effectiveFrom: pastDate(20),
      reason: "The AGM minutes record the appointment from that date.",
    });

    const events = await observer.query<{ backdated: boolean; reason: string | null }>(
      `select (context -> 'administration' ->> 'backdated')::boolean as backdated, reason
         from public.audit_events
        where context -> 'administration' ->> 'roleAssignmentId' = $1`,
      [result.roleAssignmentId],
    );
    expect(events.rows[0].backdated).toBe(true);
    expect(events.rows[0].reason).toContain("AGM minutes");
  });

  it("refuses a role code the catalogue does not have, whitespace included", async () => {
    const personId = await insertPerson("assign-unknown");

    for (const roleCode of ["kit-manager", " kit_manager ", "KIT_MANAGER", ""]) {
      expect(
        await refusalOf(assignRole({ operator: administrator(), personId, roleCode })),
        roleCode,
      ).toEqual({ kind: "not_found", rule: UNKNOWN_ROLE_RULE });
    }

    const rows = await observer.query(
      "select 1 from public.role_assignments where person_id = $1",
      [personId],
    );
    expect(rows.rowCount).toBe(0);
  });

  it("refuses a Person who is gone or merged away", async () => {
    expect(
      await refusalOf(
        assignRole({
          operator: administrator(),
          personId: "00000000-0000-4000-8000-000000000132",
          roleCode: "kit_manager",
        }),
      ),
    ).toEqual({ kind: "not_found", rule: PERSON_NOT_FOUND_RULE });

    const survivor = await insertPerson("merge-survivor");
    const merged = await insertPerson("merge-source");
    await observer.query(
      `update public.people
          set merged_into_person_id = $2,
              merged_at = now(),
              merged_by_person_id = $3,
              merge_reason = 'Fixture: two records for one person'
        where id = $1`,
      [merged, survivor, actorPersonId],
    );

    expect(
      await refusalOf(
        assignRole({ operator: administrator(), personId: merged, roleCode: "kit_manager" }),
      ),
    ).toEqual({ kind: "conflict", rule: MERGED_PERSON_RULE });
  });

  it("refuses giving one person the same seat twice over the same period", async () => {
    const personId = await insertPerson("assign-duplicate");
    await assignRole({ operator: administrator(), personId, roleCode: "social_secretary" });

    expect(
      await refusalOf(
        assignRole({ operator: administrator(), personId, roleCode: "social_secretary" }),
      ),
    ).toEqual({ kind: "conflict", rule: ALREADY_HOLDS_ROLE_RULE });
  });
});

// ---------------------------------------------------------------------------
// The guards
// ---------------------------------------------------------------------------

describe("A/B — the guard, on every write", () => {
  it("refuses a seat that holds no administration capability at all", async () => {
    const personId = await insertPerson("guard-secretary");
    expect(
      await refusalOf(assignRole({ operator: secretary(), personId, roleCode: "kit_manager" })),
    ).toMatchObject({ kind: "not_permitted" });
  });

  it("refuses an unauthenticated caller before anything else", async () => {
    const personId = await insertPerson("guard-anonymous");
    expect(
      await refusalOf(assignRole({ operator: null, personId, roleCode: "kit_manager" })),
    ).toMatchObject({ kind: "not_permitted", rule: "operator_required" });
  });

  it("refuses everybody the General Manager seat, including the strongest actor", async () => {
    const personId = await insertPerson("guard-gm");
    for (const actor of [administrator(), generalManager(), itOfficer(), president()]) {
      expect(
        await refusalOf(assignRole({ operator: actor, personId, roleCode: "general_manager" })),
      ).toMatchObject({ kind: "not_permitted", rule: "administration_leadership_target" });
    }
  });

  it("lets only the General Manager install a President", async () => {
    const restore = await vacateThePresidency();
    try {
      const refusedTo = await insertPerson("guard-president-refused");
      for (const actor of [itOfficer(), president()]) {
        expect(
          await refusalOf(
            assignRole({ operator: actor, personId: refusedTo, roleCode: "president" }),
          ),
        ).toMatchObject({ kind: "not_permitted", rule: "administration_leadership_target" });
      }

      const permittedTo = await insertPerson("guard-president-permitted");
      const result = await assignRole({
        operator: generalManager(),
        personId: permittedTo,
        roleCode: "president",
      });
      expect(result.roleCode).toBe("president");
    } finally {
      await restore();
    }
  });

  /**
   * Caller check 4, staged whole.
   *
   * The target's protection comes from a seat that has **not started yet**. If
   * `readAdministrationSubject` were called without `includeScheduled: true`,
   * the snapshot would be empty, the leadership rule would find nothing to
   * protect, and every one of these actions would be permitted. That is the
   * exact defect that was the previous package's blocking finding, and it is
   * the join — not either half — that is asserted here.
   */
  it("sees a seat that begins at a future handover, on every action", async () => {
    const restore = await vacateThePresidency();
    try {
      const presidentElect = await insertPerson("president-elect");
      await giveRole(presidentElect, "president", { from: futureDate(45) });
      await giveRole(presidentElect, "kit_manager", { from: pastDate(3) });
      const account = await giveOperatorAccount(presidentElect);

      const ordinary = (
        await observer.query<{ id: string }>(
          `select ra.id from public.role_assignments ra
             join public.roles r on r.id = ra.role_id
            where ra.person_id = $1 and r.code = 'kit_manager'`,
          [presidentElect],
        )
      ).rows[0].id;

      // An IT Officer holds `role_management` and would be permitted every one
      // of these against an unprotected target.
      expect(
        await refusalOf(
          assignRole({
            operator: itOfficer(),
            personId: presidentElect,
            roleCode: "social_secretary",
          }),
        ),
      ).toMatchObject({ rule: "administration_leadership_target" });

      expect(
        await refusalOf(
          endRoleAssignment({
            operator: itOfficer(),
            roleAssignmentId: ordinary,
            reason: "Stepping back.",
          }),
        ),
      ).toMatchObject({ rule: "administration_leadership_target" });

      expect(
        await refusalOf(
          deactivateOperatorAccess({
            operator: itOfficer(),
            operatorAccountId: account.id,
            reason: "Left the club.",
          }),
        ),
      ).toMatchObject({ rule: "administration_leadership_target" });

      // And the General Manager, who may administer the President, is not
      // refused — so the refusals above are the leadership rule rather than a
      // blanket denial.
      const permitted = await endRoleAssignment({
        operator: generalManager(),
        roleAssignmentId: ordinary,
        reason: "Handing the kit over.",
      });
      expect(permitted.effectiveTo).toBe(today);
    } finally {
      await restore();
    }
  });

  it("refuses an operator acting on their own account", async () => {
    const selfPersonId = await insertPerson("self-action");
    const account = await giveOperatorAccount(selfPersonId);
    const ownAssignment = await giveRole(selfPersonId, "kit_manager", { from: pastDate(3) });
    const self = operator(["it_officer"], selfPersonId);

    expect(
      await refusalOf(
        endRoleAssignment({
          operator: self,
          roleAssignmentId: ownAssignment,
          reason: "Standing down.",
        }),
      ),
    ).toMatchObject({ rule: "administration_self_action_forbidden" });

    expect(
      await refusalOf(
        deactivateOperatorAccess({
          operator: self,
          operatorAccountId: account.id,
          reason: "Going away.",
        }),
      ),
    ).toMatchObject({ rule: "administration_self_action_forbidden" });

    expect(
      await refusalOf(
        startOperatorEmailRehome({
          operator: self,
          operatorAccountId: account.id,
          email: uniqueAddress("self-rehome"),
          reason: "New address.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        }),
      ),
    ).toMatchObject({ rule: "administration_self_action_forbidden" });
  });
});

// ---------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------

describe("B — ending a role assignment", () => {
  it("end-dates the row, keeps it, and records the reason", async () => {
    const personId = await insertPerson("end-happy");
    const assignmentId = await giveRole(personId, "kit_manager", { from: pastDate(10) });

    const result = await endRoleAssignment({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      reason: "Moved out of Oxford.",
    });

    expect(result.effectiveTo).toBe(today);
    expect(result.scheduled).toBe(false);

    const row = await assignmentRow(assignmentId);
    expect(row, "the assignment must still exist").not.toBeNull();
    expect(row?.effective_from).toBe(pastDate(10));
    expect(row?.effective_to).toBe(today);

    const history = await readOperatorAuditHistory(administrator(), personId);
    expect(history.map((entry) => entry.action)).toContain("administration.role.ended");
    expect(history[0].reason).toBe("Moved out of Oxford.");
  });

  it("schedules an ending still to come, and the holder still holds it today", async () => {
    const personId = await insertPerson("end-scheduled");
    const assignmentId = await giveRole(personId, "kit_manager");

    const result = await endRoleAssignment({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      effectiveTo: futureDate(60),
      reason: "Leaving at the end of the season.",
    });

    expect(result.scheduled).toBe(true);
    const holders = await readRoleHolders(administrator(), "kit_manager");
    const mine = holders.holders.find((holder) => holder.personId === personId);
    expect(mine?.endScheduled).toBe(true);
    expect(mine?.ended).toBe(false);
  });

  it("requires a reason", async () => {
    const personId = await insertPerson("end-no-reason");
    const assignmentId = await giveRole(personId, "kit_manager");

    for (const reason of ["", "   "]) {
      expect(
        await refusalOf(
          endRoleAssignment({ operator: administrator(), roleAssignmentId: assignmentId, reason }),
        ),
      ).toEqual({ kind: "constraint_violated", rule: END_REASON_RULE });
    }
    expect((await assignmentRow(assignmentId))?.effective_to).toBeNull();
  });

  it("refuses to re-end an assignment that already has an end date", async () => {
    const personId = await insertPerson("end-twice");
    const assignmentId = await giveRole(personId, "kit_manager", {
      from: pastDate(20),
      to: pastDate(5),
    });

    expect(
      await refusalOf(
        endRoleAssignment({
          operator: administrator(),
          roleAssignmentId: assignmentId,
          reason: "Trying again.",
        }),
      ),
    ).toEqual({ kind: "invalid_transition", rule: ALREADY_ENDED_RULE });

    expect((await assignmentRow(assignmentId))?.effective_to).toBe(pastDate(5));
  });

  it("refuses an end date on or before the day the assignment started", async () => {
    const personId = await insertPerson("end-same-day");
    const assignmentId = await giveRole(personId, "kit_manager", { from: today });

    expect(
      await refusalOf(
        endRoleAssignment({
          operator: administrator(),
          roleAssignmentId: assignmentId,
          reason: "Appointed by mistake.",
        }),
      ),
    ).toEqual({ kind: "constraint_violated", rule: END_BEFORE_START_RULE });
  });

  it("refuses to leave the club with nobody able to administer it", async () => {
    const personId = await insertPerson("last-administrator");
    const assignmentId = await giveRole(personId, "it_officer", { from: pastDate(3) });
    const account = await giveOperatorAccount(personId);

    await withOnlyOneAdministrator([account.id], async () => {
      expect(
        await refusalOf(
          endRoleAssignment({
            operator: administrator(),
            roleAssignmentId: assignmentId,
            reason: "Handing IT over.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });

      expect(
        await refusalOf(
          deactivateOperatorAccess({
            operator: administrator(),
            operatorAccountId: account.id,
            reason: "Suspended.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });
    });

    expect((await assignmentRow(assignmentId))?.effective_to).toBeNull();
    expect((await accountRow(account.id))?.is_active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Replacement
// ---------------------------------------------------------------------------

describe("C — replacing the holder of a role", () => {
  it("ends one assignment and creates the successor's, meeting on the same day", async () => {
    const outgoing = await insertPerson("replace-outgoing");
    const successor = await insertPerson("replace-successor");
    const assignmentId = await giveRole(outgoing, "kit_manager", { from: pastDate(30) });

    const result = await replaceRoleHolder({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      successorPersonId: successor,
      reason: "Handover agreed at the committee meeting.",
    });

    const ended = await assignmentRow(result.endedAssignmentId);
    const created = await assignmentRow(result.createdAssignmentId);

    expect(ended?.effective_from).toBe(pastDate(30));
    expect(ended?.effective_to).toBe(today);
    expect(created?.person_id).toBe(successor);
    expect(created?.effective_from).toBe(today);
    expect(created?.effective_to).toBeNull();
  });

  it("writes two correlated events and no third one", async () => {
    const outgoing = await insertPerson("replace-events-outgoing");
    const successor = await insertPerson("replace-events-successor");
    const assignmentId = await giveRole(outgoing, "social_secretary", { from: pastDate(5) });

    const result = await replaceRoleHolder({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      successorPersonId: successor,
      reason: "Swapping the social secretaries over.",
    });

    const events = await observer.query<{ action: string; correlation_id: string }>(
      `select action, context -> 'administration' ->> 'correlationId' as correlation_id
         from public.audit_events
        where context -> 'administration' ->> 'correlationId' = $1
        order by action`,
      [result.correlationId],
    );

    expect(events.rows.map((row) => row.action)).toEqual([
      "administration.role.assigned",
      "administration.role.ended",
    ]);
    expect(new Set(events.rows.map((row) => row.correlation_id)).size).toBe(1);
  });

  it("hands over a single-holder seat without a day of overlap", async () => {
    // `role_assignments_one_holder_per_single_holder_seat` is a GiST exclusion
    // over a half-open range, so `effective_to = D` and `effective_from = D`
    // are disjoint and a one-day overlap is not. General Manager is the only
    // seat carrying that rule, and nobody may administer it through the
    // guard — so the replacement is staged as rows and the constraint is asked
    // directly, which is what is actually under test here.
    const outgoing = await insertPerson("gm-outgoing");
    const successor = await insertPerson("gm-successor");
    const restore = await vacateTheGeneralManagership();

    try {
      const first = await giveRole(outgoing, "general_manager", {
        from: pastDate(1),
        to: futureDate(10),
      });
      expect((await assignmentRow(first))?.is_single_holder_seat).toBe(true);

      // Meeting exactly is accepted.
      const second = await giveRole(successor, "general_manager", { from: futureDate(10) });
      expect(await assignmentRow(second)).not.toBeNull();

      // One day of overlap is not.
      await expect(giveRole(successor, "general_manager", { from: futureDate(9) })).rejects.toThrow(
        /one_holder_per_single_holder_seat/,
      );
    } finally {
      await restore();
    }
  });

  it("requires a reason, and refuses replacing somebody with themselves", async () => {
    const outgoing = await insertPerson("replace-reason");
    const assignmentId = await giveRole(outgoing, "kit_manager", { from: pastDate(3) });
    const successor = await insertPerson("replace-reason-successor");

    expect(
      await refusalOf(
        replaceRoleHolder({
          operator: administrator(),
          roleAssignmentId: assignmentId,
          successorPersonId: successor,
          reason: "  ",
        }),
      ),
    ).toEqual({ kind: "constraint_violated", rule: END_REASON_RULE });

    expect(
      await refusalOf(
        replaceRoleHolder({
          operator: administrator(),
          roleAssignmentId: assignmentId,
          successorPersonId: outgoing,
          reason: "No change at all.",
        }),
      ).then((refusal) => refusal.rule),
    ).toBe(ALREADY_HOLDS_ROLE_RULE);
  });

  it("refuses when the successor cannot sign in and the outgoing holder was the last route in", async () => {
    // `AdministrationPathEffect` models this rather than leaving the caller to
    // take it apart: a name now sits in the seat, and the club still has
    // nobody who can administer it, because the successor's invitation has
    // never been taken up.
    const outgoing = await insertPerson("replace-last-outgoing");
    const assignmentId = await giveRole(outgoing, "it_officer", { from: pastDate(3) });
    const account = await giveOperatorAccount(outgoing);

    const successor = await insertPerson("replace-last-successor");
    await giveOperatorAccount(successor, { activated: false });

    await withOnlyOneAdministrator([account.id], async () => {
      expect(
        await refusalOf(
          replaceRoleHolder({
            operator: administrator(),
            roleAssignmentId: assignmentId,
            successorPersonId: successor,
            reason: "Handing IT over to the new officer.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });
    });

    expect((await assignmentRow(assignmentId))?.effective_to).toBeNull();
  });

  it("permits the same replacement once the successor can actually sign in", async () => {
    const outgoing = await insertPerson("replace-usable-outgoing");
    const assignmentId = await giveRole(outgoing, "it_officer", { from: pastDate(3) });
    const account = await giveOperatorAccount(outgoing);

    const successor = await insertPerson("replace-usable-successor");
    const successorAccount = await giveOperatorAccount(successor, { activated: true });

    // The successor's account stays active on purpose: what is under test is
    // that a replacement whose successor really can sign in survives the same
    // rule that refused the one before it.
    await withOnlyOneAdministrator([account.id, successorAccount.id], async () => {
      const result = await replaceRoleHolder({
        operator: administrator(),
        roleAssignmentId: assignmentId,
        successorPersonId: successor,
        reason: "Handing IT over to the new officer.",
      });
      expect(result.successorPersonId).toBe(successor);
    });
  });

  it("asks the assignment question about the successor as well", async () => {
    const restore = await vacateThePresidency();
    try {
      const outgoing = await insertPerson("replace-protected-outgoing");
      const assignmentId = await giveRole(outgoing, "kit_manager", { from: pastDate(3) });
      const successor = await insertPerson("replace-protected-successor");
      await giveRole(successor, "president");

      // The outgoing holder is ordinary; the *successor* is the President. An
      // IT Officer may replace an ordinary Kit Manager and may not put the
      // President into a seat.
      expect(
        await refusalOf(
          replaceRoleHolder({
            operator: itOfficer(),
            roleAssignmentId: assignmentId,
            successorPersonId: successor,
            reason: "Giving the President the kit as well.",
          }),
        ),
      ).toMatchObject({ rule: "administration_leadership_target" });
    } finally {
      await restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Deactivate and restore
// ---------------------------------------------------------------------------

describe("D — deactivating and restoring operator access", () => {
  it("stops the sign-in, records the reason, and ends no role", async () => {
    const personId = await insertPerson("deactivate-happy");
    const assignmentId = await giveRole(personId, "kit_manager");
    const account = await giveOperatorAccount(personId);

    const before = await observer.query("select id, effective_to from public.role_assignments");

    const result = await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Suspended pending a conversation.",
    });

    expect(result.state).toBe("deactivated");

    const row = await accountRow(account.id);
    expect(row?.is_active).toBe(false);
    expect(row?.disabled_reason).toBe("Suspended pending a conversation.");

    // The central claim of REQ-deactivate-and-reinstate, asserted over the
    // whole table rather than over the one row anybody would think to check.
    const after = await observer.query("select id, effective_to from public.role_assignments");
    expect(after.rows).toEqual(before.rows);
    expect((await assignmentRow(assignmentId))?.effective_to).toBeNull();
  });

  it("leaves role detail showing the holder, with access deactivated and no vacancy", async () => {
    const personId = await insertPerson("deactivate-role-detail");
    await giveRole(personId, "social_secretary");
    const account = await giveOperatorAccount(personId);

    await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Away for a term.",
    });

    const holders = await readRoleHolders(administrator(), "social_secretary");
    const mine = holders.holders.find((holder) => holder.personId === personId);
    expect(mine).toBeDefined();
    expect(mine?.accessDeactivated).toBe(true);
    expect(mine?.operatorState).toBe("deactivated");
    expect(holders.vacant).toBe(false);
  });

  it("requires a reason, and refuses a second deactivation", async () => {
    const personId = await insertPerson("deactivate-rules");
    const account = await giveOperatorAccount(personId);

    expect(
      await refusalOf(
        deactivateOperatorAccess({
          operator: administrator(),
          operatorAccountId: account.id,
          reason: "   ",
        }),
      ),
    ).toEqual({ kind: "constraint_violated", rule: DEACTIVATION_REASON_RULE });

    await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Left the club.",
    });

    expect(
      await refusalOf(
        deactivateOperatorAccess({
          operator: administrator(),
          operatorAccountId: account.id,
          reason: "Left the club again.",
        }),
      ).then((refusal) => refusal.kind),
    ).toBe("invalid_transition");
  });

  it("restores only what is still effective — a role that ended stays ended", async () => {
    const personId = await insertPerson("restore-effective");
    const kept = await giveRole(personId, "kit_manager", { from: pastDate(3) });
    const lost = await giveRole(personId, "social_secretary", { from: pastDate(3) });
    const account = await giveOperatorAccount(personId);

    await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Suspended.",
    });

    // The seat ends while the account is deactivated. Restoration must not
    // bring it back — capabilities are read from `role_assignments` on every
    // request, so there is nothing to restore them *from*.
    await observer.query(
      "update public.role_assignments set effective_to = current_date where id = $1",
      [lost],
    );

    const restored = await restoreOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
    });
    expect(restored.state).toBe("active");

    const effective = await observer.query<{ code: string }>(
      `select r.code from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
        where ra.person_id = $1
          and ra.effective_from <= current_date
          and (ra.effective_to is null or ra.effective_to > current_date)`,
      [personId],
    );
    expect(effective.rows.map((row) => row.code)).toEqual(["kit_manager"]);
    expect((await assignmentRow(kept))?.effective_to).toBeNull();
  });

  it("keeps the deactivation date after restoration, and records both events", async () => {
    const personId = await insertPerson("restore-history");
    const account = await giveOperatorAccount(personId);

    await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Suspended.",
    });
    await restoreOperatorAccess({ operator: administrator(), operatorAccountId: account.id });

    const row = await observer.query<{ disabled_at: Date | null; is_active: boolean }>(
      "select disabled_at, is_active from public.operator_accounts where id = $1",
      [account.id],
    );
    expect(row.rows[0].is_active).toBe(true);
    expect(row.rows[0].disabled_at).not.toBeNull();

    expect(await auditActions(personId)).toEqual([
      "administration.operator.deactivated",
      "administration.operator.restored",
    ]);
  });

  it("refuses restoring an account that is not deactivated", async () => {
    const personId = await insertPerson("restore-noop");
    const account = await giveOperatorAccount(personId);

    expect(
      await refusalOf(
        restoreOperatorAccess({ operator: administrator(), operatorAccountId: account.id }),
      ).then((refusal) => refusal.kind),
    ).toBe("invalid_transition");
  });

  it("protects restoration exactly as it protects deactivation", async () => {
    const restore = await vacateThePresidency();
    try {
      const personId = await insertPerson("restore-president");
      await giveRole(personId, "president");
      const account = await giveOperatorAccount(personId);

      await deactivateOperatorAccess({
        operator: generalManager(),
        operatorAccountId: account.id,
        reason: "Stood down by the General Manager.",
      });

      // If restoration were classified as recovery, the IT Officer could undo
      // what only the General Manager was allowed to do.
      expect(
        await refusalOf(
          restoreOperatorAccess({ operator: itOfficer(), operatorAccountId: account.id }),
        ),
      ).toMatchObject({ rule: "administration_leadership_target" });

      const done = await restoreOperatorAccess({
        operator: generalManager(),
        operatorAccountId: account.id,
      });
      expect(done.state).toBe("active");
    } finally {
      await restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Email re-home
// ---------------------------------------------------------------------------

describe("E — the administrator email re-home", () => {
  it("moves the login, holds the account pending, and sends the link to the new address", async () => {
    const personId = await insertPerson("rehome-happy");
    const account = await giveOperatorAccount(personId);
    const replacement = uniqueAddress("rehome-new");
    const port = recovery();

    const result = await startOperatorEmailRehome({
      operator: administrator(),
      operatorAccountId: account.id,
      email: replacement,
      reason: "Their university mailbox was closed when they graduated.",
      callbackUrl: CALLBACK,
      identity: port.port,
    });

    expect(result.state).toBe("email_change_pending");
    expect(result.delivered).toBe(true);
    expect(result.previousLoginEmail).toBe(account.email);
    expect(port.sends).toEqual([{ email: replacement, redirectTo: CALLBACK }]);

    const row = await accountRow(account.id);
    expect(row?.login_email).toBe(replacement);
    expect(row?.email_rehome_pending_at).not.toBeNull();
    // Not deactivated: this is a different state with a different reason.
    expect(row?.is_active).toBe(true);

    const history = await readOperatorAuditHistory(administrator(), personId);
    expect(history[0].action).toBe("administration.operator.email_rehome_started");
    expect(history[0].reason).toContain("university mailbox");
    expect(history[0].detail).toMatchObject({
      previousLoginEmail: account.email,
      loginEmail: replacement,
    });
  });

  it("really moves the address on the Auth login, so the old one signs in nowhere", async () => {
    // The measurement this whole flow rests on, made against the real local
    // GoTrue rather than asserted: after the move the old address is not a
    // login at all. The *new* address would still accept the old password —
    // `email_confirm: false` does not un-confirm, and this stack has
    // `enable_confirmations = false` — which is why `resolveOperatorAccess()`
    // refuses a pending account, proved in `src/lib/auth/operator.test.ts`.
    const personId = await insertPerson("rehome-real-auth");
    const account = await giveOperatorAccount(personId);
    const replacement = uniqueAddress("rehome-real-new");

    await startOperatorEmailRehome({
      operator: administrator(),
      operatorAccountId: account.id,
      email: replacement,
      reason: "Mailbox compromised.",
      callbackUrl: CALLBACK,
      identity: {
        changeLoginEmail: supabaseOperatorIdentity().changeLoginEmail,
        sendVerification: async () => undefined,
      },
    });

    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(account.authUserId);
    expect(data?.user?.email).toBe(replacement);
  });

  it("requires a reason, an address, and a callback to point the link at", async () => {
    const personId = await insertPerson("rehome-rules");
    const account = await giveOperatorAccount(personId);
    const base = {
      operator: administrator(),
      operatorAccountId: account.id,
      email: uniqueAddress("rehome-rules-new"),
      reason: "Lost the mailbox.",
      callbackUrl: CALLBACK,
      identity: recovery().port,
    };

    expect(await refusalOf(startOperatorEmailRehome({ ...base, reason: " " }))).toEqual({
      kind: "constraint_violated",
      rule: REHOME_REASON_RULE,
    });
    expect(await refusalOf(startOperatorEmailRehome({ ...base, callbackUrl: "" }))).toMatchObject({
      rule: "administration_callback_url_required",
    });
    expect(
      await refusalOf(startOperatorEmailRehome({ ...base, email: "not-an-address" })),
    ).toMatchObject({ rule: "administration_email_invalid" });

    expect((await accountRow(account.id))?.login_email).toBe(account.email);
  });

  it("refuses an address another operator already signs in with, and the current one", async () => {
    const personId = await insertPerson("rehome-taken");
    const account = await giveOperatorAccount(personId);
    const otherPersonId = await insertPerson("rehome-taken-other");
    const other = await giveOperatorAccount(otherPersonId);

    expect(
      await refusalOf(
        startOperatorEmailRehome({
          operator: administrator(),
          operatorAccountId: account.id,
          email: other.email,
          reason: "Lost the mailbox.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        }),
      ),
    ).toEqual({ kind: "conflict", rule: REHOME_EMAIL_TAKEN_RULE });

    expect(
      await refusalOf(
        startOperatorEmailRehome({
          operator: administrator(),
          operatorAccountId: account.id,
          email: account.email.toUpperCase(),
          reason: "Lost the mailbox.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        }),
      ),
    ).toEqual({ kind: "invalid_transition", rule: REHOME_SAME_ADDRESS_RULE });

    expect((await accountRow(account.id))?.login_email).toBe(account.email);
  });

  it("records a delivery failure, keeps the account pending, and retries on the same account", async () => {
    const personId = await insertPerson("rehome-retry");
    const account = await giveOperatorAccount(personId);
    const wrong = uniqueAddress("rehome-wrong");
    const right = uniqueAddress("rehome-right");

    const failing = recovery({ send: "fail", failure: "550 mailbox unavailable" });
    const first = await startOperatorEmailRehome({
      operator: administrator(),
      operatorAccountId: account.id,
      email: wrong,
      reason: "Mailbox lost.",
      callbackUrl: CALLBACK,
      identity: failing.port,
    });

    expect(first.delivered).toBe(false);
    expect(first.deliveryFailureReason).toContain("550");
    expect(first.state).toBe("email_change_pending");
    expect(first.retry).toBe(false);

    const second = await startOperatorEmailRehome({
      operator: administrator(),
      operatorAccountId: account.id,
      email: right,
      reason: "Correcting the replacement address.",
      callbackUrl: CALLBACK,
      identity: recovery().port,
    });

    expect(second.retry).toBe(true);
    expect(second.delivered).toBe(true);
    expect(second.previousLoginEmail).toBe(wrong);
    expect((await accountRow(account.id))?.login_email).toBe(right);

    expect(await auditActions(personId)).toEqual([
      "administration.operator.email_rehome_failed",
      "administration.operator.email_rehome_retried",
      "administration.operator.email_rehome_started",
    ]);
  });

  it("refuses an account that never took up its invitation, and one that is deactivated", async () => {
    const pendingPersonId = await insertPerson("rehome-pending");
    const pending = await giveOperatorAccount(pendingPersonId, { activated: false });

    expect(
      await refusalOf(
        startOperatorEmailRehome({
          operator: administrator(),
          operatorAccountId: pending.id,
          email: uniqueAddress("rehome-pending-new"),
          reason: "Wrong address.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        }),
      ),
    ).toEqual({ kind: "invalid_transition", rule: REHOME_NOT_AVAILABLE_RULE });

    const deactivatedPersonId = await insertPerson("rehome-deactivated");
    const deactivated = await giveOperatorAccount(deactivatedPersonId, { active: false });

    expect(
      await refusalOf(
        startOperatorEmailRehome({
          operator: administrator(),
          operatorAccountId: deactivated.id,
          email: uniqueAddress("rehome-deactivated-new"),
          reason: "Lost the mailbox.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        }),
      ),
    ).toEqual({ kind: "invalid_transition", rule: REHOME_NOT_AVAILABLE_RULE });
  });

  it("applies the recovery authority matrix from REQ-rehome-email", async () => {
    const restore = await vacateThePresidency();
    try {
      const presidentPersonId = await insertPerson("rehome-president");
      await giveRole(presidentPersonId, "president");
      const presidentAccount = await giveOperatorAccount(presidentPersonId);

      // "General Manager may recover President."
      const byGeneralManager = await startOperatorEmailRehome({
        operator: generalManager(),
        operatorAccountId: presidentAccount.id,
        email: uniqueAddress("rehome-gm-recovers"),
        reason: "President lost their mailbox.",
        callbackUrl: CALLBACK,
        identity: recovery().port,
      });
      expect(byGeneralManager.state).toBe("email_change_pending");

      // "IT Officer may technically recover President."
      const byItOfficer = await startOperatorEmailRehome({
        operator: itOfficer(),
        operatorAccountId: presidentAccount.id,
        email: uniqueAddress("rehome-it-recovers"),
        reason: "Correcting the address IT was given.",
        callbackUrl: CALLBACK,
        identity: recovery().port,
      });
      expect(byItOfficer.retry).toBe(true);

      // "President may not recover General Manager", and the General Manager
      // seat admits only the IT Officer for recovery.
      const gmPersonId = await insertPerson("rehome-gm-target");
      const gmAccount = await giveOperatorAccount(gmPersonId);
      const restoreGeneralManagership = await vacateTheGeneralManagership();
      await giveRole(gmPersonId, "general_manager");

      try {
        expect(
          await refusalOf(
            startOperatorEmailRehome({
              operator: president(),
              operatorAccountId: gmAccount.id,
              email: uniqueAddress("rehome-president-refused"),
              reason: "Trying to recover the General Manager.",
              callbackUrl: CALLBACK,
              identity: recovery().port,
            }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });

        const byIt = await startOperatorEmailRehome({
          operator: itOfficer(),
          operatorAccountId: gmAccount.id,
          email: uniqueAddress("rehome-it-recovers-gm"),
          reason: "General Manager mailbox lost.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        });
        expect(byIt.state).toBe("email_change_pending");
      } finally {
        await restoreGeneralManagership();
      }
    } finally {
      await restore();
    }
  });

  it("returns the account to Active when the holder proves the new address", async () => {
    const personId = await insertPerson("rehome-verify");
    const account = await giveOperatorAccount(personId);

    await startOperatorEmailRehome({
      operator: administrator(),
      operatorAccountId: account.id,
      email: uniqueAddress("rehome-verify-new"),
      reason: "Lost the mailbox.",
      callbackUrl: CALLBACK,
      identity: recovery().port,
    });

    const verified = await verifyOperatorEmailRehome(account.authUserId);
    expect(verified?.state).toBe("active");
    expect((await accountRow(account.id))?.email_rehome_pending_at).toBeNull();

    // Idempotent: an ordinary password reset later is not a second verification.
    expect(await verifyOperatorEmailRehome(account.authUserId)).toBeNull();

    const history = await readOperatorAuditHistory(administrator(), personId);
    const verifiedEntry = history.find(
      (entry) => entry.action === "administration.operator.email_rehome_verified",
    );
    expect(verifiedEntry?.authority.kind).toBe("self");
    expect(verifiedEntry?.fromState).toBe("email_change_pending");
    expect(verifiedEntry?.toState).toBe("active");
  });

  it("does nothing for an account with no re-home in flight", async () => {
    const personId = await insertPerson("rehome-none");
    const account = await giveOperatorAccount(personId);
    expect(await verifyOperatorEmailRehome(account.authUserId)).toBeNull();
    expect(await auditActions(personId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The operating year
// ---------------------------------------------------------------------------

describe("F — one operating year at a time", () => {
  it("never mixes holders from two years, and keeps a standing seat standing", async () => {
    const previousYear = await observer.query<{ id: string }>(
      "select id from public.committee_years where id <> $1 order by starts_on desc limit 1",
      [activeCommitteeYearId],
    );
    const lastYearId = previousYear.rows[0].id;
    const lastYear = await observer.query<{ starts_on: string; ends_on: string | null }>(
      "select starts_on::text as starts_on, ends_on::text as ends_on from public.committee_years where id = $1",
      [lastYearId],
    );

    // Somebody whose assignment belonged to last year and ended with it.
    const departed = await insertPerson("year-departed");
    await giveRole(departed, "kit_manager", {
      from: lastYear.rows[0].starts_on,
      to: lastYear.rows[0].ends_on,
      committeeYearId: lastYearId,
    });

    // Somebody appointed last year and never ended — the standing case
    // REQ-effective-dated-role-history names for the General Manager and the
    // IT Officer, and the reason this is an overlap and not a cycle-id filter.
    const standing = await insertPerson("year-standing");
    await giveRole(standing, "kit_manager", {
      from: lastYear.rows[0].starts_on,
      committeeYearId: lastYearId,
    });

    const thisYear = await readRoleHolders(administrator(), "kit_manager");
    const thisYearIds = thisYear.holders.map((holder) => holder.personId);
    expect(thisYear.cycle.id).toBe(activeCommitteeYearId);
    expect(thisYear.readOnly).toBe(false);
    expect(thisYearIds).toContain(standing);
    expect(thisYearIds).not.toContain(departed);

    const lastYearView = await readRoleHolders(administrator(), "kit_manager", {
      cycleId: lastYearId,
    });
    const lastYearIds = lastYearView.holders.map((holder) => holder.personId);
    expect(lastYearView.readOnly).toBe(true);
    expect(lastYearIds).toContain(departed);
    expect(lastYearIds).toContain(standing);
  });

  it("reports a seat nobody holds as vacant", async () => {
    const holders = await readRoleHolders(administrator(), "special_teams_coach");
    expect(holders.holders).toEqual([]);
    expect(holders.vacant).toBe(true);
    expect(holders.role.label).toBe("Special Teams Coach");
    expect(holders.role.admitsMultipleHolders).toBe(true);
  });

  it("refuses the holder list to a seat that cannot administer anything", async () => {
    expect(await refusalOf(readRoleHolders(secretary(), "kit_manager"))).toMatchObject({
      kind: "not_permitted",
    });
    expect(await refusalOf(readRoleHolders(null, "kit_manager"))).toMatchObject({
      kind: "not_permitted",
    });
  });

  it("offers no way to write into a year that is not the active one", async () => {
    // `REQ-explicit-cycle-assignment`: "past years require deliberate switching
    // and are read-only". It is enforced by absence — there is no cycle
    // parameter on any write — and absence is worth asserting, because adding
    // one later would be the change that quietly makes a past year writable.
    const parameters = [assignRole, endRoleAssignment, replaceRoleHolder].map((fn) => fn.length);
    expect(parameters).toEqual([1, 1, 1]);

    const source = readFileSync(
      path.join(process.cwd(), "src/lib/services/operator-administration.ts"),
      "utf8",
    );
    const writeSection = source.slice(0, source.indexOf("// Role detail"));
    expect(writeSection).not.toMatch(/cycleId/);
  });
});

// ---------------------------------------------------------------------------
// The hard rule
// ---------------------------------------------------------------------------

describe("G — nothing here deletes anything", () => {
  it("issues no delete against any table", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/services/operator-administration.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\bdelete\s+from\b/i);
    expect(source).not.toMatch(/\btruncate\b/i);
  });

  it("leaves the Person, the binding and the history behind every action", async () => {
    const personId = await insertPerson("nothing-deleted");
    const assignmentId = await giveRole(personId, "kit_manager", { from: pastDate(3) });
    const account = await giveOperatorAccount(personId);

    await deactivateOperatorAccess({
      operator: administrator(),
      operatorAccountId: account.id,
      reason: "Suspended.",
    });
    await restoreOperatorAccess({ operator: administrator(), operatorAccountId: account.id });
    await endRoleAssignment({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      reason: "Stepped down.",
    });

    const person = await observer.query("select 1 from public.people where id = $1", [personId]);
    const binding = await observer.query("select 1 from public.operator_accounts where id = $1", [
      account.id,
    ]);
    const assignment = await observer.query("select 1 from public.role_assignments where id = $1", [
      assignmentId,
    ]);

    expect(person.rowCount).toBe(1);
    expect(binding.rowCount).toBe(1);
    expect(assignment.rowCount).toBe(1);
    expect((await auditActions(personId)).length).toBeGreaterThanOrEqual(3);
  });
});

async function roleId(code: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "select id from public.roles where code = $1",
    [code],
  );
  return result.rows[0].id;
}
