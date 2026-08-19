// @vitest-environment node
/**
 * The two plural reads Administration opens on — LAN-133, against the real
 * local database.
 *
 * ## The load-bearing test in this file
 *
 * `readRoleCatalogue()` re-derives, for twenty seats at once, what
 * `readRoleHolders()` already derives for one. That duplication is deliberate —
 * twenty transactions to draw one page is not a design — and it is exactly the
 * kind of duplication that goes quietly wrong: the two would agree on the seed
 * and disagree on a standing seat held since a previous committee year, or on a
 * holder whose access is deactivated, or on an assignment that ended in June.
 *
 * So the proof here is **agreement**, seat by seat, against the merged function,
 * on data staged to include each of those cases. An implementation that filters
 * on `effective_to is null` instead of overlapping the cycle passes every
 * "does the holder appear?" test; it fails this one.
 *
 * The other half is the guard. Both reads are the capability floor, and a
 * Secretary — a broad ordinary operator, and the most plausible near-miss — is
 * refused by each.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import pg, { type Client } from "pg";

import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, isServiceError, resolveDatabaseUrl } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readOperatorDirectory,
  readOperatorRecord,
  readPlayerMembership,
  readRoleCatalogue,
} from "./administration-directory";
import { readRoleHolders } from "./operator-administration";
import { supabaseOperatorIdentity } from "./operator-identity";

/** This suite's own marker on every Person it creates. */
const MARKER = "LAN133Fixture:administration-directory";

let observer: Client;
let today: string;

const people = new Set<string>();
const authUsers = new Set<string>();

function operator(roleCodes: readonly string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-0000000133aa",
    personId: "00000000-0000-4000-8000-0000000133bb",
    displayName: "Administrator",
    roleCodes: [...roleCodes],
    isActive: true,
  };
}

/** Holds every seat that carries `role_management`, read from the map itself. */
const administrator = () => operator(capabilityRoleCodes("role_management"));
const secretary = () => operator(["secretary"]);

function uniqueAddress(tag: string): string {
  return `lan133-${tag}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  people.add(result.rows[0].id);
  return result.rows[0].id;
}

/**
 * An assignment written directly, so the fixtures do not depend on the code
 * under test. The three denormalised columns come from the catalogue row in the
 * same statement, which is the only way to satisfy the composite foreign key.
 */
async function giveRole(
  personId: string,
  roleCode: string,
  options: { from?: string; to?: string | null } = {},
): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office,
        committee_year_id, season_id, effective_from, effective_to)
     select $1, r.id, r.scope, r.is_constitutional_office,
            case when r.scope = 'committee_year'
                 then (select id from public.committee_years
                        where starts_on <= current_date
                          and (ends_on is null or ends_on > current_date)) end,
            case when r.scope = 'season'
                 then (select id from public.seasons
                        where status in ('open', 'active')) end,
            $3::date, $4::date
       from public.roles r
      where r.code = $2
     returning id`,
    [personId, roleCode, options.from ?? today, options.to ?? null],
  );
  return result.rows[0].id;
}

/** A real Auth login plus the `operator_accounts` row pointing at it. */
async function giveOperatorAccount(
  personId: string,
  options: {
    activated?: boolean;
    active?: boolean;
    deliveryFailureReason?: string | null;
  } = {},
): Promise<string> {
  const email = uniqueAddress("account");
  const { authUserId } = await supabaseOperatorIdentity().createLogin(email);
  authUsers.add(authUserId);

  const activated = options.activated ?? true;
  const active = options.active ?? true;
  const reason = options.deliveryFailureReason ?? null;

  const result = await observer.query<{ id: string }>(
    `insert into public.operator_accounts
       (auth_user_id, person_id, login_email, invited_at, activated_at, is_active,
        disabled_at, disabled_reason,
        invitation_delivery_failed_at, invitation_delivery_failure_reason)
     values ($1, $2, $3, now(), case when $4 then now() end, $5,
             case when $5 then null else now() end,
             case when $5 then null else 'fixture' end,
             case when $6::text is not null then now() end, $6)
     returning id`,
    [authUserId, personId, email, activated, active, reason],
  );
  return result.rows[0].id;
}

