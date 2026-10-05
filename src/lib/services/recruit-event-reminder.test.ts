// @vitest-environment node
/**
 * The recruit event reminder — LAN-464 — against the real local database with
 * an injected transport, as `attendance-sheet-email.test.ts` is.
 *
 * Who receives it (a recruit whose answer is Yes, given before the reminder
 * moment, with consent and still in recruitment — nobody else), that it is
 * one per recruit per event, what it carries, and what stops or moves it:
 * a changed answer, an exit, a cancelled event, a moved event and quiet hours.
 *
 * Every row hangs off this file's own season and people, named by `MARKER`,
 * and is deleted in `afterEach`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/guards")>()),
  requireCapability: vi.fn(),
}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { requireCapability } from "@/lib/auth/guards";
import { NO_GRANTS } from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";

import { readMessageQueue } from "./message-queue";
import { dispatchRecruitEventReminderJob, runMessagingSweep } from "./messaging-scheduler";
import { setLightsOutClockForTesting } from "./messaging-schedule/lights-out";
import {
  RECRUIT_EVENT_REMINDER_NOT_YES_REASON,
  RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON,
  declareDueRecruitEventRemindersIn,
  recruitEventReminderIdempotencyKey,
} from "./recruit-event-reminder";
import { cancelRecruitEventJobsIn } from "./recruitment-prospect/cancellations";
import {
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "../../../tests/helpers/service-layer";

vi.setConfig({ testTimeout: 20_000 });

const MARKER = "LAN464RecruitReminder";
const PHONE = "07700 900464";
const DIALLED_PHONE = "447700900464";

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

const OPERATOR = {
  personId: "00000000-0000-4000-8000-000000000464",
  roleCodes: ["it_officer"],
  grants: NO_GRANTS,
} as unknown as ResolvedOperator;

/** `vitest.setup.ts`'s own pinned midday, restored after every test. */
const PINNED_MIDDAY = new Date("2026-06-15T11:00:00Z");

let observer: Client;
let seasonId: string;
let anchorPersonId: string;
let recruitmentTemplateId: string;

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    if (String(body.to ?? "") === DIALLED_PHONE) sent.push({ url, body });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { sent, transport };
}

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  anchorPersonId = anchor.rows[0].id;
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2019-09-01', '2020-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchorPersonId],
  );
  seasonId = season.rows[0].id;
  const template = await observer.query<{ id: string }>(
    `select id from public.event_templates where event_type = 'recruitment'
      order by lower(name) limit 1`,
  );
  recruitmentTemplateId = template.rows[0].id;
});

beforeEach(() => {
  vi.mocked(requireCapability).mockReset();
  vi.mocked(requireCapability).mockResolvedValue(OPERATOR);
});

afterEach(async () => {
  setLightsOutClockForTesting(() => PINNED_MIDDAY);
  await clearRecipientSafetyState(observer);
  const events = "(select id from public.events where name like $1)";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  const people = "(select id from public.people where given_name = $1)";
  const scope = `${MARKER}%`;
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [scope],
  );
  await observer.query(`delete from public.audit_events where entity_id in ${jobs}`, [scope]);
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query("delete from public.events where name like $1", [scope]);
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/**
 * An approved recruitment event starting `startsIn` from now (an SQL interval),
 * with a frozen plan whose recruit reminder moment is `reminderAt` (an SQL
 * expression; `null` for none).
 */
async function recruitmentEvent(
  startsIn = "30 minutes",
  reminderAt: string | null = "now() - interval '5 minutes'",
): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    `with target as (
       select (now() + $3::interval) at time zone 'Europe/London' as local
     )
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at, venue,
        audience_confirmed_at, audience_confirmed_by_person_id,
        approved_at, approved_by_person_id, template_id)
     select $1, $2, 'recruitment', 'approved',
            (select local::date from target),
            (select date_trunc('minute', local)::time from target),
            'University Parks',
            now(), $4, now(), $4, $5
     returning id`,
    [
      seasonId,
      `${MARKER} Taster ${crypto.randomUUID().slice(0, 4).replace(/\d/g, "x")}`,
      startsIn,
      anchorPersonId,
      recruitmentTemplateId,
    ],
  );
  const eventId = inserted.rows[0].id;
  await observer.query(
    `insert into public.event_messaging_plans
       (event_id, rsvp_by_days, invitation_lead_days, reminder_cadence_hours,
        whatsapp_reminder_count, email_reminder_count, escalation_hours,
        response_deadline_at, invitation_at, escalation_at,
        dispatches_immediately, late_approval,
        whatsapp_reminders_scheduled, email_reminders_scheduled,
        recruit_invitation_lead_days, recruit_follow_up_cadence_hours,
        recruit_invitation_at, recruit_dispatches_immediately, recruit_follow_up_at,
        recruit_event_reminder_hours, recruit_event_reminder_at)
     values ($1, 2, 5, 24, 2, 1, 12, now() - interval '1 day', now() - interval '5 days', null,
             false, false, 1, 1, 5, 72, now() - interval '5 days', false, null,
             1, ${reminderAt ?? "null"})`,
    [eventId],
  );
  return eventId;
}

