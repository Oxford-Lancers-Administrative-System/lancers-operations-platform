import type { CapabilityKey } from "@/lib/auth/capabilities";
import { isNarrowAttendanceRecorder, roleCodesPermit } from "@/lib/auth/capabilities";

/**
 * The operator shell's destinations — all of them.
 *
 * `docs/ux/slice-ux.md` § 3 is explicit: the shell exposes Roster, Events and
 * Report, **and there is no Home destination**. That absence is a decision, not
 * an omission, so this list is the whole navigation and adding a fourth entry
 * is a UX change rather than a code change.
 *
 * `capability` is what the destination *requires*, read from the capability map
 * rather than restated here:
 *
 *   * Roster and Events are ordinary operator surfaces (§ 8, first row). Any
 *     linked active operator opens them; the privileged actions *inside* them —
 *     activation, approval — are guarded individually by the issues that build
 *     them.
 *
 *   * Report is not ordinary. § 8 restricts it to an "authorized report
 *     operator" and does not say who that is, so `leadership_report` was an
 *     empty grant that refused everybody — deliberately and visibly — until
 *     LAN-81, the issue that owed the answer, resolved it to the four calendar
 *     roles. `capabilities.ts` carries the reasoning and the reason it is
 *     narrower than the ordinary operator floor: the snapshot leads with the
 *     reasons people gave for not attending.
 *
 * Navigation is never authorization. Every destination guards itself, and this
 * list is also used to decide which one the shell opens on — not what a page is
 * allowed to render.
 */
export interface Destination {
  readonly href: string;
  readonly label: string;
  /** `null` means "any linked, active operator", never "anyone". */
  readonly capability: CapabilityKey | null;
  /** Second line under the label, where the wireframe shows one. */
  readonly detail?: string;
}

export const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/roster", label: "Roster", capability: null }),
  Object.freeze({ href: "/operate/events", label: "Events", capability: null }),
  Object.freeze({
    href: "/operate/report",
    label: "Report",
    capability: "leadership_report" as CapabilityKey,
  }),
]);

/**
 * The whole of a narrow attendance recorder's navigation — UX-91's sidebar and
 * its phone bottom bar, both of which show exactly one destination. LAN-110.
 *
 * `slice-ux.md` § 3: a coaching assignment "receives only the occurred-event
 * attendance surface. No general operator navigation …". One entry is what
 * "only" means, and the second line says what is behind it.
 *
 * The wireframe's own second line was **Occurred events only**, and it stopped
 * being true on 14 August 2026: Brian asked for the list to look forward, which
 * a list of occurred events cannot do — see `./coach-event-buckets.ts`. The
 * deviation is recorded in `docs/ux/tickets/LAN-110-coach-attendance.md`.
 *
 * It reuses `/operate/events`, and that is not a shortcut. § 4's route contract
 * is closed, and adding `/operate/attendance` to it would be a UX change this
 * ticket is explicitly forbidden from making ("Do not add a new role,
 * destination, workflow, field, status, or delivery action without a recorded
 * design decision"). The route is shared and the *presentation* is
 * capability-scoped, exactly as § 4 says of the attendance route itself.
 *
 * The label is **Attendance** rather than Events because that is what the
 * wireframe shows and what the destination is for a coach: the list is filtered
 * to occurred events, and every row leads to an attendance board.
 */
export const COACH_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/events",
    label: "Attendance",
    capability: "attendance_recorder" as CapabilityKey,
    detail: "This season's sessions",
  }),
]);

