// @vitest-environment node
/**
 * The audience group rule — LAN-392.
 *
 * Against the real local database, for the same reason `event-approval.test.ts`
 * is: every sentence this suite asserts is a property of PostgreSQL honouring
 * the schema. The one that matters most cannot be mocked at all — invariant
 * P9's total unique index on `(event_id, invitee_person_id)`, and the `on
 * conflict do nothing` that stops it turning an operator's flip into a refusal.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`, or off a
 * person whose given name is `NAME_MARKER`, and `afterEach` deletes exactly
 * those in dependency order. The marker is unique to this file: suites run in
 * parallel against one database.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn, selectionKey } from "./event-audience";
import { applyAudienceGroupRuleIn, nextAutoAddSendAt } from "./event-audience-rule";
import { amendApprovedEvent, cancelEvent } from "./event-amendment";
import { createEventDraft, type EventDraftInput } from "./events";
import { runMessagingSweep } from "./messaging-scheduler";
import { finishRecruitmentAddIn } from "./recruitment-add";
import { updateRecruitmentProspectStatusIn } from "./recruitment-prospect";
import { flipRecruitmentProspectToJoinedIn } from "./recruitment-prospect/flip";
import { enterReturningPlayer } from "./roster";
import { commitBps } from "./roster-board";
import { openObserver } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN392GroupRuleSuite";
const RECRUITMENT_TEMPLATE_ID = "ae03257b-292e-5a97-b6ef-c3a6a2b839d7";
const PRACTICE_TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";

let observer: Client;
let actorPersonId: string;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    `select p.id from public.people p
       join public.role_assignments ra on ra.person_id = p.id
      order by p.id limit 1`,
  );
  actorPersonId = people.rows[0].id;
  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in
       (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(
    `delete from public.rsvp_responses where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_audience_exclusions where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_audience_groups where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`, [scope]);
  await observer.query("delete from public.events where name like $1", [scope]);

  // This file's own people, and everything that hangs off them.
  const ownPeople = "(select id from public.people where given_name = $1)";
  const ownProspects = `(select id from public.recruitment_prospects where person_id in ${ownPeople})`;
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in
       (select id from public.notification_jobs where person_id in ${ownPeople})`,
    [NAME_MARKER],
  );
  await observer.query(`delete from public.notification_jobs where person_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);
  await observer.query(
    `delete from public.recruitment_prospect_status_events where prospect_id in ${ownProspects}`,
    [NAME_MARKER],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'recruitment_prospects' and entity_id in ${ownProspects}`,
    [NAME_MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${ownPeople}`,
    [NAME_MARKER],
  );
  const ownMemberships = `(select id from public.season_memberships where person_id in ${ownPeople})`;
  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id in ${ownMemberships}`,
    [NAME_MARKER],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id in ${ownMemberships}`,
    [NAME_MARKER],
  );
  await observer.query(
    `delete from public.availability_statuses where season_membership_id in ${ownMemberships}`,
    [NAME_MARKER],
  );
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id in ${ownMemberships}`,
    [NAME_MARKER],
  );
  await observer.query(
    `delete from public.bps_selections where season_membership_id in ${ownMemberships}`,
    [NAME_MARKER],
  );
  await observer.query(`delete from public.season_memberships where person_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);
  await observer.query(`delete from public.contact_points where person_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);
  await observer.query(`delete from public.person_access_tokens where person_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);

  await observer.query(`delete from public.audit_events where entity_id in ${ownPeople}`, [
    NAME_MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [NAME_MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Tomorrow, in ISO — every event here is deliberately in the future. */
