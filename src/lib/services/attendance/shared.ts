import "server-only";

import type { Tx } from "@/lib/db";
import { isRegisterAvailable, isRegisterOpen } from "../attendance-window";
import type { EventDetail } from "../events";
import type { EventStatus } from "../event-input";

/** Register-closed reasoning and the participant key, needed by reads and writes — LAN-152. */

const ATTENDANCE_OPEN_STATUS: EventStatus = "approved";

export type AttendanceClosedReason = "not_approved" | "before_buffer";

// D72 never closes once recorded (see relocations.md).
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

export function participantKey(
  capacity: string,
  membershipId: string | null,
  personId: string | null,
) {
  return `${capacity}:${membershipId ?? personId ?? ""}`;
}