interface Recruit {
  readonly personId: string;
  readonly invitationId: string;
}

/**
 * A recruit invited to `eventId`. `answer` is recorded `answeredAgo` before
 * now (an SQL interval); `consent` grants season messaging consent.
 */
async function recruit(
  eventId: string,
  options: {
    answer?: "yes" | "no" | null;
    answeredAgo?: string;
    consent?: boolean;
    capacity?: "recruit" | "player";
    prospectStatus?: "engaged" | "declined" | null;
  } = {},
): Promise<Recruit> {
  const capacity = options.capacity ?? "recruit";
  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Recruit') returning id",
    [MARKER],
  );
  const personId = person.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
     values ($1, 'phone', $2, true)`,
    [personId, PHONE],
  );
  if (options.consent ?? true) {
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1, $2, 'granted', 'operator_recorded')`,
      [personId, seasonId],
    );
  }
  if (options.prospectStatus !== null) {
    await observer.query(
      `insert into public.recruitment_prospects (person_id, season_id, status)
       values ($1, $2, $3::public.prospect_status)`,
      [personId, seasonId, options.prospectStatus ?? "engaged"],
    );
  }
  let membershipId: string | null = null;
  if (capacity === "player") {
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );
    membershipId = membership.rows[0].id;
  }
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id, invitee_person_id,
        added_by_person_id)
     values ($1, $2, $3::public.invitation_capacity, $4, $5, $6, $7) returning id`,
    [
      eventId,
      seasonId,
      capacity,
      membershipId,
      capacity === "player" ? null : personId,
      personId,
      anchorPersonId,
    ],
  );
  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity, season_membership_id, person_id,
        status, audience_member_id)
     values ($1, 'approved', $2, $3::public.invitation_capacity, $4, $5, 'issued', $6)
     returning id`,
    [
      eventId,
      seasonId,
      capacity,
      membershipId,
      capacity === "player" ? null : personId,
      audience.rows[0].id,
    ],
  );
  const invitationId = invitation.rows[0].id;
  if (options.answer !== null) {
    await answer(invitationId, options.answer ?? "yes", options.answeredAgo ?? "1 hour");
  }
  return { personId, invitationId };
}

async function answer(invitationId: string, response: "yes" | "no", ago = "0 minutes") {
  await observer.query(
    `insert into public.rsvp_responses
       (invitation_id, response, reason, source, responded_at, recorded_at)
     values ($1, $2::public.rsvp_value, case when $2::text = 'no' then 'Cannot make it' end,
             'operator', now() - $3::interval, now() - $3::interval)`,
    [invitationId, response, ago],
  );
}

async function declare() {
  return withTransaction((tx) => declareDueRecruitEventRemindersIn(tx));
}

async function reminderJobs(eventId: string) {
  const result = await observer.query<{
    id: string;
    invitation_id: string;
    person_id: string;
    channel: string;
    status: string;
    cancelled_reason: string | null;
    last_error: string | null;
    scheduled_for: Date;
  }>(
    `select id, invitation_id, person_id, channel::text as channel, status::text as status,
            cancelled_reason, last_error, scheduled_for
       from public.notification_jobs
      where event_id = $1 and idempotency_key like 'recruit-event-reminder:%'
      order by invitation_id`,
    [eventId],
  );
  return result.rows;
}

/** Today's 23:00 in the club's zone, read from the database's own clock. */
async function tonightAt2300(): Promise<Date> {
  const result = await observer.query<{ at: Date }>(
    `select (((now() at time zone 'Europe/London')::date + time '23:00')
              at time zone 'Europe/London') as at`,
  );
  return result.rows[0].at;
}

