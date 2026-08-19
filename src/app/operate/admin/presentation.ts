import { describeRoleCapabilities, NO_CAPABILITY_SUMMARY } from "@/lib/auth/capabilities";
import {
  operatorAccountState,
  type OperatorAccountState,
} from "@/lib/services/operator-account-state";
import type { DirectoryOperator, DirectoryRole } from "@/lib/services/administration-directory";
import { labelFor } from "../labels";
import { MEMBERSHIP_STATUS_LABELS } from "../roster/presentation";

/**
 * How Administration says things — LAN-133, `WP-surfaces`.
 *
 * Everything here is presentation and nothing here is policy. The five account
 * states, their labels and their descriptions belong to
 * `operator-account-state.ts`; the Permissions summary belongs to
 * `capabilities.ts`; who may act on whom belongs to
 * `administration-authority.ts`. This module chooses the *treatment* — which
 * section a row falls in, which colour a badge is, how a date reads — because
 * `DEC-administration-language-and-states` says "`WP-surfaces` chooses the
 * visual treatment; the words are not its to choose".
 *
 * It imports nothing that reaches the database, so a client component may
 * import it without pulling `pg` into the browser bundle.
 */

// ---------------------------------------------------------------------------
// The Operators sections
// ---------------------------------------------------------------------------

/**
 * `DEC-administration-navigation`: "Operators are separated into Standing
 * Officers, Club Officers and Coaches."
 *
 * Three sections for three catalogue groups, and the mapping is by group code
 * because the *sections* are Administration's words for the groups rather than
 * the groups' own names. The Roles page shows "Operational Administration",
 * "Club Committee" and "Coaching Staff" — the catalogue's labels, read from
 * `public.role_groups` — and the Operators page shows the three names above for
 * the same three groups, because it is naming people rather than seats. Both
 * lists are locked by the same decision and neither may be derived from the
 * other.
 *
 * A group code the catalogue grows and this map has not heard of falls back to
 * the group's own label, which is honest rather than wrong: a new group would
 * appear on the Operators page under its catalogue name until somebody chooses
 * a club word for it. It never silently merges into another section.
 */
export const OPERATOR_SECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  operational_administration: "Standing Officers",
  club_committee: "Club Officers",
  coaching_staff: "Coaches",
});

/**
 * The section an operator holding no seat at all falls in.
 *
 * `REQ-admin-surfaces` names three sections and every operator in the reviewed
 * prototype holds a seat, so this case is not drawn there. It is nevertheless
 * reachable and must be: `REQ-deactivate-and-reinstate` keeps the account when a
 * seat ends ("No action deletes Person, membership, binding, attribution or
 * history"), so an operator whose only role has been ended is an account that
 * can still be restored, deactivated or given a new seat — and one that is
 * absent from the only page listing accounts cannot be any of those things.
 *
 * It is deliberately last, deliberately named in the same plain register as the
 * three above, and deliberately not a fourth *grouping* rule: it is the
 * remainder, and it is empty on a club whose records are tidy.
 */
export const UNASSIGNED_SECTION_LABEL = "Without a current role";

/** One rendered section of the Operators page. */
export interface OperatorSection {
  /** `role_groups.code`, or `""` for the remainder. */
  readonly code: string;
  readonly label: string;
  readonly operators: readonly DirectoryOperator[];
}

/**
 * The section heading one seat contributes.
 *
 * Exported so operator detail can say which part of the club a seat belongs to
 * without re-deriving the mapping.
 */
export function sectionLabelForGroup(groupCode: string, groupLabel: string): string {
  return OPERATOR_SECTION_LABELS[groupCode] ?? groupLabel;
}

/**
 * Operators, split into the approved sections, in catalogue order.
 *
 * An operator holding seats in more than one group — `DEC-one-person-multiple-capacities`
 * makes that ordinary, a President who also coaches — appears **once**, under
 * the earliest group in the catalogue's own order. Listing them twice would
 * make the page's own count wrong and would offer the same account two
 * different-looking routes to the same record.
 *
 * The order of the sections is the catalogue's `sort_order`, carried on every
 * seat, so the page never restates "Operational Administration first". Sections
 * with nobody in them are omitted rather than shown empty: the prototype shows
 * three populated sections, and an empty "Coaches" heading on a club that has
 * not invited its coaches yet reads as a fault.
 */
