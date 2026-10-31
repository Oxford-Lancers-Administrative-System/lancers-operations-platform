// @vitest-environment node
/**
 * Event messages — LAN-508 — against the real local database with an injected
 * transport, on `recruit-event-reminder.test.ts`'s idiom. Never a real send.
 *
 * When one goes (its moment, nothing before it, nothing on a cancelled event,
 * a moved event moving it, lights-out holding it), who it goes to (everyone
 * invited, or a Yes recorded by then; no consent means email only), what each
 * copy carries, the server's refusal of a changed sent message without its
 * resend, the resend going to exactly the previous people, the template's
 * skeleton reaching a new event, and the posture of the four tables.
 *
 * Every row hangs off this file's own season and people, named by `MARKER`,
 * and is deleted in `afterEach`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The real renderer, unless a test asks for a brief that cannot be drawn.
const renderControl = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/event-brief/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/event-brief/image")>();
  return {
    ...actual,
    renderBriefPng: async (markdown: string) => {
      if (renderControl.fail) throw new Error("Satori could not draw this brief");
      return actual.renderBriefPng(markdown);
    },
  };
});

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";

import { EVENT_MESSAGE_RENDER_FAILED_REASON, dispatchEventMessageJob } from "./messaging-scheduler";
import { setLightsOutClockForTesting } from "./messaging-schedule/lights-out";
import { DUE_JOB_PREDICATE } from "./messaging-queue";
import { DELIVERY_LATEST_RESULT_JOIN, DELIVERY_STATE_EXPRESSION, MAX_ATTEMPTS } from "./delivery";
import {
  EVENT_MESSAGE_RESEND_REQUIRED_RULE,
  declareDueEventMessagesIn,
  readEventMessages,
  replaceTemplateEventMessages,
  saveApprovedEventMessages,
} from "./event-messages";
import { createEventDraft } from "./events";
import { mergePersons } from "./person-merge";
import type { EventMessageInput } from "./event-messages-input";
import type { EventDraftInput } from "./event-input";
import { saveApprovedEventEdit } from "./approved-event-edit";
import {
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "../../../tests/helpers/service-layer";

vi.setConfig({ testTimeout: 30_000 });

const MARKER = "LAN508EventMessage";

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

const PINNED_MIDDAY = new Date("2026-06-15T11:00:00Z");

const BRIEF = "# GAMEDAY\n## Itinerary\n- 8:30 AM Bus leaves\n\n## Bring\n- **Mouthguard**";

let observer: Client;
let seasonId: string;
let anchorPersonId: string;
let templateId: string;

interface Sent {
  readonly url: string;
  readonly kind: "media" | "whatsapp" | "email";
  readonly body: Record<string, unknown> | null;
}

/** Accepts everything, records only this file's own recipients. */
function acceptingTransport(recipients: ReadonlySet<string>) {
  const sent: Sent[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/media")) {
      sent.push({ url, kind: "media", body: null });
      return json({ id: `media-${crypto.randomUUID()}` });
    }
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    if (path.endsWith("/emails")) {
      const to = Array.isArray(body.to) ? String(body.to[0]) : String(body.to);
      if (recipients.has(to)) sent.push({ url, kind: "email", body });
      return json({ id: crypto.randomUUID() });
    }
    if (recipients.has(String(body.to ?? ""))) sent.push({ url, kind: "whatsapp", body });
    return json({ messaging_product: "whatsapp", messages: [{ id: `wamid.${MARKER}` }] });
  };
  return { sent, transport };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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
    `select id from public.event_templates where event_type = 'game' order by lower(name) limit 1`,
  );
  templateId = template.rows[0].id;
});

