// @vitest-environment node
/**
 * The whole slice, in one run — LAN-82.
 *
 * Every issue from LAN-71 to LAN-115 ships tests for its own behaviour. None of
 * them proves that the pieces compose, and composition is where this kind of
 * system actually breaks: the invitation approval created is not the one
 * delivery sent, the token that went out is not the one the response was
 * written through, the attendance somebody recorded is not the one the report
 * compared. This file walks the path once, in order, and asserts the **joins**
 * between the steps rather than re-testing what each step already proves.
 *
 * ## What "end to end" means here, exactly
 *
 * The service layer, against the real local database, from a seeded stack.
 * Three things are deliberately real that a cheaper test would fake:
 *
 *   * **The database.** Approval's atomicity, the idempotency key that stops a
 *     second job, the composite foreign keys that tie an invitation to an
 *     approved event, the advisory lock that serialises report versions — none
 *     of those exist anywhere but PostgreSQL.
 *   * **The provider adapter.** `dispatchEventInvitations` runs the real
 *     WhatsApp Cloud adapter with an injected `Transport`, so the request this
 *     test inspects is the request Meta would receive. The plaintext RSVP token
 *     is recovered *from that request body* — which is what makes step 9 a
 *     genuine hand-off assertion and not a lookup the test arranged for itself.
 *   * **Authentication.** The operator and the coach sign in through the local
 *     Auth server with a password, and the verified user id is what resolves
 *     them to a Person. `resolveOperatorAccess()` needs a request context and
 *     cannot be called here, so the walk performs the same join it performs and
 *     feeds the result into the same guards the server actions use.
 *
 * The one thing that is **not** real is the network: no message leaves the
 * machine and no Meta credential exists. `src/lib/delivery/whatsapp-cloud.test.ts`
 * is the provider contract test that pins the request shape and every response
 * branch; this file asserts that the walk produces a request conforming to it.
 * `docs/operating-the-slice.md` § 7 gives the safe live-provider procedure for
 * the evidence a mock cannot supply.
 *
 * ## Determinism, and the shared stack
 *
 * Vitest runs suites in parallel against one database. Every row this file
 * writes hangs off `MARKER`, and `cleanUp()` runs before the walk as well as
 * after it, so a run interrupted halfway leaves nothing that poisons the next
 * one. The reporting date is this file's alone, so the version chain it asserts
 * cannot interleave with another suite's.
 *
 * The dates are fixed rather than relative to `now()`: the event has to be in
 * the future for a token to be issuable at all (a link for an event that has
 * started is refused), and inside a seeded Oxford term for the term-card
 * projection to be assertable. Michaelmas 2026 week 1 satisfies both and will
 * keep satisfying them, because the seeded calendar is fixed too.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import { assertCapability } from "@/lib/auth/guards";
import {
  CAPABILITY_KEYS,
  isNarrowAttendanceRecorder,
  type CapabilityKey,
} from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";
import type { Transport } from "@/lib/delivery/provider";
import { enterReturningPlayer } from "@/lib/services/roster";
import { activateMembership } from "@/lib/services/membership";
import {
  createEventDraft,
  listCurrentSeasonEvents,
  markEventOccurred,
} from "@/lib/services/events";
import { selectionKey } from "@/lib/services/audience-selection";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { RESPONSE_DEADLINE_RULES } from "@/lib/services/response-deadline";
import {
  applyProviderCallback,
  dispatchEventInvitations,
  readEventDelivery,
} from "@/lib/services/delivery";
import { resolveRsvpToken } from "@/lib/services/rsvp-tokens";
import { recordSignedLinkResponse } from "@/lib/services/rsvp";
import {
  readAttendanceBoard,
  recordAttendance,
  recordWalkUpAttendance,
} from "@/lib/services/attendance";
import { generateWeeklyReport, listReportVersions } from "@/lib/services/weekly-report";
import { listTermWindows } from "@/lib/services/seasons";
import {
  buildMonthGrid,
  buildTermCard,
  monthGridEvents,
  termCardEvents,
} from "@/lib/services/calendar";
import { openLocalClient } from "./helpers/domain-fixture";

/**
 * The handle every row this walk writes carries, and the one `cleanUp()`
 * deletes by. Unique to this file — see the header.
 */
const MARKER = "LAN82Walk";

/**
 * Michaelmas 2026, week 1 — inside a seeded term and comfortably in the future,
 * for the two reasons the header gives.
 */
const EVENT_ON = "2026-10-14";
const EVENT_STARTS_AT = "19:00";

/**
 * The evening the register is taken — D71 and D72, LAN-152.
 *
 * The event is deliberately in the future, for the reasons the header gives,
 * and the register now opens on a buffer before its start rather than the
 * moment somebody asserts occurrence. So the two steps below that open the
 * register say **when** they are standing at the pitch, rather than reading it
 * from a clock that is still weeks short of the evening.
 *
 * That is what the walk is: a workflow moving through its own timeline. Every
 * other step already happens at a moment the previous one made possible, and
 * this is the first one whose moment the product cares about.
 */
const EVENING_OF_THE_EVENT = new Date(`${EVENT_ON}T${EVENT_STARTS_AT}:00Z`);
const EVENT_ENDS_AT = "21:00";
const EVENT_TERM = "michaelmas";
const EVENT_ACADEMIC_YEAR = "2026-27";
const EVENT_WEEK = 1;
const EVENT_MONTH = "2026-10";

/**
 * The reporting date this walk files snapshots for. **This file's alone.**
 *
 * Deliberately not the date `docs/operating-the-slice.md` suggests a human uses
 * for the same practice: a person following the runbook files versions 1 and 2
 * by hand, and this test then filed version 3 and failed on an assertion about
 * supersession that was perfectly correct. Two walks of the same slice must not
 * be able to collide, so the manual one and the automated one have a date each,
 * and `cleanUp()` clears this one whoever wrote it.
 */
