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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction, type Tx } from "@/lib/db";
import { retryDelivery } from "./delivery";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn, selectionKey } from "./event-audience";
import { applyAudienceGroupRuleIn, nextAutoAddSendAt } from "./event-audience-rule";
import { amendApprovedEvent, cancelEvent } from "./event-amendment";
import { createEventDraft, type EventDraftInput } from "./events";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import { runMessagingSweep } from "./messaging-scheduler";
import { finishRecruitmentAddIn } from "./recruitment-add";
import { signUpAnonymouslyIn, signUpWithTokenIn } from "./recruitment-signup";
import { mintRecruitmentSignupCodeIn } from "./recruitment-signup-codes";
import { updateRecruitmentProspectStatusIn } from "./recruitment-prospect";
import { flipRecruitmentProspectToJoinedIn } from "./recruitment-prospect/flip";
import { enterReturningPlayer } from "./roster";
import { commitBps } from "./roster-board";
import {
  agePastSafetyPacing,
  clearRecipientSafetyState,
  openObserver,
} from "../../../tests/helpers/service-layer";

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

/**
 * LAN-394. The shared sending allowance is 50 admissions in any rolling five
 * minutes, counted across the whole database, and the database suites run one
 * at a time against one database. A file that sends as much as this one
 * therefore inherits whatever the file before it spent, and its sweeps stop
 * sending for a reason that has nothing to do with what it is testing.
 *
 * Ageing the window at the top of each test is safe precisely because the
 * project is serialized: nothing else is admitting while this runs, and no
 * assertion here depends on when an earlier attempt was admitted.
 */
beforeEach(async () => {
  await agePastSafetyPacing(observer);
});

