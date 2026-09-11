// Attendance vocabulary and screen shapes — pure, no db import (LAN-80). Re-exported by ./attendance.ts.

export const ATTENDANCE_PRESENCES = Object.freeze([
  "present",
  "late",
  "excused",
  "absent",
] as const); // public.attendance_presence, in the order the interface offers them (docs/ux/slice-ux.md § 6)

export type AttendancePresence = (typeof ATTENDANCE_PRESENCES)[number];

export function isAttendancePresence(value: unknown): value is AttendancePresence {
  return typeof value === "string" && (ATTENDANCE_PRESENCES as readonly string[]).includes(value);
}

export interface AttendanceParticipant {
  // one line of the attendance board — UX-72; rsvp reason/contact/availability/injury never carried (docs/ux/slice-ux.md § 3)
  key: string; // `capacity:anchorId`, stable across a save; resolved server-side, never a description
  displayName: string;
  capacity: string;
  rsvp: "yes" | "no" | null; // standing answer; null for no response and for a walk-up
  isWalkUp: boolean; // true when there is no invitation at all — invariant P6
  presence: AttendancePresence | null; // latest committed value, or null when nothing recorded
  recordedAt: string | null; // ISO-8601
  recordedByName: string | null; // shown so a second recorder sees whose value they have
  mismatch: string | null; // rsvp_attendance_mismatches classification, when the view flags one
}

export interface WalkUpInput {
  // what the walk-on form collects — see relocations.md
  givenName: string; // required. people.given_name
  familyName: string; // required here, though the column is nullable — see relocations.md
  phone: string; // required. Stored exactly as typed
  email: string | null; // optional. Stored exactly as typed
  presence: AttendancePresence;
}

// The headline numbers — D62, D73 and D74. LAN-152.

export const SHOWED_PRESENCES = Object.freeze(["present", "late"] as const); // states meaning somebody turned up — see relocations.md

export function isShowedPresence(presence: AttendancePresence | null): boolean {
  return presence !== null && (SHOWED_PRESENCES as readonly string[]).includes(presence);
}

export interface AttendanceSummary {
  invited: number; // invitations; structurally zero below approved — invariant P1
  saidYes: number; // invitations whose standing answer is yes; intent, not observation
  showed: number; // attendance rows recorded present or late
  recorded: number; // attendance rows of any value, walk-ups included
  walkUps: number; // attendance rows with no invitation behind them — invariant P6
  registerSaved: boolean; // true once anything has been recorded — not "everybody marked" (see relocations.md)
}

// One derivation, shared by the register and by the event page (docs/ux/standards.md rule 7); pinned by attendance.test.ts.
export function summariseAttendance(
  participants: readonly AttendanceParticipant[],
): AttendanceSummary {
  const recorded = participants.filter((participant) => participant.presence !== null);

  return {
    invited: participants.filter((participant) => !participant.isWalkUp).length,
    saidYes: participants.filter(
      (participant) => !participant.isWalkUp && participant.rsvp === "yes",
    ).length,
    showed: recorded.filter((participant) => isShowedPresence(participant.presence)).length,
    recorded: recorded.length,
    walkUps: participants.filter((participant) => participant.isWalkUp).length,
    registerSaved: recorded.length > 0,
  };
}