function inDays(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() + days);
  return day.toISOString().slice(0, 10);
}

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} taster session`,
    templateId: RECRUITMENT_TEMPLATE_ID,
    scheduledOn: inDays(9),
    startsAt: "19:00",
    endsAt: "21:00",
    venue: "University Parks",
    isMandatory: false,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

/**
 * An approved event carrying one group rule, built through the real write
 * paths: the picker's own save, then the real approval.
 */
async function approvedEventWithGroup(
  group: string,
  overrides: Partial<EventDraftInput> = {},
): Promise<string> {
  const event = await createEventDraft(actorPersonId, draft(overrides));
  const keys = await withTransaction(async (tx) => {
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const { groupSelectionKeys } = await import("./audience-selection");
    return groupSelectionKeys(catalogue.candidates, group);
  });
  await saveEventAudience(actorPersonId, event.id, keys, [group]);
  await approveEvent(actorPersonId, event.id);
  return event.id;
}

/** A recruit typed in by an operator, through the real add path. */
async function addRecruit(
  familyName: string,
  options: { consent?: boolean } = {},
): Promise<{ personId: string; prospectId: string }> {
  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [NAME_MARKER, familyName],
  );
  const personId = person.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, normalised_value, is_preferred, source)
     values ($1::uuid, 'phone', '07700900123', '+447700900123', true, 'test')`,
    [personId],
  );
  const result = await withTransaction((tx) =>
    finishRecruitmentAddIn(tx, {
      actorPersonId,
      personId,
      givenName: NAME_MARKER,
      seasonId,
      academic: {
        college: null,
        matriculationYear: null,
        knownAs: null,
        degreeField: null,
        expectedGraduationYear: null,
        dateOfBirth: null,
        // Brian's decision 7's fixture: an operator add with no opt-in evidence
        // records no consent at all, which is the unconsented case.
        optInEvidence: options.consent === false ? null : "verbal",
        optInNote: null,
      },
    }),
  );
  return { personId, prospectId: result.prospectId };
}

async function audienceRowsFor(eventId: string, personId: string) {
  const result = await observer.query<{
    id: string;
    capacity: string;
    added_by_group: string | null;
    added_by_person_id: string | null;
  }>(
    `select id, capacity::text as capacity, added_by_group::text as added_by_group,
            added_by_person_id
       from public.event_audience_members
      where event_id = $1::uuid and invitee_person_id = $2::uuid`,
    [eventId, personId],
  );
  return result.rows;
}

