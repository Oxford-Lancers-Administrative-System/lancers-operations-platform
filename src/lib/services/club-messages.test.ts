// @vitest-environment node
/**
 * Messages — LAN-514 — against the real local database with an injected
 * transport, as `attendance-sheet-email.test.ts` is.
 *
 * Who a message reaches (the audience builder's selection, less anyone with
 * no email and any recruit without consent), that Send now is due at once and
 * a scheduled one at its time, that a file goes up in order and is refused
 * over the size, and that the dispatched email carries the files.
 *
 * Every person is this file's own, named by `MARKER`, in the seeded current
 * season, and is deleted in `afterEach` with what it produced.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The real redaction withholds detail and never a whole candidate today, so a
// test hides one to prove the send resolves against the redacted catalogue.
const hidden = vi.hoisted(() => ({ keys: new Set<string>() }));
vi.mock("./event-audience-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./event-audience-access")>();
  return {
    ...actual,
    redactAudienceCandidates: (...args: Parameters<typeof actual.redactAudienceCandidates>) =>
      actual.redactAudienceCandidates(...args).filter((c) => !hidden.keys.has(c.key)),
  };
});

import crypto from "node:crypto";
import type { Client } from "pg";

import { fullGrants, NO_GRANTS, type OperatorGrants } from "@/lib/auth/grants";
import { closePool, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";

import {
  appendAttachmentChunk,
  createClubMessage,
  listClubMessages,
  readClubMessage,
  readClubMessageAudience,
  removeAttachmentUpload,
  startAttachmentUpload,
} from "./club-messages";
import { MAX_ATTEMPTS } from "./delivery";
import { DUE_JOB_PREDICATE } from "./messaging-queue";
import { dispatchClubMessageJob } from "./messaging-scheduler";
import { OPERATING_SEASON_STATUSES } from "./seasons";
import {
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "../../../tests/helpers/service-layer";

vi.setConfig({ testTimeout: 30_000 });

const MARKER = "LAN514Messages";

/** What a fixed committee seat holds. */
const GRANTS = fullGrants([]);

/** A seat that reads nothing on the roster: no contact, no membership. */
const NO_ROSTER: OperatorGrants = { ...GRANTS, roster: NO_GRANTS.roster };

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
let actorPersonId: string;

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(typeof init.body === "string" ? init.body : "{}") });
    return new Response(JSON.stringify({ id: `msg.${MARKER}.${crypto.randomUUID()}` }), {
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
  actorPersonId = anchor.rows[0].id;
  const season = await observer.query<{ id: string }>(
    `select id from public.seasons
      where status = any($1::public.season_status[])
      order by starts_on desc nulls last, created_at desc limit 1`,
    [OPERATING_SEASON_STATUSES],
  );
  seasonId = season.rows[0].id;
});

const MESSAGES = "(select id from public.club_messages where subject like $1)";
const JOBS = `(select j.id from public.notification_jobs j, ${MESSAGES} m
                where j.idempotency_key like 'club-message:' || m.id::text || ':%')`;

afterEach(async () => {
  await clearRecipientSafetyState(observer);
  const scope = `${MARKER}%`;
  await observer.query(`delete from public.delivery_results where notification_job_id in ${JOBS}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${JOBS}`,
    [scope],
  );
  await observer.query(`delete from public.audit_events where entity_id in ${JOBS}`, [scope]);
  await observer.query(`delete from public.notification_jobs where id in ${JOBS}`, [scope]);
  await observer.query(`delete from public.audit_events where entity_id in ${MESSAGES}`, [scope]);
  await observer.query(`delete from public.club_messages where id in ${MESSAGES}`, [scope]);
  await observer.query("delete from public.club_message_attachments where filename like $1", [
    scope,
  ]);
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/** A roster player this season, with an email or none; returns the audience key. */
async function player(
  familyName: string,
  email: string | null,
): Promise<{ personId: string; key: string }> {
  const inserted = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, familyName],
  );
  const personId = inserted.rows[0].id;
  if (email) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred)
       values ($1, 'email', 'personal', $2, true)`,
      [personId, email],
    );
  }
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
    [personId, seasonId],
  );
  return { personId, key: `player:${membership.rows[0].id}` };
}

/** An open recruit with an email and no consent recorded. */
async function recruit(familyName: string): Promise<{ personId: string; key: string }> {
  const inserted = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, familyName],
  );
  const personId = inserted.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred)
     values ($1, 'email', 'personal', $2, true)`,
    [personId, `${familyName.toLowerCase()}@example.test`],
  );
  await observer.query(
    `insert into public.recruitment_prospects (person_id, season_id, status)
     values ($1, $2, 'identified')`,
    [personId, seasonId],
  );
  return { personId, key: `recruit:${personId}` };
}

