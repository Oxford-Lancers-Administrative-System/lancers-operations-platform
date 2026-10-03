/**
 * The name-and-response box under the response progress blocks — LAN-458
 * (Stu, 30 September 2026; Brian's decisions of 1 October 2026).
 *
 * Every invited person's full name, grouped by their current answer: Yes,
 * then No, then No response. Nonresponders are included; a walk-up was never
 * invited, so they are not. The box groups by answer, not by capacity, so the
 * LAN-440 / LAN-466 folds do not touch it.
 *
 * Pure. No database, no React — the rows are the participation view's people.
 */
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
