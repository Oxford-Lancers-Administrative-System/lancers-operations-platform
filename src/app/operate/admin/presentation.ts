import { SHORT_MONTHS } from "@/lib/services/event-vocabulary";
import {
  describeLeadershipLimits,
  describeRoleCapabilities,
  NO_CAPABILITY_SUMMARY,
} from "@/lib/auth/capabilities";
import { CLUB_TIME_ZONE, formatClubDay, UNREADABLE_DATE } from "@/lib/club-time";
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
 * ## Somebody appears under every part of the club they serve
 *
 * An operator holding seats in more than one group appears in **each** of those
 * sections, once per section — LAN-141 finding 9. The first version placed each
 * account once, under the earliest group it sat in, and the consequence was
 * that a coach who also held a committee seat was absent from **Coaches**
 * entirely. `DEC-one-person-multiple-capacities` makes that combination
 * ordinary rather than exotic ("a returning player who becomes a coach or an
 * officer keeps the same record"), and `REQ-coach-operator-onboarding` requires
 * Administration to "visually separate Coaching Staff" — a Coaches section that
 * silently omits some of the club's coaches does not separate them, it hides
 * them.
 *
 * The objection the first version recorded was that listing an account twice
 * makes the page's own count wrong. It does not: the heading counts operator
 * *accounts*, which the directory supplies, and no section carries a count. The
 * second objection — two different-looking routes to one record — was never
 * true either; both rows link to the same page, and each row still names every
 * seat the person holds, so a reader meeting them under Coaches can see at once
 * that they are also on the committee.
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

  const place = (code: string, label: string, sort: number, operator: DirectoryOperator): void => {
    const section = sections.get(code);
    if (section) section.operators.push(operator);
    else sections.set(code, { sort, label, operators: [operator] });
  };

  for (const operator of operators) {
    const groups = distinctGroups(operator.roles);

    if (groups.length === 0) {
      // The remainder sorts after every real group. `Number.MAX_SAFE_INTEGER`
      // rather than a large literal, so a catalogue with many groups cannot
      // overtake it.
      place("", UNASSIGNED_SECTION_LABEL, Number.MAX_SAFE_INTEGER, operator);
      continue;
    }

    for (const group of groups) {
      place(
        group.groupCode,
        sectionLabelForGroup(group.groupCode, group.groupLabel),
        group.groupSortOrder,
        operator,
      );
    }
  }

  return [...sections.entries()]
    .sort((left, right) => left[1].sort - right[1].sort)
    .map(([code, section]) => ({ code, label: section.label, operators: section.operators }));
}

/** Every catalogue group this operator holds a seat in, in the catalogue's order. */
function distinctGroups(roles: readonly DirectoryRole[]): readonly DirectoryRole[] {
  const seen = new Map<string, DirectoryRole>();
  for (const role of roles) if (!seen.has(role.groupCode)) seen.set(role.groupCode, role);
  return [...seen.values()].sort((left, right) => left.groupSortOrder - right.groupSortOrder);
}

/**
 * The seats an operator holds, as one line: "President \u00b7 Wide Receivers Coach".
 *
 * "No current role" rather than an empty cell, for the reason every label map in
 * this repository keeps a fallback: a blank reads as an omission.
 *
 * A seat that has not begun is named **and dated**, under the same rule the
 * roles index follows: the current answer is never replaced, and a date the
 * club already knows is never withheld. The reader of this column was
 * previously told "Offensive Coordinator" flatly about somebody who does not
 * hold it until September — the third surface to answer "who holds this seat"
 * differently from the other two, and the one Brian had not yet reached.
 */
export function describeSeats(roles: readonly DirectoryRole[]): string {
  if (roles.length === 0) return "No current role";
  return roles.map(describeSeat).join(" \u00b7 ");
}