function send(patch: Partial<Parameters<typeof createClubMessage>[0]> = {}) {
  return createClubMessage({
    actorPersonId,
    grants: GRANTS,
    subject: `${MARKER} playbook`,
    body: "Here is this week's playbook.\n\nKirsty",
    audienceKeys: [],
    audienceGroups: [],
    attachmentIds: [],
    schedule: null,
    ...patch,
  });
}

async function jobsOf(messageId: string) {
  const result = await observer.query<{
    id: string;
    person_id: string;
    channel: string;
    due: boolean;
    consent_season_id: string | null;
  }>(
    `select id, person_id, channel::text as channel,
            exists (select 1 from public.notification_jobs
                     where notification_jobs.id = j.id
                       and ${DUE_JOB_PREDICATE.replace(/\$1/g, "$2")}) as due,
            template_variables ->> 'consentSeasonId' as consent_season_id
       from public.notification_jobs j
      where j.idempotency_key like 'club-message:' || $1 || ':%'
      order by j.person_id`,
    [messageId, MAX_ATTEMPTS],
  );
  return result.rows;
}

async function upload(name: string, bytes: Buffer): Promise<string> {
  const started = await startAttachmentUpload({
    actorPersonId,
    filename: name,
    contentType: "application/pdf",
    byteSize: bytes.length,
  });
  const half = Math.ceil(bytes.length / 2);
  await appendAttachmentChunk({
    actorPersonId,
    uploadId: started.id,
    offset: 0,
    bytes: bytes.subarray(0, half),
  });
  const done = await appendAttachmentChunk({
    actorPersonId,
    uploadId: started.id,
    offset: half,
    bytes: bytes.subarray(half),
  });
  expect(done.complete).toBe(true);
  return started.id;
}

describe("who a message reaches", () => {
  it("queues one email per chosen person with an email, and counts the rest unreachable", async () => {
    const reached = await player("Reached", "lan514.reached@example.test");
    const noEmail = await player("NoEmail", null);

    const audience = await readClubMessageAudience(GRANTS);
    expect(audience.unreachable[noEmail.personId]).toBe("no_email");
    expect(audience.unreachable[reached.personId]).toBeUndefined();

    const created = await send({ audienceKeys: [reached.key, noEmail.key] });
    expect(created).toMatchObject({ queued: 1, unreachable: 1 });

    const jobs = await jobsOf(created.id);
    expect(jobs.map((job) => job.person_id)).toEqual([reached.personId]);
    expect(jobs[0].channel).toBe("email");
    expect(jobs[0].due).toBe(true);

    const [summary] = (await listClubMessages()).filter((row) => row.id === created.id);
    expect(summary).toMatchObject({ recipientCount: 1, unreachableCount: 1, progress: "sending" });
  });

  it("does not email a recruit with no granted consent, as their invitation would not", async () => {
    const prospect = await recruit("Prospect");
    const audience = await readClubMessageAudience(GRANTS);
    expect(audience.unreachable[prospect.personId]).toBe("no_consent");
    await expect(send({ audienceKeys: [prospect.key] })).rejects.toMatchObject({
      rule: "club_message_nobody_reachable",
    });
  });

  it("refuses an empty audience and a key nobody holds", async () => {
    await expect(send({ audienceKeys: [] })).rejects.toMatchObject({
      rule: "event_audience_is_non_empty",
    });
    await expect(send({ audienceKeys: [`player:${crypto.randomUUID()}`] })).rejects.toMatchObject({
      rule: "event_audience_selection_unknown",
    });
  });
});

