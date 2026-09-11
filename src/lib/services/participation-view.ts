// The participation table's vocabulary, shapes, and the two pure functions that filter and sort
// it — W7, REQ-participation-table, LAN-157. Separate from `./participation.ts` (`server-only`)
// because the filter bar is a client component.
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

import type { AttendancePresence } from "./attendance-vocabulary";
import type { DerivedDiscrepancy } from "./discrepancy-vocabulary";
import type { DeliveryState } from "./delivery";

/** Who may read a participation table; delivery is the only difference (D3). `EventReadTier` minus `public`, pinned by a compile-time assertion. */
export type ParticipationTier = "operator" | "club_link";

/** Q4: the RSVP-versus-attendance discrepancy is derived, not a column or flag — see decision history. */
export type ParticipationDiscrepancy = DerivedDiscrepancy;

/** The marker for one person, or `null`. Both records must exist; `excused` and a walk-up never mark — see decision history. */
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

export interface ParticipationQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: string;
  readonly sortOrder: number;
  readonly appliesToCapacities: readonly string[];
  readonly choices?: readonly string[] | null;
  readonly isRequired?: boolean;
}

interface QuestionTally {
  readonly label: string;
  readonly count: number;
}

export interface QuestionSummary {
  readonly question: ParticipationQuestion;
  readonly applicable: number;
  readonly answers: readonly QuestionTally[];
  readonly noAnswer: number;
}

/** D68's counts, from the rows the table already has (not a second query, so the two cannot disagree). A walk-up is not in the denominator. */
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

/** One person, at the club-link tier. No delivery field — D3 is structural here, not a rendering decision. */
export interface ParticipationPerson {
  readonly key: string;
  readonly displayName: string;
  readonly capacity: string;
  readonly isWalkUp: boolean;
  readonly invitedAt: string | null;
  readonly answer: "yes" | "no" | null;
  readonly reason: string | null;
  readonly presence: AttendancePresence | null;
  readonly discrepancy: ParticipationDiscrepancy | null;
  readonly answers: Readonly<Record<string, string>>;
}

/** One person, at the operator tier: the same row plus D3's one addition. */
export interface OperatorParticipationPerson extends ParticipationPerson {
  readonly delivery: DeliveryState | null;
  readonly invitationId?: string | null;
  /** W4's chase position; see `./chase-position.ts`. */
  readonly chasePosition?: string | null;
  readonly noUsableRoute?: boolean;
  readonly whatsappUnresponsive?: boolean;
}

export interface EventFactsBase {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly templateName: string;
  readonly eventType: string;
  readonly scheduledOn: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  readonly deliveryMode: string;
  readonly description: string | null;
  readonly requiredEquipment: string | null;
  readonly isMandatory: boolean;
  readonly termLabel: string | null;
  readonly weekNumber: number | null;
}

export type ClubLinkEvent = EventFactsBase;

interface OperatorEvent extends EventFactsBase {
  readonly joiningUrl: string | null;
}

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

/** The query keys the table reads — in the URL, like the roster/events list/attendance board, so a filtered table is a link. */
export const PARTICIPATION_PARAMS = Object.freeze({
  search: "q",
  capacity: "as",
  answer: "answer",
  attendance: "att",
  delivery: "delivery",
  sort: "sort",
  direction: "dir",
});

/** Every `DeliveryState` a `?delivery=` value may name, plus `none`. Written out (not imported) to keep `./delivery` out of the client bundle; the assertion below catches drift. */
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
  /** Only ever set at the operator tier — `readParticipationFilters` drops it elsewhere (R157-F9a). */
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
const PARTICIPATION_SORT_COLUMNS = Object.freeze([
  "name",
  "capacity",
  "invited",
  "delivery",
  "answer",
  "reason",
  "attendance",
] as const);

export const ANSWER_FILTERS = Object.freeze(["yes", "no", "none"] as const);