async function invitationsFor(eventId: string, personId: string) {
  const result = await observer.query<{ id: string; expires_at: Date }>(
    `select i.id, i.expires_at
       from public.invitations i
       join public.event_audience_members a on a.id = i.audience_member_id
      where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
    [eventId, personId],
  );
  return result.rows;
}

async function jobsFor(personId: string) {
  const result = await observer.query<{
    id: string;
    job_type: string;
    status: string;
    scheduled_for: Date | null;
    ladder_rung: number | null;
    event_id: string | null;
  }>(
    `select id, job_type::text as job_type, status::text as status, scheduled_for,
            ladder_rung, event_id
       from public.notification_jobs
      where person_id = $1::uuid and job_type in ('invitation', 'reminder')
      order by scheduled_for`,
    [personId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------

describe("an approved event keeps its audience groups alive", () => {
  it("adds a recruit created after approval, invites them, and schedules after the grace delay", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const before = new Date();

    const { personId } = await addRecruit("Arden");

    const rows = await audienceRowsFor(eventId, personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].capacity).toBe("recruit");
    // The audit fact, on the row: a rule put them there, and no operator did.
    expect(rows[0].added_by_group).toBe("recruits");
    expect(rows[0].added_by_person_id).toBeNull();

    const invitations = await invitationsFor(eventId, personId);
    expect(invitations).toHaveLength(1);

    const jobs = (await jobsFor(personId)).filter((job) => job.event_id === eventId);
    expect(jobs.filter((job) => job.job_type === "invitation")).toHaveLength(1);
    const invitation = jobs.find((job) => job.job_type === "invitation");
    expect(invitation?.ladder_rung).toBe(0);
    // Ten minutes, not now.
    expect(invitation?.scheduled_for?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + 9 * 60 * 1000,
    );
  });

  it("gives the late joiner the event's own deadline, not a recomputed one", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId } = await addRecruit("Bell");

    const event = await observer.query<{ response_deadline_at: Date }>(
      "select response_deadline_at from public.events where id = $1::uuid",
      [eventId],
    );
    const invitations = await invitationsFor(eventId, personId);
    expect(invitations[0].expires_at.toISOString()).toBe(
      event.rows[0].response_deadline_at.toISOString(),
    );
  });

  it("puts them on the event's existing future rungs, at the event's own instants", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId } = await addRecruit("Crane");

    const eventRungs = await observer.query<{ ladder_rung: number; scheduled_for: Date }>(
      `select distinct j.ladder_rung, j.scheduled_for
         from public.notification_jobs j
         join public.invitations i on i.id = j.invitation_id
        where j.event_id = $1::uuid and j.job_type = 'reminder' and i.capacity = 'recruit'
          and j.person_id <> $2::uuid
        order by j.ladder_rung`,
      [eventId, personId],
    );

    const mine = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "reminder",
    );
    // Whatever the event's recruit ladder still has ahead of it, the late
    // joiner has the same rungs at the same instants — never a private ladder.
    for (const rung of mine) {
      const peer = eventRungs.rows.find((row) => row.ladder_rung === rung.ladder_rung);
      if (peer) expect(rung.scheduled_for?.toISOString()).toBe(peer.scheduled_for.toISOString());
    }
  });

  it("adds them to three future recruitment events, once each", async () => {
    const first = await approvedEventWithGroup("recruits", { scheduledOn: inDays(2) });
    const second = await approvedEventWithGroup("recruits", {
      name: `${NAME_MARKER} second taster`,
      scheduledOn: inDays(4),
    });
    const third = await approvedEventWithGroup("recruits", {
      name: `${NAME_MARKER} third taster`,
      scheduledOn: inDays(8),
    });

    const { personId } = await addRecruit("Dunn");

    for (const eventId of [first, second, third]) {
      expect(await audienceRowsFor(eventId, personId)).toHaveLength(1);
      expect(await invitationsFor(eventId, personId)).toHaveLength(1);
    }
    const mine = new Set([first, second, third]);
    const invitations = (await jobsFor(personId)).filter(
      (job) =>
        job.job_type === "invitation" &&
        job.status === "pending" &&
        job.event_id !== null &&
        mine.has(job.event_id),
    );
    expect(invitations).toHaveLength(3);
  });

  it("does not touch an event that has already started", async () => {
    const eventId = await approvedEventWithGroup("recruits", { scheduledOn: inDays(3) });
    // Moved into the past behind the service's back, which is the only way to
    // get an approved past event: approval itself refuses nothing about dates.
    await observer.query("update public.events set scheduled_on = $2::date where id = $1::uuid", [
      eventId,
      inDays(-1),
    ]);

    const { personId } = await addRecruit("Ember");
    expect(await audienceRowsFor(eventId, personId)).toHaveLength(0);
  });

  it("never reaches somebody the approver unticked, and the hand-add clears that", async () => {
    // An event built from the Recruits group with one recruit taken out by hand.
    const excluded = await addRecruit("Frost");
    const event = await createEventDraft(actorPersonId, draft());
    const keys = await withTransaction(async (tx) => {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        event.seasonId,
        event.scheduledOn,
        event.eventType,
      );
      const { groupSelectionKeys } = await import("./audience-selection");
      return groupSelectionKeys(catalogue.candidates, "recruits").filter(
        (key) => key !== selectionKey("recruit", excluded.personId),
      );
    });
    await saveEventAudience(actorPersonId, event.id, keys, ["recruits"]);
    await approveEvent(actorPersonId, event.id);

    const exclusions = await observer.query(
      "select 1 from public.event_audience_exclusions where event_id = $1::uuid and person_id = $2::uuid",
      [event.id, excluded.personId],
    );
    expect(exclusions.rowCount).toBe(1);

    // Their status changes; the rule leaves them alone.
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, excluded.prospectId, "engaged"),
    );
    expect(await audienceRowsFor(event.id, excluded.personId)).toHaveLength(0);

    // LAN-393's hand-add is the one door that clears it, and that half is
    // proved in `event-audience-amendment.test.ts`, where the hand-add lives.
  });

  it("takes the row and the invitation back when the recruit is voided inside the grace window", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId, prospectId } = await addRecruit("Gale");
    expect(await audienceRowsFor(eventId, personId)).toHaveLength(1);

    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "void", {
        reason: "Typed in twice.",
      }),
    );

    // Nothing is left to chase, and nothing is left to send: cancelling the job
    // alone would leave a pending invitation in the non-response queue.
    expect(await audienceRowsFor(eventId, personId)).toHaveLength(0);
    expect(await invitationsFor(eventId, personId)).toHaveLength(0);
    const live = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.status === "pending",
    );
    expect(live).toHaveLength(0);
  });

  it("adds a person to a BPS event when they are selected into the BPS afterwards", async () => {
    const eventId = await approvedEventWithGroup("bps", {
      name: `${NAME_MARKER} BPS walkthrough`,
      templateId: PRACTICE_TEMPLATE_ID,
    });

    // A membership of this file's own making, not in the BPS to begin with.
    const person = await observer.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, 'Holt') returning id",
      [NAME_MARKER],
    );
    const personId = person.rows[0].id;
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1::uuid, $2::uuid, 'active', 'new', current_date, current_date) returning id`,
      [personId, seasonId],
    );

    expect(await audienceRowsFor(eventId, personId)).toHaveLength(0);

    await commitBps({
      actorPersonId,
      membershipId: membership.rows[0].id,
      seasonId,
      value: "Yes",
    });

    const rows = await audienceRowsFor(eventId, personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].added_by_group).toBe("bps");
    expect(await invitationsFor(eventId, personId)).toHaveLength(1);
  });
});

