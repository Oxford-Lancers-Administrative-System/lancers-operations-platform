/**
 * The participation table's vocabulary, its shapes, and the two pure functions
 * that filter and sort it — W7, REQ-participation-table. LAN-157.
 *
 * ## Why this is a separate module
 *
 * The same split `./attendance-vocabulary.ts` makes, for the same reason:
 * `./participation.ts` is `server-only` and reaches `pg`, and the filter bar is
 * a client component. A client component importing the capacity labels from the
 * service would drag the PostgreSQL driver into the browser bundle, and the
 * build refuses it in those words.
 *
 * ## The tier is in the type, not in a flag
 *
 * `ClubLinkParticipation` and `OperatorParticipation` are two types rather than
 * one type with `delivery?: …`, and `ClubLinkEvent` has no `joiningUrl` **key**
 * rather than a null one. That is deliberate. The acceptance criterion is that
 * no club-link response carries the joining URL or the delivery column "in the
 * page or in any payload behind it" — and a field that is never assigned cannot
 * reach a payload, whereas a field the component chooses not to render is one
 * refactor away from the DOM.
 *
 * ## What the two types do and do not buy — R157-B5
 *
 * They stop a *rendering* mistake: a component holding `ClubLinkParticipation`
 * has no `delivery` to print and no `joiningUrl` to leak, and that is real.
 *
 * They do **not** make the boundary compiler-enforced, and this file used to
 * say they did. TypeScript rejects an unknown property only on a *fresh* object
 * literal, and freshness is lost through `.map()` — so adding
 * `delivery: person.delivery` to the club-link row literal in
 * `./participation.ts` type-checks cleanly and ships the column. What holds the
 * boundary is the separate per-tier query, which never selects the column, plus
 * the field-by-field reassembly of each row. What proves it is the payload
 * assertions in `./participation.test.ts`, which are the only thing in this
 * repository that fails when the literal is widened.
 */

import type { AttendancePresence } from "./attendance-vocabulary";
import type { DerivedDiscrepancy } from "./discrepancy-vocabulary";
import type { DeliveryState } from "./delivery";

/**
 * Who may read a participation table. Delivery is the only difference (D3).
 *
 * R157-B7. This is `@/lib/auth/event-tier`'s `EventReadTier` with `public`
 * removed, and it is a separate declaration rather than an import for one
 * mundane reason: that module is `server-only`, and this one is imported by the
 * filter bar, which is a client component. The two are pinned together by a
 * compile-time assertion in `src/lib/auth/event-tier.test.ts`, so they cannot
 * drift into being two vocabularies.
 *
 * They do not collapse into one type. `EventReadTier` includes `public`, and
 * there is no public participation payload for a `tier: "public"` to
 * discriminate — `Participation` could not represent it, and every switch over
 * the tier would gain a branch that cannot occur. Narrowing is the honest
 * relationship, and the assertion is what makes it provable.
 */
export type ParticipationTier = "operator" | "club_link";

// ---------------------------------------------------------------------------
// The discrepancy marker — D64, and Q4 answered
// ---------------------------------------------------------------------------

