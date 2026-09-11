import "server-only";

import type { Tx } from "@/lib/db";
import { isRegisterAvailable, isRegisterOpen } from "../attendance-window";
import type { EventDetail } from "../events";
import type { EventStatus } from "../event-input";

/**
 * Register-closed reasoning and the participant key, needed by both the
 * reads and the writes — LAN-152. Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.
 */

/**
 * The stored status an event must be in for a register to exist at all.
 * `approved` rather than `occurred`: LAN-151 retired the occurrence
 * assertion, and a draft has no audience to take a register of.
 */
const ATTENDANCE_OPEN_STATUS: EventStatus = "approved";

/**
 * Why a closed register is closed, or `null` because it is not — LAN-152,
 * reconciled to LAN-151's model.
 */
export type AttendanceClosedReason = "not_approved" | "before_buffer";

/**
 * Why this event's register is closed, or `null` because it is not — LAN-152.
 *
 * ## The buffer opens it; nothing closes it
 *
 * D72 is that the register never closes, and the third branch below is what
 * makes that literally true rather than nearly true. **A register with anything
 * recorded against it has already been opened**, whatever the clock now says
 * about the event's start, so the buffer cannot take it back.
 *
 * That is not a hypothetical tidy-up. It was found on the screen: the synthetic
 * season carries sessions recorded as having happened whose dates are still
 * ahead of today — an assertion invariant E5 permits and the seed makes — and
 * without this branch the product refused to show a coach a register they had
 * already filled in twenty-one names on. A rule that shuts a sheet somebody is
 * halfway through is the opposite of the one D72 asks for.
 *
 * The extra round trip is one `exists` and is taken only on the path that would
 * otherwise refuse.
 */
export async function closedReasonFor(
  tx: Tx,
  event: EventDetail,
  now: Date,
): Promise<AttendanceClosedReason | null> {
  if (event.status !== ATTENDANCE_OPEN_STATUS) return "not_approved";
  if (isRegisterOpen(event, now)) return null;

  const saved = await tx.query<{ saved: boolean }>(
    "select exists (select 1 from public.attendance_records where event_id = $1) as saved",
    [event.id],
  );
  return isRegisterAvailable(event, saved.rows[0].saved, now) ? null : "before_buffer";
}

/** `capacity:anchorId`. The anchor is whichever of the two columns is set. */
export function participantKey(
  capacity: string,
  membershipId: string | null,
  personId: string | null,
) {
  return `${capacity}:${membershipId ?? personId ?? ""}`;
}
