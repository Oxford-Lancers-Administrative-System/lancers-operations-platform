import "server-only";

/**
 * Turning what the club recorded into what a provider will accept. LAN-78.
 *
 * The conversion itself — the pure "can this become E.164 without guessing"
 * question — lives in `./phone-shape.ts`, which carries no `server-only` tag
 * so that `src/lib/validation/contact.ts` can ask the same question from a
 * form's shape check (LAN-215, B-007: "the same phone validation everywhere").
 * `toE164` is re-exported here unchanged, so every existing caller of this
 * module sees no difference at all.
 *
 * This module stays `server-only` because its own job — turning a recorded
 * contact into what gets handed to Meta — must never run in a browser, even
 * though the conversion it delegates to no longer lives in this file.
 */

import { toE164 } from "./phone-shape";

export { toE164 };

/**
 * The number to send an invitation to, from a person's recorded contact points.
 *
 * Prefers the contact the club marked preferred, then the most recently
 * recorded current one — the same precedence a human would apply. Only current
 * contact points are considered: `valid_until` is how the club records that a
 * number stopped being that person's.
 */
export interface ContactPointRow {
  readonly kind: string;
  readonly rawValue: string;
  readonly normalisedValue: string | null;
  readonly isPreferred: boolean;
}

export function selectMobileNumber(
  contacts: readonly ContactPointRow[],
  defaultCallingCode: string,
): string | null {
  const phones = contacts.filter((contact) => contact.kind === "phone");
  const ordered = [...phones].sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));

  for (const contact of ordered) {
    // `normalised_value` is the club's own cleaned form where intake produced
    // one; `raw_value` is what was actually supplied. Both go through the same
    // conversion, so a stored "normalised" value that is not E.164 is still
    // checked rather than trusted.
    const converted =
      toE164(contact.normalisedValue ?? "", defaultCallingCode) ??
      toE164(contact.rawValue, defaultCallingCode);
    if (converted) return converted;
  }

  return null;
}

/** What an operator is told when nobody can send to this person. */
export const NO_USABLE_NUMBER_REASON =
  "No usable mobile number is recorded for this person, so nothing could be sent. " +
  "Add or correct their phone number on the roster, then retry.";