describe("what the sender's grants let them see", () => {
  afterEach(() => {
    hidden.keys.clear();
  });

  it("resolves the audience against the catalogue the compose page shows, so a key it hid is refused", async () => {
    const shown = await player("Shown", "lan514.shown@example.test");
    const notShown = await player("NotShown", "lan514.notshown@example.test");
    hidden.keys.add(notShown.key);

    const keys = (await readClubMessageAudience(GRANTS)).catalogue.candidates.map((c) => c.key);
    expect(keys).toContain(shown.key);
    expect(keys).not.toContain(notShown.key);

    await expect(send({ audienceKeys: [shown.key, notShown.key] })).rejects.toMatchObject({
      rule: "event_audience_selection_unknown",
    });
    expect(await send({ audienceKeys: [shown.key] })).toMatchObject({ queued: 1 });
  });

  it("withholds roster detail and who has no email from a seat that does not read them", async () => {
    const noEmail = await player("Hidden", null);

    const full = await readClubMessageAudience(GRANTS);
    const narrowed = await readClubMessageAudience(NO_ROSTER);
    const standing = (audience: typeof full) =>
      audience.catalogue.candidates.find((c) => c.personId === noEmail.personId)?.standing;
    expect(standing(full)).not.toBe("");
    expect(standing(narrowed)).toBe("");
    expect(full.unreachable[noEmail.personId]).toBe("no_email");
    expect(narrowed.unreachable).toEqual({});
  });

  it("names who a message reached only for a seat that reads Contact & emergency", async () => {
    const reached = await player("Named", "lan514.named@example.test");
    const created = await send({ audienceKeys: [reached.key] });

    const named = await readClubMessage(created.id, GRANTS);
    expect(named.recipientsNamed).toBe(true);
    expect(named.recipients.map((r) => r.personId)).toEqual([reached.personId]);

    const unnamed = await readClubMessage(created.id, NO_ROSTER);
    expect(unnamed.recipientsNamed).toBe(false);
    expect(unnamed.recipients).toEqual([]);
    expect(unnamed.recipientCount).toBe(1);
  });
});

describe("when it goes", () => {
  it("holds a scheduled message until its time, in the club's zone", async () => {
    const reached = await player("Later", "lan514.later@example.test");
    const created = await send({
      audienceKeys: [reached.key],
      schedule: { day: "2099-07-01", time: "09:30" },
    });
    const [job] = await jobsOf(created.id);
    expect(job.due).toBe(false);

    const scheduled = await observer.query<{ at: Date }>(
      "select scheduled_for as at from public.club_messages where id = $1",
      [created.id],
    );
    // 09:30 British Summer Time is 08:30 UTC.
    expect(scheduled.rows[0].at.toISOString()).toBe("2099-07-01T08:30:00.000Z");
    expect((await readClubMessage(created.id, GRANTS)).progress).toBe("scheduled");
  });

  it("refuses a time in the past or one that is not a time", async () => {
    const reached = await player("Past", "lan514.past@example.test");
    await expect(
      send({ audienceKeys: [reached.key], schedule: { day: "2020-01-01", time: "09:00" } }),
    ).rejects.toMatchObject({ rule: "club_message_schedule_in_past" });
    await expect(
      send({ audienceKeys: [reached.key], schedule: { day: "2099-02-31", time: "09:00" } }),
    ).rejects.toMatchObject({ rule: "club_message_schedule_unreadable" });
  });
});

