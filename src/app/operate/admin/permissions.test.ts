// @vitest-environment node
/**
 * What Administration is allowed to **offer** — LAN-133's `./permissions.ts`,
 * against the real local database. LAN-141 finding 13.
 *
 * ## Why this file exists at all
 *
 * It did not, and that was the finding: `permissions.ts` had no test of any
 * kind. Replacing every `canAdministerTarget` answer in it with `true` passed
 * 3730 tests, because every screen suite `vi.mock`s this module and asserts
 * against the answers it was handed. The screens were covered; the thing that
 * produces the answers was not. That is the shape this whole issue is about —
 * the untested layer is the next one out.
 *
 * ## What is and is not at stake
 *
 * No privilege. Every action behind every control asks the same question again
 * inside the transaction that writes, and `operator-administration.test.ts`
 * proves that at length. What is at stake is `REQ-final-admin-protection`'s
 * presentation half, in **both** directions and neither is cosmetic:
 *
 *   * offering the President a **Deactivate operator access** button on the
 *     General Manager's record presents a constitutional impossibility as an
 *     available action, and teaches its reader something false about the club;
 *   * hiding **Replace holder** from a General Manager who may perform it
 *     tells them the club's rules forbid something the club's rules require of
 *     them, and there is no second surface that would put it right.
 *
 * So every case below asserts the whole answer object rather than the one
 * field it is about: a test that only ever checks `false` is satisfied by a
 * module that returns `false` for everything.
 *
 * ## Why the database is real
 *
 * The module's whole point is that the seats come from the database rather than
 * from the page that already drew them, with `includeScheduled` — which is the
 * one thing a fake would agree with whatever the implementation did. A
 * President-elect is staged for real, and {@link vacateThePresidency} puts the
 * seeded seat back exactly as it was.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import path from "node:path";

import pg, { type Client } from "pg";

import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, resolveDatabaseUrl, withTransaction } from "@/lib/db";
import { readAdministrationSubject } from "@/lib/services/operator-invitations";
import { permittedAccountActions, permittedRoleActions } from "./permissions";

/** This suite's own marker on every Person it creates. */
const MARKER = "LAN141Fixture:admin-permissions";

let observer: Client;
let actorPersonId: string;
let activeCommitteeYearId: string;
let activeSeasonId: string;
let today: string;

const people = new Set<string>();

function operator(roleCodes: readonly string[], personId?: string): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-0000000141aa",
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
 * A role assignment written directly, so the fixture does not depend on the
 * code under test. The three denormalised columns come from the catalogue row
 * in the same statement — the only way to satisfy `role_assignments_agree_with_role`.
 */
async function giveRole(personId: string, roleCode: string, from: string): Promise<void> {
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
    [personId, roleCode, activeCommitteeYearId, activeSeasonId, from],
  );
}

