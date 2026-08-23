import type {
  AttendanceParticipant,
  AttendancePresence,
} from "@/lib/services/attendance-vocabulary";

/**
 * The words the attendance screens use — UX-70 through UX-75, LAN-80.
 *
 * A module of its own, and pure, for the reason the other presentation modules
 * are: the client components that render these strings must not pull the
 * service layer (and therefore `pg`) into the browser bundle, and the tests
 * that assert the approved labels must be able to import them without a
 * database.
 *
 * `docs/ux/slice-ux.md` § 6 is the authority for every label below. The four
 * attendance states are fixed club vocabulary; none of them is a synonym
 * chosen here.
 */

// ---------------------------------------------------------------------------
// The four states — § 6
// ---------------------------------------------------------------------------

export const PRESENCE_LABELS: Readonly<Record<AttendancePresence, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/**
 * Which MUI colour each state carries.
 *
 * § 7: the phone presentation must expose state "without relying on color
 * alone", so every one of these is also rendered as its word. The colour is the
 * second channel, never the only one.
 */
export const PRESENCE_COLORS: Readonly<
  Record<AttendancePresence, "success" | "warning" | "info" | "error">
> = Object.freeze({
  present: "success",
  late: "warning",
  excused: "info",
  absent: "error",
});

// ---------------------------------------------------------------------------
// RSVP, shown for context and never as an attendance value — § 6
// ---------------------------------------------------------------------------

/**
 * "Delivered never means responded. Attending is intent; Present is observed
 * attendance." The prefix is deliberately kept on every one of these so that a
 * recorder scanning a column never reads an intent as an observation.
 */
export function describeRsvp(rsvp: "yes" | "no" | null, isWalkUp: boolean): string {
  if (isWalkUp) return "Walk-up · never invited";
  if (rsvp === "yes") return "RSVP: Attending";
  if (rsvp === "no") return "RSVP: Not attending";
  return "RSVP: No response";
}

/** `public.rsvp_attendance_mismatches.mismatch`, in the club's words. */
export const MISMATCH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  said_yes_no_attendance_recorded: "Said Attending · nothing recorded",
  said_yes_marked_absent: "Said Attending · marked Absent",
  said_no_but_attended: "Said Not attending · turned up",
  attended_without_invitation: "Attended without an invitation",
});

export function describeMismatch(mismatch: string | null): string | null {
  if (mismatch === null) return null;
  return MISMATCH_LABELS[mismatch] ?? mismatch;
}

// ---------------------------------------------------------------------------
// Whether the register is open, which nobody decides
// ---------------------------------------------------------------------------

/**
 * What the register panel says, in two states.
 *
 * Both sentences say what the surface does. Neither describes what the product
 * no longer asks for — VG-003: "That second line is weird. Why is that in the
 * app?" The controls being gone is the whole of the change, and an app that
 * narrates its own history is explaining a decision the reader never saw made.
 *
 * The rule they describe is D71 and D72's, and it is the clock's: the register
 * opens shortly before the event starts and never closes afterwards. It is
 * deliberately not "once the date has passed" — that was this file's previous
 * answer and it was wrong, because the person taking a register is standing at
 * the pitch while it fills up.
 */
export const ATTENDANCE_OPEN_DETAIL = "Record who was there, and correct it whenever you need to.";

// ---------------------------------------------------------------------------
// UX-71 — Attendance is not available yet
// ---------------------------------------------------------------------------

export const ATTENDANCE_LOCKED_HEADLINE = "Attendance is not available yet";

export const ATTENDANCE_LOCKED_DETAIL =
  "A register belongs to an approved event, and opens shortly before it starts. A draft or a " +
  "cancelled event never opens one.";

export const ATTENDANCE_LOCKED_RULE =
  "The service rejects attendance writes until the event is approved and its register has opened.";

// ---------------------------------------------------------------------------
// The register's own window — D71 and D72. LAN-152.
// ---------------------------------------------------------------------------

export const REGISTER_NOT_YET_HEADLINE = "The register is not open yet";