describe("the rule never breaks the write that triggered it", () => {
  it("lets a recruit already on a recruitment event flip to a player, with one row still", async () => {
    // The event chooses both groups, so the flip crosses from one to the other
    // on the *same* event — the case invariant P9's total unique index would
    // otherwise turn into a refusal that rolls the flip back.
    const event = await createEventDraft(actorPersonId, draft());
    const recruit = await addRecruit("Iver");

    const keys = await withTransaction(async (tx) => {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        event.seasonId,
        event.scheduledOn,
        event.eventType,
      );
      const { groupSelectionKeys } = await import("./audience-selection");
      return [
        ...groupSelectionKeys(catalogue.candidates, "recruits"),
        ...groupSelectionKeys(catalogue.candidates, "onboarding"),
      ];
    });
    await saveEventAudience(actorPersonId, event.id, keys, ["recruits", "onboarding"]);
    await approveEvent(actorPersonId, event.id);

    expect(await audienceRowsFor(event.id, recruit.personId)).toHaveLength(1);

    // The flip itself must succeed.
    await expect(
      withTransaction((tx) =>
        flipRecruitmentProspectToJoinedIn(tx, actorPersonId, recruit.prospectId),
      ),
    ).resolves.toBeDefined();

    // Still exactly one row, and still the recruit-capacity one the approver
    // confirmed: the existing row wins and its capacity is never upgraded.
    const rows = await audienceRowsFor(event.id, recruit.personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].capacity).toBe("recruit");
  });
});

describe("what a late joiner is not sent", () => {
  it("adds the row and the invitation but declares no job for a recruit with no consent", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId } = await addRecruit("Joyce", { consent: false });

    expect(await audienceRowsFor(eventId, personId)).toHaveLength(1);
    expect(await invitationsFor(eventId, personId)).toHaveLength(1);
    const jobs = (await jobsFor(personId)).filter((job) => job.event_id === eventId);
    expect(jobs).toHaveLength(0);
  });
});

