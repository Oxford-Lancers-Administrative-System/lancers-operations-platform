import "server-only";

import { NotFound } from "@/lib/db";
import { assertGrant, requireOperator } from "@/lib/auth/guards";
import {
  templateLevel,
  templatesAtLeast,
  type GrantRule,
  type OperatorGrants,
  type TemplateLevel,
} from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { EVENT_NOT_FOUND_MESSAGE } from "./shared";
import {
  eventTemplateIdOf,
  invitationTemplateIdsOf,
  notificationJobTemplateOf,
} from "./template-of";

/**
 * Events within granted templates — LAN-431 (W4, mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS).
 *
 * A seat holds `none`, `view` or `manage` on each event template. `none`: the
 * event does not exist for that seat. `view`: the event and everything in it.
 * `manage`: create, edit, delete, send, approve, deliver, chase and the
 * template's messaging schedule. Every per-event guard reads the event's
 * template from the database (`./template-of`), never from what a form posted.
 *
 * Attendance recording is outside this list by decision and keeps its own
 * capability; template administration, import and export keep
 * `event_calendar_management`.
 */

/** Any template at `view` or above: Events, the calendar and Follow-ups. */
export const ANY_TEMPLATE_VIEW: GrantRule = Object.freeze({ anyOf: "template", minimum: "view" });

/** Any template at `manage`: Create event, venue search and the messaging schedule. */
export const ANY_TEMPLATE_MANAGE: GrantRule = Object.freeze({
  anyOf: "template",
  minimum: "manage",
});

/** Only the entries identified by a template held at `minimum` or above. */
export function onlyGrantedTemplates<T extends { readonly id: string }>(
  grants: OperatorGrants,
  options: readonly T[],
  minimum: TemplateLevel,
): T[] {
  const granted = new Set(templatesAtLeast(grants, minimum));
  return options.filter((option) => granted.has(option.id));
}

/** The same filter over a record keyed by template id (the event form's defaults). */
export function onlyGrantedTemplateRecord<T>(
  grants: OperatorGrants,
  record: Readonly<Record<string, T>>,
  minimum: TemplateLevel,
): Record<string, T> {
  const granted = new Set(templatesAtLeast(grants, minimum));
  return Object.fromEntries(Object.entries(record).filter(([id]) => granted.has(id)));
}

function assertTemplateGrant(
  operator: ResolvedOperator,
  templateId: string,
  minimum: TemplateLevel,
): ResolvedOperator {
  return assertGrant(operator, { kind: "template", templateId }, minimum);
}

/** The current operator, if they hold `minimum` on this template; `NotPermitted` otherwise. */
export async function requireTemplateGrant(
  templateId: string,
  minimum: TemplateLevel,
): Promise<ResolvedOperator> {
  return assertTemplateGrant(await requireOperator(), templateId, minimum);
}

/**
 * The current operator, if they hold `minimum` on this event's template.
 * `NotPermitted` for no operator or too low a level; `NotFound` for no event.
 */
export async function requireEventGrant(
  eventId: string,
  minimum: TemplateLevel,
): Promise<ResolvedOperator> {
  const operator = await requireOperator();
  const templateId = await eventTemplateIdOf(eventId);
  if (templateId === null) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }
  return assertTemplateGrant(operator, templateId, minimum);
}

/**
 * This operator's level on an event's template, or `null` when there is no
 * such event (the caller's own read then says so). Never refuses.
 */
export async function readEventTemplateLevel(
  operator: ResolvedOperator,
  eventId: string,
): Promise<TemplateLevel | null> {
  const templateId = await eventTemplateIdOf(eventId);
  return templateId === null ? null : templateLevel(operator.grants, templateId);
}

/**
 * The current operator, if they hold `minimum` on the template of every one of
 * these invitations' events. An unknown invitation is left to the caller's own
 * service, which already reports it per row.
 */
export async function requireInvitationsGrant(
  invitationIds: readonly string[],
  minimum: TemplateLevel,
): Promise<ResolvedOperator> {
  const operator = await requireOperator();
  for (const templateId of await invitationTemplateIdsOf(invitationIds)) {
    assertTemplateGrant(operator, templateId, minimum);
  }
  return operator;
}

/**
 * The current operator, if they hold `minimum` on the template of the event a
 * notification job belongs to. No such job: the repair service reports that
 * itself. A job with no event behind it is not a per-event repair, so nothing
 * here grants it.
 */
export async function requireNotificationJobGrant(
  jobId: string,
  minimum: TemplateLevel,
): Promise<ResolvedOperator> {
  const operator = await requireOperator();
  const job = await notificationJobTemplateOf(jobId);
  if (job === null) return operator;
  return assertTemplateGrant(operator, job.templateId ?? "", minimum);
}