/**
 * What lifts it — `docs/ux/standards.md` rule 4, and finding W-F3.
 *
 * A refused control names the step that enables it, and here the step is not
 * something anybody can go and do: it is the clock. Naming the moment is the
 * whole answer, and it is the whole of what this says.
 *
 * There was a second sentence — "The register opens about six hours before the
 * event starts, and never closes afterwards." Brian cut it: the first sentence
 * has already answered the question, and how long a register stays open is
 * irrelevant to somebody being told they cannot open it yet. The buffer is
 * still one tunable number, `ATTENDANCE_REGISTER_BUFFER_HOURS` in
 * `services/attendance-window.ts`; no screen repeats it in words.
 */
export function describeRegisterOpensAt(opensAt: string | null): string {
  if (opensAt === null) {
    return "This event has no date yet, so there is nothing to take a register for.";
  }
  const moment = new Date(opensAt);
  // An unreadable instant is a fact about this event, not an excuse to recite
  // the policy the sentence above no longer states.
  if (Number.isNaN(moment.getTime())) {
    return "This event has no usable start time, so its register has no opening moment yet.";
  }
  return `It opens on ${formatClubMoment(moment)}.`;
}

/**
 * "27 Aug 2026, 14:00", on club time — `docs/ux/standards.md` rule 3.
 *
 * `Europe/London` rather than UTC because this one *is* an instant: it is
 * derived from the event's wall clock and printed back as the moment a person
 * standing in Oxford will see on their phone. Rendering it at UTC would show
 * 13:00 for a register that opens at 14:00, every summer.
 */
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

// ---------------------------------------------------------------------------
// The three headline numbers — D62, D73, D74. LAN-152.
// ---------------------------------------------------------------------------

export const HEADLINE_INVITED_LABEL = "Invited";
export const HEADLINE_SAID_YES_LABEL = "Said yes";
export const HEADLINE_SHOWED_LABEL = "Showed";

/** What a value reads before there is anything to read. */
export const NOT_RECORDED_VALUE = "—";

/**
 * `— / 37` before a register has been saved, `0 / 37` after one was saved with
 * everybody absent, `20 / 37` the rest of the time.
 *
 * ## The dash is the whole point
 *
 * D74: an event nobody has got round to must not read like an event nobody
 * attended. Both are a small number over forty-seven, and the club acts very
 * differently on them — one is a session to ask about, the other is a register
 * to go and take. The save is the signal, and `registerSaved` carries it.
 *
 * ## And it is never a percentage
 *
 * D62 says raw pairs. "43%" is the same fact with the two numbers the club
 * actually wanted taken out of it.
 */
export function formatShowedAgainstInvited(summary: {
  showed: number;
  invited: number;
  registerSaved: boolean;
}): string {
  const showed = summary.registerSaved ? String(summary.showed) : NOT_RECORDED_VALUE;
  return `${showed} / ${summary.invited}`;
}

// ---------------------------------------------------------------------------
// UX-90 — the same lock, seen by a coaching assignment
// ---------------------------------------------------------------------------

/**
 * The coach's version of the locked state — corrected by W-F6.
 *
 * This screen is **not** the buffer's. A coach reaches it only for a draft or a
 * cancelled session, both of which fail the register's status half; the session
 * that has not started yet gets `REGISTER_NOT_YET_HEADLINE` and a moment.
 *
 * It used to say "This session's register has not opened yet" and then recite
 * the buffer rule, which was false twice over for a cancelled session in the
 * past: its start had gone, and no register was ever coming. The operator's
 * equivalent named the real reason and the coach's did not, so the two seats
 * were told different things about one event.
 *
 * Neither sentence is an instruction. A coach can neither approve a session nor
 * un-cancel one, so naming the step is naming what somebody else's decision was
 * — which is the honest thing to say, and the reason the two cases are worded
 * apart: a cancellation is final, and a draft is not.
 */
export const COACH_LOCKED_HEADLINE = "Attendance is not open";

export function describeCoachLock(status: string): string {
  return status === "cancelled"
    ? "This session was cancelled. There is no register for it, and there will not be one."
    : "This session has not been approved yet. A register appears once it is.";
}

export const COACH_RETURN_TO_ELIGIBLE = "Return to eligible events";

// ---------------------------------------------------------------------------
// UX-91 to UX-95 — the board, seen by a coaching assignment
// ---------------------------------------------------------------------------

export const COACH_BOARD_SUBTITLE = "Coach recorder view";