/**
 * Q4 asked whether the RSVP-versus-attendance discrepancy is a column, a flag,
 * or derived from the two columns. **It is derived**, and the reasoning is
 * worth keeping next to the code that does it.
 *
 *   1. **The approved mockup derives it.** W7's table marks Alaric Brindlewood
 *      (yes, then absent) and Cassian Wolvercote (never answered, then present)
 *      with the same `≠` beside the name, and marks neither in a column of its
 *      own. It also marks a case `public.rsvp_attendance_mismatches` does not
 *      classify at all — "never answered, attended" — so reading the view would
 *      not have reproduced the screen Brian approved.
 *
 *   2. **The stored view flags nothing during the session.** Its
 *      `occurred_events` term requires `scheduled_on < today` in Europe/London,
 *      so on the evening of the event — exactly when the register is open and
 *      being filled, and exactly when a coach would notice somebody who said no
 *      standing on the pitch — it emits no row at all. D64's marker would
 *      appear the following morning. Deriving it here has no date term and is
 *      therefore correct at the moment it is useful. This is the finding
 *      carried into this package, and this is the answer to it.
 *
 *   3. **Derived cannot be auto-reconciled.** D64 and the frozen model both say
 *      the mismatch is never silently reconciled. There is no row to update, no
 *      column to clear and no control that clears one: the marker is a function
 *      of two authoritative records, and the only way to change it is to change
 *      one of them on its own surface.
 *
 *   4. **It costs no migration.** This package owns none.
 *
 * A column or a stored flag remains available later; nothing here forecloses
 * it, which is what the packet meant by "it can change".
 *
 * ## Where the two vocabularies differ, and why they are spelled the same
 *
 * R157-B3. The classes are named in `./discrepancy-vocabulary.ts`, which is
 * also where the divergence from `public.rsvp_attendance_mismatches` is stated
 * once, for both readers. The shared cases now carry the **stored** spelling —
 * `said_no_but_attended`, not `said_no_attended` — because the stored one is in
 * shipped migrations and cannot be renamed without one, and because two
 * near-identical spellings are what a future join or report mapping misses in
 * silence.
 */
export type ParticipationDiscrepancy = DerivedDiscrepancy;

/**
 * The marker for one person, or `null`.
 *
 * **Both records must exist.** A person who said yes and is not on the sheet is
 * not a disagreement — it is an absence, and the club already has a word for
 * it: *not recorded*. That is the rule LAN-152 wrote when the board reported
 * "0 recorded, 30 mismatches", and it is the same rule one row at a time: a
 * half-filled register must not accuse the half nobody has reached yet.
 *
 * `excused` never marks. It is a recorded, accepted absence, and calling it a
 * discrepancy would make the marker a judgement — which the workflow says in
 * as many words it is not.
 *
 * A walk-up never marks either. The mockup leaves Wilfrid Danecroft unmarked:
 * the Capacity column already says **Walk-up** and the Invitation column
 * already reads "—", so a marker beside the name would say a third time what
 * the row says twice.
 */
export function discrepancyFor(input: {
  answer: "yes" | "no" | null;
  presence: AttendancePresence | null;
  isWalkUp: boolean;
}): ParticipationDiscrepancy | null {
  if (input.isWalkUp) return null;
  if (input.presence === null) return null;

  if (input.answer === "yes" && input.presence === "absent") return "said_yes_marked_absent";
  if (input.presence !== "present" && input.presence !== "late") return null;
  if (input.answer === "no") return "said_no_but_attended";
  if (input.answer === null) return "never_answered_attended";
  return null;
}

// ---------------------------------------------------------------------------
// The row, and the two payloads
// ---------------------------------------------------------------------------

export interface ParticipationQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: string;
  readonly sortOrder: number;
  /**
   * `event_questions.applies_to_capacities`. Capacity decides which questions
   * apply, and a null answer from somebody the question does not apply to means
   * "not applicable to this invitee", never "no answer" — which is why the
   * counts below need it.
   */
  readonly appliesToCapacities: readonly string[];
  /**
   * `event_questions.choices`, present only for `answerType === "choice"`.
   * LAN-170's recording form needs the actual options to offer; nothing before
   * it read this far into a question, so it was never surfaced. Optional so
   * every fixture in this file's own tests and in `screens.test.tsx` that
   * predates the field keeps compiling — treat a missing key the same as
   * `null`. Carried at both tiers, unlike `delivery` and `invitationId`: a
   * question's own defined options are not the kind of fact D3 gates.
   */
  readonly choices?: readonly string[] | null;
  /**
   * `event_questions.is_required` — whether the event marks this question
   * required *of the player*. OWNER-LAN170-08 (correction round 3): the
   * recording form has to say so without implying the same is true of
   * recording it, since it never is — `REQ-questions-in-the-same-form`
   * itself says the event's questions "never block the answer". Optional,
   * defaulting to `false`, for the same fixture-compatibility reason
   * `choices` is.
   */
  readonly isRequired?: boolean;
}

