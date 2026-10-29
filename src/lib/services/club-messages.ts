import "server-only";

import type { OperatorGrants } from "@/lib/auth/grants";
import { mayViewRoster } from "@/lib/auth/roster-access";
import { withTransaction, ConstraintViolated, NotFound, type Tx } from "@/lib/db";
import type { OutboundAttachment } from "@/lib/delivery/provider";

import { recordAudit } from "./audit";
import {
  attachmentsFit,
  draftProblems,
  DRAFT_PROBLEM_MESSAGES,
  MAX_ATTACHMENTS,
  MAX_SINGLE_FILE_BYTES,
  UPLOAD_CHUNK_BYTES,
} from "./club-message-input";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  type DeliveryState,
} from "./delivery";
import { listAudienceCatalogueIn, resolveSelection } from "./event-audience";
import { redactAudienceCandidates } from "./event-audience-access";
import type { AudienceCandidate, AudienceCatalogue } from "./audience-selection";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { personDisplayName } from "./person-name";
import { readCurrentSeasonIn } from "./seasons";

/**
 * **Messages** — LAN-514 (Brian and Stewart, 29 October 2026; a first pass for
 * Brian's review).
 *
 * One email, with any files attached, to an audience chosen with the event
 * audience builder's own catalogue and groups. Only people in the system, and
 * only by email. Each recipient is an ordinary `other` notification job keyed
 * `club-message:<message>:<person>`, so the delivery record, the Messaging
 * queue row, lights-out and the messaging safety admission are the ones every
 * other message already has; `dispatchClubMessageJob` in
 * `messaging-scheduler.ts` sends it. Send now is due at once and goes on the
 * next sweep; a scheduled message is due at its time.
 *
 * Who can be reached is decided here, once, when the message is sent: a
 * person with no current email is counted as not reachable and gets no job,
 * and so does a recruit with no granted season messaging consent — the rule a
 * recruit's event invitation already follows.
 */

export const CLUB_MESSAGE_KEY_PREFIX = "club-message:";

/** `{ messageId, personId }` from a `club-message:<message>:<person>` key, or `null`. */
export function parseClubMessageKey(key: string): { messageId: string; personId: string } | null {
  if (!key.startsWith(CLUB_MESSAGE_KEY_PREFIX)) return null;
  const [messageId, personId, ...rest] = key.slice(CLUB_MESSAGE_KEY_PREFIX.length).split(":");
  if (!messageId || !personId || rest.length > 0) return null;
  return { messageId, personId };
}

/** The catalogue is the event builder's; any type offers every category since LAN-416. */
const CATALOGUE_EVENT_TYPE = "training";

/** Why one chosen person will not be emailed. */
export type Unreachable = "no_email" | "no_consent";

export interface ClubMessageAudience {
  readonly catalogue: AudienceCatalogue;
  /** Per person id, only for those who cannot be emailed. */
  readonly unreachable: Readonly<Record<string, Unreachable>>;
}

/** The current email of each person, preferred first — the attendance sheet's read. */
async function currentEmailsIn(tx: Tx, personIds: readonly string[]): Promise<Map<string, string>> {
  if (personIds.length === 0) return new Map();
  const result = await tx.query<{ person_id: string; address: string }>(
    `select distinct on (person_id) person_id, coalesce(normalised_value, raw_value) as address
       from public.contact_points
      where person_id = any($1::uuid[])
        and kind = 'email'
        and valid_from <= current_date
        and (valid_until is null or valid_until > current_date)
        and btrim(coalesce(normalised_value, raw_value)) <> ''
      order by person_id, is_preferred desc, valid_from desc, created_at desc, id`,
    [personIds],
  );
  return new Map(result.rows.map((row) => [row.person_id, row.address]));
}