describe("attachments", () => {
  it("refuses a file larger than one email can carry before any byte is sent", async () => {
    await expect(
      startAttachmentUpload({
        actorPersonId,
        filename: `${MARKER}-huge.pdf`,
        contentType: "application/pdf",
        byteSize: 31_000_000,
      }),
    ).rejects.toMatchObject({ rule: "club_message_attachments_too_large" });
  });

  it("takes a file in order and refuses a chunk out of step", async () => {
    const started = await startAttachmentUpload({
      actorPersonId,
      filename: `${MARKER}-order.pdf`,
      contentType: "application/pdf",
      byteSize: 10,
    });
    await expect(
      appendAttachmentChunk({
        actorPersonId,
        uploadId: started.id,
        offset: 5,
        bytes: new Uint8Array(5),
      }),
    ).rejects.toMatchObject({ rule: "club_message_attachment_out_of_step" });
    const first = await appendAttachmentChunk({
      actorPersonId,
      uploadId: started.id,
      offset: 0,
      bytes: new Uint8Array(5),
    });
    expect(first).toMatchObject({ received: 5, complete: false });
    await removeAttachmentUpload({ actorPersonId, uploadId: started.id });
  });

  it("refuses to send a file that has not finished uploading", async () => {
    const reached = await player("Unfinished", "lan514.unfinished@example.test");
    const started = await startAttachmentUpload({
      actorPersonId,
      filename: `${MARKER}-half.pdf`,
      contentType: "application/pdf",
      byteSize: 10,
    });
    await expect(
      send({ audienceKeys: [reached.key], attachmentIds: [started.id] }),
    ).rejects.toMatchObject({ rule: "club_message_attachment_missing" });
  });

  it("sends the email with its files, through the delivery records", async () => {
    const reached = await player("Files", "lan514.files@example.test");
    const playbook = crypto.randomBytes(150_000);
    const fileId = await upload(`${MARKER}-playbook.pdf`, playbook);

    const created = await send({ audienceKeys: [reached.key], attachmentIds: [fileId] });
    const [job] = await jobsOf(created.id);
    const { sent, transport } = acceptingTransport();

    expect(await dispatchClubMessageJob(job.id, { source: CONFIGURED, transport })).toBe(
      "accepted",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/emails$/);
    const body = sent[0].body as {
      to: string[];
      subject: string;
      text: string;
      attachments: { filename: string; content: string }[];
    };
    expect(body.to).toEqual(["lan514.files@example.test"]);
    expect(body.subject).toBe(`${MARKER} playbook`);
    expect(body.text).toBe("Here is this week's playbook.\n\nKirsty");
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe(`${MARKER}-playbook.pdf`);
    expect(Buffer.from(body.attachments[0].content, "base64").equals(playbook)).toBe(true);

    const attempt = await observer.query<{ provider_message_id: string | null }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [job.id],
    );
    expect(attempt.rows[0].provider_message_id).toMatch(new RegExp(`^msg\\.${MARKER}`));

    const detail = await readClubMessage(created.id, GRANTS);
    expect(detail.attachments.map((file) => file.byteSize)).toEqual([playbook.length]);
    expect(detail.recipients.map((recipient) => recipient.state)).toEqual(["attempted"]);
  });

  it("re-reads a recruit's consent when it sends, so a Stop in between is honoured", async () => {
    const prospect = await recruit("Withdrew");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1, $2, 'granted', 'qr_self_entry')`,
      [prospect.personId, seasonId],
    );
    const created = await send({ audienceKeys: [prospect.key] });
    const [job] = await jobsOf(created.id);
    expect(job.consent_season_id).toBe(seasonId);

    await observer.query(
      "update public.season_messaging_consents set state = 'withdrawn' where person_id = $1",
      [prospect.personId],
    );
    const { sent, transport } = acceptingTransport();
    await dispatchClubMessageJob(job.id, { source: CONFIGURED, transport });
    expect(sent).toHaveLength(0);
    const status = await withTransaction((tx) =>
      tx.query<{ status: string }>(
        "select status::text from public.notification_jobs where id = $1",
        [job.id],
      ),
    );
    expect(status.rows[0].status).toBe("failed");
  });
});