/**
 * One seat, with whichever of its two dates the club already knows.
 *
 * **A seat that is due to end says so** \u2014 LAN-141 finding 11. This column's own
 * note claimed to follow the roles index's rule and followed half of it: a
 * scheduled start was shown, a scheduled end was not, on the page an
 * administrator scans to see who is leaving. Brian's ruling was both directions
 * at once \u2014 "I like showing the successors and also showing people when they
 * go" \u2014 and one of them had quietly not shipped.
 */
function describeSeat(role: DirectoryRole): string {
  const notes: string[] = [];
  if (role.scheduled) notes.push(`from ${formatDay(role.effectiveFrom)}`);
  // The same word `describeHolders()` uses for the same fact, so the two
  // columns cannot describe one departure in two ways.
  if (role.effectiveTo) notes.push(`ends ${formatDay(role.effectiveTo)}`);
  return notes.length === 0 ? role.label : `${role.label} (${notes.join(", ")})`;
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
    // "Failed" alone was the answer when the moment had not been recorded, and
    // it is a word rather than a sentence — LAN-141. Beside a chip that already
    // reads "Delivery failed" it says nothing at all, and it does not say that
    // the missing part is the *time* rather than the failure.
    const when = operator.deliveryFailedAt
      ? `Failed ${formatInstant(operator.deliveryFailedAt)}`
      : "Failed, at a time that was not recorded";
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
 * What a seat says when the operating year it hangs off does not exist, and
 * nobody holds it either.
 *
 * Two sentences because there are two cycles. Coaching seats hang off the
 * season; the ten committee seats hang off the committee year, and telling a
 * reader of the Treasurer's row that there is "no season under way" is an
 * answer to a question nobody asked.
 */
export const NO_CYCLE: Readonly<Record<"committee_year" | "season", string>> = Object.freeze({
  committee_year: "No committee year recorded",
  season: "No season under way",
});

/**
 * Who holds one seat, as the Roles index says it.
 *
 * Four states, and Brian fixed all four on 20 August 2026 after seeing the
 * first two: "Don't do the strict version. I like showing the successors and
 * also showing people when they go."
 *
 * | Situation                     | Reads                                    |
 * | ----------------------------- | ---------------------------------------- |
 * | Filled, no end date           | the holder alone                         |
 * | Filled, with an end recorded  | the holder, and when it ends             |
 * | Vacant, successor recorded    | Not assigned, and who starts when        |
 * | Vacant, nobody recorded       | Not assigned alone                       |
 *
 * **The current answer is always first, and is never replaced.** A seat nobody
 * holds today reads `Not assigned` even when a successor starts next week, and
 * a seat held today names its holder even though the assignment ends on Friday.
 * `REQ-admin-surfaces` asks the top level for current holders and that is what
 * the head of every cell is; the scheduled half is context after it, never
 * instead of it.
 *
 * The reason it is there at all is the one Brian gave for wanting both
 * directions: he does not want to find out that a seat is uncovered on the day
 * it empties, and he does not want to find out that somebody has left after
 * they have gone. Both are the same complaint about being surprised by a date
 * the club already knew.
 *
 * Three further facts survive from before and are unchanged:
 *
 *   * **Not assigned** is a real state and the *only* thing that produces it is
 *     a seat nobody holds today (`DEC-account-state-separation`: "only End role
 *     creates a Not assigned vacancy"). It is never what a deactivated account
 *     looks like.
 *   * A holder whose operator access is deactivated is still the holder, and
 *     says so: `REQ-deactivate-and-reinstate` requires role detail to show "that
 *     the current holder's operator access is deactivated" instead of a vacancy,
 *     and the index would be lying if it disagreed with the page behind it.
 *   * A seat whose operating year does not exist yet is not vacant — nobody has
 *     ended anything. Coaching seats hang off the season, and a club between
 *     seasons has none.
 */
export function describeHolders(role: {
  readonly scope: "committee_year" | "season";
  readonly vacant: boolean;
  readonly cycleMissing: boolean;
  readonly holders: readonly {
    readonly displayName: string;
    readonly effectiveTo: string | null;
    readonly scheduled: boolean;
    readonly accessDeactivated: boolean;
    readonly operatorState: OperatorAccountState | null;
  }[];
  /** Recorded to start later. Never holders, and never a substitute for one. */
  readonly scheduled?: readonly {
    readonly displayName: string;
    readonly effectiveFrom: string;
  }[];
}): string {
  const arriving = (role.scheduled ?? [])
    .map((entry) => `${entry.displayName} from ${formatDay(entry.effectiveFrom)}`)
    .join(", ");

  // The cycle is the *last* thing consulted, not the first — LAN-141 finding 4.
  // It used to short-circuit ahead of the holders, and because assignments are
  // written open-ended and a `closing` season is not an "active" one, every
  // coaching seat in the club read "No season under way" while role detail
  // named the live holder and the Operators index printed a third answer. A
  // missing cycle is only an answer when there is no holder to give instead.
  if (role.holders.length === 0 && arriving === "" && role.cycleMissing) {
    return NO_CYCLE[role.scope];
  }

  const current = role.vacant
    ? NOT_ASSIGNED
    : role.holders
        .map((holder) => {
          const notes: string[] = [];
          if (holder.accessDeactivated) notes.push("access deactivated");
          // Half-open, and shown the way `describePeriod` shows it, so the two
          // renderings of the same date cannot drift apart.
          if (holder.effectiveTo) notes.push(`ends ${formatDay(holder.effectiveTo)}`);
          return notes.length === 0
            ? holder.displayName
            : `${holder.displayName} (${notes.join(", ")})`;
        })
        .join(", ");

  return arriving === "" ? current : `${current} \u00b7 ${arriving}`;
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
 * What one seat may **not** do, as one sentence, or `null`.
 *
 * The other half of the Permissions panel — LAN-141 finding 10, and the
 * prototype's own second paragraph. General Manager and President hold the same
 * nine grants and produced word-for-word identical summaries, in the mission
 * whose subtlest locked decision is that one of them outranks the other; what
 * separates them is which protected seats they may act on, and that is already
 * data. `describeLeadershipLimits()` reads it.
 *
 * `null` for the seventeen seats that do not administer at all. Telling a Kit
 * Manager which seats they may not manage would imply they may manage the rest.
 */
export function limitsLine(code: string): string | null {
  const limits = describeLeadershipLimits(code);
  return limits.length === 0 ? null : `Cannot ${limits.join("; ")}.`;
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

export { UNREADABLE_DATE } from "@/lib/club-time";

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
 * `null` for anything that does not parse, which the two formatters render as
 * {@link UNREADABLE_DATE}. A history surface that throws is worse than one that
 * says a value could not be read — one bad row must not take the other twenty
 * with it. Showing the raw value instead was the first answer and was wrong in
 * both directions (LAN-141): `"2026-13-45"` reached the screen unchanged, and an
 * invalid `Date` reached it as the string `"Invalid Date"`, on pages where every
 * other date reads `27 Aug 2026`.
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
  if (typeof value === "string" && CALENDAR_DATE.test(value)) return formatClubDay(value);

  const moment = toInstant(value);
  if (!moment) return UNREADABLE_DATE;
  // LAN-225, audit A6: one short-month form for the whole application. ICU
  // renders September as "Sept" on some builds; the vocabulary's own list does not.
  const month = SHORT_MONTHS[Number(part(moment, { month: "numeric" })) - 1] ?? "";
  return `${part(moment, { day: "numeric" })} ${month} ${part(moment, { year: "numeric" })}`;
}

/** "18 Aug 2026, 14:22" — a recorded moment, in the club's own time. */
export function formatInstant(value: Date | string): string {
  const moment = toInstant(value);
  if (!moment) return UNREADABLE_DATE;
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