/** One line of the collapsed Questions section — D68. */
export interface QuestionTally {
  readonly label: string;
  readonly count: number;
}

export interface QuestionSummary {
  readonly question: ParticipationQuestion;
  /** People this question applies to at all. The denominator. */
  readonly applicable: number;
  /** Each stored answer and how many gave it, commonest first. */
  readonly answers: readonly QuestionTally[];
  /** Applicable people with nothing stored. */
  readonly noAnswer: number;
}

/**
 * D68's counts, from the rows the table already has.
 *
 * Computed here rather than by a second query, so the collapsed section and the
 * per-person columns cannot disagree — `docs/ux/standards.md` rule 7 is exactly
 * about two readers of one fact.
 *
 * A walk-up is not in the denominator: nobody asked them anything.
 */
export function summariseQuestion(
  people: readonly ParticipationPerson[],
  question: ParticipationQuestion,
): QuestionSummary {
  const applies = people.filter(
    (person) => !person.isWalkUp && question.appliesToCapacities.includes(person.capacity),
  );

  const tally = new Map<string, number>();
  let noAnswer = 0;
  for (const person of applies) {
    const answer = person.answers[question.id];
    if (answer === undefined || answer === "") noAnswer += 1;
    else tally.set(answer, (tally.get(answer) ?? 0) + 1);
  }

  const answers = [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  return { question, applicable: applies.length, answers, noAnswer };
}

/**
 * One person, at the club-link tier. There is no delivery field on this type,
 * which is what makes D3 structural rather than a rendering decision.
 */
export interface ParticipationPerson {
  /** `capacity:anchorId`. Stable, and never a description of anything. */
  readonly key: string;
  readonly displayName: string;
  /** `public.invitation_capacity`, or `null` for a walk-up with none recorded. */
  readonly capacity: string;
  /** Invariant P6: attended, never asked. */
  readonly isWalkUp: boolean;
  /** `invitations.issued_at`, ISO-8601, or `null` when it has not gone. */
  readonly invitedAt: string | null;
  /** The standing answer. `null` is "no answer", and for a walk-up "not asked". */
  readonly answer: "yes" | "no" | null;
  /** Their words, when they said no. */
  readonly reason: string | null;
  /** The latest committed presence, or `null` for not recorded. */
  readonly presence: AttendancePresence | null;
  readonly discrepancy: ParticipationDiscrepancy | null;
  /** Keyed by `ParticipationQuestion.id`. A missing key is no stored answer. */
  readonly answers: Readonly<Record<string, string>>;
}

/** One person, at the operator tier: the same row plus D3's one addition. */
export interface OperatorParticipationPerson extends ParticipationPerson {
  /** `null` when nothing has been queued for them at all. */
  readonly delivery: DeliveryState | null;
  /**
   * `invitations.id`, or `null` for a walk-up who was never invited.
   *
   * LAN-170's `RecordAnswerControl` needs the actual invitation to record
   * against, and `key` deliberately is not it — `key` is
   * `capacity:anchorId`, stable across a person's whole history at this
   * event, while a real write needs the row itself. Off `ParticipationPerson`
   * and off the club-link reassembly in `buildClubLinkParticipationIn`, the
   * same way `delivery` is: a club-link reader records nothing, so it is
   * never handed the id to record against.
   *
   * Optional so every existing fixture in `participation-view.test.ts` and
   * `screens.test.tsx` keeps compiling — the real payload always sets it.
   */
  readonly invitationId?: string | null;
}

interface EventFactsBase {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly eventType: string;
  readonly scheduledOn: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  /** `in_person` or `online` (D20, D21). The venue field means both. */
  readonly deliveryMode: string;
  readonly description: string | null;
  readonly requiredEquipment: string | null;
  /** D22's attendance expectation, as the one boolean the schema stores. */
  readonly isMandatory: boolean;
  readonly termLabel: string | null;
  readonly weekNumber: number | null;
}

/**
 * What a club-link reader is told about the event.
 *
 * REQ-no-joining-url: there is no `joiningUrl` key here, so no code path can
 * put one in this object and no serialisation of it can carry one.
 */
export type ClubLinkEvent = EventFactsBase;

export interface OperatorEvent extends EventFactsBase {
  readonly joiningUrl: string | null;
}

/** The three headline numbers, as W7 § "The three headline numbers" states them. */
export interface ParticipationHeadline {
  readonly invited: number;
  readonly saidYes: number;
  readonly showed: number;
  /** D74: `false` means `Showed / Invited` reads "NA / 47", never "0 / 47". */
  readonly registerSaved: boolean;
}

export interface ClubLinkParticipation {
  readonly tier: "club_link";
  readonly event: ClubLinkEvent;
  readonly questions: readonly ParticipationQuestion[];
  readonly people: readonly ParticipationPerson[];
  readonly headline: ParticipationHeadline;
}

export interface OperatorParticipation {
  readonly tier: "operator";
  readonly event: OperatorEvent;
  readonly questions: readonly ParticipationQuestion[];
  readonly people: readonly OperatorParticipationPerson[];
  readonly headline: ParticipationHeadline;
}

export type Participation = ClubLinkParticipation | OperatorParticipation;

// ---------------------------------------------------------------------------
// Filtering and sorting
// ---------------------------------------------------------------------------

/**
 * The query keys the table reads. In the URL, for the reason the roster, the
 * events list and the attendance board all put theirs there: a filtered table
 * is a link, the back button behaves, and the club link an operator shares can
 * carry a filter if they want it to.
 */
export const PARTICIPATION_PARAMS = Object.freeze({
  search: "q",
  capacity: "as",
  answer: "answer",
  attendance: "att",
  delivery: "delivery",
  sort: "sort",
  direction: "dir",
});

/**
 * Every `DeliveryState` a `?delivery=` value may name, plus `none`.
 *
 * Written out here rather than imported from `./delivery`, which is
 * `server-only` and would reach the browser through the filter bar. The
 * assertion below is what keeps the two from drifting: a `DeliveryState`
 * that is not listed here fails compilation rather than becoming a filter value
 * that silently matches nothing. `held` and `cancelled` (LAN-156) joined the
 * five provider outcomes after this list was first written, which is exactly
 * the drift the assertion exists to catch — it did.
 */
export const DELIVERY_FILTERS = Object.freeze([
  "queued",
  "attempted",
  "delivered",
  "failed",
  "retryable",
  "held",
  "cancelled",
  "none",
] as const);

type UnlistedDeliveryState = Exclude<DeliveryState, (typeof DELIVERY_FILTERS)[number]>;
type _EveryDeliveryStateIsFilterable = UnlistedDeliveryState extends never ? true : never;
const _deliveryFiltersCoverEveryState: _EveryDeliveryStateIsFilterable = true;
void _deliveryFiltersCoverEveryState;

export interface ParticipationFilters {
  readonly search: string;
  readonly capacity: string;
  readonly answer: string;
  readonly attendance: string;
  /**
   * Only ever set at the operator tier. `readParticipationFilters` drops it at
   * every other tier, so a club-link reader cannot reach a filter their page
   * has no control for (R157-F9a).
   */
  readonly delivery: string;
  readonly sort: string;
  readonly direction: string;
}

export const EMPTY_FILTERS: ParticipationFilters = Object.freeze({
  search: "",
  capacity: "",
  answer: "",
  attendance: "",
  delivery: "",
  sort: "",
  direction: "",
});

/** The fixed columns every tier sorts by. Question columns add `q:<id>`. */
export const PARTICIPATION_SORT_COLUMNS = Object.freeze([
  "name",
  "capacity",
  "invited",
  "delivery",
  "answer",
  "reason",
  "attendance",
] as const);

/** `answer=` accepts these three, and "no answer" is a real, filterable state. */
export const ANSWER_FILTERS = Object.freeze(["yes", "no", "none"] as const);

/** `att=` accepts the four presences plus the absence of a record. */
export const ATTENDANCE_FILTERS = Object.freeze([
  "present",
  "late",
  "excused",
  "absent",
  "not_recorded",
] as const);

/** A row's sortable value for one column, as a comparable string or number. */
function sortValue(person: ParticipationPerson, column: string): string | number {
  switch (column) {
    case "capacity":
      return person.isWalkUp ? "￿walk-up" : person.capacity;
    case "invited":
      // Walk-ups and un-issued invitations sort last in ascending order rather
      // than first: "" would put every one of them above the earliest real
      // timestamp, and "who was asked first" is the question being asked.
      return person.invitedAt ?? "￿";
    case "delivery":
      return (person as OperatorParticipationPerson).delivery ?? "￿";
    case "answer":
      return person.answer ?? "￿";
    case "reason":
      return person.reason?.toLocaleLowerCase() ?? "￿";
    case "attendance":
      return person.presence ?? "￿";
    case "name":
      return person.displayName.toLocaleLowerCase();
    default:
      if (column.startsWith("q:")) return person.answers[column.slice(2)] ?? "￿";
      return person.displayName.toLocaleLowerCase();
  }
}

/**
 * Whether `sort` names something this table can sort by.
 *
 * A whitelist, and the question half is checked against the event's own
 * questions rather than against the shape of the string: `q:<anything>` from a
 * query string must not select a column, because the next thing somebody does
 * with an unvalidated sort key is interpolate it.
 */
export function isParticipationSort(
  sort: string,
  questions: readonly ParticipationQuestion[],
): boolean {
  if ((PARTICIPATION_SORT_COLUMNS as readonly string[]).includes(sort)) return true;
  return questions.some((question) => `q:${question.id}` === sort);
}

function matchesSearch(person: ParticipationPerson, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();
  if (term === "") return true;
  return person.displayName.toLocaleLowerCase().includes(term);
}

function matchesAnswer(person: ParticipationPerson, answer: string): boolean {
  if (answer === "") return true;
  if (answer === "none") return person.answer === null;
  return person.answer === answer;
}

function matchesAttendance(person: ParticipationPerson, attendance: string): boolean {
  if (attendance === "") return true;
  if (attendance === "not_recorded") return person.presence === null;
  return person.presence === attendance;
}

function matchesCapacity(person: ParticipationPerson, capacity: string): boolean {
  if (capacity === "") return true;
  if (capacity === "walk_up") return person.isWalkUp;
  return !person.isWalkUp && person.capacity === capacity;
}

function matchesDelivery(person: ParticipationPerson, delivery: string): boolean {
  if (delivery === "") return true;
  const state = (person as OperatorParticipationPerson).delivery ?? null;
  if (delivery === "none") return state === null;
  return state === delivery;
}

/**
 * The filtered, sorted rows — one pure function, so the operator table and the
 * club-link table cannot drift apart.
 *
 * Every filter combines with every other (W7: "the filters combine and apply as
 * you type"), and `delivery` is simply never populated at the club-link tier,
 * where the column does not exist.
 *
 * The sort is **stable and total**: ties fall back to the display name, so two
 * people with the same answer come out in the same order on every render. An
 * unstable order on a table somebody is reading down is a table that appears to
 * shuffle itself.
 *
 * The tie-break stays **ascending** in both directions, and that is deliberate.
 * Sorting descending by Answer puts the people who have not answered at the
 * top, and A before Z inside that group is predictable; reversing the names as
 * well would be a second reversal nobody asked for.
 */
export function applyParticipationView<T extends ParticipationPerson>(
  people: readonly T[],
  filters: ParticipationFilters,
  questions: readonly ParticipationQuestion[] = [],
): readonly T[] {
  const matched = people.filter(
    (person) =>
      matchesSearch(person, filters.search) &&
      matchesCapacity(person, filters.capacity) &&
      matchesAnswer(person, filters.answer) &&
      matchesAttendance(person, filters.attendance) &&
      matchesDelivery(person, filters.delivery),
  );

  const column = isParticipationSort(filters.sort, questions) ? filters.sort : "name";
  const descending = filters.direction === "desc";

  return [...matched].sort((left, right) => {
    const a = sortValue(left, column);
    const b = sortValue(right, column);
    let order = 0;
    if (typeof a === "number" && typeof b === "number") order = a - b;
    else order = String(a).localeCompare(String(b));
    if (order === 0) {
      order = left.displayName.localeCompare(right.displayName);
      // The name column already sorted by name; a tie there is two people with
      // the same name, and the key is the only thing left that distinguishes
      // them. Without this the order depends on the database's row order.
      if (order === 0) return left.key.localeCompare(right.key);
      return order;
    }
    return descending ? -order : order;
  });
}

/**
 * The href a column heading points at: sort by it, or reverse it if it is
 * already the sorted column.
 *
 * Every other filter is carried, because a table somebody has filtered down to
 * the eight people who have not answered must stay filtered when they sort it
 * by name. Dropping a filter on a sort is the defect that made the events list
 * appear to reset itself.
 */
export function participationSortHref(
  basePath: string,
  filters: ParticipationFilters,
  column: string,
): string {
  const active = (filters.sort === "" ? "name" : filters.sort) === column;
  const direction = active && filters.direction !== "desc" ? "desc" : "asc";
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value !== "") params.set(key, value);
  };
  set(PARTICIPATION_PARAMS.search, filters.search);
  set(PARTICIPATION_PARAMS.capacity, filters.capacity);
  set(PARTICIPATION_PARAMS.answer, filters.answer);
  set(PARTICIPATION_PARAMS.attendance, filters.attendance);
  set(PARTICIPATION_PARAMS.delivery, filters.delivery);
  params.set(PARTICIPATION_PARAMS.sort, column);
  params.set(PARTICIPATION_PARAMS.direction, direction);
  return `${basePath}?${params.toString()}`;
}

