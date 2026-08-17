import "server-only";

import { toE164 } from "./phone";

/**
 * The recipient allowlist: the set of telephone numbers this deployment is
 * permitted to send to, and the refusal for every number outside it.
 *
 * LAN-124. The hosted database holds the club's real roster, and the deployed
 * application holds a live provider credential. Between an operator pressing
 * **Approve** and forty real students receiving a message there is exactly one
 * thing, and this is it.
 *
 * ## Why an allowlist rather than care
 *
 * The showcase is a demonstration to two people. Everything else about it —
 * which events are approved, which audiences are confirmed, which jobs are left
 * terminal — is a property of the *data*, and data can be edited by the person
 * giving the demonstration, on the morning of the demonstration, by accident.
 * A control that depends on the loader having left the right rows behind is a
 * control that a single careless click removes. This one does not depend on the
 * data at all.
 *
 * ## Fail-closed, and what that means concretely here
 *
 * `DELIVERY_RECIPIENT_ALLOWLIST` is a **required** outbound variable, listed in
 * `OUTBOUND_ENVIRONMENT_VARIABLES` beside the access token and the template.
 * The consequences follow from that one decision:
 *
 *   * **Unset** — outbound resolves to `{ configured: false }` and the
 *     dispatcher sends nothing at all, recording an honest failure naming the
 *     variable. Absence is never "allow everybody"; it is "send to nobody".
 *   * **Set but empty, or set to nothing parseable** — the same refusal. A
 *     stray comma is not permission.
 *   * **Set** — those numbers, and no others.
 *
 * There is no environment flag, no `NODE_ENV` branch and no "disable in
 * production" escape. Widening delivery means writing another number into the
 * variable, which is a deliberate act by whoever holds the deployment, not a
 * side effect of anything an operator can do in the application.
 *
 * ## Where it is enforced
 *
 * Twice, on purpose:
 *
 *   * in `claimNextJobIn` (`src/lib/services/delivery.ts`), **before an RSVP
 *     token is minted** — so a person outside the list never has a live link in
 *     existence, not merely an unsent one; and
 *   * in the Cloud API adapter's `send`, immediately before the HTTP request —
 *     the last point at which a number can still be stopped.
 *
 * The first is where the demonstration behaves well: the job fails with a
 * readable reason and no token is issued. The second is the one that matters if
 * a future caller reaches the adapter by some path the service layer does not
 * own.
 *
 * ## Comparison is on E.164 digits
 *
 * `+44 7700 900123`, `07700900123` and `447700900123` are one number written
 * three ways, and a string comparison would let two of them through a list
 * containing the third. Both sides go through `toE164` with the deployment's
 * default calling code, and an entry that cannot be converted is discarded
 * rather than kept as a literal — a malformed entry must not become a rule that
 * matches nothing while looking like it matches something.
 *
 * ## The two sides are not converted identically, and that is deliberate
 *
 * A recipient arriving here has usually **already** been through `toE164` — it
 * is what `selectMobileNumber` returns — so it is bare E.164 digits with the
 * `+` already stripped. Handing those digits back to `toE164` asks it a
 * question it is built to refuse: digits with no `+`, no `00`, no trunk zero
 * and not the local calling code are the ambiguous case, and it returns `null`.
 * A foreign number therefore failed this check while being character-for-
 * character identical to an allowlist entry. That is the defect this comment
 * exists to stop coming back, and it survived every test because every fixture
 * was a United Kingdom number, which does start with the default calling code.
 *
 * So the recipient side also tries the number read as already-international.
 * That is safe **here specifically**, and nowhere else: the result still has to
 * equal an entry that whoever holds the deployment wrote down. The second
 * attempt can stop a refusal; it can never create a permission.
 *
 * The allowlist side does not get the same fallback, for the mirror-image
 * reason. There, reading an entry as already-international is what *grants*
 * delivery, so a mistyped entry would quietly become a real number in some
 * other country and this deployment would be permitted to message it. An entry
 * meant as international is written with a `+`, which costs the person writing
 * it one character and costs a misreading nothing.
 */

/** The variable that carries it. Named here so config and tests agree. */
export const RECIPIENT_ALLOWLIST_VARIABLE = "DELIVERY_RECIPIENT_ALLOWLIST";

/**
 * Parses the allowlist into E.164 digits.
 *
 * Separators are the comma, the semicolon and the newline — and **not** the
 * space. `+44 7700 900001` is one number written the way people write numbers,
 * and a parser that treated the space as a separator would read it as three
 * unparseable fragments, discard all three, and leave the deployment refusing
 * the very person it was configured to permit. That failure is silent at
 * configuration time and only visible when a message does not arrive, which is
 * the worst moment to discover it.
 *
 * Returns a sorted, deduplicated list so that two orderings of the same numbers
 * produce the same allowlist, and so a test can assert on it without depending
 * on input order.
 */
export function parseRecipientAllowlist(
  raw: string,
  defaultCallingCode: string,
): readonly string[] {
  const entries = raw
    .split(/[,;\n\r]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  const converted = entries
    .map((entry) => toE164(entry, defaultCallingCode))
    .filter((entry): entry is string => entry !== null);

  return Object.freeze([...new Set(converted)].sort());
}

/**
 * Is this recipient permitted?
 *
 * An empty allowlist permits nobody. That is the fail-closed case and it is
 * written as the first branch rather than left to `includes` returning false on
 * an empty array, because the two are the same answer for very different
 * reasons and only one of them should ever happen.
 */
export function recipientPermitted(
  recipient: string,
  allowlist: readonly string[],
  defaultCallingCode: string,
): boolean {
  if (allowlist.length === 0) return false;

  // Up to two readings of the same recipient: the number as written, and — only
  // where that could not be converted at all — the number read as
  // already-international. Whichever one converts still has to equal an entry.
  // See "The two sides are not converted identically" above for why the second
  // reading is confined to this side of the comparison.
  const asWritten = toE164(recipient, defaultCallingCode);
  const normalised =
    asWritten ??
    (recipient.trim().startsWith("+") ? null : toE164(`+${recipient.trim()}`, defaultCallingCode));
  if (normalised === null) return false;

  return allowlist.includes(normalised);
}

/**
 * The sentence stored against a refused attempt.
 *
 * Written to `delivery_attempts.failure_reason` and read by an operator, so it
 * says what happened and whose decision it was — not "error 403". It names no
 * telephone number: the reason column is readable in the application, and the
 * whole point of the control is that the numbers behind it are private.
 */
export const RECIPIENT_NOT_PERMITTED_REASON =
  "This deployment is restricted to an approved list of recipients, and this person is not " +
  "on it, so nothing was sent and no RSVP link was issued. The restriction is deliberate " +
  "and is lifted by the club's administrator, not by an operator.";
