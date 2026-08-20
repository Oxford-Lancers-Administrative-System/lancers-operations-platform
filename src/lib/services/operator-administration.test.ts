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
import { closePool, isServiceError, resolveDatabaseUrl, withTransaction } from "@/lib/db";
import { addClubDays, formatClubDay } from "@/lib/club-time";
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
  earliestEndFor,
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
import {
  insertRoleAssignmentIn,
  readAdministrationSubject,
  resolveActiveCommitteeYear,
  resolveCycleFor,
} from "./operator-invitations";

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

/** The sentence a refusal gave the operator, which is the half they read. */
async function messageOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (isServiceError(error)) return error.message;
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

  it("carries the catalogue's scope and office status onto the assignment", async () => {
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

  /**
   * LAN132-A1. The test above cannot prove this and no longer claims to:
   * `general_manager` is the only seat whose `is_single_holder_seat` is true,
   * and it is unassignable through every guarded path in this module, so every
   * assignment reachable from `assignRole` asserts `false` for a role whose
   * flag is `false`. Hardcoding `false` at the insert passed it.
   *
   * So the insert helper is exercised directly against the one catalogue row
   * where the answer differs. There is no trigger — LAN-128 decided that
   * deliberately — so a value taken from anywhere but the catalogue row is
   * refused by `role_assignments_agree_with_single_holder_rule`, and this is
   * the case that makes the difference visible: hardcode `false` and the
   * composite foreign key rejects the insert.
   */
  it("reads the single-holder flag from the catalogue, on the one seat where it is true", async () => {
    const restore = await vacateTheGeneralManagership();
    try {
      const personId = await insertPerson("single-holder-flag");

      const assignmentId = await withTransaction(async (tx) => {
        const role = (
          await tx.query<{
            id: string;
            code: string;
            scope: "committee_year" | "season";
            is_constitutional_office: boolean;
            is_single_holder_seat: boolean;
          }>(
            `select id, code, scope::text as scope, is_constitutional_office,
                    is_single_holder_seat
               from public.roles where code = 'general_manager'`,
          )
        ).rows[0];
        expect(role.is_single_holder_seat, "the catalogue's own answer").toBe(true);

        const cycle = await resolveCycleFor(tx, role.scope, await resolveActiveCommitteeYear(tx));
        return insertRoleAssignmentIn(tx, {
          personId,
          entry: {
            role,
            effectiveFrom: today,
            backdated: false,
            scheduled: false,
            reason: null,
          },
          cycle,
          appointedByPersonId: actorPersonId,
        });
      });

      expect((await assignmentRow(assignmentId))?.is_single_holder_seat).toBe(true);
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

  /**
   * Caller check 4, at the five sites the test above never reached — LAN-141
   * finding 1.
   *
   * The claim in this module's header was that every one of its four rules "is
   * checked by a test that fails if the line enforcing it is deleted". For rule
   * 4 that was true of three actions out of ten. Flipping `includeScheduled`
   * to `false` at `replaceRoleHolder`'s two sites, at `restoreOperatorAccess`
   * and at both of `startOperatorEmailRehome`'s left the whole suite green,
   * which is what let a President re-home the President-elect's login and an IT
   * Officer restore a President the General Manager had stood down.
   *
   * Each case below stages the same target — a Person whose *only* protection
   * is a seat dated to begin at a handover — against an actor who holds
   * `role_management` and would be permitted every one of these against an
   * unprotected target. Each ends by showing an actor the leadership rule does
   * admit, so a refusal cannot be a blanket denial wearing the right rule name.
   */
  describe("a seat that begins at a future handover, at the remaining sites", () => {
    /** A Person protected by nothing except a seat that has not started. */
    async function aPresidentElect(tag: string): Promise<string> {
      const personId = await insertPerson(tag);
      await giveRole(personId, "president", { from: futureDate(45) });

      // The precondition that makes every case below dangerous: today, the
      // leadership rules can see nothing at all about this person.
      const asOfToday = await withTransaction((tx) => readAdministrationSubject(tx, personId));
      expect(asOfToday.roleCodes).not.toContain("president");
      return personId;
    }

    it("protects the outgoing holder when a seat is handed over", async () => {
      const restore = await vacateThePresidency();
      try {
        const elect = await aPresidentElect("replace-outgoing-elect");
        const ordinary = await giveRole(elect, "kit_manager", { from: pastDate(3) });
        const successor = await insertPerson("replace-outgoing-successor");

        expect(
          await refusalOf(
            replaceRoleHolder({
              operator: itOfficer(),
              roleAssignmentId: ordinary,
              successorPersonId: successor,
              reason: "Handing the kit over.",
            }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });

        // A refusal that had already ended the outgoing assignment would be the
        // defect wearing a refusal's clothes.
        expect((await assignmentRow(ordinary))?.effective_to).toBeNull();

        const handed = await replaceRoleHolder({
          operator: generalManager(),
          roleAssignmentId: ordinary,
          successorPersonId: successor,
          reason: "Handing the kit over.",
        });
        expect(handed.successorPersonId).toBe(successor);
      } finally {
        await restore();
      }
    });

    it("protects the successor a seat is handed to", async () => {
      // The second guard `replaceRoleHolder` asks, and the one an outgoing-only
      // test cannot reach: a successor who is themselves protected must be as
      // hard to install as they are to administer.
      const restore = await vacateThePresidency();
      try {
        const elect = await aPresidentElect("replace-successor-elect");
        const outgoing = await insertPerson("replace-successor-outgoing");
        const ordinary = await giveRole(outgoing, "kit_manager", { from: pastDate(3) });

        expect(
          await refusalOf(
            replaceRoleHolder({
              operator: itOfficer(),
              roleAssignmentId: ordinary,
              successorPersonId: elect,
              reason: "New kit manager.",
            }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });
        expect((await assignmentRow(ordinary))?.effective_to).toBeNull();

        const handed = await replaceRoleHolder({
          operator: generalManager(),
          roleAssignmentId: ordinary,
          successorPersonId: elect,
          reason: "New kit manager.",
        });
        expect(handed.successorPersonId).toBe(elect);
      } finally {
        await restore();
      }
    });

    it("protects a target whose access is being restored", async () => {
      // `restore_account` is management and protected symmetrically with
      // deactivation on purpose — otherwise the IT Officer reinstates a
      // President the General Manager stood down, which is exactly what the
      // missing widening permitted here.
      const restore = await vacateThePresidency();
      try {
        const elect = await aPresidentElect("restore-elect");
        const account = await giveOperatorAccount(elect, { active: false });

        expect(
          await refusalOf(
            restoreOperatorAccess({ operator: itOfficer(), operatorAccountId: account.id }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });
        expect((await accountRow(account.id))?.is_active).toBe(false);

        const restored = await restoreOperatorAccess({
          operator: generalManager(),
          operatorAccountId: account.id,
        });
        expect(restored.state).toBe("active");
      } finally {
        await restore();
      }
    });

    it("protects a target before the login is touched, when an email is recovered", async () => {
      const restore = await vacateThePresidency();
      try {
        const elect = await aPresidentElect("rehome-elect");
        const account = await giveOperatorAccount(elect);
        const refused = recovery();

        expect(
          await refusalOf(
            startOperatorEmailRehome({
              operator: president(),
              operatorAccountId: account.id,
              email: uniqueAddress("rehome-elect-new"),
              reason: "Mailbox lost.",
              callbackUrl: CALLBACK,
              identity: refused.port,
            }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });

        // This is what binds the **first** of the re-home's two assertions,
        // which the refusal alone cannot: the second one refuses too, so the
        // caller sees the same error either way. What differs is that without
        // the widening on the first, the President-elect's sign-in address is
        // moved on the Auth server and then moved back — a refusal that
        // relocated somebody's login.
        expect(refused.moves, "a refused recovery must touch no login").toEqual([]);
        expect(refused.sends).toEqual([]);
        expect((await accountRow(account.id))?.login_email).toBe(account.email);

        // Recovery of the presiding seat belongs to the General Manager and the
        // IT Officer — a different authority list from management, which is
        // half of what `REQ-rehome-email` loses when the seat is invisible.
        const recovered = await startOperatorEmailRehome({
          operator: itOfficer(),
          operatorAccountId: account.id,
          email: uniqueAddress("rehome-elect-ok"),
          reason: "Mailbox lost.",
          callbackUrl: CALLBACK,
          identity: recovery().port,
        });
        expect(recovered.state).toBe("email_change_pending");
      } finally {
        await restore();
      }
    });

    it("protects a target handed a future seat inside the Auth window", async () => {
      // The re-home's **second** assertion, which is the load-bearing one. The
      // window is staged exactly as LAN132-B3's test stages it, with the one
      // difference that decides this case: the seat recorded inside the window
      // begins at the handover rather than today, so only the widened snapshot
      // can see it when the write transaction re-asks.
      const restore = await vacateThePresidency();
      try {
        const targetPersonId = await insertPerson("rehome-window-scheduled");
        const account = await giveOperatorAccount(targetPersonId);
        const real = supabaseOperatorIdentity();
        let recorded = false;

        const port: OperatorEmailRecoveryPort = {
          async changeLoginEmail(authUserId, email) {
            await real.changeLoginEmail(authUserId, email);
            // Once only: this port is called a second time to compensate, and
            // a second President assignment would be refused by the Office
            // exclusion and swallowed by the compensation's `catch`.
            if (recorded) return;
            recorded = true;
            await giveRole(targetPersonId, "president", { from: futureDate(45) });
          },
          async sendVerification() {
            throw new Error("the verification must never be sent for a refused recovery");
          },
        };

        expect(
          await refusalOf(
            startOperatorEmailRehome({
              operator: president(),
              operatorAccountId: account.id,
              email: uniqueAddress("rehome-window-scheduled-new"),
              reason: "Mailbox lost.",
              callbackUrl: CALLBACK,
              identity: port,
            }),
          ),
        ).toMatchObject({ rule: "administration_leadership_target" });

        const row = await accountRow(account.id);
        expect(row?.email_rehome_pending_at, "no re-home may have been recorded").toBeNull();
        expect(row?.login_email, "the address must be back").toBe(account.email);

        const admin = createAdminClient();
        const { data } = await admin.auth.admin.getUserById(account.authUserId);
        expect(data?.user?.email, "the login must be back too").toBe(account.email);
      } finally {
        await restore();
      }
    });

    it("asks for the widened snapshot at every site in this module", () => {
      // The behavioural cases above bind the eight sites that exist today. This
      // binds the ninth: a site added later cannot quietly take the default,
      // which is how six of the ten came to be unwidened in the first place.
      // Deliberately a source read rather than a lint rule — the rule is about
      // one function in one module, and `G` already reads this file for the
      // same kind of reason.
      const source = readFileSync(
        path.join(process.cwd(), "src/lib/services/operator-administration.ts"),
        "utf8",
      );
      const callSites = source.split("readAdministrationSubject(tx").slice(1);

      expect(callSites.length, "every write here reads the target's seats").toBe(8);
      for (const site of callSites) {
        expect(site.slice(0, 200)).toMatch(/includeScheduled:\s*true/);
      }
    });
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

  /**
   * LAN-141 finding 2: the refusal has to name a date the administrator can
   * actually use, in the words every screen uses for a date.
   *
   * Both the end date and the assignment's start default to today, so a role
   * given to the wrong person this morning is refused by every route — there is
   * no delete, and deactivating the account deliberately does not vacate the
   * seat. The refusal said only "Choose a later date", and said it about
   * `2026-08-20` while the page behind it read `20 Aug 2026`, so two spellings
   * of one date read as two dates.
   *
   * Correcting it *same-day* would mean relaxing `role_assignments_period_ordered`
   * on the frozen domain model, which is Brian's decision. Naming the earliest
   * date that works is not.
   */
  it("names the earliest usable end date, in the club's own words", async () => {
    const personId = await insertPerson("end-same-day-message");
    const assignmentId = await giveRole(personId, "kit_manager", { from: today });
    const tomorrow = addClubDays(today, 1) as string;

    const message = await messageOf(
      endRoleAssignment({
        operator: administrator(),
        roleAssignmentId: assignmentId,
        reason: "Appointed by mistake.",
      }),
    );

    expect(message).toContain(formatClubDay(today));
    expect(message).toContain(formatClubDay(tomorrow));
    // Never the stored form: `27 Aug 2026` everywhere, or the two disagree.
    expect(message).not.toContain(today);
    expect(message).not.toContain(tomorrow);
  });

  it("accepts the earliest date it names", async () => {
    const personId = await insertPerson("end-earliest-accepted");
    const assignmentId = await giveRole(personId, "kit_manager", { from: today });
    const earliest = earliestEndFor({ effectiveFrom: today });

    const result = await endRoleAssignment({
      operator: administrator(),
      roleAssignmentId: assignmentId,
      effectiveTo: earliest,
      reason: "Appointed by mistake; handing it back tomorrow.",
    });

    expect(result.effectiveTo).toBe(earliest);
    expect(result.scheduled).toBe(true);
  });

  /**
   * The other half of `REQ-final-admin-protection`'s arithmetic, and the half a
   * floor rather than a comparison gets wrong.
   *
   * A club with no usable administration path at all is a state this
   * application refuses to produce — and it is the state a freshly migrated
   * database is *in*, because the seed creates role assignments and no operator
   * logins. That is what CI runs against, and it is what caught this: with an
   * unqualified survival check, ending a Kit Manager's assignment was refused
   * because nobody anywhere had a login, with a message about administration
   * roles that had nothing to do with the action.
   *
   * An action cannot eliminate what is already gone. Deleting the guard's
   * emptiness test fails here; deleting the guard fails the test above.
   */
  it("permits an unrelated ending when the club has no usable administrator to lose", async () => {
    const personId = await insertPerson("no-administrators");
    const assignmentId = await giveRole(personId, "kit_manager", { from: pastDate(3) });

    await withOnlyOneAdministrator([], async () => {
      const result = await endRoleAssignment({
        operator: administrator(),
        roleAssignmentId: assignmentId,
        reason: "Handed the kit over at the end of the season.",
      });
      expect(result.effectiveTo).toBe(today);
    });
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

/**
 * LAN132-B2 — the finding this round exists for.
 *
 * `REQ-final-admin-protection` says no action may eliminate every usable
 * administration path, and the first version asked that question only about
 * today. An administrator already scheduled to lapse is still effective today,
 * so it counted them as the surviving path and nothing re-evaluated on the date
 * they went. One administrator, two ordinary endings through the normal
 * surface, no race and no second actor — and on the effective date the club had
 * nobody able to administer operator accounts or roles, recoverable only by
 * Brian through a migration or the owner-run bootstrap.
 */
describe("B2 — a scheduled ending cannot empty the club on the day it takes effect", () => {
  it("refuses the second scheduled ending that would leave the date with nobody", async () => {
    const firstPersonId = await insertPerson("scheduled-first");
    const firstAssignment = await giveRole(firstPersonId, "it_officer", { from: pastDate(3) });
    const first = await giveOperatorAccount(firstPersonId);

    const secondPersonId = await insertPerson("scheduled-second");
    const secondAssignment = await giveRole(secondPersonId, "it_officer", { from: pastDate(3) });
    const second = await giveOperatorAccount(secondPersonId);

    const handover = futureDate(30);

    await withOnlyOneAdministrator([first.id, second.id], async () => {
      // Permitted: the other administrator survives the date.
      const ended = await endRoleAssignment({
        operator: administrator(),
        roleAssignmentId: firstAssignment,
        effectiveTo: handover,
        reason: "Stepping down at the AGM.",
      });
      expect(ended.scheduled).toBe(true);

      // Refused: today both are still effective, and on the handover date
      // neither would be.
      expect(
        await refusalOf(
          endRoleAssignment({
            operator: administrator(),
            roleAssignmentId: secondAssignment,
            effectiveTo: handover,
            reason: "Also stepping down at the AGM.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });

      // …and the ordering does not matter: ending the second one *today* is
      // refused too, because the first is gone from the handover date on.
      expect(
        await refusalOf(
          endRoleAssignment({
            operator: administrator(),
            roleAssignmentId: secondAssignment,
            reason: "Leaving now.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });
    });

    expect((await assignmentRow(secondAssignment))?.effective_to).toBeNull();
  });

  it("permits it once somebody else's seat starts before that date", async () => {
    // The other half of the same arithmetic, and the reason the guard reasons
    // over dates rather than simply refusing every second ending: a scheduled
    // *start* is a path on the date it starts. A succession planned properly —
    // the successor's seat begins before the outgoing seats end — must go
    // through, or the rule would forbid the very thing it is protecting.
    const firstPersonId = await insertPerson("succession-first");
    const firstAssignment = await giveRole(firstPersonId, "it_officer", { from: pastDate(3) });
    const first = await giveOperatorAccount(firstPersonId);

    const secondPersonId = await insertPerson("succession-second");
    const secondAssignment = await giveRole(secondPersonId, "it_officer", { from: pastDate(3) });
    const second = await giveOperatorAccount(secondPersonId);

    const successorPersonId = await insertPerson("succession-successor");
    await giveRole(successorPersonId, "it_officer", { from: futureDate(10) });
    const successor = await giveOperatorAccount(successorPersonId);

    await withOnlyOneAdministrator([first.id, second.id, successor.id], async () => {
      await endRoleAssignment({
        operator: administrator(),
        roleAssignmentId: firstAssignment,
        effectiveTo: futureDate(30),
        reason: "Stepping down at the AGM.",
      });

      const ended = await endRoleAssignment({
        operator: administrator(),
        roleAssignmentId: secondAssignment,
        effectiveTo: futureDate(30),
        reason: "Also stepping down at the AGM.",
      });
      expect(ended.effectiveTo).toBe(futureDate(30));
    });
  });

  it("refuses a deactivation that empties a date the club had already scheduled itself into", async () => {
    // The same defect reached through a different verb: the surviving path is
    // scheduled to lapse, so deactivating the only other administrator today is
    // fine today and fatal from the lapse date.
    const lapsingPersonId = await insertPerson("lapsing-administrator");
    await giveRole(lapsingPersonId, "it_officer", { from: pastDate(3), to: futureDate(20) });
    const lapsing = await giveOperatorAccount(lapsingPersonId);

    const otherPersonId = await insertPerson("other-administrator");
    await giveRole(otherPersonId, "it_officer", { from: pastDate(3) });
    const other = await giveOperatorAccount(otherPersonId);

    await withOnlyOneAdministrator([lapsing.id, other.id], async () => {
      expect(
        await refusalOf(
          deactivateOperatorAccess({
            operator: administrator(),
            operatorAccountId: other.id,
            reason: "Suspended.",
          }),
        ),
      ).toEqual({ kind: "not_permitted", rule: FINAL_ADMINISTRATION_PATH_RULE });
    });

    expect((await accountRow(other.id))?.is_active).toBe(true);
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

  /**
   * LAN132-B1. Independent review downgraded each of this module's seven
   * `assertAdministrationTarget` calls to the capability floor in turn; six
   * produced failures and this one did not, because nothing exercised the
   * *outgoing* holder's protection through Replace.
   *
   * It is reachable only here. `endRoleAssignment` has its own guard and is
   * never entered on this path, and the successor guard below asks about the
   * successor — so an IT Officer taking an ordinary seat away from the sitting
   * President passed every other test in this file.
   */
  it("asks the replacement question about the outgoing holder", async () => {
    const restore = await vacateThePresidency();
    try {
      const sittingPresident = await insertPerson("replace-outgoing-president");
      await giveRole(sittingPresident, "president");
      const assignmentId = await giveRole(sittingPresident, "kit_manager", { from: pastDate(3) });
      const successor = await insertPerson("replace-outgoing-president-successor");

      // The seat changing hands is ordinary and the successor is ordinary. The
      // only thing protecting this action is who currently holds it.
      expect(
        await refusalOf(
          replaceRoleHolder({
            operator: itOfficer(),
            roleAssignmentId: assignmentId,
            successorPersonId: successor,
            reason: "Taking the kit off the President.",
          }),
        ),
      ).toMatchObject({ kind: "not_permitted", rule: "administration_leadership_target" });

      expect((await assignmentRow(assignmentId))?.effective_to).toBeNull();

      // And the General Manager, who may administer the President, is not
      // refused — so the refusal above is the leadership rule and not a blanket
      // denial of replacement.
      const done = await replaceRoleHolder({
        operator: generalManager(),
        roleAssignmentId: assignmentId,
        successorPersonId: successor,
        reason: "Handing the kit over.",
      });
      expect(done.outgoingPersonId).toBe(sittingPresident);
      expect(done.successorPersonId).toBe(successor);
    } finally {
      await restore();
    }
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

  /**
   * LAN132-B3. The re-home cannot be one transaction: it has to move the
   * address on the Auth server between deciding and writing, and the first
   * transaction commits and releases its `FOR UPDATE` lock before that call. So
   * every fact the guard checked is a snapshot from before an unbounded network
   * window, and the write that follows used to trust it.
   *
   * The window is staged deterministically here by making the Auth call itself
   * the moment a different administrator assigns the President seat to the
   * target. At the guard the target is nobody in particular; by the write they
   * are the sitting President, and a President-held actor may not recover them
   * (`REQ-rehome-email`: recovery of the presiding seat belongs to the General
   * Manager and the IT Officer).
   *
   * The address must also be put back — a refused recovery that had already
   * moved somebody's login would be a half-performed one.
   */
  it("re-asserts the guard after the Auth call, and puts the address back when it refuses", async () => {
    const restore = await vacateThePresidency();
    try {
      const targetPersonId = await insertPerson("rehome-window");
      const account = await giveOperatorAccount(targetPersonId);
      const replacement = uniqueAddress("rehome-window-new");
      const real = supabaseOperatorIdentity();

      const port: OperatorEmailRecoveryPort = {
        async changeLoginEmail(authUserId, email) {
          await real.changeLoginEmail(authUserId, email);
          // The window. Another administrator, acting legitimately, makes this
          // person the President while the Auth call is in flight.
          await giveRole(targetPersonId, "president");
        },
        async sendVerification() {
          throw new Error("the verification must never be sent for a refused recovery");
        },
      };

      expect(
        await refusalOf(
          startOperatorEmailRehome({
            operator: president(),
            operatorAccountId: account.id,
            email: replacement,
            reason: "Mailbox lost.",
            callbackUrl: CALLBACK,
            identity: port,
          }),
        ),
      ).toMatchObject({ kind: "not_permitted", rule: "administration_leadership_target" });

      const row = await accountRow(account.id);
      expect(row?.email_rehome_pending_at, "no re-home may have been recorded").toBeNull();
      expect(row?.login_email, "the address must be back").toBe(account.email);

      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(account.authUserId);
      expect(data?.user?.email, "the login must be back too").toBe(account.email);

      expect(await auditActions(targetPersonId)).toEqual([]);
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