export function operatorSections(
  operators: readonly DirectoryOperator[],
): readonly OperatorSection[] {
  const sections = new Map<
    string,
    { sort: number; label: string; operators: DirectoryOperator[] }
  >();

  for (const operator of operators) {
    const seat = primarySeat(operator.roles);
    const code = seat?.groupCode ?? "";
    const label = seat
      ? sectionLabelForGroup(seat.groupCode, seat.groupLabel)
      : UNASSIGNED_SECTION_LABEL;
    // The remainder sorts after every real group. `Number.MAX_SAFE_INTEGER`
    // rather than a large literal, so a catalogue with many groups cannot
    // overtake it.
    const sort = seat?.groupSortOrder ?? Number.MAX_SAFE_INTEGER;

    const section = sections.get(code);
    if (section) section.operators.push(operator);
    else sections.set(code, { sort, label, operators: [operator] });
  }

  return [...sections.entries()]
    .sort((left, right) => left[1].sort - right[1].sort)
    .map(([code, section]) => ({ code, label: section.label, operators: section.operators }));
}

/** The seat that decides an operator's section: the earliest group they sit in. */
function primarySeat(roles: readonly DirectoryRole[]): DirectoryRole | null {
  return [...roles].sort((left, right) => left.groupSortOrder - right.groupSortOrder)[0] ?? null;
}

/**
 * The seats an operator holds, as one line: "President · Wide Receivers Coach".
 *
 * "No current role" rather than an empty cell, for the reason every label map in
 * this repository keeps a fallback: a blank reads as an omission.
 */
export function describeSeats(roles: readonly DirectoryRole[]): string {
  if (roles.length === 0) return "No current role";
  return roles.map((role) => role.label).join(" · ");
}

// ---------------------------------------------------------------------------
// Account state
// ---------------------------------------------------------------------------

/**
 * The colour each account state wears.
 *
 * `REQ-invitation-states` requires the five states to be told apart by "distinct
 * text and visual treatment" — the text is the state definition's own `label`,
 * and this is the other half. Three colours for five states is deliberate and
 * is the reason a chip never travels without its words: the two states that
 * share `warning` are both "sent, not taken up", and the two that share
 * `default` are both "cannot sign in", which is exactly the distinction colour
 * is good at and exactly the one it must not be relied on for.
 */
export function accountStateColour(
  state: OperatorAccountState,
): "success" | "warning" | "error" | "default" {
  switch (state) {
    case "active":
      return "success";
    case "invitation_pending":
      return "warning";
    case "delivery_failed":
      return "error";
    case "email_change_pending":
      return "warning";
    case "deactivated":
      return "default";
  }
}

/** The club's word for a state. Never a code, never a technical term. */
export function accountStateLabel(state: OperatorAccountState): string {
  return operatorAccountState(state).label;
}

/**
 * What the Operators list says in its invitation column.
 *
 * Four sentences for four situations, and the failed one **carries the
 * transport's reason** — LAN131-A5. The reason is the only place the
 * administrator is told that an invitation which was opened and abandoned is
 * recovered through Forgot password rather than through another invitation, and
 * before this package it was written to `invitation_delivery_failure_reason` and
 * rendered nowhere. A state badge saying "Delivery failed" with no reason beside
 * it is the defect that finding names.
 */
export function describeInvitationProgress(operator: {
  readonly state: OperatorAccountState;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly deliveryFailedAt: Date | null;
  readonly deliveryFailureReason: string | null;
}): string {
  if (operator.state === "delivery_failed") {
    const when = operator.deliveryFailedAt
      ? `Failed ${formatInstant(operator.deliveryFailedAt)}`
      : "Failed";
    return operator.deliveryFailureReason ? `${when} · ${operator.deliveryFailureReason}` : when;
  }
  if (operator.activatedAt) return `Accepted ${formatDay(operator.activatedAt)}`;
  if (operator.invitedAt) return `Sent ${formatInstant(operator.invitedAt)}`;
  return "No invitation recorded";
}

