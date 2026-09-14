/**
 * Who an event's questions are asked of — LAN-339 (Brian, 2026-09-12).
 *
 * > Recruits are never asked an event's questions. Their answer is Yes or No,
 * > nothing more. A question asked while someone was a recruit never comes back
 * > to them as follow-up, not while a recruit and not after they join.
 *
 * The rule lives here, once, in both the shape a query needs and the shape a
 * list in memory needs, because it has five readers — the recruit's own answer
 * page, the operator's participation view and its counts, the player page after
 * the flip, the follow-up queue, and the two writers that record an answer —
 * and five copies of one rule is four places for it to stop being true.
 *
 * It is expressed against the INVITATION'S CAPACITY, not against the person: a
 * recruit-capacity invitation stays a recruit's invitation for ever, which is
 * what makes "joining does not resurrect them" fall out rather than need its
 * own rule. Nothing here reads `event_questions.applies_to_capacities` alone —
 * that column is honoured (a coach-only question is still coach-only) and then
 * narrowed by this rule, so a stored array that happens to name `recruit` is
 * inert rather than authoritative.
 *
 * Deliberately has no `server-only` import: the participation table's filter
 * bar is a client component and shares the rule rather than re-stating it.
 */

/** The capacities an event's questions never reach. One entry; the shape says it is a rule about capacities, not about recruits in particular. */
const CAPACITIES_NEVER_ASKED_QUESTIONS: readonly string[] = Object.freeze(["recruit"]);

/** Whether an invitation in this capacity is ever asked a question at all. */
export function capacityIsAskedQuestions(capacity: string): boolean {
  return !CAPACITIES_NEVER_ASKED_QUESTIONS.includes(capacity);
}

/** Whether one stored question applies to one invitation's capacity — both halves of the rule. */
export function questionAppliesToCapacity(
  appliesToCapacities: readonly string[],
  capacity: string,
): boolean {
  return capacityIsAskedQuestions(capacity) && appliesToCapacities.includes(capacity);
}

const NEVER_ASKED_SQL_ARRAY = `array[${CAPACITIES_NEVER_ASKED_QUESTIONS.map(
  (capacity) => `'${capacity}'`,
).join(", ")}]::public.invitation_capacity[]`;

/**
 * The same rule as a SQL predicate, for the reads that count questions in the
 * database rather than in memory.
 *
 * `questionAlias` is the alias of `public.event_questions` in the query;
 * `capacityExpression` is whatever that query already has for the invitation's
 * capacity — a parameter placeholder cast to `public.invitation_capacity`, or a
 * column. Built from the constant above so the list cannot drift between the
 * two halves.
 */
export function questionAppliesToCapacitySql(
  questionAlias: string,
  capacityExpression: string,
): string {
  return (
    `(${capacityExpression} <> all(${NEVER_ASKED_SQL_ARRAY})` +
    ` and ${capacityExpression} = any(${questionAlias}.applies_to_capacities))`
  );
}
