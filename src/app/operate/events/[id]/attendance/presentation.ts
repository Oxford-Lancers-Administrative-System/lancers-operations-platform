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
 * attendance states and the two occurrence assertions are fixed club
 * vocabulary; none of them is a synonym chosen here.
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
// UX-70 — Confirm what happened
// ---------------------------------------------------------------------------

export const OCCURRENCE_HEADLINE = "Confirm what happened";

/**
 * The wireframe's sentence, with the issue number taken out of it.
 *
 * UX-70 reads "This human assertion is required before attendance. Coaches with
 * LAN-110 access cannot perform it." Brian's verdict on the equivalent sentence
 * on the walk-up screen — "the warning names in LAN-85 are stupid, I don't know
 * why you put that in the app in the first place" — applies to this one for the
 * same reason: an operator at the side of a pitch has no use for a backlog
 * identifier, and the club's screens are not where one belongs.
 *
 * The information the wireframe was carrying survives whole: the assertion is a
 * person's, it gates attendance, and a coach who records attendance cannot make
 * it. Only the tracker reference went. Recorded as a deviation from the SVG in
 * LAN-80's pull request, under the owner decision that produced it.
 */
export const OCCURRENCE_DETAIL =
  "This is a human assertion and is required before attendance. A coach who records " +
  "attendance cannot make it.";

export const OCCURRENCE_NOT_ASSERTED = "Not yet asserted";

export const OCCURRENCE_NEVER_INFERRED = "Never inferred from time";

export const ATTENDANCE_UNAVAILABLE = "Unavailable";

export const ATTENDANCE_OPENS_AFTER = "Opens only after Mark occurred";

// ---------------------------------------------------------------------------
// UX-75 — Event marked not held
// ---------------------------------------------------------------------------

export const NOT_HELD_HEADLINE = "Event marked not held";

export const NOT_HELD_DETAIL =
  "Attendance remains unavailable. The occurrence decision and actor are retained in the " +
  "audit trail.";

// ---------------------------------------------------------------------------
// UX-71 — Attendance is not available yet
// ---------------------------------------------------------------------------

export const ATTENDANCE_LOCKED_HEADLINE = "Attendance is not available yet";

export const ATTENDANCE_LOCKED_DETAIL =
  "An authorized operator must first mark this event as occurred.";

export const ATTENDANCE_LOCKED_RULE =
  "The service rejects attendance writes while occurrence is unset or the event is marked " +
  "not held.";

// ---------------------------------------------------------------------------
// UX-90 — the same lock, seen by a coaching assignment
// ---------------------------------------------------------------------------

/**
 * The coach's version of the locked state, and why the words differ.
 *
 * UX-71 tells an operator that somebody must mark the event occurred, and that
 * operator may well be them — the sentence is an instruction. UX-90 shows the
 * same lock to a coach, for whom it is not: `slice-ux.md` § 8 and LAN-110's
 * fixed boundaries both say the assertion is closed to a coaching assignment,
 * and a screen that told a coach to go and mark the event occurred would be
 * describing an action the service refuses them.
 *
 * So the coach is told what is true and what to do about it: an operator has
 * not marked it, and this is not yours to mark.
 */
export const COACH_LOCKED_HEADLINE = "Attendance is not open";

export const COACH_LOCKED_DETAIL = "An authorized operator has not marked this event as occurred.";

export const COACH_LOCKED_RULE =
  "Coach attendance access does not include Mark occurred or Mark not held.";

export const COACH_RETURN_TO_ELIGIBLE = "Return to eligible events";

// ---------------------------------------------------------------------------
// UX-91 to UX-95 — the board, seen by a coaching assignment
// ---------------------------------------------------------------------------

export const COACH_BOARD_SUBTITLE = "Occurred · coach recorder view";

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

export const WALK_UP_HEADLINE = "Add walk-up attendance";

export const WALK_UP_DETAIL = "Capture only enough identity to record attendance now.";

export const WALK_UP_RECONCILIATION_NOTE =
  "The walk-up is visibly flagged for later reconciliation. This does not create or activate " +
  "a membership.";

export const WALK_UP_NAME_LABEL = "Name";

export const WALK_UP_CONTACT_LABEL = "Email or phone";

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

export const WALK_UP_MATCH_LABEL = "Possible roster match";

export const WALK_UP_MATCH_NONE = "None selected";

export const WALK_UP_MATCH_HELP =
  "If they are already on this season's roster, choose them here so the attendance is " +
  "recorded against their membership rather than against a second record of the same person.";

export const WALK_UP_SUBMIT = "Add walk-up";

/** The reconciliation flag, in the club's words. Derived, never a column. */
export const WALK_UP_CHIP = "Walk-up · to reconcile";