// ---------------------------------------------------------------------------
// Holders
// ---------------------------------------------------------------------------

/** What Administration calls a seat nobody holds. `DEC-account-state-separation`. */
export const NOT_ASSIGNED = "Not assigned";

/**
 * Who holds one seat, as the Roles index says it.
 *
 * Three facts have to survive being compressed into one cell, and each of them
 * is a requirement rather than a nicety:
 *
 *   * **Not assigned** is a real state and the *only* thing that produces it is
 *     an ended role (`DEC-account-state-separation`: "only End role creates a
 *     Not assigned vacancy"). It is never what a deactivated account looks like.
 *   * A holder whose operator access is deactivated is still the holder, and
 *     says so: `REQ-deactivate-and-reinstate` requires role detail to show "that
 *     the current holder's operator access is deactivated" instead of a vacancy,
 *     and the index would be lying if it disagreed with the page behind it.
 *   * A seat whose operating year does not exist yet is not vacant — nobody has
 *     ended anything. Coaching seats hang off the season, and a club between
 *     seasons has none.
 */
export function describeHolders(role: {
  readonly vacant: boolean;
  readonly cycleMissing: boolean;
  readonly holders: readonly {
    readonly displayName: string;
    readonly scheduled: boolean;
    readonly accessDeactivated: boolean;
    readonly operatorState: OperatorAccountState | null;
  }[];
}): string {
  if (role.cycleMissing) return "No season under way";
  if (role.vacant) return NOT_ASSIGNED;

  return role.holders
    .map((holder) => {
      const notes: string[] = [];
      if (holder.scheduled) notes.push("not started yet");
      if (holder.accessDeactivated) notes.push("access deactivated");
      return notes.length === 0
        ? holder.displayName
        : `${holder.displayName} (${notes.join(", ")})`;
    })
    .join(", ");
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * The plain-language Permissions summary for one seat, and whether it is empty.
 *
 * `describeRoleCapabilities()` is the projection `REQ-capability-copy-consistency`
 * requires — "derived from the same reviewed capability definition used by
 * server enforcement, so a later approved grant change updates authorization and
 * plain-language UI copy together". Nothing here writes a capability sentence,
 * and nothing here may: the phrases are the map's own `action` strings, which
 * are already the words a refusal quotes.
 *
 * `empty` exists because the two cases read differently. Ten of the twenty seats
 * hold nothing, and their summary is one complete sentence saying so; the others
 * are a list of verb phrases that needs a subject in front of it.
 */
export function permissionsSummary(code: string): {
  readonly empty: boolean;
  readonly items: readonly string[];
} {
  const described = describeRoleCapabilities(code);
  const empty = described.length === 1 && described[0] === NO_CAPABILITY_SUMMARY;
  return { empty, items: described };
}

/** The same summary as one line, in full. Role detail shows every phrase. */
export function permissionsLine(code: string): string {
  const { empty, items } = permissionsSummary(code);
  return empty ? items[0] : `Can ${items.join("; ")}.`;
}

/**
 * How many phrases the Roles **index** shows before it stops.
 *
 * The catalogue's strongest seats hold nine capabilities, and nine verb phrases
 * in a table cell is a paragraph: it dwarfs the seat's own name and the holder
 * beside it, which are what a reader scanning twenty rows is looking for. The
 * reviewed prototype's third column is one short line per seat, and this is the
 * nearest honest equivalent — a shortened summary that says it is shortened,
 * with the complete one on the seat's own page.
 *
 * Three is a presentation choice and nothing is written or reworded to fit it:
 * every phrase shown is the capability map's own, in the map's own order, and
 * the remainder is counted rather than elided silently.
 */
const INDEX_PERMISSION_PHRASES = 3;

/** The shortened summary the Roles index shows, and its full form on detail. */
export function permissionsPreview(code: string): string {
  const { empty, items } = permissionsSummary(code);
  if (empty) return items[0];
  if (items.length <= INDEX_PERMISSION_PHRASES) return `Can ${items.join("; ")}.`;

  const shown = items.slice(0, INDEX_PERMISSION_PHRASES).join("; ");
  const remaining = items.length - INDEX_PERMISSION_PHRASES;
  return `Can ${shown}; and ${remaining} more.`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * A calendar date, as a `date` column stores one. Not a validity check — a
 * shape, and it is the shape that decides how the value is read.
 */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The moment to render, and the zone to render it in.
 *
 * Administration receives dates in three shapes and they are **not**
 * interchangeable, which the agent's browser preflight proved the hard way: an
 * audit entry's `occurredAt` is a full ISO instant, and reading a string as a
 * calendar date built `new Date("2026-08-20T00:39:14.123Z" + "T00:00:00Z")`,
 * which is an invalid date, which threw out of `Intl.DateTimeFormat` and took
 * the whole server-rendered page down with it.
 *
 *   * `YYYY-MM-DD` — a stored calendar date. It has no time and no zone, and is
 *     read and rendered as UTC so that "2026-08-18" is 18 August everywhere.
 *     The same rule `events/presentation.ts` follows for `scheduled_on`.
 *   * any other string — an ISO instant, rendered on club time.
 *   * a `Date` — an instant already, likewise.
 *
 * `null` for anything that does not parse. A history surface that throws is
 * worse than one that shows a raw value: the value is still the truth, and the
 * page still renders around it.
 */
function toInstant(value: Date | string): { instant: Date; zone: string } | null {
  if (typeof value !== "string") {
    return Number.isNaN(value.getTime()) ? null : { instant: value, zone: CLUB_TIME_ZONE };
  }

  const calendarDate = CALENDAR_DATE.test(value);
  const instant = new Date(calendarDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(instant.getTime())) return null;
  return { instant, zone: calendarDate ? "UTC" : CLUB_TIME_ZONE };
}

function part(
  moment: { instant: Date; zone: string },
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: moment.zone }).format(
    moment.instant,
  );
}