describe("who gets the reminder", () => {
  it("is each recruit whose answer is Yes — nobody who said No, nobody unanswered, no player", async () => {
    const eventId = await recruitmentEvent();
    const going = await recruit(eventId, { answer: "yes" });
    await recruit(eventId, { answer: "no" });
    await recruit(eventId, { answer: null });
    await recruit(eventId, { answer: "yes", capacity: "player", prospectStatus: null });

    const { declared } = await declare();
    expect(declared).toBeGreaterThanOrEqual(1);

    const jobs = await reminderJobs(eventId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      invitation_id: going.invitationId,
      person_id: going.personId,
      channel: "whatsapp",
      status: "pending",
    });
  });

  it("is nobody who answered Yes after the reminder moment", async () => {
    const eventId = await recruitmentEvent();
    await recruit(eventId, { answer: "yes", answeredAgo: "1 minute" });
    await declare();
    expect(await reminderJobs(eventId)).toHaveLength(0);
  });

  it("is nobody without season consent, and nobody who has left recruitment", async () => {
    const eventId = await recruitmentEvent();
    await recruit(eventId, { answer: "yes", consent: false });
    await recruit(eventId, { answer: "yes", prospectStatus: "declined" });
    await declare();
    expect(await reminderJobs(eventId)).toHaveLength(0);
  });

  it("is nobody before the reminder moment, and nobody once the reminder is off", async () => {
    const early = await recruitmentEvent("3 hours", "now() + interval '2 hours'");
    await recruit(early, { answer: "yes" });
    const off = await recruitmentEvent("30 minutes", null);
    await recruit(off, { answer: "yes" });
    await declare();
    expect(await reminderJobs(early)).toHaveLength(0);
    expect(await reminderJobs(off)).toHaveLength(0);
  });

  it("is nobody on a cancelled event", async () => {
    const eventId = await recruitmentEvent();
    await recruit(eventId, { answer: "yes" });
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = 'Test cancellation' where id = $1",
      [eventId],
    );
    await declare();
    expect(await reminderJobs(eventId)).toHaveLength(0);
  });

  it("is one per recruit per event, however many ticks run", async () => {
    const eventId = await recruitmentEvent();
    const going = await recruit(eventId, { answer: "yes" });
    await declare();
    await declare();
    const jobs = await reminderJobs(eventId);
    expect(jobs).toHaveLength(1);
    const key = await observer.query<{ idempotency_key: string }>(
      "select idempotency_key from public.notification_jobs where id = $1",
      [jobs[0].id],
    );
    expect(key.rows[0].idempotency_key).toBe(
      recruitEventReminderIdempotencyKey(eventId, going.invitationId),
    );
  });
});

describe("the message", () => {
  it("is declared and sent by the ordinary sweep tick", async () => {
    // Far overdue, so ambient due work in the seeded database cannot crowd it
    // out of the tick (see `EXTREME_OVERDUE_HOURS` in messaging-scheduler.test.ts).
    const eventId = await recruitmentEvent("30 minutes", "now() - interval '365 days'");
    await recruit(eventId, { answer: "yes", answeredAgo: "366 days" });

    const { sent, transport } = acceptingTransport();
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(summary.recruitRemindersDeclared).toBeGreaterThanOrEqual(1);
    expect(sent).toHaveLength(1);
    expect((sent[0].body.template as { name: string }).name).toBe("recruit_event_reminder_v1");
    expect((await reminderJobs(eventId))[0].status).toBe("processing");
  });

  it("goes by WhatsApp on recruit_event_reminder_v1, carrying what, when and where", async () => {
    const eventId = await recruitmentEvent();
    await recruit(eventId, { answer: "yes" });
    await declare();
    const [job] = await reminderJobs(eventId);

    const { sent, transport } = acceptingTransport();
    expect(await dispatchRecruitEventReminderJob(job.id, { source: CONFIGURED, transport })).toBe(
      "accepted",
    );

    expect(sent).toHaveLength(1);
    const template = sent[0].body.template as {
      name: string;
      components: { type: string; parameters: { text: string }[] }[];
    };
    expect(template.name).toBe("recruit_event_reminder_v1");
    expect(template.components.filter((c) => c.type === "button")).toHaveLength(0);
    const parameters = template.components
      .find((c) => c.type === "body")!
      .parameters.map((p) => p.text);
    const event = await observer.query<{ name: string; when_label: string }>(
      `select name,
              to_char((scheduled_on + starts_at), 'FMDay FMDD FMMonth, HH24:MI') as when_label
         from public.events where id = $1`,
      [eventId],
    );
    expect(parameters).toEqual([
      MARKER,
      event.rows[0].name,
      event.rows[0].when_label,
      "University Parks",
    ]);
    expect((await reminderJobs(eventId))[0].status).toBe("processing");
  });
});