function futureDate(days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const pastDate = (days: number) => futureDate(-days);

/**
 * Frees the sitting President for the length of one test and puts the seat back.
 *
 * `role_assignments_one_holder_per_office` refuses a second concurrent holder,
 * so a President-elect cannot be staged beside the seeded one. Copied in shape
 * from `operator-administration.test.ts`, including the order of the restore:
 * anything this suite put in the seat goes first, or restoring the seeded row
 * re-creates the overlap the exclusion exists to refuse.
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

// ---------------------------------------------------------------------------

beforeAll(async () => {
  observer = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await observer.connect();

  today = (await observer.query<{ today: string }>("select current_date::text as today")).rows[0]
    .today;

  activeCommitteeYearId = (
    await observer.query<{ id: string }>(
      `select id from public.committee_years
        where starts_on <= current_date and (ends_on is null or ends_on > current_date)`,
    )
  ).rows[0].id;

  activeSeasonId = (
    await observer.query<{ id: string }>(
      "select id from public.seasons where status in ('open', 'active')",
    )
  ).rows[0].id;

  actorPersonId = await insertPerson("actor");
});

afterAll(async () => {
  const ids = [...people];
  if (ids.length > 0) {
    await observer.query("delete from public.role_assignments where person_id = any($1::uuid[])", [
      ids,
    ]);
    await observer.query("delete from public.people where id = any($1::uuid[])", [ids]);
  }
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Account-level controls
// ---------------------------------------------------------------------------

describe("the five account decisions operator detail may offer", () => {
  it("offers all five against an ordinary operator", async () => {
    // The direction a one-sided suite misses. Every case below that expects a
    // `false` is only meaningful because this one shows the module can say
    // `true` — a module that refused everything would satisfy them all.
    const personId = await insertPerson("ordinary");
    await giveRole(personId, "kit_manager", pastDate(30));

    expect(await permittedAccountActions(administrator(), personId)).toEqual({
      resend: true,
      correct: true,
      deactivate: true,
      restore: true,
      recoverEmail: true,
    });
  });

  it("refuses everything to a seat that holds no administration capability", async () => {
    // The capability floor, asked through this module rather than through the
    // guard directly: a page that offered the Social Secretary these controls
    // would be offering them to somebody the floor stops.
    const personId = await insertPerson("floor");
    expect(await permittedAccountActions(secretary(), personId)).toEqual({
      resend: false,
      correct: false,
      deactivate: false,
      restore: false,
      recoverEmail: false,
    });
  });

  it("hides what a General Manager's record forbids, from the strongest actor there is", async () => {
    // `REQ-final-admin-protection` read with `DEC-no-self-removal` leaves
    // **nobody** who may ordinarily manage this seat, and the IT Officer alone
    // may recover it. An interface offering Deactivate here presents a
    // constitutional impossibility as an available action.
    const generalManagerPersonId = (
      await observer.query<{ person_id: string }>(
        `select ra.person_id
           from public.role_assignments ra
           join public.roles r on r.id = ra.role_id
          where r.code = 'general_manager'
            and ra.effective_from <= current_date
            and (ra.effective_to is null or ra.effective_to > current_date)
          limit 1`,
      )
    ).rows[0].person_id;

    expect(await permittedAccountActions(administrator(), generalManagerPersonId)).toEqual({
      resend: false,
      correct: false,
      deactivate: false,
      restore: false,
      recoverEmail: true,
    });
  });

  it("sees a seat that begins at a future handover", async () => {
    // The site LAN-141 finding 1 named in this file. Without
    // `includeScheduled: true` the snapshot is empty, every answer becomes
    // `true`, and operator detail offers the President a **Recover email
    // access** control on the President-elect — the exact control that moves
    // somebody's sign-in to an address the actor chooses.
    const restore = await vacateThePresidency();
    try {
      const elect = await insertPerson("president-elect");
      await giveRole(elect, "president", futureDate(45));

      // The precondition: today, they hold nothing the guard can see.
      const asOfToday = await withTransaction((tx) => readAdministrationSubject(tx, elect));
      expect(asOfToday.roleCodes).toEqual([]);

      expect(await permittedAccountActions(president(), elect)).toEqual({
        resend: false,
        correct: false,
        deactivate: false,
        restore: false,
        // Recovery has its own, different authority list — General Manager and
        // IT Officer — and the President is on neither. This is the control
        // the finding named: without the widening, a President could move the
        // President-elect's sign-in to an address of their choosing.
        recoverEmail: false,
      });

      // The General Manager is the one seat that may manage the presiding tier.
      expect(await permittedAccountActions(generalManager(), elect)).toEqual({
        resend: true,
        correct: true,
        deactivate: true,
        restore: true,
        recoverEmail: true,
      });

      // And the IT Officer may recover it without being able to manage it —
      // the asymmetry `REQ-rehome-email` turns on, invisible to a screen test.
      expect(await permittedAccountActions(itOfficer(), elect)).toEqual({
        resend: false,
        correct: false,
        deactivate: false,
        restore: false,
        recoverEmail: true,
      });
    } finally {
      await restore();
    }
  });

  it("offers an actor neither of the two things they may not do to themselves", async () => {
    // `DEC-no-self-removal`. A mixed answer, which is the useful kind here: a
    // module stuck on `true` and a module stuck on `false` both fail it.
    const selfPersonId = await insertPerson("self");
    await giveRole(selfPersonId, "kit_manager", pastDate(30));
    const self = operator(["it_officer"], selfPersonId);

    expect(await permittedAccountActions(self, selfPersonId)).toEqual({
      resend: true,
      correct: true,
      deactivate: false,
      restore: true,
      recoverEmail: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Seat-level controls
// ---------------------------------------------------------------------------

describe("the three seat decisions role detail may offer", () => {
  it("offers all three against an ordinary seat with an ordinary holder", async () => {
    const holder = await insertPerson("role-ordinary-holder");
    await giveRole(holder, "kit_manager", pastDate(30));

    expect(await permittedRoleActions(administrator(), "kit_manager", holder)).toEqual({
      assign: true,
      replace: true,
      end: true,
    });
  });

  it("offers only assignment when the seat is vacant", async () => {
    // LAN129-B1's shape: with no incumbent there is nobody to replace or end,
    // and the question that *can* be asked is whether this actor may confer
    // the seat at all.
    expect(await permittedRoleActions(administrator(), "kit_manager", null)).toEqual({
      assign: true,
      replace: false,
      end: false,
    });
  });

  it("weighs the seat being conferred, not only the person conferred it on", async () => {
    // The vacancy case that matters: `assign_role` is role-scoped, so a vacant
    // President seat is protected even though the subject is nobody. Offering
    // **Assign** here would invite an IT Officer to install a President.
    const restore = await vacateThePresidency();
    try {
      expect(await permittedRoleActions(itOfficer(), "president", null)).toEqual({
        assign: false,
        replace: false,
        end: false,
      });
      expect(await permittedRoleActions(generalManager(), "president", null)).toEqual({
        assign: true,
        replace: false,
        end: false,
      });
    } finally {
      await restore();
    }
  });

  it("offers nothing at all on the General Manager's seat, to anybody", async () => {
    const generalManagerPersonId = (
      await observer.query<{ person_id: string }>(
        `select ra.person_id
           from public.role_assignments ra
           join public.roles r on r.id = ra.role_id
          where r.code = 'general_manager'
            and ra.effective_from <= current_date
            and (ra.effective_to is null or ra.effective_to > current_date)
          limit 1`,
      )
    ).rows[0].person_id;

    for (const actor of [administrator(), generalManager(), president(), itOfficer()]) {
      expect(await permittedRoleActions(actor, "general_manager", generalManagerPersonId)).toEqual({
        assign: false,
        replace: false,
        end: false,
      });
    }
  });

  it("sees a future handover on the holder of an ordinary seat", async () => {
    // The same missing widening, on the other export. A President-elect who
    // also holds the kit is protected on the kit seat too — that is what
    // "protects the holder, not the seat" means, and a snapshot that could not
    // see the handover would offer **Replace holder** and **End** to an IT
    // Officer on the person about to preside.
    const restore = await vacateThePresidency();
    try {
      const elect = await insertPerson("role-president-elect");
      await giveRole(elect, "president", futureDate(45));
      await giveRole(elect, "kit_manager", pastDate(3));

      expect(await permittedRoleActions(itOfficer(), "kit_manager", elect)).toEqual({
        assign: true,
        replace: false,
        end: false,
      });

      expect(await permittedRoleActions(generalManager(), "kit_manager", elect)).toEqual({
        assign: true,
        replace: true,
        end: true,
      });
    } finally {
      await restore();
    }
  });
});

// ---------------------------------------------------------------------------

describe("the module's own shape", () => {
  it("reads the target's seats with the scheduled ones included", () => {
    // Behaviour is asserted above; this is the guard against a second read
    // being added later without the option, which is how six of the ten sites
    // in the services came to be unwidened.
    const source = readFileSync(
      path.join(process.cwd(), "src/app/operate/admin/permissions.ts"),
      "utf8",
    );
    const callSites = source.split("readAdministrationSubject(tx").slice(1);

    expect(callSites.length).toBe(1);
    for (const site of callSites) {
      expect(site.slice(0, 200)).toMatch(/includeScheduled:\s*true/);
    }
  });

  it("is not a server-action module, and must not become one", () => {
    // The module note says so and nothing enforced it. These are reads a page
    // performs; `"use server"` would turn every export into an endpoint a
    // browser can call with arguments it chose.
    const source = readFileSync(
      path.join(process.cwd(), "src/app/operate/admin/permissions.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*["']use server["']/m);
  });
});