afterEach(async () => {
  renderControl.fail = false;
  setLightsOutClockForTesting(() => PINNED_MIDDAY);
  await clearRecipientSafetyState(observer);
  const events = "(select id from public.events where name like $1)";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;
  const sends = `(select id from public.event_message_sends where event_id in ${events})`;
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  const scope = `${MARKER}%`;
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.event_message_send_recipients where send_id in ${sends}`,
    [scope],
  );
  await observer.query(`delete from public.event_message_sends where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_messages where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_questions where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(
    `delete from public.audit_events where entity_table = 'people' and entity_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.person_aliases where person_id in ${people}`, [MARKER]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  await observer.query("delete from public.event_template_messages where body like $1", [scope]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/** An approved game starting `startsIn` from now (an SQL interval). */
async function approvedEvent(startsIn = "30 hours", status = "approved"): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    `with target as (
       select (now() + $3::interval) at time zone 'Europe/London' as local
     )
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at, venue,
        audience_confirmed_at, audience_confirmed_by_person_id,
        approved_at, approved_by_person_id, template_id, decision_reason)
     select $1, $2, 'game', $5::public.event_status,
            (select local::date from target),
            (select date_trunc('minute', local)::time from target),
            'Iffley Road', now(), $4, now(), $4, $6,
            case when $5::text = 'cancelled' then 'Waterlogged pitch' end
     returning id`,
    [
      seasonId,
      `${MARKER} Varsity ${crypto.randomUUID().slice(0, 6)}`,
      startsIn,
      anchorPersonId,
      status,
      templateId,
    ],
  );
  return inserted.rows[0].id;
}

interface Invitee {
  readonly personId: string;
  readonly invitationId: string;
  readonly phone: string;
  readonly email: string;
}

let sequence = 0;

/** One person invited to `eventId`, with a phone and an email; consent by default. */
async function invitee(
  eventId: string,
  options: { answer?: "yes" | "no" | null; consent?: boolean } = {},
): Promise<Invitee> {
  sequence += 1;
  const suffix = String(500 + sequence).padStart(3, "0");
  const phone = `07700 900${suffix}`;
  const email = `lan508.${suffix}@example.org`;
  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Player') returning id",
    [MARKER],
  );
  const personId = person.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
     values ($1, 'phone', $2, true), ($1, 'email', $3, true)`,
    [personId, phone, email],
  );
  if (options.consent ?? true) {
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1, $2, 'granted', 'operator_recorded')`,
      [personId, seasonId],
    );
  }
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, person_id, invitee_person_id, added_by_person_id)
     values ($1, $2, 'recruit', $3, $3, $4) returning id`,
    [eventId, seasonId, personId, anchorPersonId],
  );
  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity, person_id, status, audience_member_id)
     values ($1, 'approved', $2, 'recruit', $3, 'issued', $4)
     returning id`,
    [eventId, seasonId, personId, audience.rows[0].id],
  );
  const invitationId = invitation.rows[0].id;
  if (options.answer) await answer(invitationId, options.answer);
  return { personId, invitationId, phone: `44${phone.replace(/\D/g, "").slice(1)}`, email };
}

async function answer(invitationId: string, response: "yes" | "no") {
  await observer.query(
    `insert into public.rsvp_responses
       (invitation_id, response, reason, source, responded_at, recorded_at)
     values ($1, $2::public.rsvp_value, case when $2::text = 'no' then 'Away' end,
             'operator', now(), now())`,
    [invitationId, response],
  );
}

async function message(
  eventId: string,
  fields: Partial<{ hours: number; channel: string; recipients: string; body: string }> = {},
): Promise<string> {
  const inserted = await observer.query<{ id: string }>(
    `insert into public.event_messages (event_id, hours_before, channel, recipients, body)
     values ($1, $2, $3::public.event_message_channel, $4::public.event_message_recipients, $5)
     returning id`,
    [
      eventId,
      fields.hours ?? 48,
      fields.channel ?? "both",
      fields.recipients ?? "everyone",
      fields.body ?? BRIEF,
    ],
  );
  return inserted.rows[0].id;
}

async function declare(): Promise<number> {
  return withTransaction((tx) => declareDueEventMessagesIn(tx));
}

async function jobsFor(eventId: string) {
  const result = await observer.query<{
    id: string;
    person_id: string;
    channel: string;
    status: string;
    idempotency_key: string;
    invitation_id: string | null;
  }>(
    `select id, person_id, channel::text as channel, status::text as status, idempotency_key,
            invitation_id
       from public.notification_jobs where event_id = $1 order by created_at, idempotency_key`,
    [eventId],
  );
  return result.rows;
}

async function sendsFor(eventId: string) {
  const result = await observer.query<{
    id: string;
    version: number;
    body: string;
    resent_by_person_id: string | null;
    people: string[];
  }>(
    `select s.id, s.version, s.body, s.resent_by_person_id,
            array(select r.person_id::text from public.event_message_send_recipients r
                   where r.send_id = s.id order by r.person_id) as people
       from public.event_message_sends s where s.event_id = $1 order by s.version`,
    [eventId],
  );
  return result.rows;
}