describe("what stops or moves a declared reminder", () => {
  it("an answer changed to No before it goes stands it down, with the reason", async () => {
    const eventId = await recruitmentEvent();
    const going = await recruit(eventId, { answer: "yes" });
    await declare();
    await answer(going.invitationId, "no");
    const [job] = await reminderJobs(eventId);

    const { sent, transport } = acceptingTransport();
    await dispatchRecruitEventReminderJob(job.id, { source: CONFIGURED, transport });
    expect(sent).toHaveLength(0);
    expect((await reminderJobs(eventId))[0]).toMatchObject({
      status: "cancelled",
      cancelled_reason: RECRUIT_EVENT_REMINDER_NOT_YES_REASON,
    });
  });

  it("the recruit leaving recruitment cancels it on LAN-341's own path", async () => {
    const eventId = await recruitmentEvent();
    const going = await recruit(eventId, { answer: "yes" });
    await declare();
    const cancelled = await withTransaction((tx) =>
      cancelRecruitEventJobsIn(tx, going.personId, seasonId, "Recruit moved to declined."),
    );
    expect(cancelled).toBe(1);
    expect((await reminderJobs(eventId))[0].status).toBe("cancelled");
  });

  it("consent withdrawn before it goes withholds it", async () => {
    const eventId = await recruitmentEvent();
    const going = await recruit(eventId, { answer: "yes" });
    await declare();
    await observer.query(
      `update public.season_messaging_consents set state = 'withdrawn' where person_id = $1`,
      [going.personId],
    );
    const [job] = await reminderJobs(eventId);
    const { sent, transport } = acceptingTransport();
    await dispatchRecruitEventReminderJob(job.id, { source: CONFIGURED, transport });
    expect(sent).toHaveLength(0);
    expect((await reminderJobs(eventId))[0]).toMatchObject({
      status: "failed",
      last_error:
        "No recorded consent to message this recruit for this season, so nothing was sent.",
    });
  });

  it("an event moved later puts it back to the plan's new moment, unsent", async () => {
    const eventId = await recruitmentEvent();
    await recruit(eventId, { answer: "yes" });
    await declare();
    await observer.query(
      `update public.event_messaging_plans
          set recruit_event_reminder_at = now() + interval '2 hours' where event_id = $1`,
      [eventId],
    );
    const [job] = await reminderJobs(eventId);
    const { sent, transport } = acceptingTransport();
    expect(await dispatchRecruitEventReminderJob(job.id, { source: CONFIGURED, transport })).toBe(
      "skipped",
    );
    expect(sent).toHaveLength(0);
    const after = (await reminderJobs(eventId))[0];
    expect(after.status).toBe("pending");
    expect(after.scheduled_for.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });
});

describe("quiet hours", () => {
  it("holds a reminder for 07:00 while 07:00 is still before the event", async () => {
    const night = await tonightAt2300();
    setLightsOutClockForTesting(() => night);
    // Starts at 09:00 tomorrow, club time: 07:00 is two hours before it.
    const startsIn = await observer.query<{ gap: string }>(
      `select ((($1::timestamptz at time zone 'Europe/London')::date + 1 + time '09:00')
                 at time zone 'Europe/London' - now())::text as gap`,
      [night],
    );
    const eventId = await recruitmentEvent(startsIn.rows[0].gap);
    await recruit(eventId, { answer: "yes" });

    const { dropped } = await declare();
    expect(dropped).toBe(0);
    const [job] = await reminderJobs(eventId);
    expect(job.status).toBe("pending");

    const { sent, transport } = acceptingTransport();
    expect(await dispatchRecruitEventReminderJob(job.id, { source: CONFIGURED, transport })).toBe(
      "deferred",
    );
    expect(sent).toHaveLength(0);
  });

  it("drops a reminder that 07:00 would deliver after the start, and the queue says why", async () => {
    const night = await tonightAt2300();
    setLightsOutClockForTesting(() => night);
    const eventId = await recruitmentEvent("30 minutes");
    await recruit(eventId, { answer: "yes" });

    const { dropped } = await declare();
    expect(dropped).toBeGreaterThanOrEqual(1);
    expect((await reminderJobs(eventId))[0]).toMatchObject({
      status: "cancelled",
      cancelled_reason: RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON,
    });

    const queue = await readMessageQueue({
      window: "today",
      kind: "reminder",
      status: "cancelled",
    });
    const [jobRow] = await reminderJobs(eventId);
    const row = queue.rows.find((candidate) => candidate.id === jobRow.id);
    expect(row).toMatchObject({
      kind: "recruit_reminder",
      state: "cancelled",
      droppedReason: RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON,
    });
  });
});