afterEach(async () => {
  // LAN-394: this suite's holds and provider circuit go with its fixtures.
  await clearRecipientSafetyState(observer);
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
  // `on delete restrict` to `notification_jobs`, and a refused send writes one
  // (`recordUndeliverableIn`), so this has to go first or the job delete below
  // fails and every later case in this file inherits the leftovers.
  await observer.query(
    `delete from public.delivery_results where notification_job_id in
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
  await observer.query(
    `delete from public.delivery_results where notification_job_id in
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
    // LAN-414: the stored pair, read back as the one picker token the rule
    // speaks, so these assertions keep naming the group rather than a column.
    `select id, capacity::text as capacity,
            case when added_by_group_category = 'general' then added_by_group::text
                 when added_by_group_category is not null
                   then added_by_group_category::text || ':' || added_by_group_value
            end as added_by_group,
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

/** One invitation and the reason, if any, that no message was declared against it. */
async function withheldReasonFor(eventId: string, personId: string) {
  const result = await observer.query<{ id: string; message_withheld_reason: string | null }>(
    `select i.id, i.message_withheld_reason
       from public.invitations i
       join public.event_audience_members a on a.id = i.audience_member_id
      where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
    [eventId, personId],
  );
  return result.rows[0];
}

/** Whether one invitation is being chased — the queue behind Follow-ups, the escalation and the Monday report. */
async function isChased(invitationId: string): Promise<boolean> {
  const result = await observer.query(
    "select 1 from public.nonresponse_queue where invitation_id = $1::uuid",
    [invitationId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** One instant, as the London wall-clock date and time the events table stores. */
function londonWallClock(at: Date): { on: string; at: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return { on: `${parts.year}-${parts.month}-${parts.day}`, at: `${parts.hour}:${parts.minute}` };
}

/**
 * Six approved taster events, fifteen minutes apart from a quarter of an hour
 * from now, so the five-an-hour cap pushes the sixth invitation an hour out —
 * past the start of the event it is about. The rule walks them in start order,
 * so the sixth, at +40, is the one whose message is withheld.
 *
 * The start times are written behind the service's back, exactly as the
 * already-started case does it, so nothing here depends on approval accepting
 * an event forty minutes away.
 */
async function sixImminentTasters(): Promise<string[]> {
  const eventIds: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    eventIds.push(
      await approvedEventWithGroup("recruits:all", {
        name: `${NAME_MARKER} imminent taster ${index}`,
        scheduledOn: inDays(3),
      }),
    );
  }

  const offsets = [15, 20, 25, 30, 35, 40];
  for (let index = 0; index < eventIds.length; index += 1) {
    const when = londonWallClock(new Date(Date.now() + offsets[index] * 60 * 1000));
    await observer.query(
      `update public.events
          set scheduled_on = $2::date, starts_at = $3::time, ends_at = null
        where id = $1::uuid`,
      [eventIds[index], when.on, when.at],
    );
  }
  return eventIds;
}

/** The ordinary operator act: move one approved event to another day, changing nothing else. */
async function rescheduleTo(eventId: string, scheduledOn: string): Promise<void> {
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
      scheduledOn,
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
    const eventId = await approvedEventWithGroup("recruits:all");
    const before = new Date();

    const { personId } = await addRecruit("Arden");

    const rows = await audienceRowsFor(eventId, personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].capacity).toBe("recruit");
    // The audit fact, on the row: a rule put them there, and no operator did.
    expect(rows[0].added_by_group).toBe("recruits:all");
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
    const eventId = await approvedEventWithGroup("recruits:all");
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
    const eventId = await approvedEventWithGroup("recruits:all");
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
    const first = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(2) });
    const second = await approvedEventWithGroup("recruits:all", {
      name: `${NAME_MARKER} second taster`,
      scheduledOn: inDays(4),
    });
    const third = await approvedEventWithGroup("recruits:all", {
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
    const eventId = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(3) });
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
      return groupSelectionKeys(catalogue.candidates, "recruits:all").filter(
        (key) => key !== selectionKey("recruit", excluded.personId),
      );
    });
    await saveEventAudience(actorPersonId, event.id, keys, ["recruits:all"]);
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
    const eventId = await approvedEventWithGroup("recruits:all");
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
        ...groupSelectionKeys(catalogue.candidates, "recruits:all"),
        ...groupSelectionKeys(catalogue.candidates, "onboarding"),
      ];
    });
    await saveEventAudience(actorPersonId, event.id, keys, ["recruits:all", "onboarding"]);
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
    const eventId = await approvedEventWithGroup("recruits:all");
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
    const eventId = await approvedEventWithGroup("recruits:all");
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
    // A consented recruit on the event from the start, so there is somebody to
    // move *with*. Without one this test compared the late joiner against an
    // empty set: the recruit follow-up rung is declared per recruit and only
    // where consent is on file, and no seeded recruit in the catalogue has it.
    // Added before the event exists, so the rule has nothing to act on yet and
    // they arrive through approval like any other confirmed invitee.
    await addRecruit("NashPeer");
    const eventId = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(12) });
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
    // The comparison used to sit inside `if (peer.rowCount)` behind a closing
    // assertion (`before.length + after.length > 0`) that was true whatever
    // happened — including if nothing had been compared at all. It is now the
    // count of comparisons that closes the test, so a run in which no rung was
    // matched against a peer fails rather than passing silently.
    //
    // Not every rung is required to have a peer, and that is a real property
    // rather than a hedge: the recruit follow-up is declared per recruit and
    // only where consent is on file, so a late joiner can legitimately hold a
    // rung nobody else on the event has (the review records it as A10).
    const survivors = after.filter((job) => job.status !== "cancelled");
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    expect(survivors.length).toBeGreaterThan(0);

    const wasAt = new Map(before.map((job) => [job.ladder_rung, job.scheduled_for?.toISOString()]));
    let compared = 0;
    let moved = 0;
    for (const job of survivors) {
      if (
        wasAt.has(job.ladder_rung) &&
        wasAt.get(job.ladder_rung) !== job.scheduled_for?.toISOString()
      ) {
        moved += 1;
      }
      const peer = await observer.query<{ scheduled_for: Date }>(
        `select j.scheduled_for from public.notification_jobs j
          where j.event_id = $1::uuid and j.ladder_rung = $2 and j.job_type = 'reminder'
            and j.person_id <> $3::uuid and j.status <> 'cancelled' limit 1`,
        [eventId, job.ladder_rung, personId],
      );
      if (peer.rowCount === 0) continue;
      expect(job.scheduled_for?.toISOString()).toBe(peer.rows[0].scheduled_for.toISOString());
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
    // And the reschedule genuinely moved them, rather than agreeing with a peer
    // that also stayed put.
    expect(moved).toBeGreaterThan(0);
  });

  it("stands a late joiner's messages down when the event is cancelled", async () => {
    const eventId = await approvedEventWithGroup("recruits:all");
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

// ---------------------------------------------------------------------------
// The correction round (review of PR 193, 2026-09-17)
// ---------------------------------------------------------------------------

/**
 * F3 and A11, in one acceptance case, because they are one sentence in the
 * requirement: "if that sixth event has started by then, no message and the
 * invitation is not chased" (`run5-task.md:34`).
 *
 * Six approved events, all starting inside the next hour, so the five-an-hour
 * cap pushes the sixth invitation an hour out — past the start of the event it
 * is about. The guard in `joinApprovedEventIn` declares no job for it, and the
 * invitation that is left behind must not read as somebody who was asked and
 * did not answer: that is what `message_withheld_reason` and
 * `invitation_response_state`'s `never_asked` exist for.
 *
 * The start times are written behind the service's back, exactly as the
 * already-started case above does it, so nothing here depends on approval
 * accepting an event forty minutes away.
 */
describe("an event that will have started by the invitation's own send time", () => {
  it("adds the row and the invitation, declares nothing, and never chases it", async () => {
    const eventIds = await sixImminentTasters();
    const { personId } = await addRecruit("Pike");

    // Every one of the six holds the row and the invitation. Brian's decision
    // 3: the audience row and the invitation are added either way.
    for (const eventId of eventIds) {
      expect(await audienceRowsFor(eventId, personId)).toHaveLength(1);
      expect(await invitationsFor(eventId, personId)).toHaveLength(1);
    }

    const mine = new Set(eventIds);
    const invitationJobs = (await jobsFor(personId)).filter(
      (job) => job.job_type === "invitation" && job.event_id !== null && mine.has(job.event_id),
    );
    // Five, not six: the sixth event has started by the time its own message
    // would have gone.
    expect(invitationJobs).toHaveLength(5);
    expect(invitationJobs.map((job) => job.event_id)).not.toContain(eventIds[5]);

    const withheld = await observer.query<{ id: string; message_withheld_reason: string | null }>(
      `select i.id, i.message_withheld_reason
         from public.invitations i
         join public.event_audience_members a on a.id = i.audience_member_id
        where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
      [eventIds[5], personId],
    );
    expect(withheld.rows[0].message_withheld_reason).toBe("event_starts_first");

    // A11. The invitation exists, so without the recorded reason it would read
    // as `awaiting_response` and this person would be chased — by the
    // Follow-ups queue, by the President's escalation and in the Monday
    // report's "no answer" column — about a message nobody ever sent.
    const state = await observer.query<{ response_state: string }>(
      "select response_state from public.invitation_response_state where invitation_id = $1::uuid",
      [withheld.rows[0].id],
    );
    expect(state.rows[0].response_state).toBe("never_asked");
    const queued = await observer.query(
      "select 1 from public.nonresponse_queue where invitation_id = $1::uuid",
      [withheld.rows[0].id],
    );
    expect(queued.rowCount).toBe(0);

    // And the contrast, so the exclusion is proved to be about this invitation
    // rather than about the view being empty: one of the five that *was*
    // declared is in the queue.
    const declared = await observer.query<{ id: string }>(
      `select i.id
         from public.invitations i
         join public.event_audience_members a on a.id = i.audience_member_id
        where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
      [eventIds[0], personId],
    );
    const stillChased = await observer.query(
      "select 1 from public.nonresponse_queue where invitation_id = $1::uuid",
      [declared.rows[0].id],
    );
    expect(stillChased.rowCount).toBe(1);
  });

  it("keeps an unconsented recruit's invitation out of the chase queue too", async () => {
    const eventId = await approvedEventWithGroup("recruits:all");
    const { personId } = await addRecruit("Quint", { consent: false });

    const invitation = await observer.query<{ id: string; message_withheld_reason: string | null }>(
      `select i.id, i.message_withheld_reason
         from public.invitations i
         join public.event_audience_members a on a.id = i.audience_member_id
        where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
      [eventId, personId],
    );
    expect(invitation.rows[0].message_withheld_reason).toBe("no_consent");

    const queued = await observer.query(
      "select 1 from public.nonresponse_queue where invitation_id = $1::uuid",
      [invitation.rows[0].id],
    );
    expect(queued.rowCount).toBe(0);
  });
});

/**
 * F6 (corrected 2026-09-17). `message_withheld_reason` claims that no message
 * was ever declared against the invitation, and `invitation_response_state`
 * answers `never_asked` on that claim alone. A reschedule makes the claim
 * false: `backfillInvitationJobsIn` declares the invitation job for every
 * invitation on the event without asking why one was missing, and
 * `scheduleEventLadderIn` puts the rungs behind it. The person is messaged, and
 * with the reason still standing they are permanently out of
 * `nonresponse_queue`, the Follow-ups queue, the President's escalation and the
 * Monday report's "no answer" column — messaged, silent, and chased by nobody.
 *
 * Both cases here are ordinary operator acts, and the second carries the
 * opposite half of the rule: a job existing is not the same as a message that
 * can go, so the unconsented recruit keeps their reason until consent is on
 * file. Clearing it any earlier would put somebody `claimJobIn` will refuse to
 * message back into the chase queue.
 */
describe("a reschedule that declares the message a withheld invitation never had", () => {
  it("clears `event_starts_first` and chases the person like everybody else", async () => {
    const eventIds = await sixImminentTasters();
    const { personId } = await addRecruit("Rowntree");
    const lastEventId = eventIds[5];

    // The precondition, asserted rather than assumed: the sixth invitation is
    // the withheld one, it holds no job, and nothing is chasing it.
    const before = await withheldReasonFor(lastEventId, personId);
    expect(before.message_withheld_reason).toBe("event_starts_first");
    expect(
      (await jobsFor(personId)).filter(
        (job) => job.event_id === lastEventId && job.job_type === "invitation",
      ),
    ).toHaveLength(0);
    expect(await isChased(before.id)).toBe(false);

    // An operator moves that taster to next week. There is runway now.
    await rescheduleTo(lastEventId, inDays(7));

    const declared = (await jobsFor(personId)).filter(
      (job) => job.event_id === lastEventId && job.job_type === "invitation",
    );
    expect(declared).toHaveLength(1);
    expect(declared[0].scheduled_for).not.toBeNull();

    const after = await withheldReasonFor(lastEventId, personId);
    expect(after.message_withheld_reason).toBeNull();

    const state = await observer.query<{ response_state: string }>(
      "select response_state from public.invitation_response_state where invitation_id = $1::uuid",
      [after.id],
    );
    expect(state.rows[0].response_state).toBe("awaiting_response");
    expect(await isChased(after.id)).toBe(true);
  });

  it("holds `no_consent` until consent is on file, then clears it", async () => {
    const eventId = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(9) });
    const { personId } = await addRecruit("Sable", { consent: false });

    const withheld = await withheldReasonFor(eventId, personId);
    expect(withheld.message_withheld_reason).toBe("no_consent");

    // A reschedule declares the job regardless of consent — the backfill asks
    // no question — and `claimJobIn` is what refuses the send. So the job
    // existing is not the message being declarable, and the reason must stand.
    await rescheduleTo(eventId, inDays(11));

    const jobs = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );
    expect(jobs).toHaveLength(1);
    const stillWithheld = await withheldReasonFor(eventId, personId);
    expect(stillWithheld.message_withheld_reason).toBe("no_consent");
    expect(await isChased(stillWithheld.id)).toBe(false);

    // They then sign up themselves and grant consent for the season, and the
    // event moves again. Now the message really will go, so the reason goes.
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    await rescheduleTo(eventId, inDays(13));

    const cleared = await withheldReasonFor(eventId, personId);
    expect(cleared.message_withheld_reason).toBeNull();
    expect(await isChased(cleared.id)).toBe(true);
  });
});

/**
 * F6, the other half (corrected 2026-09-17). The reason the reschedule-time
 * clear does not answer: consent arrives and *nobody reschedules again*. The
 * job declared by the first reschedule is already pending, `claimJobIn`'s
 * consent check now passes, and the ordinary sweep sends the invitation — with
 * the reason still standing, because nothing between the grant and the send
 * looked at it.
 *
 * So the rule is kept where a message actually goes out: `claimJobIn` clears
 * the reason as it claims the job and writes the delivery attempt. Both cases
 * here run the real send path — the scheduler's own sweep, and the operator's
 * Retry after a refused job failed, which is the remedy `delivery.ts` documents
 * for an invitation that reached the sweep before the consent did.
 *
 * Proved through a transport sink rather than by reading the column back
 * alone, because the claim is about what happens when a message *goes*: the
 * assertion is the message leaving, and then the person being chased like
 * anybody else who has been asked and has not answered.
 */
describe("the send is what clears the withheld reason", () => {
  const CONFIGURED = {
    APP_BASE_URL: "https://lancers.example.org",
    WHATSAPP_PHONE_NUMBER_ID: "5550001",
    WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
    WHATSAPP_APP_SECRET: "not-a-real-app-secret",
    WHATSAPP_TEMPLATE_NAME: "event_invitation",
    EMAIL_API_KEY: "not-a-real-key",
    EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  };

  /** A provider that accepts everything, and the record of what it was asked to send. */
  function sink(): { sent: string[]; transport: (url: string) => Promise<Response> } {
    const sent: string[] = [];
    return {
      sent,
      transport: async (url: string) => {
        sent.push(url);
        return new Response(
          JSON.stringify({
            messaging_product: "whatsapp",
            messages: [{ id: `wamid.${crypto.randomUUID()}` }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    };
  }

  /** Brought to the front of `readDueJobs`' queue, which is what its time coming looks like. */
  async function makeDue(jobId: string): Promise<void> {
    await observer.query(
      "update public.notification_jobs set scheduled_for = now() - interval '30 days' where id = $1::uuid",
      [jobId],
    );
  }

  async function invitationJob(eventId: string, personId: string) {
    const jobs = (await jobsFor(personId)).filter(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );
    expect(jobs).toHaveLength(1);
    return jobs[0];
  }

  async function responseStateOf(invitationId: string): Promise<string> {
    const state = await observer.query<{ response_state: string }>(
      "select response_state from public.invitation_response_state where invitation_id = $1::uuid",
      [invitationId],
    );
    return state.rows[0].response_state;
  }

  it("clears it when consent arrives and the sweep sends, with no second reschedule", async () => {
    const eventId = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(9) });
    const { personId } = await addRecruit("Tallis", { consent: false });

    const withheld = await withheldReasonFor(eventId, personId);
    expect(withheld.message_withheld_reason).toBe("no_consent");

    // One ordinary reschedule. The backfill declares the invitation job without
    // asking why one was missing, and the reason correctly stands: `claimJobIn`
    // is still refusing this send.
    await rescheduleTo(eventId, inDays(11));
    const job = await invitationJob(eventId, personId);
    expect((await withheldReasonFor(eventId, personId)).message_withheld_reason).toBe("no_consent");

    // Consent arrives through the function the public sign-up, the tokenised
    // door and the questionnaire all call. Nothing else happens — in
    // particular, nobody reschedules the event again.
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    expect((await withheldReasonFor(eventId, personId)).message_withheld_reason).toBe("no_consent");

    // The job's time comes and the ordinary sweep claims it.
    await makeDue(job.id);
    const provider = sink();
    await runMessagingSweep({ source: CONFIGURED, transport: provider.transport, limit: 5 });
    expect(provider.sent.length).toBeGreaterThan(0);

    // The message went out for *this* invitation, not merely for something the
    // sweep happened to pick up alongside it.
    const attempts = await observer.query(
      "select 1 from public.delivery_attempts where notification_job_id = $1::uuid",
      [job.id],
    );
    expect(attempts.rowCount).toBeGreaterThan(0);

    const cleared = await withheldReasonFor(eventId, personId);
    expect(cleared.message_withheld_reason).toBeNull();
    expect(await responseStateOf(cleared.id)).toBe("awaiting_response");
    expect(await isChased(cleared.id)).toBe(true);
  });

  it("clears it on the operator's Retry after the unconsented job failed", async () => {
    const eventId = await approvedEventWithGroup("recruits:all", { scheduledOn: inDays(9) });
    const { personId } = await addRecruit("Underhill", { consent: false });

    expect((await withheldReasonFor(eventId, personId)).message_withheld_reason).toBe("no_consent");
    await rescheduleTo(eventId, inDays(11));
    const job = await invitationJob(eventId, personId);

    // The sweep reaches the job before the consent does. `claimJobIn` refuses
    // the send, `recordUndeliverableIn` leaves the job `failed` with no
    // `next_attempt_at`, and the reason is untouched — nothing was sent.
    await makeDue(job.id);
    const refused = sink();
    await runMessagingSweep({ source: CONFIGURED, transport: refused.transport, limit: 5 });

    const afterRefusal = await observer.query<{ status: string; last_error: string | null }>(
      "select status::text as status, last_error from public.notification_jobs where id = $1::uuid",
      [job.id],
    );
    expect(afterRefusal.rows[0].status).toBe("failed");
    const stillWithheld = await withheldReasonFor(eventId, personId);
    expect(stillWithheld.message_withheld_reason).toBe("no_consent");
    expect(await isChased(stillWithheld.id)).toBe(false);

    // The consent is recorded and an operator presses Retry on the delivery
    // screen. A `failed` job is outside the reschedule-time clear's allow-list,
    // so this route is the one the send-time clear has to carry by itself.
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    // LAN-394. The refused sweep above still admitted this person through the
    // messaging safety guard before `claimJobIn` declined to send, and the
    // guard admits one message per person per five minutes. A Retry pressed a
    // second later is deferred, correctly and unhelpfully — the window is aged
    // out here so what this test measures is the send-time clear rather than
    // the pacing allowance.
    await agePastSafetyPacing(observer);
    const accepted = sink();
    const outcome = await retryDelivery(actorPersonId, job.id, {
      source: CONFIGURED,
      transport: accepted.transport,
    });
    expect(outcome).toBe("accepted");
    expect(accepted.sent.length).toBeGreaterThan(0);

    const cleared = await withheldReasonFor(eventId, personId);
    expect(cleared.message_withheld_reason).toBeNull();
    expect(await responseStateOf(cleared.id)).toBe("awaiting_response");
    expect(await isChased(cleared.id)).toBe(true);
  });
});

/**
 * A5. `insertAudienceRowIn`'s `on conflict (event_id, invitee_person_id) do
 * nothing` is the guard that stops invariant P9's total unique index turning
 * one operator's status write into a refusal. The review's injections showed
 * the pre-read guard alone also suffices for the *sequential* case, so nothing
 * in the suite exercised the concurrent one the `on conflict` actually exists
 * for: two transactions that both read "not there" and then both insert.
 *
 * Staged rather than raced, so it is deterministic: both transactions read
 * first, the second's insert then blocks on the index until the first commits,
 * and the assertion is on what is on the table afterwards.
 */
describe("two transactions adding the same human at once", () => {
  it("leaves one row, one invitation, and refuses neither caller", async () => {
    const eventId = await approvedEventWithGroup("recruits:all");

    // The prospect is written directly rather than through `addRecruit`, which
    // would run the rule itself and leave nothing for the race to contend over.
    const person = await observer.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, 'Race') returning id",
      [NAME_MARKER],
    );
    const personId = person.rows[0].id;
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, normalised_value, is_preferred, source)
       values ($1::uuid, 'phone', '07700900199', '+447700900199', true, 'test')`,
      [personId],
    );
    await observer.query(
      `insert into public.recruitment_prospects (person_id, season_id, status, source, first_contact_on)
       values ($1::uuid, $2::uuid, 'identified', 'test', current_date)`,
      [personId, seasonId],
    );

    const first = await openObserver();
    const second = await openObserver();
    try {
      await first.query("begin");
      await second.query("begin");

      const args = {
        personId,
        seasonId,
        trigger: "recruit_status_changed" as const,
        actorPersonId,
      };

      const firstOutcome = await applyAudienceGroupRuleIn(first as unknown as Tx, args);
      expect(firstOutcome.added).toBe(1);

      // Reads "not there" — the first transaction has not committed — and then
      // blocks on the unique index at the insert.
      const secondRun = applyAudienceGroupRuleIn(second as unknown as Tx, args);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("commit");

      const secondOutcome = await secondRun;
      await second.query("commit");

      // Nothing thrown, nothing added twice.
      expect(secondOutcome.added).toBe(0);
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      await first.end();
      await second.end();
    }

    expect(await audienceRowsFor(eventId, personId)).toHaveLength(1);
    expect(await invitationsFor(eventId, personId)).toHaveLength(1);
  });
});

/**
 * A6. `scheduleEventLadderIn` re-anchors every pending invitation job on the
 * event to the plan's own instant, and a reschedule calls it. For a late joiner
 * that discarded the two things the plan knows nothing about — the ten-minute
 * grace, which is the operator's window to undo a mis-click before anything is
 * sent, and their place in the five-an-hour queue.
 *
 * The event is three days out and the recruit lead is five, so the plan's
 * invitation instant is "now" both before and after the reschedule: the late
 * joiner's own instant is later, and it is the one that must stand.
 */
describe("a reschedule and a late joiner's own send time", () => {
  it("keeps the later of the plan's instant and the late joiner's own", async () => {
    const eventId = await approvedEventWithGroup("recruits:all", {
      name: `${NAME_MARKER} soon taster`,
      scheduledOn: inDays(3),
    });
    const { personId } = await addRecruit("Rowe");

    const mineBefore = (await jobsFor(personId)).find(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );
    expect(mineBefore?.scheduled_for).not.toBeNull();

    const peerBefore = await observer.query<{ id: string; scheduled_for: Date | null }>(
      `select j.id, j.scheduled_for from public.notification_jobs j
        where j.event_id = $1::uuid and j.job_type = 'invitation' and j.person_id <> $2::uuid
        limit 1`,
      [eventId, personId],
    );
    expect(peerBefore.rowCount).toBe(1);

    const event = await observer.query<{
      name: string;
      template_id: string;
      starts_at: string | null;
      delivery_mode: string;
      venue: string | null;
      is_mandatory: boolean;
    }>(
      `select name, template_id, starts_at::text as starts_at,
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
        scheduledOn: inDays(4),
        startsAt: row.starts_at?.slice(0, 5) ?? "19:00",
        endsAt: null,
        deliveryMode: row.delivery_mode as EventDraftInput["deliveryMode"],
        venue: row.venue,
        description: null,
        requiredEquipment: null,
        joiningUrl: null,
        isMandatory: row.is_mandatory,
      },
      { notify: false, silenceConfirmed: true },
    );

    const peerAfter = await observer.query<{ scheduled_for: Date }>(
      "select scheduled_for from public.notification_jobs where id = $1::uuid",
      [peerBefore.rows[0].id],
    );
    const mineAfter = (await jobsFor(personId)).find(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );

    // The precondition, asserted rather than assumed: the plan's instant really
    // is earlier than the late joiner's own, so `greatest` has something to do.
    // Without it this test would pass on the defect it exists to catch.
    expect(peerAfter.rows[0].scheduled_for.getTime()).toBeLessThan(
      (mineBefore?.scheduled_for as Date).getTime(),
    );
    expect(mineAfter?.scheduled_for?.toISOString()).toBe(
      (mineBefore?.scheduled_for as Date).toISOString(),
    );
  });
});

/**
 * F5's public half. `tests/audience-group-rule-writers.test.ts` proves the
 * chokepoint is *called* from `recruitment-signup.ts` by reading the source;
 * this proves what the call does. Brian's decision 8 names this door
 * explicitly, and it is the one door with no operator behind it.
 */
describe("the public sign-up door", () => {
  it("adds one row and one invitation, with the job after the grace", async () => {
    const eventId = await approvedEventWithGroup("recruits:all");

    // A code of this suite's own. Minting supersedes whatever was live
    // (`recruitment_signup_codes_one_live_per_season`), so anything this
    // displaces is put back in the `finally` below and the minted row is
    // deleted — the sign-up gate's own state is left exactly as it was found.
    const displaced = await observer.query<{ id: string }>(
      `select id from public.recruitment_signup_codes
        where season_id = $1::uuid and deactivated_at is null`,
      [seasonId],
    );
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    const before = new Date();

    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code: minted.code,
        submission: {
          givenName: NAME_MARKER,
          familyName: "Selby",
          mobile: "+44 7700 900177",
          collegeEmail: `${NAME_MARKER.toLowerCase()}.selby@balliol.ox.ac.uk`,
          consent: true,
        },
      }),
    );

    try {
      const rows = await audienceRowsFor(eventId, result.personId);
      expect(rows).toHaveLength(1);
      expect(rows[0].added_by_group).toBe("recruits:all");
      // No operator at this door, and the row says so.
      expect(rows[0].added_by_person_id).toBeNull();
      expect(await invitationsFor(eventId, result.personId)).toHaveLength(1);

      const invitation = (await jobsFor(result.personId)).find(
        (job) => job.event_id === eventId && job.job_type === "invitation",
      );
      expect(invitation).toBeDefined();
      expect(invitation?.scheduled_for?.getTime()).toBeGreaterThanOrEqual(
        before.getTime() + 9 * 60 * 1000,
      );
    } finally {
      await observer.query("delete from public.recruitment_signup_codes where id = $1::uuid", [
        minted.id,
      ]);
      for (const row of displaced.rows) {
        await observer.query(
          `update public.recruitment_signup_codes
              set deactivated_at = null, deactivated_reason = null
            where id = $1::uuid`,
          [row.id],
        );
      }
    }
  });

  it("does the same at the tokenised door, which is its own function", async () => {
    const eventId = await approvedEventWithGroup("recruits:all");
    const person = await observer.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, 'Tregarth') returning id",
      [NAME_MARKER],
    );
    const personId = person.rows[0].id;
    const before = new Date();

    await withTransaction((tx) =>
      signUpWithTokenIn(tx, {
        personId,
        seasonId,
        submission: {
          givenName: NAME_MARKER,
          familyName: "Tregarth",
          mobile: "+44 7700 900188",
          collegeEmail: `${NAME_MARKER.toLowerCase()}.tregarth@balliol.ox.ac.uk`,
          consent: true,
        },
      }),
    );

    const rows = await audienceRowsFor(eventId, personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].added_by_group).toBe("recruits:all");
    expect(await invitationsFor(eventId, personId)).toHaveLength(1);

    const invitation = (await jobsFor(personId)).find(
      (job) => job.event_id === eventId && job.job_type === "invitation",
    );
    expect(invitation?.scheduled_for?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + 9 * 60 * 1000,
    );
  });
});
