/**
 * The name-and-response box under the response progress blocks — LAN-458
 * (Stu, 30 September 2026; Brian's decisions of 1 October 2026).
 *
 * Every invited person's full name, grouped by their current answer: Yes,
 * then No, then No response. Nonresponders are included; a walk-up was never
 * invited, so they are not.
 *
 * LAN-481 (Brian, 6 and 7 October 2026) splits the box by Recruits, Players
 * and Coaches before it groups by answer. The split is the response blocks'
 * own — `responseCapacityOf`, the classifier that tallies them, with the
 * LAN-440 / LAN-466 folds — so a name sits in the section whose count it is.
 *
 * Pure. No database, no React — the rows are the participation view's people.
 */
import {
  DISPLAY_ORDER,
  RESPONSE_CAPACITY_LABELS,
  responseCapacityOf,
  type DisplayCapacity,
  type ResponseProgressRow,
} from "./event-response-progress";
import { answerGroupOf, type AnswerGroup, type ParticipationPerson } from "./participation-view";

export interface ResponseNameGroup {
  readonly group: AnswerGroup;
  readonly label: string;
  readonly names: readonly string[];
}

const GROUPS: readonly { group: AnswerGroup; label: string }[] = Object.freeze([
  { group: "yes", label: "Yes" },
  { group: "no", label: "No" },
  { group: "none", label: "No response" },
]);

type NameRow = Pick<ParticipationPerson, "displayName" | "isWalkUp" | "answer">;

/** Always the three groups, in order, each with its names alphabetically; a group may be empty. */
export function responseNamesByAnswer(people: readonly NameRow[]): ResponseNameGroup[] {
  const invited = people.filter((person) => !person.isWalkUp);
  return GROUPS.map(({ group, label }) => ({
    group,
    label,
    names: invited
      .filter((person) => answerGroupOf(person) === group)
      .map((person) => person.displayName)
      .sort((left, right) => left.localeCompare(right, "en-GB")),
  }));
}

/** One capacity's section: its label and its three answer groups. */
export interface ResponseNameSection {
  readonly capacity: DisplayCapacity;
  readonly label: string;
  readonly groups: readonly ResponseNameGroup[];
}

type SectionRow = NameRow & ResponseProgressRow;

/**
 * LAN-481: one section per capacity the response blocks show, in their order,
 * each with the three answer groups. A capacity nobody is tallied under has no
 * section, exactly as it has no block; a row the blocks do not count (a
 * walk-up, an unknown capacity) is in no section.
 */
export function responseNamesByCapacity(people: readonly SectionRow[]): ResponseNameSection[] {
  const byCapacity = new Map<DisplayCapacity, SectionRow[]>();
  for (const person of people) {
    const capacity = responseCapacityOf(person);
    if (capacity === null) continue;
    byCapacity.set(capacity, [...(byCapacity.get(capacity) ?? []), person]);
  }
  return DISPLAY_ORDER.flatMap((capacity) => {
    const rows = byCapacity.get(capacity);
    if (rows === undefined) return [];
    return [
      { capacity, label: RESPONSE_CAPACITY_LABELS[capacity], groups: responseNamesByAnswer(rows) },
    ];
  });
}
