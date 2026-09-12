import type { FollowUpDelivery } from "@/lib/services/follow-ups";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import { DELIVERY_LABELS } from "@/app/participation/presentation";
import { CHANNEL_LABELS, LAST_MESSAGE_NONE } from "./presentation";
import type { QueueRow } from "./queue-filters";

/**
 * Where a queue row points, and what its last message reads — LAN-329, LAN-322.
 *
 * Pure, and its own module because both renderings (the desktop table and the
 * phone card) draw the same two links and the same sentence, and because the
 * client bundle must not reach `@/lib/services/follow-ups` for anything but a
 * type.
 */

/** The person's own record — `person_record_authority`, which is why the caller checks first. */
export function personHref(row: Pick<QueueRow, "personId">): string {
  return `/operate/people/${row.personId}`;
}

/** The event they are silent about, where the answer can be recorded for them. */
export function eventHref(row: Pick<QueueRow, "eventId">): string {
  return `/operate/events/${row.eventId}`;
}

/**
 * What one row's checkbox is called — LAN-322's walk.
 *
 * A queue row is a person *on an event*, not a person, and somebody silent
 * about three events has three rows and three checkboxes. Every one of them
 * was called "Select Dorian", so twenty-two controls on the seeded queue
 * shared a handful of names: a screen reader announced the same label for
 * boxes that tick different things, and nothing an operator heard told them
 * which event they had just selected somebody for.
 *
 * The event is what separates them, and the date separates two events the club
 * gave the same name. Both are read out of the row's own rendered values
 * (`formatLongDate` is what the When column shows), so the label cannot come
 * to describe something different from the row it sits on. An undated event
 * contributes nothing rather than "No date yet", which would say less than
 * silence.
 */
export function selectRowLabel(
  row: Pick<QueueRow, "personName" | "eventName" | "scheduledOn">,
): string {
  const when = row.scheduledOn ? `, ${formatLongDate(row.scheduledOn)}` : "";
  return `Select ${row.personName} for ${row.eventName}${when}`;
}

/** Selection and the chase, handed to both renderings by the board that owns them. */
export interface QueueSelection {
  readonly selected: ReadonlySet<string>;
  readonly pending: boolean;
  /** `delivery_administration`. Without it the queue is the report it has always been. */
  readonly mayChase: boolean;
  /** `person_record_authority`. Without it the name is text, never a link into a refusal. */
  readonly mayOpenPerson: boolean;
  readonly toggle: (invitationId: string) => void;
  readonly toggleAll: () => void;
  readonly chase: (invitationIds: readonly string[]) => void;
}

/** What the club last sent this person, in the delivery screen's own vocabulary (rule 7). */
export function lastMessageLabel(delivery: FollowUpDelivery | null): string {
  if (delivery === null) return LAST_MESSAGE_NONE;
  const state = DELIVERY_LABELS[delivery.state] ?? delivery.state;
  const channel = delivery.channel ? (CHANNEL_LABELS[delivery.channel] ?? delivery.channel) : null;
  const when = delivery.at
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
      }).format(delivery.at)
    : null;
  return [channel, state, when].filter((part) => part !== null).join(" · ");
}