describe("the sweep picks the auto-add invitation up", () => {
  /**
   * The brief asks for the pickup to be proved through a sink rather than by
   * reading the row back, because the interesting question is not "was a job
   * written" but "does `readDueJobs`' allow-list and its approved-and-future
   * guard let this particular job through". The auto-add invitation carries
   * `job_type = 'invitation'` and the same idempotency-key shape `approveEvent`
   * uses, deliberately, so the answer should be yes with no change to that
   * allow-list at all — and this is what says so.
   */
  const CONFIGURED = {
    APP_BASE_URL: "https://lancers.example.org",
    WHATSAPP_PHONE_NUMBER_ID: "5550001",
    WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
    WHATSAPP_APP_SECRET: "not-a-real-app-secret",
    WHATSAPP_TEMPLATE_NAME: "event_invitation",
    EMAIL_API_KEY: "not-a-real-key",
    EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  };

  it("dispatches the declared job once its time has come", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId } = await addRecruit("Kerr");

    const jobs = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );
    expect(jobs).toHaveLength(1);

    // Brought to the front of the queue, which is what the grace window
    // elapsing looks like — and what makes this suite's own job win
    // `readDueJobs`' ordering rather than somebody else's fixture.
    await observer.query(
      "update public.notification_jobs set scheduled_for = now() - interval '30 days' where id = $1::uuid",
      [jobs[0].id],
    );

    const sent: string[] = [];
    const transport = async (url: string) => {
      sent.push(url);
      return new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: `wamid.${crypto.randomUUID()}` }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await runMessagingSweep({ source: CONFIGURED, transport, limit: 5 });

    expect(sent.length).toBeGreaterThan(0);

    // Picked up, claimed and attempted. The assertion is deliberately "not
    // still pending, and it has a delivery attempt" rather than "completed":
    // what this test is about is `readDueJobs`' allow-list letting the job
    // through, and whether the stub provider's reply is then recorded as a
    // success is `delivery.test.ts`'s subject, not this one's.
    const after = await observer.query<{ status: string }>(
      "select status::text as status from public.notification_jobs where id = $1::uuid",
      [jobs[0].id],
    );
    expect(after.rows[0].status).not.toBe("pending");
    const attempts = await observer.query(
      "select 1 from public.delivery_attempts where notification_job_id = $1::uuid",
      [jobs[0].id],
    );
    expect(attempts.rowCount).toBeGreaterThan(0);
  });
});

describe("the five-an-hour cap", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const graceAt = new Date(now.getTime() + 10 * 60 * 1000);

  it("puts the first five in one hour and the sixth an hour after the first", () => {
    const pending: Date[] = [];
    const chosen: Date[] = [];
    for (let i = 0; i < 6; i += 1) {
      const at = nextAutoAddSendAt({ pending, welcomeAt: null, now });
      chosen.push(at);
      pending.push(at);
    }

    expect(chosen.slice(0, 5).map((at) => at.toISOString())).toEqual(
      Array.from({ length: 5 }, () => graceAt.toISOString()),
    );
    expect(chosen[5].toISOString()).toBe(
      new Date(graceAt.getTime() + 60 * 60 * 1000).toISOString(),
    );
  });

  it("never schedules inside the ten-minute grace, whatever the queue looks like", () => {
    const at = nextAutoAddSendAt({
      pending: [new Date(now.getTime() - 30 * 60 * 1000)],
      welcomeAt: null,
      now,
    });
    expect(at.getTime()).toBeGreaterThanOrEqual(graceAt.getTime());
  });

  it("goes behind a declared recruit welcome rather than in front of it", () => {
    const welcomeAt = new Date(now.getTime() + 60 * 60 * 1000);
    const at = nextAutoAddSendAt({ pending: [], welcomeAt, now });
    expect(at.getTime()).toBe(welcomeAt.getTime() + 60 * 1000);
  });
});