/**
 * The sentence UX-91 puts at the top of the coach's board.
 *
 * It is not a disclaimer. `slice-ux.md` § 3 withholds RSVP reasons, contact
 * details, availability and injury notes from this surface, and the person
 * reading it is the one who would otherwise go looking for them — a coach who
 * cannot see why somebody said no needs to know that the screen is not broken
 * and that the answer is not one press away.
 */
export const COACH_BOARD_NOTE =
  "Only event context, player identity, standing RSVP state and attendance are shown. " +
  "RSVP reasons, contact, availability and administration are omitted.";

// ---------------------------------------------------------------------------
// UX-72 — the board
// ---------------------------------------------------------------------------

export const ATTENDANCE_HEADLINE_PREFIX = "Attendance ·";

export const RSVP_STAYS_SEPARATE =
  "RSVP and attendance remain separate. Mismatches are visible and never auto-reconciled.";

export const NOT_MARKED = "Not marked";

// ---------------------------------------------------------------------------
// The two groups the board is read in — Brian, 14 August 2026
// ---------------------------------------------------------------------------

/**
 * Attending, then everyone else, then walk-ups — Brian, 14 August 2026.
 *
 * A recorder works the register in one direction: they expect the people who
 * said they were coming, tick them off, and only then deal with the surprises.
 * Brian's words on the real screen: "I want to look at the people who RSVPed
 * yes, and then I want everyone else (no or otherwise)… those are not the
 * people I'm expecting to be there."
 *
 * The first two groups split on the **standing RSVP**. A "no" and a nonresponse
 * are different facts and the row still shows which is which, but they are the
 * same *expectation* — somebody who was not counted on — so they share a group.
 *
 * ## Why a walk-up is not in either of them
 *
 * Because it would have to be a lie in one direction or the other. A walk-up
 * has no invitation and so no standing answer, which by the rule above puts
 * them in "everyone else" — under a heading that says the club was not
 * expecting them, next to people who are not there. But the group above says
 * **Attending**, and that word means "said yes" throughout this product:
 * Locked Requirement 7 and `slice-ux.md` § 6 are explicit that intent and
 * reality are different records and that "a Yes never becomes Present
 * automatically". Putting somebody who turned up into a group named for what
 * they answered is exactly the conflation the frozen model forbids.
 *
 * So they get their own group, at the bottom, which is what Brian asked for:
 * "it should be its own separate group that attended and should automatically
 * be marked as present". It says what is true of them — they turned up, nobody
 * invited them, and they still have to be reconciled with the roster.
 *
 * ## What this deliberately does not do
 *
 * It does not reorder anything by attendance. The groups are fixed by the
 * standing RSVP and by whether there was an invitation, so pressing **Present**
 * on somebody in "Everyone else" leaves them exactly where they were — a row
 * that jumped to another section under the recorder's thumb, mid-register, at
 * the side of a pitch, is how the wrong person gets marked.
 */
export type ParticipantGroupKey = "attending" | "everyone_else" | "walk_ups";

export interface ParticipantGroup {
  key: ParticipantGroupKey;
  label: string;
  /** One line under the label saying who is in here. */
  detail: string;
  participants: AttendanceParticipant[];
}

export const ATTENDING_GROUP_LABEL = "Attending";
export const ATTENDING_GROUP_DETAIL = "Said yes to this event";
export const EVERYONE_ELSE_GROUP_LABEL = "Everyone else";
export const EVERYONE_ELSE_GROUP_DETAIL = "Not attending, and no response";
export const WALK_UP_GROUP_LABEL = "Walk-ups";
export const WALK_UP_GROUP_DETAIL = "Turned up uninvited, recorded present, to reconcile";

/**
 * Sorted by name, within each group.
 *
 * `localeCompare` rather than `<`, because the club's real names are not
 * ASCII-only and a byte comparison puts "Ó" after "Z". `en-GB` with base
 * sensitivity is the ordering somebody scanning a list expects.
 *
 * The `key` tiebreak keeps it total: two people can share a display name — the
 * club has had two Toms — and an unstable sort would let their rows swap places
 * on a revalidation, which for a control that records who was present is worse
 * than untidy.
 */
