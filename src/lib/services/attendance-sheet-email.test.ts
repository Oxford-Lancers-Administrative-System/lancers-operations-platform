// @vitest-environment node
/**
 * The attendance-sheet email — LAN-465 — against the real local database with
 * an injected transport, as `messaging-scheduler.test.ts` is.
 *
 * Who receives it (the General Manager, the President, every coach who
 * answered Yes, each once), and which events send nothing (cancelled, no
 * start time, not yet within the hour), and that a moved event moves the send.
 *
 * Every row hangs off this file's own season and people, named by `MARKER`,
 * and is deleted in `afterEach`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";
import {
  FIXED_COACHING_ROLE_CODES,
  LEADERSHIP_TIER_SEATS,
  roleCodesPermit,
} from "@/lib/auth/capabilities";

import {
  attendanceSheetIdempotencyKey,
  declareDueAttendanceSheetEmailsIn,
  listAttendanceSheetRecipientsIn,
  parseAttendanceSheetKey,
} from "./attendance-sheet-email";
import { dispatchAttendanceSheetJob } from "./messaging-scheduler";
import {
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "../../../tests/helpers/service-layer";

vi.setConfig({ testTimeout: 20_000 });

const MARKER = "LAN465AttendanceSheet";
const COACH_EMAIL = "lan465.coach@example.test";

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

let observer: Client;
let seasonId: string;
let anchorPersonId: string;

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    sent.push({ url, body });
    const id = `msg.${MARKER}.${crypto.randomUUID()}`;
    return new Response(JSON.stringify({ id }), {
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
});

afterEach(async () => {
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
  await observer.query("delete from public.events where name like $1", [scope]);
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

/** An approved practice starting `minutesAhead` from now, club time; `null` start for none. */
async function event(
  minutesAhead: number,
  options: { status?: "approved" | "cancelled"; noStartTime?: boolean } = {},
): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    `with target as (
       select (now() + make_interval(mins => $3)) at time zone 'Europe/London' as local
     )
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at,
        audience_confirmed_at, audience_confirmed_by_person_id,
        approved_at, approved_by_person_id, template_id)
     select $1, $2, 'practice', 'approved',
            (select local::date from target),
            case when $4 then null else (select date_trunc('minute', local)::time from target) end,
            now(), $5, now(), $5,
            (select tpl.id from public.event_templates tpl
              where tpl.event_type = 'practice' order by lower(tpl.name) limit 1)
     returning id`,
    [
      seasonId,
      `${MARKER} ${crypto.randomUUID().slice(0, 8)}`,
      minutesAhead,
      options.noStartTime ?? false,
      anchorPersonId,
    ],
  );
  const id = inserted.rows[0].id;
  if (options.status === "cancelled") {
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = 'Test cancellation' where id = $1",
      [id],
    );
  }
  return id;
}

async function person(familyName: string, email: string | null = null): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, familyName],
  );
  const id = inserted.rows[0].id;
  if (email) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred)
       values ($1, 'email', 'personal', $2, true)`,
      [id, email],
    );
  }
  return id;
}

/** An invitation in `capacity` with `answer` as its current response (or none). */
async function invite(
  eventId: string,
  personId: string,
  capacity: "coach" | "player",
  answer: "yes" | "no" | null,
): Promise<void> {
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
  if (answer) {
    await observer.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, $2::public.rsvp_value, case when $2::text = 'no' then 'Cannot make it' end, 'operator', now())`,
      [invitation.rows[0].id, answer],
    );
  }
}

async function seatHolders(): Promise<string[]> {
  const result = await observer.query<{ person_id: string }>(
    `select distinct a.person_id
       from public.role_assignments a
       join public.roles r on r.id = a.role_id
      where r.code = any($1::text[])
        and a.effective_from <= current_date
        and (a.effective_to is null or a.effective_to > current_date)`,
    [[LEADERSHIP_TIER_SEATS.standing_continuity, LEADERSHIP_TIER_SEATS.presiding]],
  );
  return result.rows.map((row) => row.person_id);
}

async function declare(): Promise<void> {
  await withTransaction((tx) => declareDueAttendanceSheetEmailsIn(tx));
}

async function sheetJobs(eventId: string) {
  const result = await observer.query<{
    id: string;
    person_id: string;
    channel: string;
    status: string;
    scheduled_for: Date;
  }>(
    `select id, person_id, channel::text as channel, status::text as status, scheduled_for
       from public.notification_jobs
      where event_id = $1 and idempotency_key like 'attendance-sheet:%'
      order by person_id`,
    [eventId],
  );
  return result.rows;
}