const REPORT_ON = "2026-10-16";

/** Local logins this walk creates. Deleted with everything else. */
const OPERATOR_EMAIL = "lan82.operator@oxfordlancers.local";
const COACH_EMAIL = "lan82.coach@oxfordlancers.local";
const PLAYER_EMAIL = "lan82.player@oxfordlancers.local";
const FORMER_COACH_EMAIL = "lan82.former.coach@oxfordlancers.local";
const LOGIN_PASSWORD = "lan82-walkthrough-not-a-real-secret";

const LOGINS = [OPERATOR_EMAIL, COACH_EMAIL, PLAYER_EMAIL, FORMER_COACH_EMAIL];

/**
 * The provider settings the adapter needs, supplied as an explicit source
 * rather than through `process.env`, so this file never depends on how the
 * machine happens to be configured and never reads a real credential.
 */
const PROVIDER_ENVIRONMENT: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550082",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  // LAN-124 made the recipient allowlist a required outbound setting: unset,
  // the whole sending path reports itself unconfigured and dispatches nothing.
  // These are the three numbers this walk invites — the two players who answer
  // and the walk-up — all in Ofcom's reserved drama range.
  DELIVERY_RECIPIENT_ALLOWLIST: "07700 900321,07700 900322,07700 900323",
};

/** Provider message identifiers this run invents. Globally unique by table. */
const PROVIDER_MESSAGE_PREFIX = `wamid.${MARKER}.`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const configured = Boolean(url && secretKey && publishableKey);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local Supabase environment is incomplete.");
}

// ---------------------------------------------------------------------------
// What the walk accumulates as it goes
// ---------------------------------------------------------------------------

interface Walker {
  personId: string;
  membershipId: string;
  authUserId: string;
}

let db: Client;
let admin: SupabaseClient;

let operator: ResolvedOperator;
let coach: ResolvedOperator;
let player: ResolvedOperator;
let formerCoach: ResolvedOperator;

let seasonId: string;
let sayingYes: Walker;
let sayingNo: Walker;

let eventId: string;
/** invitation id → the plaintext token the adapter actually sent. */
const deliveredTokens = new Map<string, string>();
/** invitation id → the provider message identifier the send returned. */
const providerMessageIds = new Map<string, string>();
let yesInvitationId: string;
let noInvitationId: string;
let yesResponseId: string;
let noResponseId: string;
let walkUpKey: string;
let firstReportId: string;

const DECLINE_REASON = "Away at a family event that weekend.";

// ---------------------------------------------------------------------------
// The transport: real adapter, no network
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  method: string | undefined;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

const sent: CapturedRequest[] = [];

/**
 * Accepts every message, recording the exact request first.
 *
 * A distinct identifier per send, because Meta's are distinct and
 * `delivery_attempts_provider_message_unique` is what lets one callback name
 * exactly one attempt. A stub reusing one identifier would collide with the
 * constraint and prove nothing.
 */