/** Which way the arrow points on a heading, for `TableSortLabel`. */
export function participationSortState(
  filters: ParticipationFilters,
  column: string,
): { active: boolean; direction: "asc" | "desc" } {
  const active = (filters.sort === "" ? "name" : filters.sort) === column;
  return { active, direction: active && filters.direction === "desc" ? "desc" : "asc" };
}

/**
 * The filters as they arrived, with anything unrecognised dropped.
 *
 * Unrecognised is dropped rather than refused, for the same reason the events
 * list does it: a stale link with a filter that no longer exists should show
 * the table, not an error.
 *
 * ## The tier is an argument, and it has no default
 *
 * R157-F9a. `?delivery=queued` on a club link used to empty the table: every
 * club-tier person has no delivery field, so nothing matched, and the reader
 * was told "No one matches these filters" for a filter their page has no
 * control for and no data behind. The value is now dropped unless the caller
 * says it is reading at the operator tier, and validated against
 * `DELIVERY_FILTERS` even then — an unrecognised state was previously accepted
 * whole and compared against a column.
 *
 * The parameter is required rather than defaulted, and deliberately so: a
 * default is a fail-open, and the tier is a fact every caller already knows.
 */
export function readParticipationFilters(
  query: Record<string, string | string[] | undefined>,
  questions: readonly ParticipationQuestion[],
  tier: ParticipationTier,
): ParticipationFilters {
  const one = (key: string): string => {
    const value = query[key];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" ? first : "";
  };

  const capacity = one(PARTICIPATION_PARAMS.capacity);
  const answer = one(PARTICIPATION_PARAMS.answer);
  const attendance = one(PARTICIPATION_PARAMS.attendance);
  const delivery = one(PARTICIPATION_PARAMS.delivery);
  const sort = one(PARTICIPATION_PARAMS.sort);
  const direction = one(PARTICIPATION_PARAMS.direction);

  return {
    search: one(PARTICIPATION_PARAMS.search),
    capacity,
    answer: (ANSWER_FILTERS as readonly string[]).includes(answer) ? answer : "",
    attendance: (ATTENDANCE_FILTERS as readonly string[]).includes(attendance) ? attendance : "",
    delivery:
      tier === "operator" && (DELIVERY_FILTERS as readonly string[]).includes(delivery)
        ? delivery
        : "",
    sort: isParticipationSort(sort, questions) ? sort : "",
    direction: direction === "desc" ? "desc" : direction === "asc" ? "asc" : "",
  };
}