/** Lets the next copy to the same person through the five-minute pacing. */
async function forgetPacing(): Promise<void> {
  await observer.query(
    `update public.delivery_attempts set safety_admitted_at = now() - interval '1 hour'
      where safety_person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
}

function asInput(
  stored: Awaited<ReturnType<typeof readEventMessages>>[number],
  patch: Partial<EventMessageInput> = {},
): EventMessageInput {
  return {
    id: stored.id,
    hoursBefore: stored.hoursBefore,
    channel: stored.channel,
    recipients: stored.recipients,
    body: stored.body,
    fromTemplate: stored.fromTemplate,
    ...patch,
  };
}

describe("when an event message goes", () => {
  it("goes at its moment, once, to everyone invited", async () => {
    const eventId = await approvedEvent("30 hours");
    const a = await invitee(eventId, { answer: "yes" });
    const b = await invitee(eventId, { answer: null });
    await message(eventId, { hours: 48 });

    expect(await declare()).toBeGreaterThanOrEqual(1);
    const sends = await sendsFor(eventId);
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({ version: 1, body: BRIEF, resent_by_person_id: null });
    expect(sends[0].people).toEqual([a.personId, b.personId].sort());

    // Both channels for each consented person, no invitation link on any copy.
    const jobs = await jobsFor(eventId);
    expect(jobs.map((job) => job.channel).sort()).toEqual([
      "email",
      "email",
      "whatsapp",
      "whatsapp",
    ]);
    expect(jobs.every((job) => job.invitation_id === null)).toBe(true);
    expect(jobs.every((job) => job.idempotency_key.startsWith("event-message:"))).toBe(true);

    // Never a second time.
    await declare();
    expect(await sendsFor(eventId)).toHaveLength(1);
    expect(await jobsFor(eventId)).toHaveLength(4);
  });

  it("does not go before its moment, and moves with the event", async () => {
    const eventId = await approvedEvent("72 hours");
    await invitee(eventId);
    await message(eventId, { hours: 48 });

    await declare();
    expect(await sendsFor(eventId)).toHaveLength(0);

    // The event moves 30 hours earlier: its message's moment has now come.
    await observer.query(
      `update public.events
          set scheduled_on = ((now() + interval '40 hours') at time zone 'Europe/London')::date,
              starts_at = date_trunc('minute',
                (now() + interval '40 hours') at time zone 'Europe/London')::time
        where id = $1`,
      [eventId],
    );
    await declare();
    expect(await sendsFor(eventId)).toHaveLength(1);
  });

  it("never goes for a cancelled event", async () => {
    const eventId = await approvedEvent("30 hours", "cancelled");
    await message(eventId, { hours: 48 });
    await declare();
    expect(await sendsFor(eventId)).toHaveLength(0);
  });

  it("waits while lights-out is on, and goes at the first tick after", async () => {
    const eventId = await approvedEvent("30 hours");
    await invitee(eventId);
    await message(eventId, { hours: 48 });

    setLightsOutClockForTesting(() => new Date("2026-06-15T22:30:00Z"));
    expect(await declare()).toBe(0);
    expect(await sendsFor(eventId)).toHaveLength(0);

    setLightsOutClockForTesting(() => new Date("2026-06-16T06:00:00Z")); // 07:00 BST
    await declare();
    expect(await sendsFor(eventId)).toHaveLength(1);
  });

  it("reads Those who said Yes when it goes, not when it was written", async () => {
    const eventId = await approvedEvent("30 hours");
    const yes = await invitee(eventId, { answer: "yes" });
    const changed = await invitee(eventId, { answer: "yes" });
    await invitee(eventId, { answer: "no" });
    await invitee(eventId, { answer: null });
    await answer(changed.invitationId, "no");
    await message(eventId, { recipients: "yes" });

    await declare();
    const [send] = await sendsFor(eventId);
    expect(send.people).toEqual([yes.personId]);
  });

  it("gives a person without season consent the email only, whatever the channel", async () => {
    const eventId = await approvedEvent("30 hours");
    const without = await invitee(eventId, { consent: false });
    await message(eventId, { channel: "whatsapp" });

    await declare();
    const jobs = await jobsFor(eventId);
    expect(jobs.filter((job) => job.person_id === without.personId).map((j) => j.channel)).toEqual([
      "email",
    ]);
  });
});

describe("what each copy carries", () => {
  it("sends WhatsApp on the brief template with the image header, and email in the shell", async () => {
    const eventId = await approvedEvent("30 hours");
    const person = await invitee(eventId);
    await message(eventId, { channel: "both" });
    await declare();

    const { sent, transport } = acceptingTransport(new Set([person.phone, person.email]));
    for (const job of await jobsFor(eventId)) {
      await forgetPacing();
      expect(await dispatchEventMessageJob(job.id, { source: CONFIGURED, transport })).toBe(
        "accepted",
      );
    }

    const whatsapp = sent.find((entry) => entry.kind === "whatsapp");
    const template = whatsapp?.body?.template as {
      name: string;
      components: { type: string; parameters: Record<string, unknown>[] }[];
    };
    expect(template.name).toBe("lancers_event_brief_image_v1");
    expect(template.components[0]).toMatchObject({
      type: "header",
      parameters: [{ type: "image", image: { id: expect.stringMatching(/^media-/) } }],
    });
    expect(template.components[1].parameters.map((p) => p.text)).toEqual([
      MARKER,
      expect.stringContaining("Varsity"),
      expect.stringMatching(/, \d{2}:\d{2}$/),
    ]);
    expect(sent.filter((entry) => entry.kind === "media")).toHaveLength(1);

    const email = sent.find((entry) => entry.kind === "email");
    expect(String(email?.body?.html)).toContain("<strong>Mouthguard</strong>");
    expect(String(email?.body?.html)).toContain(">8:30 AM</td>");
    expect(String(email?.body?.subject)).toContain("Your brief for");

    // Through the delivery records like any other message.
    const attempts = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts
        where notification_job_id in (select id from public.notification_jobs where event_id = $1)
          and accepted_at is not null`,
      [eventId],
    );
    expect(Number(attempts.rows[0].count)).toBe(2);
  });

  it("fails a WhatsApp copy whose brief cannot be drawn, once, and still sends the email", async () => {
    const eventId = await approvedEvent("30 hours");
    const person = await invitee(eventId);
    await message(eventId, { channel: "both" });
    await declare();
    renderControl.fail = true;

    const { sent, transport } = acceptingTransport(new Set([person.phone, person.email]));
    const jobs = await jobsFor(eventId);
    const whatsapp = jobs.find((job) => job.channel === "whatsapp")!;
    const email = jobs.find((job) => job.channel === "email")!;

    expect(await dispatchEventMessageJob(whatsapp.id, { source: CONFIGURED, transport })).toBe(
      "refused",
    );
    await forgetPacing();
    expect(await dispatchEventMessageJob(email.id, { source: CONFIGURED, transport })).toBe(
      "accepted",
    );
    expect(sent.map((entry) => entry.kind)).toEqual(["email"]);

    // Concluded through the delivery records, not left due for the next sweep.
    const after = await observer.query<{ status: string; last_error: string | null }>(
      "select status::text as status, last_error from public.notification_jobs where id = $1",
      [whatsapp.id],
    );
    expect(after.rows[0]).toEqual({
      status: "failed",
      last_error: EVENT_MESSAGE_RENDER_FAILED_REASON,
    });
    const results = await observer.query<{ outcome: string; detail: string }>(
      `select outcome::text as outcome, detail from public.delivery_results
        where notification_job_id = $1`,
      [whatsapp.id],
    );
    // Recorded `rejected`, as every claim-time refusal is (LAN-483), but it is
    // not a skip by design, so it reads Failed, never Withheld.
    expect(results.rows).toEqual([
      { outcome: "rejected", detail: EVENT_MESSAGE_RENDER_FAILED_REASON },
    ]);
    const state = await observer.query<{ state: string }>(
      `select ${DELIVERY_STATE_EXPRESSION} as state
         from public.notification_jobs j
         ${DELIVERY_LATEST_RESULT_JOIN}
        where j.id = $1`,
      [whatsapp.id],
    );
    expect(state.rows[0].state).toBe("failed");
    // The sweep's own definition of due no longer finds it, so no later tick draws it again.
    const due = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.notification_jobs
        where id = $2 and ${DUE_JOB_PREDICATE}`,
      [MAX_ATTEMPTS, whatsapp.id],
    );
    expect(due.rows[0].count).toBe("0");
  });

  it("is not sent once its event is cancelled", async () => {
    const eventId = await approvedEvent("30 hours");
    const person = await invitee(eventId);
    await message(eventId, { channel: "email" });
    await declare();
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = 'Waterlogged' where id = $1",
      [eventId],
    );

    const { sent, transport } = acceptingTransport(new Set([person.email]));
    const [job] = await jobsFor(eventId);
    expect(await dispatchEventMessageJob(job.id, { source: CONFIGURED, transport })).toBe(
      "skipped",
    );
    expect(sent).toHaveLength(0);
  });
});

describe("saving an approved event's messages", () => {
  it("just saves an edit to a message that has not gone", async () => {
    const eventId = await approvedEvent("100 hours");
    await message(eventId, { hours: 48 });
    const [stored] = await readEventMessages(eventId);

    const result = await saveApprovedEventMessages(anchorPersonId, eventId, [
      asInput(stored, { body: `${BRIEF}\n- Helmet` }),
    ]);
    expect(result).toEqual({ changed: true, resent: 0 });
    expect(await sendsFor(eventId)).toHaveLength(0);
    expect((await readEventMessages(eventId))[0].body).toContain("Helmet");
  });

  it("refuses a change to a sent message without Save and send again, writing nothing", async () => {
    const eventId = await approvedEvent("30 hours");
    await invitee(eventId);
    await message(eventId);
    await declare();
    const [stored] = await readEventMessages(eventId);

    await expect(
      saveApprovedEventMessages(anchorPersonId, eventId, [asInput(stored, { body: "Changed" })]),
    ).rejects.toMatchObject({ rule: EVENT_MESSAGE_RESEND_REQUIRED_RULE });
    expect((await readEventMessages(eventId))[0].body).toBe(BRIEF);
    expect(await sendsFor(eventId)).toHaveLength(1);
  });

  it("sends the new version to exactly the people the last one went to", async () => {
    const eventId = await approvedEvent("30 hours");
    const first = await invitee(eventId, { answer: "yes" });
    const second = await invitee(eventId, { answer: "yes" });
    await message(eventId, { recipients: "yes" });
    await declare();

    // After it went: one Yes turns No, and a new Yes arrives. Neither changes who gets it again.
    await answer(second.invitationId, "no");
    const late = await invitee(eventId, { answer: "yes" });
    const [stored] = await readEventMessages(eventId);

    const result = await saveApprovedEventMessages(
      anchorPersonId,
      eventId,
      [asInput(stored, { body: "Kick-off moved to 15:00" })],
      { resend: true },
    );
    expect(result.resent).toBe(1);

    const sends = await sendsFor(eventId);
    expect(sends.map((send) => send.version)).toEqual([1, 2]);
    expect(sends[1]).toMatchObject({
      body: "Kick-off moved to 15:00",
      resent_by_person_id: anchorPersonId,
    });
    expect(sends[1].people).toEqual(sends[0].people);
    expect(sends[1].people).toEqual([first.personId, second.personId].sort());
    expect(sends[1].people).not.toContain(late.personId);

    // Each version is kept; the page shows the last.
    const [after] = await readEventMessages(eventId);
    expect(after.lastSend).toMatchObject({ version: 2, body: "Kick-off moved to 15:00" });
  });

  it("refuses to remove a message that has gone", async () => {
    const eventId = await approvedEvent("30 hours");
    await invitee(eventId);
    await message(eventId);
    await declare();
    await expect(saveApprovedEventMessages(anchorPersonId, eventId, [])).rejects.toMatchObject({
      rule: "event_message_sent_cannot_be_removed",
    });
  });

  it("sends again to the surviving record of a merged recipient, once", async () => {
    const eventId = await approvedEvent("30 hours");
    const survivor = (await invitee(eventId)).personId;
    const other = await invitee(eventId);
    const duplicate = { personId: await uninvitedPerson() };
    await message(eventId, { channel: "both" });
    await declare();
    const [first] = await sendsFor(eventId);
    // The duplicate record had been sent it too, before anyone saw it was one person.
    await observer.query(
      "insert into public.event_message_send_recipients (send_id, person_id) values ($1, $2)",
      [first.id, duplicate.personId],
    );

    // The duplicate presses Save and send again, so it has a resend row as well.
    let [stored] = await readEventMessages(eventId);
    await saveApprovedEventMessages(
      duplicate.personId,
      eventId,
      [asInput(stored, { body: "Kick-off moved to 15:00" })],
      { resend: true },
    );

    await mergePersons({
      actorPersonId: anchorPersonId,
      survivorPersonId: survivor,
      loserPersonId: duplicate.personId,
      reason: `${MARKER} same person`,
      fieldChoices: { mobile: "survivor", personal_email: "survivor", college_email: "survivor" },
    });

    // History is not rewritten: both rows still name the merged-away record.
    const kept = await sendsFor(eventId);
    expect(kept[1].resent_by_person_id).toBe(duplicate.personId);
    expect(kept[1].people).toContain(duplicate.personId);

    [stored] = await readEventMessages(eventId);
    await saveApprovedEventMessages(
      anchorPersonId,
      eventId,
      [asInput(stored, { body: "Kick-off moved to 16:00" })],
      { resend: true },
    );

    const sends = await sendsFor(eventId);
    expect(sends.map((send) => send.version)).toEqual([1, 2, 3]);
    expect(sends[2].people).toEqual([other.personId, survivor].sort());
    const copies = await observer.query<{ person_id: string; channel: string }>(
      `select person_id, channel::text as channel from public.notification_jobs
        where idempotency_key like $1 order by person_id, channel`,
      [`event-message:${sends[2].id}:%`],
    );
    expect(copies.rows.filter((row) => row.person_id === survivor)).toEqual([
      { person_id: survivor, channel: "email" },
      { person_id: survivor, channel: "whatsapp" },
    ]);
    expect(copies.rows.some((row) => row.person_id === duplicate.personId)).toBe(false);
  });
});

/** A person with a phone, an email and season consent, invited to nothing. */
async function uninvitedPerson(): Promise<string> {
  sequence += 1;
  const suffix = String(500 + sequence).padStart(3, "0");
  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Player') returning id",
    [MARKER],
  );
  const personId = person.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
     values ($1, 'phone', $2, true), ($1, 'email', $3, true)`,
    [personId, `07700 900${suffix}`, `lan508.${suffix}@example.org`],
  );
  await observer.query(
    `insert into public.season_messaging_consents (person_id, season_id, state, source)
     values ($1, $2, 'granted', 'operator_recorded')`,
    [personId, seasonId],
  );
  return personId;
}