const capturingTransport: Transport = async (requestUrl, init) => {
  const headers = new Headers(init.headers as HeadersInit);
  sent.push({
    url: requestUrl,
    method: init.method,
    authorization: headers.get("authorization") ?? undefined,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  });

  return new Response(
    JSON.stringify({ messages: [{ id: `${PROVIDER_MESSAGE_PREFIX}${sent.length}` }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The refusal a guard threw, or a failure naming what happened instead. */
async function refusalOf(action: () => Promise<unknown> | unknown): Promise<ServiceError> {
  try {
    await action();
  } catch (caught) {
    if (isServiceError(caught)) return caught;
    throw caught;
  }
  throw new Error("Expected the service layer to refuse this, and it did not.");
}

/**
 * One local login, bound to one Person, holding one optionally effective seat.
 *
 * This is the real linking path: an Auth user, an `operator_accounts` row and a
 * `role_assignments` row. Nothing is inserted into `people` behind the service
 * layer's back except the identity itself, which no service in this slice
 * creates for a coach or a committee member.
 */
async function linkLogin(options: {
  email: string;
  familyName: string;
  roleCode?: string;
  scope?: "committee_year" | "season";
  effectiveFrom?: string;
  effectiveTo?: string | null;
}): Promise<{ personId: string; authUserId: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: options.email,
    password: LOGIN_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create ${options.email}: ${error.message}`);
  const authUserId = data.user!.id;

  const person = await db.query<{ id: string }>(
    // `created_at` is set far ahead deliberately. Several suites resolve an
    // acting operator as "the oldest person"; a fixture person created at plain
    // `now()` can win that ordering, and this file then deletes their actor out
    // from under them. Sorting these rows to the end of every ordering keeps
    // them unpickable.
    `insert into public.people (given_name, family_name, created_at)
     values ($1, $2, now() + interval '100 years') returning id`,
    [MARKER, options.familyName],
  );
  const personId = person.rows[0].id;

  await db.query(
    `insert into public.operator_accounts (auth_user_id, person_id, is_active)
     values ($1, $2, true)`,
    [authUserId, personId],
  );

  if (options.roleCode) {
    await db.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, season_id, effective_from, effective_to)
       select $1, r.id, r.scope, r.is_constitutional_office, r.is_single_holder_seat,
              case when r.scope = 'committee_year'
                   then (select id from public.committee_years
                          where ends_on is null or ends_on > current_date
                          order by starts_on desc limit 1) end,
              case when r.scope = 'season'
                   then (select id from public.seasons
                          where status = 'active' order by starts_on desc limit 1) end,
              $3::date, $4::date
         from public.roles r
        where r.code = $2`,
      [
        personId,
        options.roleCode,
        options.effectiveFrom ?? "current_date",
        options.effectiveTo ?? null,
      ],
    );
  }

  return { personId, authUserId };
}

/**
 * Signs the login in for real and resolves it the way the request path does.
 *
 * The identity comes from `auth.getUser(token)` — verified against the Auth
 * server, exactly as `resolveOperatorAccess()` insists — and the person and the
 * currently-effective role codes are read through `operator_accounts` and
 * `role_assignments`. Both bounds of effective dating are applied, which is
 * what makes the ended-seat denial below a real test of the rule rather than of
 * a fixture.
 */
async function signInAndResolve(email: string): Promise<ResolvedOperator> {
  const anon = createClient(url!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: LOGIN_PASSWORD,
  });
  if (signInError) throw new Error(`Could not sign ${email} in: ${signInError.message}`);

  const { data: verified, error: verifyError } = await anon.auth.getUser(
    session.session!.access_token,
  );
  if (verifyError) throw new Error(`Could not verify ${email}: ${verifyError.message}`);

  const resolved = await db.query<{
    person_id: string;
    display_name: string;
    is_active: boolean;
    role_codes: string[] | null;
  }>(
    `select a.person_id,
            coalesce(nullif(btrim(p.known_as), ''), p.given_name)
              || coalesce(' ' || p.family_name, '') as display_name,
            a.is_active,
            (select array_agg(distinct r.code order by r.code)
               from public.role_assignments ra
               join public.roles r on r.id = ra.role_id
              where ra.person_id = a.person_id
                and ra.effective_from <= current_date
                and (ra.effective_to is null or ra.effective_to > current_date)) as role_codes
       from public.operator_accounts a
       join public.people p on p.id = a.person_id
      where a.auth_user_id = $1 and a.is_active`,
    [verified.user!.id],
  );

  const row = resolved.rows[0];
  expect(row, `${email} did not resolve to an active operator account`).toBeTruthy();

  return {
    authUserId: verified.user!.id,
    personId: row.person_id,
    displayName: row.display_name,
    roleCodes: row.role_codes ?? [],
    isActive: true,
  };
}

/** Enters one returning player through the real intake, and activates them. */
async function enterAndActivate(familyName: string, phone: string): Promise<Walker> {
  const intake = await enterReturningPlayer({
    actorPersonId: operator.personId,
    input: { givenName: MARKER, familyName, phone },
    decision: { kind: "new", confirmed: true },
  });

  await activateMembership({
    actorPersonId: operator.personId,
    membershipId: intake.membershipId,
    overrideReason: `${MARKER}: onboarding items outstanding, activated for the slice walk.`,
  });

  return { personId: intake.personId, membershipId: intake.membershipId, authUserId: "" };
}

/**
 * Everything this walk may have written, in an order the foreign keys accept.
 *
 * Safe to call twice, and called before the walk as well as after it: a run
 * killed halfway through otherwise leaves an Auth user occupying an email and a
 * report occupying a version, and the next run fails for a reason that has
 * nothing to do with the code.
 */
async function cleanUp(): Promise<void> {
  /** Every identifier in one column of one query, as a plain array. */
  async function ids(sql: string, params: unknown[] = []): Promise<string[]> {
    const result = await db.query<{ id: string }>(sql, params);
    return result.rows.map((row) => row.id);
  }

  /**
   * A delete keyed on an array of identifiers.
   *
   * Arrays rather than nested subqueries because a subquery that mentions a
   * parameter the outer statement does not use leaves PostgreSQL unable to
   * infer that parameter's type, and `any($1::uuid[])` on an empty array is a
   * well-defined no-op rather than a special case.
   */
  async function purge(table: string, column: string, values: string[]): Promise<void> {
    if (values.length === 0) return;
    await db.query(`delete from ${table} where ${column} = any($1::uuid[])`, [values]);
  }

  const personIds = await ids("select id from public.people where given_name = $1", [MARKER]);
  const eventIds = await ids("select id from public.events where name like $1", [`${MARKER}%`]);
  const membershipIds = await ids(
    "select id from public.season_memberships where person_id = any($1::uuid[])",
    [personIds],
  );
  const jobIds = await ids(
    "select id from public.notification_jobs where event_id = any($1::uuid[])",
    [eventIds],
  );
  const invitationIds = await ids(
    "select id from public.invitations where event_id = any($1::uuid[])",
    [eventIds],
  );
  const attemptIds = await ids(
    "select id from public.delivery_attempts where notification_job_id = any($1::uuid[])",
    [jobIds],
  );
  const attendanceIds = await ids(
    "select id from public.attendance_records where event_id = any($1::uuid[])",
    [eventIds],
  );

  // Delivery evidence, deepest first.
  await purge("public.delivery_callbacks", "delivery_attempt_id", attemptIds);
  // An unmatched callback has no attempt and is unreachable above. Left behind,
  // it occupies its globally unique `provider_event_id` for ever.
  await db.query("delete from public.delivery_callbacks where provider_event_id like $1", [
    `${PROVIDER_MESSAGE_PREFIX}%`,
  ]);
  await purge("public.delivery_results", "notification_job_id", jobIds);
  await purge("public.delivery_attempts", "notification_job_id", jobIds);

  // Participation.
  await purge("public.audit_events", "entity_id", [
    ...eventIds,
    ...jobIds,
    ...attendanceIds,
    ...invitationIds,
    ...personIds,
    ...membershipIds,
  ]);
  await purge("public.notification_jobs", "event_id", eventIds);
  await purge("public.attendance_records", "event_id", eventIds);
  await purge("public.rsvp_responses", "invitation_id", invitationIds);
  await purge("public.rsvp_access_tokens", "invitation_id", invitationIds);
  await purge("public.invitations", "event_id", eventIds);
  await purge("public.event_audience_members", "event_id", eventIds);

  // Every report on this file's own reporting date, whoever filed it.
  //
  // Not "the ones this walk's people generated": a run interrupted after the
  // first snapshot leaves version 1 behind, the next run files version 2, and
  // the assertion that a fresh walk produces version 1 fails for a reason that
  // has nothing to do with the code. The date is declared this file's alone in
  // `REPORT_ON` precisely so that clearing it wholesale is safe.
  //
  // Newest first, one layer at a time: `supersedes_id` points at another row in
  // this table `on delete restrict`, so deleting the whole chain in one
  // statement is refused by the row a later version still names.
  for (;;) {
    const removed = await db.query(
      `delete from public.weekly_reports w
        where w.report_on = $1::date
          and not exists (
            select 1 from public.weekly_reports later where later.supersedes_id = w.id
          )`,
      [REPORT_ON],
    );
    if ((removed.rowCount ?? 0) === 0) break;
  }

  await purge("public.events", "id", eventIds);
  await purge("public.audit_events", "actor_person_id", personIds);

  // Identity and membership.
  await purge("public.onboarding_items", "season_membership_id", membershipIds);
  await purge("public.season_membership_status_events", "season_membership_id", membershipIds);
  await purge("public.season_memberships", "id", membershipIds);
  await purge("public.recruitment_prospects", "person_id", personIds);
  await purge("public.role_assignments", "person_id", personIds);
  await purge("public.contact_points", "person_id", personIds);
  await purge("public.person_aliases", "person_id", personIds);
  await purge("public.operator_accounts", "person_id", personIds);
  await purge("public.people", "id", personIds);

  // The Auth users last: `operator_accounts.auth_user_id` is `on delete restrict`.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (user.email && LOGINS.includes(user.email.toLowerCase())) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}

// ---------------------------------------------------------------------------

describe.runIf(configured).sequential("the whole slice, walked once", () => {
  beforeAll(async () => {
    db = await openLocalClient();
    admin = createClient(url!, secretKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await cleanUp();

    const season = await db.query<{ id: string }>(
      "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
    );
    seasonId = season.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await cleanUp();
    await db.end();
    await closePool();
  }, 120_000);

  // -------------------------------------------------------------------------
  // 1. Link an operator
  // -------------------------------------------------------------------------

  it("links a login to a Person, and the seat it holds decides what it may do", async () => {
    // An IT Officer: the seat that carries every capability this walk needs,
    // and one the club may fill more than once, so provisioning one alongside
    // the seeded holder is legal. An Office would collide with
    // `role_assignments_one_holder_per_office`, and General Manager — which
    // this walk used to borrow — with the single-holder rule LAN-128 gave it.
    const linked = await linkLogin({
      email: OPERATOR_EMAIL,
      familyName: "Operator",
      roleCode: "it_officer",
      effectiveFrom: "2026-01-01",
    });
    expect(linked.personId).toBeTruthy();

    operator = await signInAndResolve(OPERATOR_EMAIL);
    expect(operator.personId).toBe(linked.personId);
    expect(operator.roleCodes).toContain("it_officer");

    // The guards the server actions call, on the roles the database resolved.
    for (const key of [
      "event_calendar_management",
      "event_approval",
      "event_occurrence_assertion",
      "membership_activation",
      "delivery_administration",
      "leadership_report",
    ] as const) {
      expect(() => assertCapability(operator, key), key).not.toThrow();
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // 2–3. Enter two returners, and activate them
  // -------------------------------------------------------------------------

  it("enters two returning players and activates both memberships", async () => {
    sayingYes = await enterAndActivate("Yes", "07700 900321");
    sayingNo = await enterAndActivate("No", "07700 900322");

    const memberships = await db.query<{ id: string; status: string; entry: string }>(
      `select m.id, m.status::text as status, m.entry::text as entry
         from public.season_memberships m
         join public.people p on p.id = m.person_id
        where p.given_name = $1 and m.season_id = $2
        order by p.family_name`,
      [MARKER, seasonId],
    );

    expect(memberships.rows.map((row) => row.status)).toEqual(["active", "active"]);

    // The intake's documented status sequence, not a single `confirmed` insert:
    // `carried_forward → confirmed` on entry, then `confirmed → onboarding →
    // active` on activation. Every step is recorded, and the chain joins up.
    //
    // Compared as a set. `occurred_at` defaults to `now()`, which is the
    // transaction timestamp, so the two rows the intake writes share one and
    // no column orders them — asserting a sequence would be asserting the
    // order UUIDs happened to sort in.
    const history = await db.query<{ from_status: string | null; to_status: string }>(
      `select e.from_status::text as from_status, e.to_status::text as to_status
         from public.season_membership_status_events e
        where e.season_membership_id = $1`,
      [sayingYes.membershipId],
    );
    const steps = history.rows.map((row) => `${row.from_status ?? "-"}>${row.to_status}`);
    expect([...steps].sort()).toEqual(
      [
        "->carried_forward",
        "carried_forward>confirmed",
        "confirmed>onboarding",
        "onboarding>active",
      ].sort(),
    );

    // The chain is closed: exactly one step starts from nothing, and every
    // other step begins where an earlier one ended.
    const arrivals = new Set(history.rows.map((row) => row.to_status));
    expect(history.rows.filter((row) => row.from_status === null)).toHaveLength(1);
    for (const row of history.rows) {
      if (row.from_status !== null)
        expect(arrivals.has(row.from_status), row.from_status).toBe(true);
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // 4. Save a practice — Save alone creates a draft
  // -------------------------------------------------------------------------

  it("saves a practice as a draft, with no separate submit step", async () => {
    const draft = await createEventDraft(operator.personId, {
      name: `${MARKER} Michaelmas practice`,
      eventType: "practice",
      scheduledOn: EVENT_ON,
      startsAt: EVENT_STARTS_AT,
      endsAt: EVENT_ENDS_AT,
      venue: "University Parks, Oxford OX1 3RF",
      isMandatory: false,
      solicitsResponse: true,
    });

    eventId = draft.id;
    expect(draft.status).toBe("draft");
    expect(draft.venue).toBe("University Parks, Oxford OX1 3RF");

    // The term coordinate is derived from the date, never entered beside it.
    const stored = await db.query<{ week_number: number; term_name: string }>(
      `select e.week_number, t.name::text as term_name
         from public.events e join public.terms t on t.id = e.term_id
        where e.id = $1`,
      [eventId],
    );
    expect(stored.rows[0]).toMatchObject({ week_number: EVENT_WEEK, term_name: EVENT_TERM });

    // `pending_approval` exists in the enum and nothing in the application
    // produces it. A submit step would show up here as a second transition.
    const actions = await db.query<{ action: string }>(
      "select action from public.audit_events where entity_id = $1 order by occurred_at",
      [eventId],
    );
    expect(actions.rows.map((row) => row.action)).toEqual(["event.drafted"]);
  }, 60_000);

  // -------------------------------------------------------------------------
  // 5–6. Confirm the audience, then approve it in one transaction
  // -------------------------------------------------------------------------

  it("confirms an audience containing both new members, and approves it", async () => {
    const proposed = await saveEventAudience(operator.personId, eventId, [
      selectionKey("player", sayingYes.membershipId),
      selectionKey("player", sayingNo.membershipId),
    ]);
    expect(proposed.map((member) => member.anchorId).sort()).toEqual(
      [sayingYes.membershipId, sayingNo.membershipId].sort(),
    );

    const outcome = await approveEvent(operator.personId, eventId);

    expect(outcome.event.status).toBe("approved");
    expect(outcome.invitationCount).toBe(2);
    expect(outcome.notificationJobCount).toBe(2);

    // The deadline comes from the centrally configured rule for the event type,
    // with no per-event override anywhere in this path.
    expect(outcome.deadline?.rule).toEqual(RESPONSE_DEADLINE_RULES.practice);
    expect(outcome.deadline?.clamped).toBe(false);

    const invitations = await db.query<{ id: string; membership: string; status: string }>(
      `select id, season_membership_id as membership, status::text as status
         from public.invitations where event_id = $1`,
      [eventId],
    );
    yesInvitationId = invitations.rows.find((row) => row.membership === sayingYes.membershipId)!.id;
    noInvitationId = invitations.rows.find((row) => row.membership === sayingNo.membershipId)!.id;
    expect(yesInvitationId).toBeTruthy();
    expect(noInvitationId).toBeTruthy();

    // Adding a late recipient after approval is unavailable: the audience is
    // fixed once the event leaves `draft`.
    const refusal = await refusalOf(() =>
      saveEventAudience(operator.personId, eventId, [
        selectionKey("player", sayingYes.membershipId),
      ]),
    );
    expect(refusal.rule).toBe("event_audience_requires_draft");
  }, 60_000);

  // -------------------------------------------------------------------------
  // 7–8. Automated WhatsApp dispatch, and durable delivery evidence
  // -------------------------------------------------------------------------

  it("dispatches both invitations through the WhatsApp adapter, with no manual step", async () => {
    const summary = await dispatchEventInvitations(eventId, {
      source: PROVIDER_ENVIRONMENT,
      transport: capturingTransport,
    });

    expect(summary).toMatchObject({ attempted: 2, accepted: 2, refused: 0, skipped: 0 });
    expect(sent).toHaveLength(2);

    // The provider contract, as `whatsapp-cloud.test.ts` pins it: the Graph
    // messages endpoint for the configured phone number, a bearer token, and
    // the approved template's four body parameters in order.
    for (const request of sent) {
      expect(request.method).toBe("POST");
      expect(request.url).toContain(`/${PROVIDER_ENVIRONMENT.WHATSAPP_PHONE_NUMBER_ID}/messages`);
      expect(request.authorization).toBe(`Bearer ${PROVIDER_ENVIRONMENT.WHATSAPP_ACCESS_TOKEN}`);
      expect(request.body).toMatchObject({ messaging_product: "whatsapp", type: "template" });

      const template = request.body.template as {
        name: string;
        components: { parameters: { text: string }[] }[];
      };
      expect(template.name).toBe(PROVIDER_ENVIRONMENT.WHATSAPP_TEMPLATE_NAME);
      const parameters = template.components[0].parameters.map((entry) => entry.text);
      expect(parameters).toHaveLength(4);
      expect(parameters[1]).toContain(MARKER);
      expect(parameters[3]).toMatch(
        new RegExp(`^${PROVIDER_ENVIRONMENT.APP_BASE_URL}/rsvp/[A-Za-z0-9_-]{43}$`),
      );
    }

    // Durable evidence: an attempt per invitation, each carrying the provider's
    // own message identifier, and a recorded result. `delivery_results` is the
    // authority on what happened — invariant M4.
    const attempts = await db.query<{
      invitation_id: string;
      provider: string;
      provider_message_id: string;
      outcome: string | null;
    }>(
      `select j.invitation_id, a.provider, a.provider_message_id, r.outcome::text as outcome
         from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
         left join public.delivery_results r
           on r.notification_job_id = a.notification_job_id
          and r.attempt_number = a.attempt_number
        where j.event_id = $1`,
      [eventId],
    );

    expect(attempts.rows).toHaveLength(2);
    for (const row of attempts.rows) {
      expect(row.provider).toBe(WHATSAPP_CLOUD_PROVIDER);
      expect(row.provider_message_id).toContain(PROVIDER_MESSAGE_PREFIX);
      providerMessageIds.set(row.invitation_id, row.provider_message_id);
    }

    // Nothing anywhere in this path is a person copying a link: the only
    // channel written is `whatsapp`, and `manual` is not a channel the
    // dispatcher can produce.
    const channels = await db.query<{ channel: string }>(
      "select distinct channel::text as channel from public.notification_jobs where event_id = $1",
      [eventId],
    );
    expect(channels.rows.map((row) => row.channel)).toEqual(["whatsapp"]);
  }, 120_000);

  // -------------------------------------------------------------------------
  // JOIN A + B. Approval's invitation is the one delivered; the delivered token
  // resolves to that invitation.
  // -------------------------------------------------------------------------

  it("hands off approval to delivery: the token that went out resolves to the invitation approval created", async () => {
    // The tokens come out of the captured request bodies, not out of the
    // database. That is the whole point: a token read from
    // `rsvp_access_tokens` would prove the test can query, and this proves the
    // link a player receives is the link this invitation minted.
    for (const request of sent) {
      const template = request.body.template as {
        components: { parameters: { text: string }[] }[];
      };
      const link = template.components[0].parameters[3].text;
      const token = link.slice(link.lastIndexOf("/") + 1);

      const resolution = await resolveRsvpToken(token);
      expect(resolution.state).toBe("valid");
      expect(resolution.writable).toBe(true);
      expect(resolution.invitation!.eventId).toBe(eventId);

      deliveredTokens.set(resolution.invitation!.invitationId, token);
    }

    // Both invitations approval created, and no others.
    expect([...deliveredTokens.keys()].sort()).toEqual([yesInvitationId, noInvitationId].sort());

    // Only the digest is stored. The plaintext exists in the message and nowhere else.
    const stored = await db.query<{ token_hash: string }>(
      `select token_hash from public.rsvp_access_tokens
        where invitation_id = any($1::uuid[])`,
      [[yesInvitationId, noInvitationId]],
    );
    expect(stored.rows).toHaveLength(2);
    for (const row of stored.rows) {
      expect([...deliveredTokens.values()]).not.toContain(row.token_hash);
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // 9. The provider's callback closes the loop
  // -------------------------------------------------------------------------

  it("records the provider's delivery callback against the attempt it names", async () => {
    for (const [invitationId, providerMessageId] of providerMessageIds) {
      const applied = await applyProviderCallback(
        WHATSAPP_CLOUD_PROVIDER,
        {
          providerEventId: `${providerMessageId}.delivered`,
          providerMessageId,
          providerStatus: "delivered",
          outcome: "delivered",
          detail: null,
        },
        { signatureVerified: true },
      );
      expect(applied, invitationId).toBe("applied");
    }

    const delivery = await readEventDelivery(eventId);
    expect(delivery.counts).toMatchObject({ audience: 2, delivered: 2, failed: 0, queued: 0 });
    expect(delivery.rows.every((row) => row.state === "delivered")).toBe(true);
    expect(delivery.rows.every((row) => row.tokenState === "live")).toBe(true);

    // An unverified callback is never stored, whatever it claims.
    const refusal = await refusalOf(() =>
      applyProviderCallback(
        WHATSAPP_CLOUD_PROVIDER,
        {
          providerEventId: `${PROVIDER_MESSAGE_PREFIX}forged`,
          providerMessageId: null,
          providerStatus: "delivered",
          outcome: "delivered",
          detail: null,
        },
        { signatureVerified: false },
      ),
    );
    expect(refusal.rule).toBe("delivery_callbacks_are_verified_before_they_are_stored");
  }, 60_000);

  // -------------------------------------------------------------------------
  // 10–11. Yes on one link, No with a reason on the other
  // -------------------------------------------------------------------------

  it("answers Yes on one delivered link and No with a reason on the other", async () => {
    const yes = await recordSignedLinkResponse(deliveredTokens.get(yesInvitationId)!, {
      response: "yes",
    });
    expect(yes.invitationId).toBe(yesInvitationId);
    yesResponseId = yes.responseId;

    // A No with no reason is refused before anything is written.
    const refusal = await refusalOf(() =>
      recordSignedLinkResponse(deliveredTokens.get(noInvitationId)!, {
        response: "no",
        reason: "   ",
      }),
    );
    expect(refusal.rule).toBe("rsvp_responses_no_requires_a_reason");

    const no = await recordSignedLinkResponse(deliveredTokens.get(noInvitationId)!, {
      response: "no",
      reason: DECLINE_REASON,
    });
    expect(no.invitationId).toBe(noInvitationId);
    noResponseId = no.responseId;

    const standing = await db.query<{
      invitation_id: string;
      response: string;
      reason: string | null;
    }>(
      `select invitation_id, response::text as response, reason
         from public.current_rsvp where invitation_id = any($1::uuid[])`,
      [[yesInvitationId, noInvitationId]],
    );
    expect(
      standing.rows.map((row) => [row.invitation_id, row.response, row.reason]).sort(),
    ).toEqual(
      [
        [yesInvitationId, "yes", null],
        [noInvitationId, "no", DECLINE_REASON],
      ].sort(),
    );
  }, 60_000);

  // -------------------------------------------------------------------------
  // 12. The operator asserts the event occurred
  // -------------------------------------------------------------------------

  it("asserts the event occurred, naming the operator who asserted it", async () => {
    const occurred = await markEventOccurred(operator.personId, eventId);
    expect(occurred.status).toBe("occurred");

    const asserted = await db.query<{ by: string; at: Date | null }>(
      "select outcome_recorded_by_person_id as by, outcome_recorded_at as at from public.events where id = $1",
      [eventId],
    );
    expect(asserted.rows[0].by).toBe(operator.personId);
    expect(asserted.rows[0].at).not.toBeNull();
  }, 60_000);

  // -------------------------------------------------------------------------
  // 13. An explicitly authorized coach, and only that
  // -------------------------------------------------------------------------

  it("provisions an authorized coach, an ordinary player and a coach whose seat has ended", async () => {
    await linkLogin({
      email: COACH_EMAIL,
      familyName: "Coach",
      roleCode: "head_coach",
      effectiveFrom: "2026-08-01",
    });
    // A login with a Person and no seat at all: the ordinary player's account.
    await linkLogin({ email: PLAYER_EMAIL, familyName: "Player" });
    // A coaching seat that has ended. Authority is effective-dated at both
    // ends, and this is the end.
    await linkLogin({
      email: FORMER_COACH_EMAIL,
      familyName: "FormerCoach",
      roleCode: "offence_coach",
      effectiveFrom: "2026-06-01",
      effectiveTo: "2026-08-01",
    });

    coach = await signInAndResolve(COACH_EMAIL);
    player = await signInAndResolve(PLAYER_EMAIL);
    formerCoach = await signInAndResolve(FORMER_COACH_EMAIL);

    expect(coach.roleCodes).toEqual(["head_coach"]);
    expect(player.roleCodes).toEqual([]);
    expect(formerCoach.roleCodes).toEqual([]);

    // The coach's whole authority is the attendance surface.
    expect(isNarrowAttendanceRecorder(coach.roleCodes)).toBe(true);
    expect(() => assertCapability(coach, "attendance_recorder")).not.toThrow();
    expect(() => assertCapability(coach, "attendance_recording")).not.toThrow();
  }, 60_000);

  it("refuses every other capability to the coach, and attendance to the other two", async () => {
    // Enumerated from the capability map rather than from a list kept by hand,
    // so a capability added next term is refused here by default.
    const permittedToCoach: CapabilityKey[] = ["attendance_recorder", "attendance_recording"];
    for (const key of CAPABILITY_KEYS) {
      if (permittedToCoach.includes(key)) continue;
      const refusal = await refusalOf(() => assertCapability(coach, key));
      expect(refusal.kind, key).toBe("not_permitted");
      expect(refusal.rule, key).toBe(`capability:${key}`);
    }

    // An ordinary player, and a coach whose seat has ended, reach neither the
    // read nor the write.
    for (const [who, actor] of [
      ["ordinary player", player],
      ["former coach", formerCoach],
    ] as const) {
      for (const key of ["attendance_recorder", "attendance_recording"] as const) {
        const refusal = await refusalOf(() => assertCapability(actor, key));
        expect(refusal.kind, `${who} / ${key}`).toBe("not_permitted");
      }
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // 14–15. The coach records, corrects, and adds a walk-up
  // -------------------------------------------------------------------------

  it("lets the authorized coach record attendance, correct it, and add one walk-up", async () => {
    const board = await readAttendanceBoard(eventId, EVENING_OF_THE_EVENT);
    expect(board.isOpen).toBe(true);
    expect(board.invitedCount).toBe(2);

    // Nothing sensitive is on this payload — no reason, no contact detail, no
    // availability. A field that is never selected cannot leak.
    for (const participant of board.participants) {
      expect(Object.keys(participant)).not.toContain("reason");
      expect(JSON.stringify(participant)).not.toContain(DECLINE_REASON);
    }

    const yesRow = board.participants.find(
      (entry) => entry.key === `player:${sayingYes.membershipId}`,
    )!;
    expect(yesRow.rsvp).toBe("yes");

    // Recorded, then corrected — the same function, and the audit trail is what
    // tells them apart.
    const recorded = await recordAttendance(coach.personId, eventId, yesRow.key, "late");
    expect(recorded.presence).toBe("late");
    expect(recorded.previousPresence).toBeNull();

    const corrected = await recordAttendance(coach.personId, eventId, yesRow.key, "present");
    expect(corrected.presence).toBe("present");
    expect(corrected.previousPresence).toBe("late");
    expect(corrected.recordedByName).toContain(MARKER);

    // The person who said No did not turn up: recorded, so the report has a
    // fact rather than a silence.
    await recordAttendance(coach.personId, eventId, `player:${sayingNo.membershipId}`, "absent");

    // The walk-up: minimum identity, attendance, and a prospect record for the
    // reconciliation somebody has to do afterwards.
    const walkUp = await recordWalkUpAttendance(coach.personId, eventId, {
      givenName: MARKER,
      familyName: "Walkup",
      phone: "07700 900323",
      email: null,
      presence: "present",
    });
    walkUpKey = walkUp.key;
    expect(walkUp.presence).toBe("present");

    // Actor and timestamp on every write, and the previous value preserved.
    const audit = await db.query<{
      action: string;
      actor: string;
      from_state: string | null;
      to_state: string | null;
      occurred_at: Date;
    }>(
      `select action, actor_person_id as actor, from_state, to_state, occurred_at
         from public.audit_events
        where entity_table = 'attendance_records' and entity_id in
          (select id from public.attendance_records where event_id = $1)
        order by occurred_at, id`,
      [eventId],
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(4);
    expect(audit.rows.every((row) => row.actor === coach.personId)).toBe(true);
    expect(audit.rows.every((row) => row.occurred_at instanceof Date)).toBe(true);
    expect(
      audit.rows.some((row) => row.from_state === "late" && row.to_state === "present"),
      "the correction did not preserve the value it replaced",
    ).toBe(true);
    expect(audit.rows.some((row) => row.action === "attendance.walk_up_recorded")).toBe(true);

    const after = await readAttendanceBoard(eventId, EVENING_OF_THE_EVENT);
    expect(after.recordedCount).toBe(3);
    expect(after.walkUpCount).toBe(1);
    expect(after.participants.find((entry) => entry.key === walkUpKey)?.isWalkUp).toBe(true);
  }, 120_000);

  // -------------------------------------------------------------------------
  // JOIN D. The attendance recorded is the attendance compared.
  // -------------------------------------------------------------------------

  it("compares the recorded attendance against the standing answers", async () => {
    const mismatches = await db.query<{
      membership: string | null;
      person: string | null;
      mismatch: string;
    }>(
      `select season_membership_id as membership, person_id as person, mismatch::text as mismatch
         from public.rsvp_attendance_mismatches where event_id = $1`,
      [eventId],
    );

    const byAnchor = new Map(
      mismatches.rows.map((row) => [row.membership ?? row.person, row.mismatch]),
    );

    // The walk-up attended with no invitation — invariant P6.
    const walkUpPerson = await db.query<{ id: string }>(
      "select id from public.people where given_name = $1 and family_name = 'Walkup'",
      [MARKER],
    );
    expect(byAnchor.get(walkUpPerson.rows[0].id)).toBe("attended_without_invitation");

    // The person who said Yes and turned up is not a mismatch; the person who
    // said No and did not turn up is not one either.
    expect(byAnchor.has(sayingYes.membershipId)).toBe(false);
  }, 60_000);

  // -------------------------------------------------------------------------
  // JOIN C + 16. The report counts this walk's own responses and attendance.
  // -------------------------------------------------------------------------

  it("generates the Monday report, counting this walk's answers and register", async () => {
    const generated = await generateWeeklyReport(operator.personId, REPORT_ON);
    firstReportId = generated.id;

    expect(generated.version).toBe(1);
    expect(generated.supersedesId).toBeNull();

    const stored = await db.query<{ content: { lastWeek: Record<string, unknown>[] } }>(
      "select content from public.weekly_reports where id = $1",
      [firstReportId],
    );
    const entry = stored.rows[0].content.lastWeek.find((row) => row.id === eventId) as
      Record<string, number | string | boolean> | undefined;

    expect(entry, "this walk's event is missing from the report's look-back week").toBeTruthy();
    expect(entry).toMatchObject({
      invited: 2,
      respondedYes: 1,
      respondedNo: 1,
      noAnswer: 0,
      // Two present: the invitee who was corrected from Late to Present, and
      // the walk-up. `present` counts attendance rows, and a walk-up is an
      // attendance row with no invitation — so the count includes them while
      // `invited` does not. `turnoutPercent` divides one by the other and can
      // therefore exceed 100 on an event with walk-ups. That is LAN-81's metric
      // definition, observed here rather than corrected: reported in the pull
      // request as a gap for Brian to place.
      present: 2,
      absent: 1,
      walkUps: 1,
      registerTaken: true,
      neverInvited: 0,
    });

    // The response the report counted is the row written through the delivered
    // token, not merely a row with the same shape.
    const counted = await db.query<{ id: string }>(
      `select r.id from public.rsvp_responses r
         join public.current_rsvp c on c.rsvp_response_id = r.id
        where c.invitation_id = any($1::uuid[])`,
      [[yesInvitationId, noInvitationId]],
    );
    expect(counted.rows.map((row) => row.id).sort()).toEqual([yesResponseId, noResponseId].sort());
  }, 120_000);

  it("regenerates the report, and version 2 supersedes an unchanged version 1", async () => {
    const before = await db.query<{ content: unknown; generated_at: Date; data_as_of: Date }>(
      "select content, generated_at, data_as_of from public.weekly_reports where id = $1",
      [firstReportId],
    );

    const second = await generateWeeklyReport(operator.personId, REPORT_ON);
    expect(second.version).toBe(2);
    expect(second.supersedesId).toBe(firstReportId);

    const after = await db.query<{ content: unknown; generated_at: Date; data_as_of: Date }>(
      "select content, generated_at, data_as_of from public.weekly_reports where id = $1",
      [firstReportId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    const versions = await listReportVersions(REPORT_ON);
    const mine = versions.filter((report) => report.seasonId === seasonId);
    expect(mine.map((report) => report.version)).toEqual([2, 1]);
    expect(mine[0].isSuperseded).toBe(false);
    expect(mine[1].isSuperseded).toBe(true);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 17. One event, three presentations
  // -------------------------------------------------------------------------

  it("shows the same event in the list, the Gregorian month and the Oxford term card", async () => {
    const list = await listCurrentSeasonEvents({ search: MARKER });
    const listed = list.events.find((entry) => entry.id === eventId);
    expect(listed?.scheduledOn).toBe(EVENT_ON);
    expect(listed?.status).toBe("occurred");

    const terms = await listTermWindows();

    const grid = buildMonthGrid(EVENT_MONTH, list.events);
    const inMonth = monthGridEvents(grid).find((entry) => entry.id === eventId);
    expect(inMonth, "the event is missing from the Gregorian month").toBeTruthy();

    const term = terms.find(
      (window) => window.name === EVENT_TERM && window.academicYear === EVENT_ACADEMIC_YEAR,
    )!;
    const card = buildTermCard(term, terms, list.events);
    const inCard = termCardEvents(card).find((entry) => entry.id === eventId);
    expect(inCard, "the event is missing from the Oxford term card").toBeTruthy();

    // Same record, same actual date and time, same status, in all three.
    expect([listed!.status, inMonth!.status, inCard!.status]).toEqual([
      "occurred",
      "occurred",
      "occurred",
    ]);
    expect([listed!.scheduledOn, inMonth!.scheduledOn, inCard!.scheduledOn]).toEqual([
      EVENT_ON,
      EVENT_ON,
      EVENT_ON,
    ]);

    // And the week it lands in is the one derived from the date.
    const week = card.weeks.find((row) =>
      row.days.some((day) => day.events.some((entry) => entry.id === eventId)),
    );
    expect(week?.week).toBe(EVENT_WEEK);
  }, 60_000);
});