/**
 * LAN-465 asks whether each recipient class can open the page the link goes
 * to. `/operate/events/[id]/attendance` is gated on `attendance_recording`
 * (narrow recorders allowed), and the register opens six hours before the
 * start, so it is open at the one-hour mark. A `coach` invitation is made for a
 * season-scoped seat (`event-audience.ts`), and every season-scoped seat is a
 * fixed coaching seat (`tests/operator-capability-catalogue.test.ts`). What the
 * grant cannot supply is a sign-in: a recipient with no active operator
 * account reaches the login page, not the sheet.
 */
describe("every recipient class holds the capability the attendance page is gated on", () => {
  it("the General Manager, the President and every fixed coaching seat", () => {
    for (const code of [
      LEADERSHIP_TIER_SEATS.standing_continuity,
      LEADERSHIP_TIER_SEATS.presiding,
      ...FIXED_COACHING_ROLE_CODES,
    ]) {
      expect(roleCodesPermit([code], "attendance_recording"), code).toBe(true);
    }
  });
});

describe("the key", () => {
  it("round-trips the event and the person", () => {
    const key = attendanceSheetIdempotencyKey("e1", "p1");
    expect(key).toBe("attendance-sheet:e1:p1");
    expect(parseAttendanceSheetKey(key)).toEqual({ eventId: "e1", personId: "p1" });
    expect(parseAttendanceSheetKey("onboarding-chase:e1:p1")).toBeNull();
  });
});

describe("who receives the sheet", () => {
  it("is the General Manager, the President and each coach who answered Yes — nobody else", async () => {
    const eventId = await event(30);
    const going = await person("Coach going");
    const notGoing = await person("Coach not going");
    const unanswered = await person("Coach unanswered");
    const player = await person("Player going");
    await invite(eventId, going, "coach", "yes");
    await invite(eventId, notGoing, "coach", "no");
    await invite(eventId, unanswered, "coach", null);
    await invite(eventId, player, "player", "yes");

    const recipients = await withTransaction((tx) => listAttendanceSheetRecipientsIn(tx, eventId));

    const holders = await seatHolders();
    expect(holders.length).toBeGreaterThan(0);
    expect([...recipients].sort()).toEqual([...holders, going].sort());
  });

  it("declares one email per person, even for somebody who qualifies twice", async () => {
    const eventId = await event(30);
    const [president] = await seatHolders();
    await invite(eventId, president, "coach", "yes");

    await declare();
    await declare();

    const jobs = await sheetJobs(eventId);
    const holders = await seatHolders();
    expect(jobs.map((job) => job.person_id).sort()).toEqual([...holders].sort());
    expect(new Set(jobs.map((job) => job.person_id)).size).toBe(jobs.length);
    expect(jobs.every((job) => job.channel === "email" && job.status === "pending")).toBe(true);
  });
});

describe("which events send nothing", () => {
  it("does not declare before the one-hour mark", async () => {
    const eventId = await event(90);
    await declare();
    expect(await sheetJobs(eventId)).toEqual([]);
  });

  it("does not declare for a cancelled event", async () => {
    const eventId = await event(30, { status: "cancelled" });
    await declare();
    expect(await sheetJobs(eventId)).toEqual([]);
  });

  it("does not declare for an event with no start time", async () => {
    const eventId = await event(30, { noStartTime: true });
    await declare();
    expect(await sheetJobs(eventId)).toEqual([]);
  });

  it("does not declare for an event that has already started", async () => {
    const eventId = await event(-5);
    await declare();
    expect(await sheetJobs(eventId)).toEqual([]);
  });
});