export const ATTENDANCE_FILTERS = Object.freeze([
  "present",
  "late",
  "excused",
  "absent",
  "not_recorded",
] as const);

function sortValue(person: ParticipationPerson, column: string): string | number {
  switch (column) {
    case "capacity":
      return person.isWalkUp ? "￿walk-up" : person.capacity;
    case "invited":
      // Walk-ups/un-issued sort last, not first.
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

/** Whether `sort` names something this table can sort by — a whitelist; `q:` is checked against real questions, not string shape. */
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
  // Matches delivery/presentation.ts.
  if (delivery === "attention") return state === "failed" || state === "retryable";
  return state === delivery;
}

// The generic engine below (sortColumnState/sortColumnHref/stableSortRows) is extracted so
// another sortable table can share the link/arrow/stable-sort idiom; the Follow-ups queue does.

/** Which way the arrow points, and whether it points at all, for one column. */
export function sortColumnState(
  sort: string,
  direction: string,
  column: string,
  defaultColumn: string,
): { active: boolean; direction: "asc" | "desc" } {
  const active = (sort === "" ? defaultColumn : sort) === column;
  return { active, direction: active && direction === "desc" ? "desc" : "asc" };
}

/** The href a column heading points at: sort by it, or reverse it if already sorted. Empty `extraParams` values are dropped. */
export function sortColumnHref(
  basePath: string,
  extraParams: Readonly<Record<string, string>>,
  sortParam: string,
  directionParam: string,
  sort: string,
  direction: string,
  defaultColumn: string,
  column: string,
): string {
  const active = (sort === "" ? defaultColumn : sort) === column;
  const nextDirection = active && direction !== "desc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== "") params.set(key, value);
  }
  params.set(sortParam, column);
  params.set(directionParam, nextDirection);
  return `${basePath}?${params.toString()}`;
}

/** A stable sort, falling back to `tieBreak` on equal values so a table never appears to shuffle on re-render. `tieBreak` is not reversed by `descending`. */
export function stableSortRows<T>(
  rows: readonly T[],
  valueFor: (row: T) => string | number,
  descending: boolean,
  tieBreak: (left: T, right: T) => number,
): readonly T[] {
  return [...rows].sort((left, right) => {
    const a = valueFor(left);
    const b = valueFor(right);
    const order =
      typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    if (order === 0) return tieBreak(left, right);
    return descending ? -order : order;
  });
}

/**
 * The filtered, sorted rows — one pure function shared by both tiers. Every
 * filter combines with every other (W7). Stable and total: ties fall back to
 * display name, ascending, in both sort directions.
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

  return stableSortRows(
    matched,
    (person) => sortValue(person, column),
    descending,
    (left, right) => {
      const order = left.displayName.localeCompare(right.displayName);
      return order === 0 ? left.key.localeCompare(right.key) : order;
    },
  );
}

/** The href a column heading points at; every other filter is carried, so sorting never drops a filter. */
export function participationSortHref(
  basePath: string,
  filters: ParticipationFilters,
  column: string,
): string {
  return sortColumnHref(
    basePath,
    {
      [PARTICIPATION_PARAMS.search]: filters.search,
      [PARTICIPATION_PARAMS.capacity]: filters.capacity,
      [PARTICIPATION_PARAMS.answer]: filters.answer,
      [PARTICIPATION_PARAMS.attendance]: filters.attendance,
      [PARTICIPATION_PARAMS.delivery]: filters.delivery,
    },
    PARTICIPATION_PARAMS.sort,
    PARTICIPATION_PARAMS.direction,
    filters.sort,
    filters.direction,
    "name",
    column,
  );
}

export function participationSortState(
  filters: ParticipationFilters,
  column: string,
): { active: boolean; direction: "asc" | "desc" } {
  return sortColumnState(filters.sort, filters.direction, column, "name");
}

/**
 * The filters as they arrived, unrecognised values dropped (not refused, like
 * the events list). `tier` is required, not defaulted (R157-F9a) — see
 * decision history.
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