async function unreachableIn(
  tx: Tx,
  seasonId: string,
  candidates: readonly AudienceCandidate[],
): Promise<Record<string, Unreachable>> {
  const personIds = [...new Set(candidates.map((candidate) => candidate.personId))];
  const emails = await currentEmailsIn(tx, personIds);
  const unreachable: Record<string, Unreachable> = {};
  for (const personId of personIds) {
    if (!emails.has(personId)) unreachable[personId] = "no_email";
  }
  // A person who is a recruit and nothing else needs their consent, as their invitation does.
  const onlyRecruit = new Set(personIds);
  for (const candidate of candidates) {
    if (candidate.capacity !== "recruit") onlyRecruit.delete(candidate.personId);
  }
  for (const personId of onlyRecruit) {
    if (unreachable[personId]) continue;
    if (!(await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId))) {
      unreachable[personId] = "no_consent";
    }
  }
  return unreachable;
}

/**
 * The catalogue as one seat may see it: the event builder's, narrowed to the
 * seat's grants as it is there (LAN-423). The compose page shows exactly this
 * and the send resolves its keys against exactly this, so a key the seat was
 * not shown is refused.
 */
async function visibleCatalogueIn(
  tx: Tx,
  seasonId: string,
  grants: OperatorGrants,
): Promise<AudienceCatalogue> {
  const catalogue = await listAudienceCatalogueIn(tx, seasonId, null, CATALOGUE_EVENT_TYPE);
  return {
    ...catalogue,
    candidates: redactAudienceCandidates(catalogue.candidates, grants, CATALOGUE_EVENT_TYPE),
  };
}

/** Whether this seat may see who a message reached: who has an email is a contact fact. */
function mayNameRecipients(grants: OperatorGrants): boolean {
  return mayViewRoster(grants, "contact_emergency");
}

/**
 * Everybody this seat can choose, and who of them cannot be emailed. Who has
 * no email is a contact fact, so it is named only for a seat that reads
 * Contact & emergency; the send refuses them either way.
 */
export async function readClubMessageAudience(
  grants: OperatorGrants,
): Promise<ClubMessageAudience> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const catalogue = await visibleCatalogueIn(tx, season.id, grants);
    const unreachable = mayNameRecipients(grants)
      ? await unreachableIn(tx, season.id, catalogue.candidates)
      : {};
    return { catalogue, unreachable };
  });
}

// ---------------------------------------------------------------------------
// Attachments — uploaded in chunks before the message exists
// ---------------------------------------------------------------------------

export interface AttachmentUpload {
  readonly id: string;
  readonly received: number;
  readonly byteSize: number;
  readonly complete: boolean;
}

const UNCLAIMED_UPLOAD_LIFETIME = "1 day";

/** Starts one file's upload for this operator; the bytes follow in chunks. */
export async function startAttachmentUpload(input: {
  readonly actorPersonId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
}): Promise<AttachmentUpload> {
  const filename = input.filename.trim().slice(0, 255);
  if (filename === "") {
    throw new ConstraintViolated("A file needs a name.", { rule: "club_message_attachment_name" });
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1) {
    throw new ConstraintViolated("That file is empty.", { rule: "club_message_attachment_empty" });
  }
  if (input.byteSize > MAX_SINGLE_FILE_BYTES || !attachmentsFit([input.byteSize])) {
    throw new ConstraintViolated(DRAFT_PROBLEM_MESSAGES.attachments_too_large, {
      rule: "club_message_attachments_too_large",
    });
  }
  return withTransaction(async (tx) => {
    // Uploads that never became a message do not linger.
    await tx.query(
      `delete from public.club_message_attachments
        where club_message_id is null
          and created_at < now() - interval '${UNCLAIMED_UPLOAD_LIFETIME}'`,
    );
    const inserted = await tx.query<{ id: string }>(
      `insert into public.club_message_attachments
         (uploaded_by_person_id, filename, content_type, byte_size)
       values ($1, $2, $3, $4)
       returning id`,
      [
        input.actorPersonId,
        filename,
        input.contentType.trim() || "application/octet-stream",
        input.byteSize,
      ],
    );
    return { id: inserted.rows[0].id, received: 0, byteSize: input.byteSize, complete: false };
  });
}

