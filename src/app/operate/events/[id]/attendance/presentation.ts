import type {
  AttendanceParticipant,
  AttendancePresence,
} from "@/lib/services/attendance-vocabulary";

// The words the attendance screens use — UX-70 through UX-75, LAN-80. `docs/ux/slice-ux.md` § 6 is the authority.

export const PRESENCE_LABELS: Readonly<Record<AttendancePresence, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/** MUI colour per state — § 7: colour is the second channel, never the only one. */
export const PRESENCE_COLORS: Readonly<
  Record<AttendancePresence, "success" | "warning" | "info" | "error">
> = Object.freeze({
  present: "success",
  late: "warning",
  excused: "info",
  absent: "error",
});

/** RSVP shown for context, never as an attendance value — § 6. */
export function describeRsvp(rsvp: "yes" | "no" | null, isWalkUp: boolean): string {
  if (isWalkUp) return "Walk-up · never invited";
  if (rsvp === "yes") return "RSVP: Attending";
  if (rsvp === "no") return "RSVP: Not attending";
  return "RSVP: No response";
}

const MISMATCH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  said_yes_no_attendance_recorded: "Said Attending · nothing recorded",
  said_yes_marked_absent: "Said Attending · marked Absent",
  said_no_but_attended: "Said Not attending · turned up",
  attended_without_invitation: "Attended without an invitation",
});

export function describeMismatch(mismatch: string | null): string | null {
  if (mismatch === null) return null;
  return MISMATCH_LABELS[mismatch] ?? mismatch;
}

/** Whether the register is open, which nobody decides — VG-003. */
export const ATTENDANCE_OPEN_DETAIL = "Record who was there, and correct it whenever you need to.";

export const ATTENDANCE_LOCKED_HEADLINE = "Attendance is not available yet";

/** The operator's version of the locked state — W9-F1. */
export function describeOperatorLock(status: string): string {
  return status === "cancelled"
    ? "This event was cancelled. It has no register, and there is nothing you can do to open one."
    : "This event is still a draft, so there is nobody on it to record. Approve it, and it gets a register.";
}

export const REGISTER_NOT_YET_HEADLINE = "The register is not open yet";

/** What lifts it — `docs/ux/standards.md` rule 4, finding W-F3. */
export function describeRegisterOpensAt(opensAt: string | null): string {
  if (opensAt === null) {
    return "This event has no date yet, so there is nothing to take a register for.";
  }
  const moment = new Date(opensAt);
  if (Number.isNaN(moment.getTime())) {
    return "This event has no usable start time, so its register has no opening moment yet.";
  }
  return `It opens on ${formatClubMoment(moment)}.`;
}

