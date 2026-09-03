/**
 * The phone and email shape checks every roster-entry surface shares.
 * LAN-215, B-007.
 *
 * Brian, at the roster form: "phone validation needs to be consistent: the
 * same phone validation everywhere. I know it has it there, but it needs to
 * be consistent across all components... I just popped in a nonsense number,
 * and it allowed it in." Before this file, `/operate/roster/new` and the
 * bulk-import reader each kept a private `looksLikePhone` that accepted any
 * value with seven or more digits — which is exactly how a nonsense number
 * got through. This is the one place that question is asked now.
 *
 * ## Why the phone predicate calls `toE164`, not a regex of its own
 *
 * `src/lib/delivery/phone-shape.ts` already owns a strict, conservative
 * converter: a recorded contact becomes an E.164 number, or the conversion
 * returns `null` when it cannot do so without guessing — because a wrong
 * guess would send a working RSVP link to a stranger. A phone number that
 * cannot become E.164 can never receive the welcome, which is the entire
 * reason the club collects it, so "can this convert" is the correct
 * acceptance test for "is this a phone number", not a second, looser rule
 * kept in sync by hand.
 *
 * `./phone-shape.ts` (not `src/lib/delivery/phone.ts`) is what this imports:
 * `phone.ts` carries `import "server-only"` on purpose, because turning a
 * contact into what a delivery provider is handed must never run in a
 * browser. This module has no such restriction — a form's shape check has to
 * be callable from whatever renders that form — so it reaches past `phone.ts`
 * to the pure conversion underneath, exactly as `phone.ts` itself does.
 *
 * ## Why the email predicate stays deliberately loose
 *
 * B-007 is a phone finding. Email keeps the permissive shape check LAN-74
 * already decided: one `@`, something before it, something after it, no
 * internal spaces. `avery@example.ac.ox` still passes — normalisation and
 * verification are separate, reversible steps this intake layer deliberately
 * keeps apart from itself.
 *
 * ## Scope of "every surface"
 *
 * This module is imported by the two surfaces LAN-215's own arrival doors
 * touch: `/operate/roster/new` (`src/app/operate/roster/new/validation.ts`)
 * and the bulk-import reader (`src/lib/services/roster-csv.ts`). It does not
 * replace `src/lib/services/person-validation.ts`, which the recruitment and
 * person-record surfaces outside this package already use, was decided under
 * its own issue (LAN-183), and is out of this correction's scope — folding it
 * in is a decision for whichever ticket next touches those surfaces, not a
 * silent widening of this one.
 */

import { toE164 } from "@/lib/delivery/phone-shape";

/** Shown when a phone number cannot be converted to E.164 at all. */
export const PHONE_SHAPE_MESSAGE =
  "This does not look like a phone number. Enter it with its country code (or a UK number " +
  "starting with 0), and check the digit count.";

/** Shown when an email address has no `@`, or nothing on one side of it. */
export const EMAIL_SHAPE_MESSAGE =
  "This does not look like an email address. Enter it as it was given, including the @, " +
  "or leave it blank.";

/** The Oxford Lancers' own calling code — the one a bare national number defaults to. */
export const DEFAULT_CALLING_CODE = "44";

/**
 * Whether `value` can become an E.164 number — the same question, and the
 * same answer, as `src/lib/delivery/phone.ts`'s `toE164`. Never repairs a
 * number: this only ever reports whether the conversion would succeed.
 */
export function looksLikePhone(
  value: string,
  defaultCallingCode: string = DEFAULT_CALLING_CODE,
): boolean {
  return toE164(value, defaultCallingCode) !== null;
}

/**
 * One `@`, something before it, something after it, and no internal spaces.
 * Deliberately not a full RFC address parser: the strict ones reject real
 * addresses, and the club's messy-but-genuine addresses must get through.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+$/.test(trimmed);
}
