import "server-only";

import { withTransaction } from "@/lib/db";
import { UUID_PATTERN } from "../event-input";

/**
 * Which event template a row belongs to — LAN-431's three lookups, read from
 * the database and never from what a form posted. Kept to themselves so the
 * guards in `./access` are the only readers, and a screen or action test can
 * stand one fixed answer in for the database.
 */

/** The event's template id, or `null` for a malformed or unknown event id. */
export async function eventTemplateIdOf(eventId: string): Promise<string | null> {
  if (!UUID_PATTERN.test(eventId)) return null;
  return withTransaction(async (tx) => {
    const result = await tx.query<{ template_id: string }>(
      "select template_id::text as template_id from public.events where id = $1",
      [eventId],
    );
    return result.rows[0]?.template_id ?? null;
  });
}

/** The distinct template ids of these invitations' events; unknown or malformed ids contribute none. */
export async function invitationTemplateIdsOf(invitationIds: readonly string[]): Promise<string[]> {
  const wellFormed = invitationIds.filter((id) => UUID_PATTERN.test(id));
  if (wellFormed.length === 0) return [];
  return withTransaction(async (tx) => {
    const result = await tx.query<{ template_id: string }>(
      `select distinct e.template_id::text as template_id
         from public.invitations i
         join public.events e on e.id = i.event_id
        where i.id = any($1::uuid[])`,
      [wellFormed],
    );
    return result.rows.map((row) => row.template_id);
  });
}

/**
 * The template of the event a notification job belongs to (directly, or
 * through its invitation). `null` for no such job; `{ templateId: null }` for
 * a job with no event behind it.
 */
export async function notificationJobTemplateOf(
  jobId: string,
): Promise<{ templateId: string | null } | null> {
  if (!UUID_PATTERN.test(jobId)) return null;
  return withTransaction(async (tx) => {
    const result = await tx.query<{ template_id: string | null }>(
      `select e.template_id::text as template_id
         from public.notification_jobs j
         left join public.invitations i on i.id = j.invitation_id
         left join public.events e on e.id = coalesce(j.event_id, i.event_id)
        where j.id = $1`,
      [jobId],
    );
    const row = result.rows[0];
    return row ? { templateId: row.template_id } : null;
  });
}