/**
 * Appends one chunk at `offset`. A chunk at any other offset than the bytes
 * already held is refused, so a retried or reordered request cannot corrupt
 * the file; the answer always says how many bytes are held.
 */
export async function appendAttachmentChunk(input: {
  readonly actorPersonId: string;
  readonly uploadId: string;
  readonly offset: number;
  readonly bytes: Uint8Array;
}): Promise<AttachmentUpload> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > UPLOAD_CHUNK_BYTES) {
    throw new ConstraintViolated("That piece of the file is the wrong size.", {
      rule: "club_message_attachment_chunk",
    });
  }
  return withTransaction(async (tx) => {
    const updated = await tx.query<{
      id: string;
      received: number;
      byte_size: number;
    }>(
      `update public.club_message_attachments
          set content = content || $4::bytea,
              complete = octet_length(content) + octet_length($4::bytea) = byte_size
        where id = $1
          and uploaded_by_person_id = $2
          and club_message_id is null
          and not complete
          and octet_length(content) = $3
          and octet_length(content) + octet_length($4::bytea) <= byte_size
        returning id, octet_length(content) as received, byte_size`,
      [input.uploadId, input.actorPersonId, input.offset, Buffer.from(input.bytes)],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new ConstraintViolated(
        "That upload could not continue. Remove the file and attach it again.",
        { rule: "club_message_attachment_out_of_step" },
      );
    }
    return {
      id: row.id,
      received: row.received,
      byteSize: row.byte_size,
      complete: row.received === row.byte_size,
    };
  });
}

/**
 * Removes one of this operator's uploads that no message has claimed. Another
 * operator's upload, a claimed one or one already gone is refused as not
 * found, so the answer never says whose an upload is.
 */
export async function removeAttachmentUpload(input: {
  readonly actorPersonId: string;
  readonly uploadId: string;
}): Promise<void> {
  const removed = await withTransaction((tx) =>
    tx.query(
      `delete from public.club_message_attachments
        where id = $1 and uploaded_by_person_id = $2 and club_message_id is null`,
      [input.uploadId, input.actorPersonId],
    ),
  );
  if (removed.rowCount === 0) throw new NotFound("That file is no longer there.");
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface ClubMessageInput {
  readonly actorPersonId: string;
  /** The sender's grants: the audience resolves against the catalogue they were shown. */
  readonly grants: OperatorGrants;
  readonly subject: string;
  readonly body: string;
  /** The audience builder's selection keys (`capacity:anchorId`). */
  readonly audienceKeys: readonly string[];
  /** The group tokens ticked, for display. */
  readonly audienceGroups: readonly string[];
  readonly attachmentIds: readonly string[];
  /** A club-zone day (`YYYY-MM-DD`) and time (`HH:MM`); `null` is Send now. */
  readonly schedule: { readonly day: string; readonly time: string } | null;
}

/** A club-zone day and time as an instant, or `null` when either is not one. */
async function clubInstantIn(
  tx: Tx,
  schedule: { readonly day: string; readonly time: string },
): Promise<Date | null> {
  // Checked here, not by letting PostgreSQL refuse it: a failed statement
  // would abort the whole transaction.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule.day);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule.time);
  if (!day || !time) return null;
  const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) return null;
  const result = await tx.query<{ at: Date }>(
    "select ($1::date + $2::time) at time zone 'Europe/London' as at",
    [schedule.day, schedule.time],
  );
  return result.rows[0]?.at ?? null;
}

export interface ClubMessageCreated {
  readonly id: string;
  readonly queued: number;
  readonly unreachable: number;
}

/**
 * Writes the message and one job per reachable recipient, in one transaction
 * with its audit row. Every rule the form checks is checked again here, the
 * attachment sizes from the bytes actually held.
 */
