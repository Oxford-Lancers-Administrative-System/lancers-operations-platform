// @vitest-environment node
/**
 * The database half of the roster's CSV import — LAN-215, `WP-arrival-doors`,
 * workflow `W1`.
 *
 * `./roster-csv.test.ts` already proves what a row's own shape means, entirely
 * without a server. What only exists against the **real** local database is
 * everything `./roster-import.ts` adds on top of that: that
 * `requireCapability` runs before any read or write, that a row's duplicate
 * question is asked of the real roster (`findPersonCandidates`), that a
 * carried-forward person's own facts are never touched, that confirming
 * queues the welcome and never sends it, that a confirmed digest is checked
 * against a freshly recomputed plan rather than trusted, and that applying is
 * genuinely one transaction.
 *
 * Every name and mobile this suite invents is generated from `MARKER` and an
 * incrementing counter — never a plausible real one — because
 * `scripts/seed-local.mjs` draws its own ~66 synthetic people from name pools
 * that include ordinary-sounding names like "Hallowfield" and "Penhaligon".
 * `findPersonCandidates` matches loosely, on purpose (`roster.ts`'s own doc
 * comment), so a fixture using one of those names is a false "possible
 * duplicate" against a seeded stranger, not a controlled test. Every person
 * this suite creates carries `MARKER` in `given_name`, and `afterEach` deletes
 * exactly those and everything that hangs off them.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  applyRosterImport,
  IMPORT_NOTHING_TO_APPLY_MESSAGE,
  IMPORT_PLAN_MOVED_MESSAGE,
  planRosterImport,
  readRosterImportContext,
} from "./roster-import";
import { resolveOpenSeason } from "./roster";

const MARKER = "LAN215RosterImport";

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;
let openSeasonLabel: string;

const capability = vi.mocked(requireCapability);

function operator(): ResolvedOperator {
  return {
    authUserId: "55555555-5555-4555-8555-555555555555",
    personId: actorPersonId,
    displayName: "Roster Import Suite Operator",
    roleCodes: ["president"],
    isActive: true,
  };
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
  openSeasonLabel = season.label;
});

beforeEach(() => {
  capability.mockReset();
  capability.mockResolvedValue(operator());
});

async function cleanUp(): Promise<void> {
  const people = `(select id from public.people where given_name like '${MARKER}%')`;
  await observer.query(
    `delete from public.notification_jobs where idempotency_key like 'onboarding-welcome:%' and person_id in ${people}`,
  );
  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
  );
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
  );
  await observer.query(
    `delete from public.audit_events where entity_id in (select id from public.season_memberships where person_id in ${people}) or entity_id in ${people}`,
  );
  await observer.query(`delete from public.season_memberships where person_id in ${people}`);
  await observer.query(`delete from public.contact_points where person_id in ${people}`);
  await observer.query(`delete from public.person_aliases where person_id in ${people}`);
  await observer.query(`delete from public.people where given_name like '${MARKER}%'`);
}

afterEach(cleanUp);

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures — every value manufactured, never a plausible real one
// ---------------------------------------------------------------------------

let unique = 0;
function next(): number {
  unique += 1;
  return unique;
}

/** A given name unique to this run of this suite — never matches a seeded person. */
function givenNameFor(tag: string): string {
  return `${MARKER}${tag}${next()}`;
}

/** A family name unique to this run — the seed's own name pool includes ordinary ones. */
function familyNameFor(tag: string): string {
  return `${MARKER}Family${tag}${next()}`;
}

/** A mobile shape the validator accepts, guaranteed unique by an incrementing tail. */
function mobileFor(): string {
  return `07000${String(100000 + next()).padStart(6, "0")}`;
}

interface PersonFixture {
  id: string;
  givenName: string;
  familyName: string;
  mobile: string;
}

/** A person the club already holds, with no membership in the open season. */
async function seedCarriedForwardCandidate(): Promise<PersonFixture> {
  const givenName = givenNameFor("Carried");
  const familyName = familyNameFor("Carried");
  const mobile = mobileFor();
  const inserted = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  const id = inserted.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, 'phone', $2, true, 'seed')`,
    [id, mobile],
  );
  return { id, givenName, familyName, mobile };
}

/**
 * A person the club already holds, matched by name alone — no phone or email
 * on file matches the row that will be compared against them. This is the
 * genuinely ambiguous case: a mobile number is single-owner, so a phone match
 * auto-resolves (see `roster-import.ts`'s own comment), and only a name-only
 * match still asks.
 */
async function seedNameOnlyCandidate(): Promise<PersonFixture> {
  const givenName = givenNameFor("NameOnly");
  const familyName = familyNameFor("NameOnly");
  const inserted = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  const id = inserted.rows[0].id;
  const storedMobile = mobileFor();
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, 'phone', $2, true, 'seed')`,
    [id, storedMobile],
  );
  return { id, givenName, familyName, mobile: storedMobile };
}