describe("an event with no stored groups", () => {
  it("does nothing at all", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const keys = await withTransaction(async (tx) => {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        event.seasonId,
        event.scheduledOn,
        event.eventType,
      );
      // A hand-picked audience: people, no group pressed.
      return catalogue.candidates.slice(0, 2).map((candidate) => candidate.key);
    });
    await saveEventAudience(actorPersonId, event.id, keys, []);
    await approveEvent(actorPersonId, event.id);

    const { personId } = await addRecruit("Lowe");
    expect(await audienceRowsFor(event.id, personId)).toHaveLength(0);

    const outcome = await withTransaction((tx) =>
      applyAudienceGroupRuleIn(tx, {
        personId,
        seasonId,
        trigger: "recruit_status_changed",
        actorPersonId,
      }),
    );
    expect(outcome.added).toBe(0);
  });
});

describe("the other doors", () => {
  it("adds a returner intake's new membership to an Onboarding-group event", async () => {
    const eventId = await approvedEventWithGroup("onboarding", {
      name: `${NAME_MARKER} onboarding practice`,
      templateId: PRACTICE_TEMPLATE_ID,
    });

    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: NAME_MARKER, familyName: "Marsh", phone: "+44 7700 900144" },
      decision: { kind: "new", confirmed: true },
    });

    const rows = await audienceRowsFor(eventId, result.personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].added_by_group).toBe("onboarding");
    expect(rows[0].capacity).toBe("player");
    expect(await invitationsFor(eventId, result.personId)).toHaveLength(1);
  });

  it("moves a late joiner's future rungs with everybody else's when the event is rescheduled", async () => {
    const eventId = await approvedEventWithGroup("recruits", { scheduledOn: inDays(12) });
    const { personId } = await addRecruit("Nash");

    const before = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "reminder",
    );

    const event = await observer.query<{
      name: string;
      template_id: string;
      starts_at: string | null;
      ends_at: string | null;
      delivery_mode: string;
      venue: string | null;
      is_mandatory: boolean;
    }>(
      `select name, template_id, starts_at::text as starts_at, ends_at::text as ends_at,
              delivery_mode::text as delivery_mode, venue, is_mandatory
         from public.events where id = $1::uuid`,
      [eventId],
    );
    const row = event.rows[0];

    await amendApprovedEvent(
      actorPersonId,
      eventId,
      {
        name: row.name,
        templateId: row.template_id,
        scheduledOn: inDays(16),
        startsAt: row.starts_at?.slice(0, 5) ?? "19:00",
        endsAt: row.ends_at?.slice(0, 5) ?? null,
        deliveryMode: row.delivery_mode as EventDraftInput["deliveryMode"],
        venue: row.venue,
        description: null,
        requiredEquipment: null,
        joiningUrl: null,
        isMandatory: row.is_mandatory,
      },
      { notify: false, silenceConfirmed: true },
    );

    const after = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "reminder",
    );
    // Whatever the reschedule did to everybody's rungs, it did to the late
    // joiner's: they carry the same `ladder_rung`, which is the only thing
    // `recomputeScheduleOnRescheduleIn` matches on.
    const survivors = after.filter((job) => job.status !== "cancelled");
    for (const job of survivors) {
      const peer = await observer.query<{ scheduled_for: Date }>(
        `select j.scheduled_for from public.notification_jobs j
          where j.event_id = $1::uuid and j.ladder_rung = $2 and j.job_type = 'reminder'
            and j.person_id <> $3::uuid limit 1`,
        [eventId, job.ladder_rung, personId],
      );
      if (peer.rowCount) {
        expect(job.scheduled_for?.toISOString()).toBe(peer.rows[0].scheduled_for.toISOString());
      }
    }
    expect(before.length + after.length).toBeGreaterThan(0);
  });

  it("stands a late joiner's messages down when the event is cancelled", async () => {
    const eventId = await approvedEventWithGroup("recruits");
    const { personId } = await addRecruit("Orme");
    expect(
      (await jobsFor(personId)).filter(
        (job) => job.event_id === eventId && job.status === "pending",
      ).length,
    ).toBeGreaterThan(0);

    await cancelEvent(actorPersonId, eventId, {
      reason: "Pitch unavailable.",
      notify: false,
      silenceConfirmed: true,
    });

    const live = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.status === "pending",
    );
    expect(live).toHaveLength(0);
  });
});