export async function createClubMessage(input: ClubMessageInput): Promise<ClubMessageCreated> {
  const attachmentIds = [...new Set(input.attachmentIds)];
  return withTransaction(async (tx) => {
    const files = await tx.query<{ id: string; byte_size: number }>(
      `select id, byte_size
         from public.club_message_attachments
        where id = any($1::uuid[])
          and uploaded_by_person_id = $2
          and club_message_id is null
          and complete
        for update`,
      [attachmentIds, input.actorPersonId],
    );
    if (files.rows.length !== attachmentIds.length) {
      throw new ConstraintViolated(
        "One of the files is still uploading or is no longer there. Attach it again.",
        { rule: "club_message_attachment_missing" },
      );
    }

    const scheduledFor = input.schedule === null ? null : await clubInstantIn(tx, input.schedule);
    if (input.schedule !== null && scheduledFor === null) {
      throw new ConstraintViolated("Choose a date and a time to send it.", {
        rule: "club_message_schedule_unreadable",
      });
    }
    const problems = draftProblems({
      subject: input.subject,
      body: input.body,
      attachmentSizes: files.rows.map((row) => row.byte_size),
      scheduledFor,
    });
    if (attachmentIds.length > MAX_ATTACHMENTS) problems.push("too_many_attachments");
    if (problems.length > 0) {
      throw new ConstraintViolated(DRAFT_PROBLEM_MESSAGES[problems[0]], {
        rule: `club_message_${problems[0]}`,
      });
    }

    const season = await readCurrentSeasonIn(tx);
    const catalogue = await visibleCatalogueIn(tx, season.id, input.grants);
    const resolution = resolveSelection(catalogue.candidates, input.audienceKeys);
    if (!resolution.ok) {
      throw new ConstraintViolated(
        resolution.failure === "empty"
          ? "Choose who this message is for."
          : "Some of the people chosen can no longer be chosen. Choose the audience again.",
        { rule: resolution.rule },
      );
    }
    const chosen = catalogue.candidates.filter((candidate) =>
      resolution.members.some((member) => member.personId === candidate.personId),
    );
    const unreachable = await unreachableIn(tx, season.id, chosen);
    const reachable = resolution.members.filter((member) => !unreachable[member.personId]);
    if (reachable.length === 0) {
      throw new ConstraintViolated("Nobody chosen has an email address the club can use.", {
        rule: "club_message_nobody_reachable",
      });
    }

    const message = await tx.query<{ id: string; scheduled_for: Date }>(
      `insert into public.club_messages
         (subject, body, audience_groups, recipient_count, unreachable_count, scheduled_for,
          sent_by_person_id)
       values ($1, $2, $3::text[], $4, $5, coalesce($6::timestamptz, now()), $7)
       returning id, scheduled_for`,
      [
        input.subject.trim(),
        input.body.trim(),
        [...new Set(input.audienceGroups)],
        reachable.length,
        resolution.members.length - reachable.length,
        scheduledFor,
        input.actorPersonId,
      ],
    );
    const messageId = message.rows[0].id;

    // In the order they were attached.
    for (const [position, id] of attachmentIds.entries()) {
      await tx.query(
        `update public.club_message_attachments
            set club_message_id = $2, position = $3
          where id = $1`,
        [id, messageId, position],
      );
    }

    // A recruit-only recipient carries the season whose consent the send
    // re-checks, so a Stop between scheduling and sending is honoured.
    const recruitOnly = new Set(
      chosen.filter((candidate) => candidate.capacity === "recruit").map((c) => c.personId),
    );
    for (const candidate of chosen) {
      if (candidate.capacity !== "recruit") recruitOnly.delete(candidate.personId);
    }
    await tx.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, person_id, channel, scheduled_for, template_variables)
       select $1 || $2::text || ':' || person_id::text, 'other', 'pending', person_id, 'email', $3,
              case when person_id = any($5::uuid[])
                   then jsonb_build_object('consentSeasonId', $6::text)
                   else '{}'::jsonb end
         from unnest($4::uuid[]) as person_id`,
      [
        CLUB_MESSAGE_KEY_PREFIX,
        messageId,
        message.rows[0].scheduled_for,
        reachable.map((member) => member.personId),
        [...recruitOnly],
        season.id,
      ],
    );

    await recordAudit(tx, {
      actorPersonId: input.actorPersonId,
      action: scheduledFor === null ? "club_message.sent" : "club_message.scheduled",
      entityTable: "club_messages",
      entityId: messageId,
      context: {
        recipients: reachable.length,
        unreachable: resolution.members.length - reachable.length,
        attachments: attachmentIds.length,
        scheduledFor: message.rows[0].scheduled_for.toISOString(),
      },
    });

    return {
      id: messageId,
      queued: reachable.length,
      unreachable: resolution.members.length - reachable.length,
    };
  });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Where a message is, from its jobs: still to go, going, or gone. */
export type ClubMessageProgress = "scheduled" | "sending" | "sent";

export interface ClubMessageSummary {
  readonly id: string;
  readonly subject: string;
  readonly audienceGroups: readonly string[];
  readonly recipientCount: number;
  readonly unreachableCount: number;
  readonly attachmentCount: number;
  readonly scheduledFor: string;
  readonly sentBy: string;
  readonly progress: ClubMessageProgress;
  readonly queued: number;
}

interface SummaryRow {
  id: string;
  subject: string;
  audience_groups: string[];
  recipient_count: number;
  unreachable_count: number;
  attachment_count: number;
  scheduled_for: Date;
  given_name: string;
  family_name: string | null;
  queued: number;
  due: boolean;
}

function progressOf(row: SummaryRow): ClubMessageProgress {
  if (!row.due) return "scheduled";
  return row.queued > 0 ? "sending" : "sent";
}

function toSummary(row: SummaryRow): ClubMessageSummary {
  return {
    id: row.id,
    subject: row.subject,
    audienceGroups: row.audience_groups,
    recipientCount: row.recipient_count,
    unreachableCount: row.unreachable_count,
    attachmentCount: row.attachment_count,
    scheduledFor: row.scheduled_for.toISOString(),
    sentBy: personDisplayName(row.given_name, row.family_name),
    progress: progressOf(row),
    queued: row.queued,
  };
}

const SUMMARY_SELECT = `
  select m.id, m.subject, m.audience_groups, m.recipient_count, m.unreachable_count,
         m.scheduled_for, p.given_name, p.family_name,
         (select count(*)::int from public.club_message_attachments a
           where a.club_message_id = m.id) as attachment_count,
         (select count(*)::int from public.notification_jobs j
           where j.idempotency_key like '${CLUB_MESSAGE_KEY_PREFIX}' || m.id::text || ':%'
             and j.status in ('pending', 'ready')) as queued,
         m.scheduled_for <= now() as due
    from public.club_messages m
    join public.people p on p.id = m.sent_by_person_id`;

/** Every message, newest first: scheduled ones by when they will go. */
export async function listClubMessages(limit = 100): Promise<ClubMessageSummary[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<SummaryRow>(
      `${SUMMARY_SELECT}
        order by m.scheduled_for desc, m.created_at desc
        limit $1`,
      [limit],
    );
    return result.rows.map(toSummary);
  });
}

interface ClubMessageRecipient {
  readonly personId: string;
  readonly displayName: string;
  readonly state: DeliveryState;
  readonly lastError: string | null;
}

export interface ClubMessageDetail extends ClubMessageSummary {
  readonly body: string;
  readonly attachments: readonly { id: string; filename: string; byteSize: number }[];
  /**
   * Every recipient and their delivery state, or empty when the seat may not
   * name them (`recipientsNamed`). The list is the chosen people who had an
   * email, so naming it says who had none; the count always travels, as the
   * event review's unreachable panel does (LAN-423).
   */
  readonly recipients: readonly ClubMessageRecipient[];
  readonly recipientsNamed: boolean;
}

/** One message, its files and, as far as the seat may see them, its recipients. */
export async function readClubMessage(
  id: string,
  grants: OperatorGrants,
): Promise<ClubMessageDetail> {
  const recipientsNamed = mayNameRecipients(grants);
  return withTransaction(async (tx) => {
    const found = await tx.query<SummaryRow & { body: string }>(
      `${SUMMARY_SELECT.replace("select m.id,", "select m.body, m.id,")}
        where m.id = $1`,
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new NotFound("That message does not exist.");

    const attachments = await tx.query<{ id: string; filename: string; byte_size: number }>(
      `select id, filename, byte_size
         from public.club_message_attachments
        where club_message_id = $1
        order by position, created_at`,
      [id],
    );
    const recipients = recipientsNamed
      ? await tx.query<{
          person_id: string;
          given_name: string;
          family_name: string | null;
          state: DeliveryState;
          last_error: string | null;
        }>(
          `select j.person_id, p.given_name, p.family_name,
                  ${DELIVERY_STATE_EXPRESSION} as state,
                  j.last_error
             from public.notification_jobs j
             join public.people p on p.id = j.person_id
             ${DELIVERY_LATEST_RESULT_JOIN}
            where j.idempotency_key like $1
            order by p.given_name, p.family_name, j.person_id`,
          [`${CLUB_MESSAGE_KEY_PREFIX}${id}:%`],
        )
      : { rows: [] };

    return {
      ...toSummary(row),
      body: row.body,
      attachments: attachments.rows.map((file) => ({
        id: file.id,
        filename: file.filename,
        byteSize: file.byte_size,
      })),
      recipients: recipients.rows.map((recipient) => ({
        personId: recipient.person_id,
        displayName: personDisplayName(recipient.given_name, recipient.family_name),
        state: recipient.state,
        lastError: recipient.state === "delivered" ? null : recipient.last_error,
      })),
      recipientsNamed,
    };
  });
}

// ---------------------------------------------------------------------------
// What the dispatcher sends
// ---------------------------------------------------------------------------

export interface ClubMessageForSend {
  readonly subject: string;
  readonly body: string;
  readonly attachments: readonly OutboundAttachment[];
}

/**
 * Reads `length` bytes of one attachment from `offset`, in its own short
 * transaction. `substring` on a `bytea` fetches only that range, so the row is
 * never read whole (LAN-514; the driver otherwise gathers the whole value into
 * one doubling buffer, which the analysis found dominated a send's memory).
 */
export async function readClubMessageAttachmentSlice(
  attachmentId: string,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const slice = await withTransaction((tx) =>
    tx.query<{ bytes: Buffer | null }>(
      `select substring(content from $2::int + 1 for $3::int) as bytes
         from public.club_message_attachments
        where id = $1 and complete`,
      [attachmentId, offset, length],
    ),
  );
  return slice.rows[0]?.bytes ?? new Uint8Array(0);
}

/**
 * The message and its files, read at send time. The files are their names and
 * sizes and a way to read each a slice at a time; no content is read here.
 */
export async function readClubMessageForSendIn(
  tx: Tx,
  messageId: string,
): Promise<ClubMessageForSend | null> {
  const message = await tx.query<{ subject: string; body: string }>(
    "select subject, body from public.club_messages where id = $1",
    [messageId],
  );
  if (!message.rows[0]) return null;
  const files = await tx.query<{
    id: string;
    filename: string;
    content_type: string;
    byte_size: number;
  }>(
    `select id, filename, content_type, octet_length(content) as byte_size
       from public.club_message_attachments
      where club_message_id = $1 and complete
      order by position, created_at`,
    [messageId],
  );
  return {
    subject: message.rows[0].subject,
    body: message.rows[0].body,
    attachments: files.rows.map((file) => ({
      filename: file.filename,
      contentType: file.content_type,
      byteSize: file.byte_size,
      readSlice: (offset: number, length: number) =>
        readClubMessageAttachmentSlice(file.id, offset, length),
    })),
  };
}
