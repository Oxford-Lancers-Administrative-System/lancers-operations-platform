import { ConstraintViolated } from "@/lib/db";

/**
 * Every state change names the operator who made it.
 *
 * Invariant M2 is that a change and its audit row are written together, and an
 * audit row without an actor is not an audit row — so each aggregate checked
 * this before writing. Four modules did, and they had drifted into three
 * different guards: `membership.ts` also rejected a non-string,
 * `attendance.ts` and `event-approval.ts` trimmed, `events.ts` trimmed through
 * a helper. Three answers to one question, on the path that makes the audit
 * trail trustworthy.
 *
 * The strictest is now the only one. Through the application it can never fire:
 * the actor comes from `resolveOperator()`, typed `personId: string`, so
 * TypeScript has already excluded a non-string. What it defends is the
 * unchecked caller — a script, a migration helper, a test passing whatever it
 * likes — which `src/lib/services/README.md` explicitly requires to work
 * ("callable from a test with an arbitrary actor"). For those it turns a
 * `TypeError` thrown from somewhere deeper into the club's own sentence, thrown
 * before anything is written.
 *
 * The message stays with the aggregate. "A membership change has to name the
 * operator who made it" is not the sentence an attendance failure should
 * produce, and a single shared wording would have been a worse answer than the
 * duplication it replaced.
 */
export function actorRequirement(message: string): (actorPersonId: string) => void {
  return (actorPersonId: string): void => {
    if (typeof actorPersonId !== "string" || actorPersonId.trim() === "") {
      throw new ConstraintViolated(message, { rule: "audit_events_has_an_actor" });
    }
  };
}