describe("one save of the edit page", () => {
  it("leaves the details as they were when the messages half is refused", async () => {
    const eventId = await approvedEvent("30 hours");
    await invitee(eventId);
    await message(eventId);
    await declare();

    const row = await observer.query<{
      name: string;
      template_id: string;
      scheduled_on: string;
      starts_at: string;
      delivery_mode: EventDraftInput["deliveryMode"];
      is_mandatory: boolean;
    }>(
      `select name, template_id, to_char(scheduled_on, 'YYYY-MM-DD') as scheduled_on,
              to_char(starts_at, 'HH24:MI') as starts_at, delivery_mode::text as delivery_mode,
              is_mandatory
         from public.events where id = $1`,
      [eventId],
    );
    const before = row.rows[0];

    // The venue moves, and the sent message is taken away: the second is refused.
    await expect(
      saveApprovedEventEdit(anchorPersonId, eventId, {
        details: {
          name: before.name,
          templateId: before.template_id,
          scheduledOn: before.scheduled_on,
          startsAt: before.starts_at,
          endsAt: null,
          deliveryMode: before.delivery_mode,
          venue: "Marston Road",
          description: null,
          requiredEquipment: null,
          joiningUrl: null,
          isMandatory: before.is_mandatory,
        },
        amendment: { notify: false, silenceConfirmed: true },
        questions: null,
        messages: { submitted: [], resend: false },
      }),
    ).rejects.toMatchObject({ rule: "event_message_sent_cannot_be_removed" });

    const after = await observer.query<{ venue: string; changes: string }>(
      `select venue,
              (select count(*)::text from public.schedule_changes where event_id = $1) as changes
         from public.events where id = $1`,
      [eventId],
    );
    expect(after.rows[0]).toEqual({ venue: "Iffley Road", changes: "0" });
    expect(await readEventMessages(eventId)).toHaveLength(1);
  });
});