/**
 * Administration — LAN-133, `DEC-administration-navigation`.
 *
 * Brian's intake decision of 18 August 2026 is a decision about *placement*
 * rather than about capability: "Administration is a low-frequency privileged
 * area at the bottom of the left application sidebar, immediately above
 * user/account controls". It held "Operators and Roles" and nothing else at
 * the time; W5 and W7 have since each added one more entry, and the reviewed
 * prototype's shape survives them — a rule, the word Administration, then
 * the entries, then the signed-in account.
 *
 * So it is a **second list** rather than more entries in `DESTINATIONS`.
 * The separator and the caption are the decision, and a flat list cannot carry
 * them; `ShellNav` renders this one under its own heading.
 *
 * Three different capabilities now govern the four entries, in this order:
 *
 *   * **Follow-ups** — W5, `capability: null`. The workflow's primary actor
 *     is "the President, and any operator working follow-ups", not a
 *     privileged subset — the same floor Roster and Events already use.
 *     Placed first, above Operators, per the approved `W5-01` mockup.
 *   * **Operators**, **Roles** — `role_management`,
 *     `REQ-role-management-authority`'s capability, held by three seats.
 *   * **Messaging schedule** — LAN-171, `delivery_administration`. The four
 *     calendar roles who already approve events and repair their delivery
 *     are the ones who set the policy deciding when those events chase; the
 *     Treasurer and coaching seats are excluded from it for the same
 *     recorded reason `delivery_administration` excludes them elsewhere. Not
 *     `role_management` — changing when the club messages people is not
 *     account or role administration. Ordered Operators, Messaging schedule,
 *     Roles among themselves, matching the approved `W7-02` mockup's own
 *     sidebar.
 *
 * None of the four is shown to every operator, where Roster, Events and
 * Report are — except Follow-ups, which (like them) is `capability: null`
 * and so is shown to every seated operator alongside them; it is only
 * grouped under this heading, not gated by it. That grouping is a courtesy
 * and never a boundary either way — `src/app/operate/admin/**` gates itself
 * on the same capabilities, and an operator who types the URL is refused by
 * the page, not by this list. Hiding Operators, Roles and Messaging schedule
 * matters anyway, because a low-frequency privileged area advertised to
 * everybody who cannot open it is an invitation to try.
 */
export const ADMINISTRATION_DESTINATIONS: readonly Destination[] = Object.freeze([
  /**
   * W5. "Shown as a Follow-ups item under Administration, above Operators" —
   * the mockup's own placement, and `capability: null` rather than
   * `role_management`: the workflow's primary actor is "the President, and
   * any operator working follow-ups", not the three seats Operators and Roles
   * are narrowed to. `readFollowUpsQueue`'s own floor is
   * `requireGeneralOperator()`, the same as the participation table's.
   */
  Object.freeze({ href: "/operate/admin/follow-ups", label: "Follow-ups", capability: null }),
  Object.freeze({
    href: "/operate/admin/operators",
    label: "Operators",
    capability: "role_management" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/admin/messaging",
    label: "Messaging schedule",
    capability: "delivery_administration" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/admin/roles",
    label: "Roles",
    capability: "role_management" as CapabilityKey,
  }),
]);

/** The word above the Administration entries in the sidebar. */
export const ADMINISTRATION_SECTION = "Administration";

/**
 * The Administration entries this operator may open — all of them, or none.
 *
 * Both entries share one capability, so this is empty or complete and never
 * partial. It is written as a filter rather than as an `if` so that a third
 * entry with a different capability would be handled correctly by construction.
 *
 * A narrow attendance recorder gets none, without consulting the capability at
 * all: `slice-ux.md` § 3 gives a coaching assignment *one* surface, and a coach
 * who somehow also held `role_management` would be an operator with general
 * authority rather than a narrow recorder — `isNarrowAttendanceRecorder()` is
 * already false for them, so this branch never takes their Administration away.
 */
export function administrationDestinationsFor(
  roleCodes: readonly string[],
): readonly Destination[] {
  if (isNarrowAttendanceRecorder(roleCodes)) return [];
  return ADMINISTRATION_DESTINATIONS.filter((destination) =>
    permitsDestination(roleCodes, destination),
  );
}

/**
 * The destinations this operator's shell shows.
 *
 * Navigation, still, and not authorization: every destination guards itself and
 * a coach who types `/operate/roster` is refused there, not merely unable to
 * click to it.
 */
export function destinationsFor(roleCodes: readonly string[]): readonly Destination[] {
  return isNarrowAttendanceRecorder(roleCodes) ? COACH_DESTINATIONS : DESTINATIONS;
}

/** Can this operator's current roles open the destination? */
export function permitsDestination(
  roleCodes: readonly string[],
  destination: Destination,
): boolean {
  return destination.capability === null || roleCodesPermit(roleCodes, destination.capability);
}

/**
 * The destination the shell opens on, per § 3: "the first destination permitted
 * by the operator's capability map". `null` when none is — an operator with no
 * permitted destination is refused rather than dropped on an empty page.
 */
export function firstPermittedDestination(roleCodes: readonly string[]): Destination | null {
  return (
    destinationsFor(roleCodes).find((destination) => permitsDestination(roleCodes, destination)) ??
    null
  );
}