/** "18 Aug 2026" — a calendar date, or an instant reduced to its day. */
export function formatDay(value: Date | string): string {
  const moment = toInstant(value);
  if (!moment) return String(value);
  return `${part(moment, { day: "numeric" })} ${part(moment, { month: "short" })} ${part(moment, {
    year: "numeric",
  })}`;
}

/** "18 Aug 2026, 14:22" — a recorded moment, in the club's own time. */
export function formatInstant(value: Date | string): string {
  const moment = toInstant(value);
  if (!moment) return String(value);
  return `${formatDay(value)}, ${part(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

/**
 * How one assignment's period reads: "From 18 Aug 2026", "18 Aug 2026 – 1 Jun
 * 2027", or "Starts 1 Sep 2026" for a seat that has not begun.
 *
 * `REQ-effective-dated-role-history` asks for "no routine end date", so an open
 * period is the ordinary case and reads as one rather than as "18 Aug 2026 –
 * null".
 */
export function describePeriod(assignment: {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean;
}): string {
  const from = formatDay(assignment.effectiveFrom);
  if (assignment.scheduled) {
    return assignment.effectiveTo
      ? `Starts ${from}, ends ${formatDay(assignment.effectiveTo)}`
      : `Starts ${from}`;
  }
  return assignment.effectiveTo ? `${from} – ${formatDay(assignment.effectiveTo)}` : `From ${from}`;
}

/** Everything this club does is on club time. */
const CLUB_TIME_ZONE = "Europe/London";

// ---------------------------------------------------------------------------
// Player membership
// ---------------------------------------------------------------------------

/**
 * The stored membership status, in the club's words.
 *
 * Reusing the roster's own map rather than writing a second one. That map's own
 * note says why it exists — LAN-90 § 4 requires the mapping "to be decided once
 * and used everywhere, so three issues do not invent three labels for one
 * state" — and Administration showing a player's membership is a fourth screen,
 * not an exception.
 */
export function membershipStatusLabel(status: string): string {
  return labelFor(MEMBERSHIP_STATUS_LABELS, status);
}