describe("templates and duplicates", () => {
  it("hands a template's messages to every new event made from it, and duplicates copy", async () => {
    const original = await readTemplateMessagesBody(templateId);
    try {
      await replaceTemplateEventMessages(anchorPersonId, templateId, [
        {
          id: null,
          hoursBefore: 24,
          channel: "email",
          recipients: "yes",
          body: `${MARKER} skeleton`,
          fromTemplate: false,
        },
      ]);
      const draft = await createEventDraft(anchorPersonId, {
        name: `${MARKER} from template`,
        templateId,
        scheduledOn: null,
        startsAt: null,
        endsAt: null,
        deliveryMode: "in_person",
        venue: null,
        description: null,
        requiredEquipment: null,
        joiningUrl: null,
        isMandatory: false,
        homeAway: null,
      });
      const inherited = await readEventMessages(draft.id);
      expect(inherited).toHaveLength(1);
      expect(inherited[0]).toMatchObject({
        hoursBefore: 24,
        channel: "email",
        recipients: "yes",
        body: `${MARKER} skeleton`,
        fromTemplate: true,
        lastSend: null,
      });

      // A duplicate posts its source's messages, which the new draft keeps.
      const copy = await createEventDraft(
        anchorPersonId,
        {
          name: `${MARKER} duplicate`,
          templateId,
          scheduledOn: null,
          startsAt: null,
          endsAt: null,
          deliveryMode: "in_person",
          venue: null,
          description: null,
          requiredEquipment: null,
          joiningUrl: null,
          isMandatory: false,
          homeAway: null,
        },
        undefined,
        inherited.map((stored) => asInput(stored, { id: null, body: `${MARKER} next week` })),
      );
      const copied = await readEventMessages(copy.id);
      expect(copied.map((stored) => stored.body)).toEqual([`${MARKER} next week`]);
      expect(copied[0].id).not.toBe(inherited[0].id);
    } finally {
      await withTransaction(async (tx) => {
        await tx.query("delete from public.event_template_messages where template_id = $1", [
          templateId,
        ]);
        for (const row of original) {
          await tx.query(
            `insert into public.event_template_messages
               (template_id, sort_order, hours_before, channel, recipients, body)
             values ($1, $2, $3, $4::public.event_message_channel,
                     $5::public.event_message_recipients, $6)`,
            [templateId, row.sort_order, row.hours_before, row.channel, row.recipients, row.body],
          );
        }
      });
      await observer.query(
        `delete from public.audit_events where entity_table = 'event_templates' and entity_id = $1
            and action = 'event_template.messages_updated'`,
        [templateId],
      );
    }
  });
});

