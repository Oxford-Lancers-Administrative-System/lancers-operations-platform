/**
 * Turning a stored value into the club's word for it.
 *
 * Every operate screen keeps its own label maps — the roster's statuses, the
 * events screens' types, the report's onboarding states — because those
 * vocabularies belong to their screens and have no business being one shared
 * dictionary. The *lookup*, though, was written out three times, identically,
 * in `roster/presentation.ts`, `events/presentation.ts` and
 * `report/presentation.ts`. Three copies of one expression is three places for
 * the fallback to be forgotten, and the fallback is the whole point: a value
 * the map has never heard of has to render as itself rather than as a blank
 * cell, because a blank cell reads as "no status" instead of "a status nobody
 * has written a label for yet".
 *
 * The maps stay where they are. Only this is shared.
 *
 * ## Where it lives now
 *
 * The implementation moved to `@/lib/services/event-vocabulary` when LAN-153
 * opened a public calendar: the vocabulary that calendar needs had to leave
 * `/operate`, and it needs this lookup, so a module under `src/lib/` could not
 * go on importing from `src/app/`. This file is the re-export, so the five
 * `/operate` screens that have always imported `labelFor` from here still do.
 */
export { labelFor } from "@/lib/services/event-vocabulary";