describe("the send", () => {
  it("emails a coach who answered Yes the event's attendance link", async () => {
    const eventId = await event(30);
    const coach = await person("Coach going", COACH_EMAIL);
    await invite(eventId, coach, "coach", "yes");
    await declare();
    const job = (await sheetJobs(eventId)).find((row) => row.person_id === coach)!;

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport });

    expect(outcome).toBe("accepted");
    const mine = sent.filter((entry) => JSON.stringify(entry.body.to).includes(COACH_EMAIL));
    expect(mine).toHaveLength(1);
    expect(mine[0].url.endsWith("/emails")).toBe(true);
    expect(String(mine[0].body.text)).toContain(
      `https://lancers.example.org/operate/events/${eventId}/attendance`,
    );
    expect(String(mine[0].body.subject)).toContain("Attendance sheet");
  });

  it("puts a moved event's send back to its new one-hour mark instead of sending", async () => {
    const eventId = await event(30);
    const coach = await person("Coach going", COACH_EMAIL);
    await invite(eventId, coach, "coach", "yes");
    await declare();
    const job = (await sheetJobs(eventId)).find((row) => row.person_id === coach)!;

    // Moved three hours later after the sheet was declared.
    await observer.query(
      `update public.events
          set scheduled_on = ((now() + interval '3 hours') at time zone 'Europe/London')::date,
              starts_at = date_trunc('minute', (now() + interval '3 hours') at time zone 'Europe/London')::time
        where id = $1`,
      [eventId],
    );

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport });

    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
    const after = (await sheetJobs(eventId)).find((row) => row.id === job.id)!;
    expect(after.status).toBe("pending");
    const minutesAhead = (after.scheduled_for.getTime() - Date.now()) / 60_000;
    expect(minutesAhead).toBeGreaterThan(110);
    expect(minutesAhead).toBeLessThan(121);
    const attempts = await observer.query(
      "select 1 from public.delivery_attempts where notification_job_id = $1",
      [job.id],
    );
    expect(attempts.rowCount).toBe(0);
  });

  it("R470-04: stands down a coach who changed Yes to No after the sheet was declared", async () => {
    const eventId = await event(30);
    const coach = await person("Coach going", COACH_EMAIL);
    await invite(eventId, coach, "coach", "yes");
    await declare();
    const job = (await sheetJobs(eventId)).find((row) => row.person_id === coach)!;
    await observer.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       select i.id, 'no', 'Cannot make it now', 'operator', now() + interval '1 second'
         from public.invitations i where i.event_id = $1 and i.person_id = $2`,
      [eventId, coach],
    );

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport });

    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
    // R470-05: stood down, not cancelled — still pending and unclaimed.
    expect((await sheetJobs(eventId)).find((row) => row.id === job.id)!.status).toBe("pending");
  });

  it("R470-05: sends once to a coach who goes No and then back to Yes", async () => {
    const eventId = await event(30);
    const coach = await person("Coach going", COACH_EMAIL);
    await invite(eventId, coach, "coach", "yes");
    await declare();
    const job = (await sheetJobs(eventId)).find((row) => row.person_id === coach)!;
    const answer = (response: "yes" | "no", seconds: number) =>
      observer.query(
        `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
         select i.id, $3::public.rsvp_value, case when $3::text = 'no' then 'Cannot make it now' end,
                'operator', now() + make_interval(secs => $4)
           from public.invitations i where i.event_id = $1 and i.person_id = $2`,
        [eventId, coach, response, seconds],
      );
    const mine = (sent: { body: Record<string, unknown> }[]) =>
      sent.filter((entry) => JSON.stringify(entry.body.to).includes(COACH_EMAIL));
    const withheldRows = async () =>
      (
        await observer.query(
          `select 1 from public.audit_events
            where entity_id = $1 and action = 'delivery.attendance_sheet_withheld'`,
          [job.id],
        )
      ).rowCount;

    await answer("no", 1);
    const { sent, transport } = acceptingTransport();
    expect(await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport })).toBe(
      "skipped",
    );
    // A coach who stays No is re-checked each sweep and still sent nothing, and
    // the stand-down is audited once, not on every sweep.
    expect(await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport })).toBe(
      "skipped",
    );
    expect(mine(sent)).toHaveLength(0);
    expect(await withheldRows()).toBe(1);
    const stoodDown = await observer.query<{ status: string; claimed_at: Date | null }>(
      "select status::text as status, claimed_at from public.notification_jobs where id = $1",
      [job.id],
    );
    expect(stoodDown.rows[0]).toEqual({ status: "pending", claimed_at: null });

    await answer("yes", 2);
    await declare(); // the declaration's own conflict rule: no second job
    expect((await sheetJobs(eventId)).filter((row) => row.person_id === coach)).toHaveLength(1);
    expect(await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport })).toBe(
      "accepted",
    );
    expect(await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport })).toBe(
      "skipped",
    );
    expect(mine(sent)).toHaveLength(1);
  });

  it("sends nothing for an event cancelled after the sheet was declared", async () => {
    const eventId = await event(30);
    const coach = await person("Coach going", COACH_EMAIL);
    await invite(eventId, coach, "coach", "yes");
    await declare();
    const job = (await sheetJobs(eventId)).find((row) => row.person_id === coach)!;
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = 'Test cancellation' where id = $1",
      [eventId],
    );

    const { sent, transport } = acceptingTransport();
    await dispatchAttendanceSheetJob(job.id, { source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
  });
});