async function readTemplateMessagesBody(id: string) {
  const result = await observer.query<{
    sort_order: number;
    hours_before: number;
    channel: string;
    recipients: string;
    body: string;
  }>(
    `select sort_order, hours_before, channel::text as channel, recipients::text as recipients,
            body
       from public.event_template_messages where template_id = $1`,
    [id],
  );
  return result.rows;
}

describe("the four tables' posture", () => {
  it("enables RLS and grants the browser roles nothing, the server only its need", async () => {
    const tables = [
      ["event_messages", ["DELETE", "INSERT", "SELECT", "UPDATE"]],
      ["event_template_messages", ["DELETE", "INSERT", "SELECT", "UPDATE"]],
      ["event_message_sends", ["INSERT", "SELECT"]],
      ["event_message_send_recipients", ["INSERT", "SELECT"]],
    ] as const;
    for (const [table, granted] of tables) {
      const rls = await observer.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid = $1::regclass",
        [`public.${table}`],
      );
      expect(rls.rows[0].relrowsecurity, table).toBe(true);
      const privileges = await observer.query<{ grantee: string; privilege_type: string }>(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = $1
            and grantee in ('anon', 'authenticated', 'service_role')
          order by grantee, privilege_type`,
        [table],
      );
      expect(
        privileges.rows.filter((row) => row.grantee !== "service_role"),
        table,
      ).toEqual([]);
      expect(
        privileges.rows
          .filter((row) => row.grantee === "service_role")
          .map((row) => row.privilege_type),
        table,
      ).toEqual([...granted]);
    }
  });
});