/** "27 Aug 2026, 14:00" — rendered at Europe/London, not UTC, per `docs/ux/standards.md` rule 3. */
function formatClubMoment(moment: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(moment);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("day")} ${value("month")} ${value("year")}, ${value("hour")}:${value("minute")}`;
}

export const HEADLINE_INVITED_LABEL = "Invited";
export const HEADLINE_SAID_YES_LABEL = "Said yes";
export const HEADLINE_SHOWED_LABEL = "Showed";

const NOT_RECORDED_VALUE = "—";

/** "— / 37" unsaved, "0 / 37" saved-empty, never a percentage (D62, D74). */
export function formatShowedAgainstInvited(summary: {
  showed: number;
  invited: number;
  registerSaved: boolean;
}): string {
  const showed = summary.registerSaved ? String(summary.showed) : NOT_RECORDED_VALUE;
  return `${showed} / ${summary.invited}`;
}

/** The coach's version of the locked state — W-F6. */
export const COACH_LOCKED_HEADLINE = "Attendance is not open";

export function describeCoachLock(status: string): string {
  return status === "cancelled"
    ? "This session was cancelled. There is no register for it, and there will not be one."
    : "This session has not been approved yet. A register appears once it is.";
}

export const COACH_RETURN_TO_ELIGIBLE = "Return to eligible events";

export const COACH_BOARD_SUBTITLE = "Coach recorder view";

export const ATTENDANCE_HEADLINE_PREFIX = "Attendance ·";

export const NOT_MARKED = "Not marked";

// The board's reading groups — Brian, 14 Aug 2026 (W12, D11, LAN-205, `OWNER-WALKUP-GROUP-ORDER`).
export type ParticipantGroupKey = "recruits" | "attending" | "everyone_else" | "walk_ups";

export interface ParticipantGroup {
  key: ParticipantGroupKey;
  label: string;
  detail: string;
  participants: AttendanceParticipant[];
}

const ATTENDING_GROUP_LABEL = "Attending";
const ATTENDING_GROUP_DETAIL = "Said yes to this event";
const EVERYONE_ELSE_GROUP_LABEL = "Everyone else";
const EVERYONE_ELSE_GROUP_DETAIL = "Not attending, and no response";
const WALK_UP_GROUP_LABEL = "Walk-ups";
const WALK_UP_GROUP_DETAIL = "Turned up uninvited, recorded present, to reconcile";

/** Recruitment events only — W12, D11, LAN-205. Copy verbatim from `chore/recruitment-fidelity-mockup`. */
const RECRUITS_GROUP_LABEL = "Recruits";
const RECRUITS_GROUP_DETAIL =
  "Every recruit on the board this season, the ones who said yes first.";

function byName(left: AttendanceParticipant, right: AttendanceParticipant): number {
  const name = left.displayName.localeCompare(right.displayName, "en-GB", {
    sensitivity: "base",
  });
  return name !== 0 ? name : left.key.localeCompare(right.key);
}

// Groups in reading order, each sorted by name (W12, D11, LAN-205).
export function groupParticipants(
  participants: AttendanceParticipant[],
  eventType: string,
): ParticipantGroup[] {
  const isRecruitmentEvent = eventType === "recruitment";
  const recruits = isRecruitmentEvent
    ? participants
        .filter((participant) => participant.capacity === "recruit" && !participant.isWalkUp)
        .sort(byName)
    : [];
  const recruitKeys = new Set(recruits.map((participant) => participant.key));

  // A walk-up is never in either RSVP group; a recruit placed above is excluded the same way.
  const invited = participants.filter(
    (participant) => !participant.isWalkUp && !recruitKeys.has(participant.key),
  );

  const walkUps: ParticipantGroup = {
    key: "walk_ups" as const,
    label: WALK_UP_GROUP_LABEL,
    detail: WALK_UP_GROUP_DETAIL,
    participants: participants.filter((participant) => participant.isWalkUp).sort(byName),
  };

  const groups: ParticipantGroup[] = [];
  if (isRecruitmentEvent) {
    groups.push(
      {
        key: "recruits" as const,
        label: RECRUITS_GROUP_LABEL,
        detail: RECRUITS_GROUP_DETAIL,
        participants: recruits,
      },
      walkUps,
    );
  }
  groups.push(
    {
      key: "attending" as const,
      label: ATTENDING_GROUP_LABEL,
      detail: ATTENDING_GROUP_DETAIL,
      participants: invited.filter((participant) => participant.rsvp === "yes").sort(byName),
    },
    {
      key: "everyone_else" as const,
      label: EVERYONE_ELSE_GROUP_LABEL,
      detail: EVERYONE_ELSE_GROUP_DETAIL,
      participants: invited.filter((participant) => participant.rsvp !== "yes").sort(byName),
    },
  );
  if (!isRecruitmentEvent) groups.push(walkUps);
  return groups;
}

export const NOBODY_INVITED =
  "Nobody was invited to this event, and nothing has been recorded. Anyone who turned up can " +
  "still be added as a walk-up.";

export const NO_MATCHING_PARTICIPANTS =
  "No one on this event matches these filters. Clear them to see everybody.";

export const ADD_WALK_UP = "Add walk-up";

export const COMPLETE_ATTENDANCE = "Complete attendance";

export const SAVING = "Saving…";

export const SAVE_FAILED_HEADLINE = "We could not save this change";

/** "Saved · Casey North · 20:07" — UX-72's committed line, exactly. */
export function describeCommitted(
  recordedAt: string | null,
  recordedByName: string | null,
): string | null {
  if (recordedAt === null) return null;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(new Date(recordedAt));

  return recordedByName ? `Saved · ${recordedByName} · ${time}` : `Saved · ${time}`;
}

/** Brian locked *walk-up* as the word, 2026-08-31 — never "walk-on". */
export const WALK_UP_HEADLINE = "Add a walk-up";

/** Into recruitment, not onto the roster — Brian, 14 August 2026. */
export const WALK_UP_RECONCILIATION_NOTE =
  "They are added to recruitment as somebody to follow up, and recorded at this event. " +
  "This does not put them on the roster or create a membership.";

export const WALK_UP_GIVEN_NAME_LABEL = "First name";

export const WALK_UP_FAMILY_NAME_LABEL = "Last name";

export const WALK_UP_PHONE_LABEL = "Phone";

export const WALK_UP_EMAIL_LABEL = "Email";

/** A walk-up is recorded Present, and the form does not ask — Brian, 14 August 2026. */
export const WALK_UP_ALWAYS_PRESENT =
  "Recorded as Present. Correct it on their row afterwards if you need to.";

export const WALK_UP_SUBMIT = "Add walk-up";

export const WALK_UP_CHIP = "Walk-up · in recruitment";

/** The WhatsApp send/read-back consent note — LAN-205, packet amendment 1. */
export const WALK_UP_SEND_NOTE =
  "Saving sends them one WhatsApp message: the sign-up form, prefilled, on a link that is theirs. " +
  "Read the number back before you save.";

/** The recorded confirmation — Brian, 2026-08-31: a short label, not a paragraph. */
export const WALK_UP_ADDED = "Walk-up added";