function byName(left: AttendanceParticipant, right: AttendanceParticipant): number {
  const name = left.displayName.localeCompare(right.displayName, "en-GB", {
    sensitivity: "base",
  });
  return name !== 0 ? name : left.key.localeCompare(right.key);
}

/** The board's three groups, in reading order, each sorted by name. */
export function groupParticipants(participants: AttendanceParticipant[]): ParticipantGroup[] {
  // Tested first, and everywhere: a walk-up is never in either RSVP group, even
  // though `rsvp` is null on one and could be anything on a future one.
  const invited = participants.filter((participant) => !participant.isWalkUp);

  return [
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
    {
      key: "walk_ups" as const,
      label: WALK_UP_GROUP_LABEL,
      detail: WALK_UP_GROUP_DETAIL,
      participants: participants.filter((participant) => participant.isWalkUp).sort(byName),
    },
  ];
}

export const NOBODY_INVITED =
  "Nobody was invited to this event, and nothing has been recorded. Anyone who turned up can " +
  "still be added as a walk-up.";

export const NO_MATCHING_PARTICIPANTS =
  "No one on this event matches these filters. Clear them to see everybody.";

export const ADD_WALK_UP = "Add walk-up";

export const COMPLETE_ATTENDANCE = "Complete attendance";

/**
 * What **Complete attendance** actually does, said on the screen.
 *
 * There is no finalisation column in `attendance_records` and LAN-80 forbids
 * authoring a migration without Brian, so this button closes the recorder's
 * session and returns to the event. Every value it leaves behind stays
 * correctable. Saying so is better than a button that implies a lock the
 * database does not have — the gap is reported in the pull request.
 */
export const COMPLETE_ATTENDANCE_MEANING =
  "Finishes recording and returns to the event. Values stay correctable afterwards.";

// ---------------------------------------------------------------------------
// The save line — § 9, Saving / Saved / failed save
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// UX-73 / UX-97 — the walk-up
// ---------------------------------------------------------------------------

export const WALK_UP_HEADLINE = "Add a walk-on";

export const WALK_UP_DETAIL = "Somebody who turned up and is not on the roster.";

/**
 * What the club ends up with, said before the operator commits — Brian,
 * 14 August 2026: a walk-on "should go in like a new person is being added, not
 * in the roster, not in the season roster, but in the person in the
 * recruitment".
 *
 * Both halves are load-bearing. **Into recruitment** is what somebody picking
 * this up next week needs to know to go and find them; **not onto the roster**
 * is the approved criterion that the record "cannot be mistaken for a completed
 * membership", and is why nobody has to take them off a team sheet afterwards.
 */
export const WALK_UP_RECONCILIATION_NOTE =
  "They are added to recruitment as somebody to follow up, and recorded at this event. " +
  "This does not put them on the roster or create a membership.";

// The four labels, matching `/operate/roster/new` word for word. Two screens
// that add a person to the club should not name the same field two ways.
export const WALK_UP_GIVEN_NAME_LABEL = "First name";

export const WALK_UP_FAMILY_NAME_LABEL = "Last name";

export const WALK_UP_PHONE_LABEL = "Phone";

export const WALK_UP_EMAIL_LABEL = "Email";

/**
 * A walk-up is recorded **Present**, and the form does not ask — Brian,
 * 14 August 2026: "when they're added as a walk-up, they should be
 * automatically added as present."
 *
 * It is the only attendance value the situation can produce. Somebody is being
 * typed into a form because they are standing in front of the person typing;
 * an uninvited person who is *absent* is not an event that happens, and asking
 * a coach to confirm what they can see is a decision taken away from the thing
 * they are actually doing.
 *
 * It is not a lock. The four buttons on the row it creates work exactly as they
 * do for anybody else, so a walk-up who turned up late or left at half time is
 * corrected in the same place and audited the same way. The note below says so
 * on the form, because a value chosen for you without explanation is a value
 * you do not trust.
 */
export const WALK_UP_ALWAYS_PRESENT =
  "Recorded as Present. Correct it on their row afterwards if you need to.";

export const WALK_UP_SUBMIT = "Add walk-on";

/** The reconciliation flag, in the club's words. Derived, never a column. */
export const WALK_UP_CHIP = "Walk-on · in recruitment";