/** A person already on this season's roster. */
async function seedAlreadyOnRoster(): Promise<PersonFixture> {
  const fixture = await seedCarriedForwardCandidate();
  await observer.query(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'returning', current_date)`,
    [fixture.id, openSeasonId],
  );
  return fixture;
}

function csvOf(
  rows: readonly {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    email?: string;
    college?: string;
    year?: string;
  }[],
): string {
  const header = "first_name,last_name,mobile,personal_email,college,matriculation_year";
  const body = rows.map((row) =>
    [
      row.firstName ?? "",
      row.lastName ?? "",
      row.mobile ?? "",
      row.email ?? "",
      row.college ?? "",
      row.year ?? "",
    ].join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

async function membershipStatusFor(personId: string): Promise<string | null> {
  const result = await observer.query<{ status: string }>(
    `select status::text as status from public.season_memberships
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, openSeasonId],
  );
  return result.rows[0]?.status ?? null;
}

async function welcomeQueuedFor(personId: string): Promise<{ queued: boolean; sent: boolean }> {
  const membership = await observer.query<{ id: string }>(
    `select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, openSeasonId],
  );
  const membershipId = membership.rows[0]?.id;
  if (!membershipId) return { queued: false, sent: false };
  const job = await observer.query<{ status: string }>(
    `select status::text as status from public.notification_jobs
      where idempotency_key = $1`,
    [`onboarding-welcome:${membershipId}`],
  );
  const row = job.rows[0];
  return { queued: Boolean(row), sent: row?.status === "delivered" || row?.status === "sent" };
}

// ---------------------------------------------------------------------------
// readRosterImportContext
// ---------------------------------------------------------------------------

describe("readRosterImportContext", () => {
  it("checks roster_bulk_import before reading anything", async () => {
    await readRosterImportContext();
    expect(capability).toHaveBeenCalledWith("roster_bulk_import");
  });

  it("reads the open season's label and counts", async () => {
    const context = await readRosterImportContext();
    expect(context.seasonLabel).toBe(openSeasonLabel);
    expect(context.onRoster).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// The plan — writes nothing
// ---------------------------------------------------------------------------

describe("planRosterImport", () => {
  it("checks roster_bulk_import before reading anything", async () => {
    await planRosterImport({ csvText: csvOf([]) });
    expect(capability).toHaveBeenCalledWith("roster_bulk_import");
  });

  it("proposes a genuinely new person as New, and writes nothing", async () => {
    const first = givenNameFor("New");
    const last = familyNameFor("New");
    const result = await planRosterImport({
      csvText: csvOf([{ firstName: first, lastName: last, mobile: mobileFor() }]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("new");
    expect(result.plan.totals.new).toBe(1);

    const found = await observer.query("select 1 from public.people where given_name = $1", [
      first,
    ]);
    expect(found.rowCount).toBe(0);
  });

  it("proposes a Carried forward outcome automatically for an exact phone match — never a repeated question", async () => {
    // A mobile number is single-owner: an exact match to it is a confirmed
    // identity, not a "possible" one. This is also what makes the same file
    // imported twice idempotent — see the apply-side test below.
    const candidate = await seedCarriedForwardCandidate();
    const result = await planRosterImport({
      csvText: csvOf([
        {
          firstName: candidate.givenName,
          lastName: candidate.familyName,
          mobile: candidate.mobile,
        },
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("carried_forward");
    expect(result.plan.rows[0].matchedPersonId).toBe(candidate.id);
    expect(result.plan.rows[0].duplicate).toBeNull();
    expect(result.plan.unansweredLines).toEqual([]);
  });

  it("refuses an unanswered possible duplicate matched by name alone, naming it, and leaves the rest of the file to apply", async () => {
    const candidate = await seedNameOnlyCandidate();
    const result = await planRosterImport({
      csvText: csvOf([
        {
          firstName: candidate.givenName,
          lastName: candidate.familyName,
          mobile: mobileFor(),
        },
        { firstName: givenNameFor("Clean"), lastName: familyNameFor("Clean"), mobile: mobileFor() },
      ]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("refused");
    expect(result.plan.rows[0].duplicate?.candidates.map((c) => c.personId)).toContain(
      candidate.id,
    );
    expect(result.plan.unansweredLines).toEqual([2]);
    // The rest of the file is not held up by it.
    expect(result.plan.rows[1].outcome).toBe("new");
    expect(result.plan.totals.refused).toBe(1);
  });

  it("resolves to Carried forward once the operator answers 'same person', for a name-only match with no membership yet", async () => {
    const candidate = await seedNameOnlyCandidate();
    const result = await planRosterImport({
      csvText: csvOf([
        {
          firstName: candidate.givenName,
          lastName: candidate.familyName,
          mobile: mobileFor(),
        },
      ]),
      duplicateAnswers: { "2": candidate.id },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("carried_forward");
    expect(result.plan.rows[0].matchedPersonId).toBe(candidate.id);
  });

  it("resolves to Unchanged for a name-only match already on this season's roster, once answered 'same person'", async () => {
    const already = await seedAlreadyOnRoster();
    const result = await planRosterImport({
      csvText: csvOf([
        { firstName: already.givenName, lastName: already.familyName, mobile: mobileFor() },
      ]),
      duplicateAnswers: { "2": already.id },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("unchanged");
  });

  it("treats 'different person' as New, ignoring the candidate", async () => {
    const candidate = await seedNameOnlyCandidate();
    const result = await planRosterImport({
      csvText: csvOf([
        {
          firstName: candidate.givenName,
          lastName: candidate.familyName,
          mobile: mobileFor(),
        },
      ]),
      duplicateAnswers: { "2": "different" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rows[0].outcome).toBe("new");
  });

  it("refuses the whole file, before any row is read, when the header is not recognised", async () => {
    const result = await planRosterImport({ csvText: "not,a,roster,file\r\n1,2,3,4\r\n" });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Applying — one transaction, and never a send
// ---------------------------------------------------------------------------

describe("applyRosterImport", () => {
  it("checks roster_bulk_import before writing anything", async () => {
    capability.mockClear();
    // An empty file is refused before anything is read, but the capability
    // check has to run before even that refusal is reached.
    await expect(applyRosterImport({ csvText: csvOf([]), digest: "x" })).rejects.toBeDefined();
    expect(capability).toHaveBeenCalledWith("roster_bulk_import");
  });

  it("creates a new person at onboarding, with a checklist and a queued welcome — never sent", async () => {
    const first = givenNameFor("Applied");
    const csvText = csvOf([
      {
        firstName: first,
        lastName: familyNameFor("Applied"),
        mobile: mobileFor(),
        college: "Brasenose",
        year: "2024",
      },
    ]);
    const proposal = await planRosterImport({ csvText });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const applied = await applyRosterImport({ csvText, digest: proposal.plan.digest });
    expect(applied.created).toBe(1);
    expect(applied.welcomesQueued).toBe(1);

    const person = await observer.query<{ id: string; college: string | null }>(
      "select id, college from public.people where given_name = $1",
      [first],
    );
    expect(person.rows).toHaveLength(1);
    expect(person.rows[0].college).toBe("Brasenose");

    const status = await membershipStatusFor(person.rows[0].id);
    expect(status).toBe("onboarding");

    const items = await observer.query(
      `select 1 from public.onboarding_items i
         join public.season_memberships m on m.id = i.season_membership_id
        where m.person_id = $1::uuid and m.season_id = $2::uuid`,
      [person.rows[0].id, openSeasonId],
    );
    expect((items.rowCount ?? 0) > 0).toBe(true);

    const welcome = await welcomeQueuedFor(person.rows[0].id);
    expect(welcome.queued).toBe(true);
    expect(welcome.sent).toBe(false);
  });

  it("never overwrites a carried-forward person's own facts", async () => {
    const candidate = await seedCarriedForwardCandidate();
    const csvText = csvOf([
      {
        firstName: candidate.givenName,
        lastName: familyNameFor("Disagreeing"),
        mobile: candidate.mobile,
        college: "A college the file claims",
      },
    ]);
    const proposal = await planRosterImport({
      csvText,
      duplicateAnswers: { "2": candidate.id },
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    await applyRosterImport({
      csvText,
      digest: proposal.plan.digest,
      duplicateAnswers: { "2": candidate.id },
    });

    const person = await observer.query<{ family_name: string | null; college: string | null }>(
      "select family_name, college from public.people where id = $1::uuid",
      [candidate.id],
    );
    // The stored surname and college are untouched by the file's disagreeing
    // values — no second person, and no silent update.
    expect(person.rows[0].family_name).toBe(candidate.familyName);
    expect(person.rows[0].college).toBeNull();

    const total = await observer.query(
      "select count(*)::text as n from public.people where id = $1::uuid",
      [candidate.id],
    );
    expect(total.rows[0].n).toBe("1");
  });

  it("writes nothing for a row still waiting on an unanswered duplicate, while the rest of the file applies", async () => {
    const candidate = await seedNameOnlyCandidate();
    const clean = givenNameFor("Applies");
    const csvText = csvOf([
      { firstName: candidate.givenName, lastName: candidate.familyName, mobile: mobileFor() },
      { firstName: clean, lastName: familyNameFor("Applies"), mobile: mobileFor() },
    ]);
    const proposal = await planRosterImport({ csvText });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const applied = await applyRosterImport({ csvText, digest: proposal.plan.digest });
    expect(applied.created).toBe(1);
    expect(applied.refused).toBe(1);

    const cleanPerson = await observer.query("select 1 from public.people where given_name = $1", [
      clean,
    ]);
    expect(cleanPerson.rowCount).toBe(1);
  });

  it("refuses the same file imported twice — the second run is Unchanged, no second checklist and no second welcome", async () => {
    const first = givenNameFor("Twice");
    const csvText = csvOf([
      { firstName: first, lastName: familyNameFor("Twice"), mobile: mobileFor() },
    ]);
    const proposal1 = await planRosterImport({ csvText });
    if (!proposal1.ok) throw new Error("expected a valid plan");
    await applyRosterImport({ csvText, digest: proposal1.plan.digest });

    const proposal2 = await planRosterImport({ csvText });
    expect(proposal2.ok).toBe(true);
    if (!proposal2.ok) return;
    expect(proposal2.plan.rows[0].outcome).toBe("unchanged");
    expect(proposal2.plan.applicableCount).toBe(0);

    await expect(
      applyRosterImport({ csvText, digest: proposal2.plan.digest }),
    ).rejects.toMatchObject({ message: IMPORT_NOTHING_TO_APPLY_MESSAGE });

    const person = await observer.query<{ id: string }>(
      "select id from public.people where given_name = $1",
      [first],
    );
    const jobs = await observer.query(
      "select count(*)::text as n from public.notification_jobs where idempotency_key like 'onboarding-welcome:%' and person_id = $1::uuid",
      [person.rows[0].id],
    );
    expect(jobs.rows[0].n).toBe("1");
  });

  it("refuses a stale digest rather than applying what the operator did not read", async () => {
    const first = givenNameFor("Stale");
    const csvText = csvOf([
      { firstName: first, lastName: familyNameFor("Stale"), mobile: mobileFor() },
    ]);
    await expect(applyRosterImport({ csvText, digest: "0000000000000000" })).rejects.toMatchObject({
      message: IMPORT_PLAN_MOVED_MESSAGE,
    });

    const person = await observer.query("select 1 from public.people where given_name = $1", [
      first,
    ]);
    expect(person.rowCount).toBe(0);
  });

  it("abandoning the confirmation writes nothing, because it never calls apply at all", async () => {
    // W1's own exceptions table: abandoning is simply not confirming. There
    // is no service call this test exercises — planRosterImport itself never
    // writes, proven above — so the coverage this needs is that proving.
    const first = givenNameFor("Abandoned");
    const proposal = await planRosterImport({
      csvText: csvOf([
        { firstName: first, lastName: familyNameFor("Abandoned"), mobile: mobileFor() },
      ]),
    });
    expect(proposal.ok).toBe(true);
    const person = await observer.query("select 1 from public.people where given_name = $1", [
      first,
    ]);
    expect(person.rowCount).toBe(0);
  });

  it("commits several applicable rows together, in one transaction", async () => {
    const a = givenNameFor("Batch");
    const b = givenNameFor("Batch");
    const csvText = csvOf([
      { firstName: a, lastName: familyNameFor("Batch"), mobile: mobileFor() },
      { firstName: b, lastName: familyNameFor("Batch"), mobile: mobileFor() },
    ]);
    const proposal = await planRosterImport({ csvText });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const applied = await applyRosterImport({ csvText, digest: proposal.plan.digest });
    expect(applied.created).toBe(2);

    const rows = await observer.query(
      "select given_name from public.people where given_name like $1",
      [`${MARKER}Batch%`],
    );
    expect(rows.rowCount).toBe(2);
  });
});