function offset(days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The refusal a read threw, as `{ kind, rule }`, or a failure. */
async function refusalOf(action: Promise<unknown>): Promise<{ kind: string; rule?: string }> {
  try {
    await action;
  } catch (error) {
    if (isServiceError(error)) return { kind: error.kind, rule: error.rule };
    throw error;
  }
  throw new Error("The read was permitted, and should not have been.");
}

beforeAll(async () => {
  observer = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await observer.connect();

  const dates = await observer.query<{ today: string }>("select current_date::text as today");
  today = dates.rows[0].today;
});

afterAll(async () => {
  const ids = [...people];
  if (ids.length > 0) {
    await observer.query("delete from public.role_assignments where person_id = any($1::uuid[])", [
      ids,
    ]);
    await observer.query("delete from public.operator_accounts where person_id = any($1::uuid[])", [
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
// The guard
// ---------------------------------------------------------------------------

describe("both list reads are the capability floor", () => {
  it("refuses a Secretary, who is a broad ordinary operator and no administrator", async () => {
    expect(await refusalOf(readRoleCatalogue(secretary()))).toMatchObject({
      kind: "not_permitted",
    });
    expect(await refusalOf(readOperatorDirectory(secretary()))).toMatchObject({
      kind: "not_permitted",
    });
    expect(await refusalOf(readOperatorRecord(secretary(), "whatever"))).toMatchObject({
      kind: "not_permitted",
    });
    expect(
      await refusalOf(readPlayerMembership(secretary(), "00000000-0000-4000-8000-000000000000")),
    ).toMatchObject({ kind: "not_permitted" });
  });

  it("refuses a request with no operator at all", async () => {
    expect(await refusalOf(readRoleCatalogue(null))).toMatchObject({ kind: "not_permitted" });
    expect(await refusalOf(readOperatorDirectory(null))).toMatchObject({ kind: "not_permitted" });
  });
});

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

describe("the role catalogue", () => {
  it("returns the twenty approved seats in the three approved groups, in order", async () => {
    const catalogue = await readRoleCatalogue(administrator());

    expect(catalogue.groups.map((group) => group.label)).toEqual([
      "Operational Administration",
      "Club Committee",
      "Coaching Staff",
    ]);
    expect(catalogue.groups.flatMap((group) => group.roles)).toHaveLength(20);
    expect(catalogue.groups[0].roles.map((role) => role.label)).toEqual([
      "General Manager",
      "IT Officer",
    ]);
    expect(catalogue.groups[2].roles).toHaveLength(10);
  });

  it("names each seat exactly as the capability map does", async () => {
    const catalogue = await readRoleCatalogue(administrator());
    const coaching = catalogue.groups[2].roles.map((role) => role.label);

    // The two seats whose code and label deliberately disagree — LAN-128.
    expect(coaching).toContain("Offensive Coordinator");
    expect(coaching).toContain("Defensive Coordinator");
  });

  /**
   * The agreement test. Every seat, against the merged single-seat reader, on
   * data staged to contain the three cases a naive filter gets wrong.
   */
  it("agrees with readRoleHolders on every seat, including the awkward ones", async () => {
    // A seat whose holder's access is deactivated: still the holder.
    const deactivated = await insertPerson("deactivated-holder");
    await giveOperatorAccount(deactivated, { active: false });
    await giveRole(deactivated, "kit_manager");

    // A seat whose holder's assignment ended earlier in this operating year:
    // a holder of the year, not of today.
    const ended = await insertPerson("ended-holder");
    await giveRole(ended, "social_secretary", { from: offset(-30), to: offset(-2) });

    // A seat dated to begin at a handover still to come.
    const scheduled = await insertPerson("scheduled-holder");
    await giveRole(scheduled, "media_secretary", { from: offset(7) });

    const catalogue = await readRoleCatalogue(administrator());

    for (const group of catalogue.groups) {
      for (const role of group.roles) {
        if (role.cycleMissing) continue;
        const single = await readRoleHolders(administrator(), role.code);

        expect(
          role.holders.map((holder) => holder.roleAssignmentId).sort(),
          `holders of ${role.code}`,
        ).toEqual(single.holders.map((holder) => holder.roleAssignmentId).sort());
        expect(role.vacant, `vacancy of ${role.code}`).toBe(single.vacant);
        expect(role.label).toBe(single.role.label);
        expect(role.admitsMultipleHolders).toBe(single.role.admitsMultipleHolders);
      }
    }
  });

  it("keeps a deactivated holder as the holder, and says their access is off", async () => {
    const personId = await insertPerson("deactivated-flag");
    await giveOperatorAccount(personId, { active: false });
    await giveRole(personId, "gameday_secretary");

    const catalogue = await readRoleCatalogue(administrator());
    const seat = catalogue.groups
      .flatMap((group) => group.roles)
      .find((role) => role.code === "gameday_secretary");

    const mine = seat?.holders.find((holder) => holder.personId === personId);
    expect(seat?.vacant).toBe(false);
    expect(mine?.accessDeactivated).toBe(true);
    expect(mine?.operatorState).toBe("deactivated");
  });

  it("reports no operator state for a holder who has never had a login", async () => {
    const personId = await insertPerson("no-login");
    await giveRole(personId, "special_teams_coach");

    const catalogue = await readRoleCatalogue(administrator());
    const seat = catalogue.groups
      .flatMap((group) => group.roles)
      .find((role) => role.code === "special_teams_coach");

    const mine = seat?.holders.find((holder) => holder.personId === personId);
    expect(mine?.operatorAccountId).toBeNull();
    expect(mine?.operatorState).toBeNull();
    expect(mine?.accessDeactivated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

describe("the operator directory", () => {
  it("carries the seats an operator holds, in catalogue order", async () => {
    const personId = await insertPerson("many-seats");
    const accountId = await giveOperatorAccount(personId);
    await giveRole(personId, "linebackers_coach");
    await giveRole(personId, "kit_manager");

    const record = await readOperatorRecord(administrator(), accountId);

    expect(record?.roles.map((role) => role.label)).toEqual(["Kit Manager", "Linebackers Coach"]);
    expect(record?.roles[0].groupCode).toBe("club_committee");
    expect(record?.roles[1].groupCode).toBe("coaching_staff");
    expect(record?.roles[0].groupSortOrder).toBeLessThan(record?.roles[1].groupSortOrder ?? 0);
  });

  it("lists an account whose seats have all ended rather than dropping it", async () => {
    const personId = await insertPerson("no-current-seat");
    const accountId = await giveOperatorAccount(personId);
    await giveRole(personId, "social_secretary", { from: offset(-30), to: offset(-1) });

    const directory = await readOperatorDirectory(administrator());
    const mine = directory.operators.find((entry) => entry.operatorAccountId === accountId);

    expect(mine, "an account with no current seat must still be listed").toBeDefined();
    expect(mine?.roles).toEqual([]);
  });

  it("includes a seat that has not started yet, and says so", async () => {
    const personId = await insertPerson("scheduled-seat");
    const accountId = await giveOperatorAccount(personId, { activated: false });
    await giveRole(personId, "media_secretary", { from: offset(14) });

    const record = await readOperatorRecord(administrator(), accountId);

    expect(record?.roles).toHaveLength(1);
    expect(record?.roles[0].scheduled).toBe(true);
    expect(record?.state).toBe("invitation_pending");
  });

  it("carries the delivery failure reason — LAN131-A5", async () => {
    const reason = "This account has already been opened. Use Forgot password instead.";
    const personId = await insertPerson("failed-delivery");
    const accountId = await giveOperatorAccount(personId, {
      activated: false,
      deliveryFailureReason: reason,
    });

    const record = await readOperatorRecord(administrator(), accountId);

    expect(record?.state).toBe("delivery_failed");
    expect(record?.deliveryFailureReason).toBe(reason);

    const listed = (await readOperatorDirectory(administrator())).operators.find(
      (entry) => entry.operatorAccountId === accountId,
    );
    expect(listed?.deliveryFailureReason).toBe(reason);
  });

  it("derives the same state one account at a time as it does in the list", async () => {
    const personId = await insertPerson("state-agreement");
    const accountId = await giveOperatorAccount(personId, { active: false });

    const record = await readOperatorRecord(administrator(), accountId);
    const listed = (await readOperatorDirectory(administrator())).operators.find(
      (entry) => entry.operatorAccountId === accountId,
    );

    expect(record).toEqual(listed);
  });

  it("answers an unknown account and a malformed identifier the same way", async () => {
    expect(
      await readOperatorRecord(administrator(), "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await readOperatorRecord(administrator(), "not-a-uuid")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The other capacity
// ---------------------------------------------------------------------------

describe("player membership", () => {
  it("is null for a person who is not a player this season", async () => {
    const personId = await insertPerson("not-a-player");

    expect(await readPlayerMembership(administrator(), personId)).toBeNull();
  });

  it("reports the current season's membership when there is one", async () => {
    const seeded = await observer.query<{ person_id: string; label: string; status: string }>(
      `select sm.person_id, s.label, sm.status::text as status
         from public.season_memberships sm
         join public.seasons s on s.id = sm.season_id
        where s.status in ('open', 'active')
        limit 1`,
    );
    expect(seeded.rows.length, "the synthetic seed should hold current-season memberships").toBe(1);

    const membership = await readPlayerMembership(administrator(), seeded.rows[0].person_id);

    expect(membership?.seasonLabel).toBe(seeded.rows[0].label);
    expect(membership?.status).toBe(seeded.rows[0].status);
  });
});
