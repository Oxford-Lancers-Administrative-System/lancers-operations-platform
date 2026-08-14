import "server-only";

/**
 * Turning what the club recorded into what a provider will accept. LAN-78.
 *
 * `contact_points.raw_value` is deliberately unvalidated — the schema comment
 * says so, and the reason is that rejecting messy input at the door loses the
 * contact entirely. The club's real data has trailing spaces, missing leading
 * zeros, numbers written with spaces, and numbers that are one digit short
 * (Source Data Analysis §11.1). All of that is fine to *store* and none of it
 * can be handed to Meta.
 *
 * So this is the one place a recorded contact becomes an E.164 number, and it
 * is deliberately conservative: anything it cannot convert with confidence
 * becomes `null`, and the dispatcher records a failed, non-retryable attempt
 * saying the roster needs fixing. Guessing is the failure mode that matters —
 * a wrong guess sends a club invitation, containing a working RSVP link, to a
 * stranger.
 *
 * There is no `libphonenumber` here on purpose. It is a large dependency whose
 * value is in parsing arbitrary international input, and the club has one
 * country, one number format that matters, and a hard rule that an
 * unconvertible number must fail rather than be repaired.
 */

/**
 * E.164 digits — no `+`, no spaces — or `null` if the value cannot be converted
 * without guessing.
 *
 * `defaultCallingCode` is applied only to a number written in national form
 * with a leading zero, which is how every UK number in the club's data is
 * written. A bare number with no leading zero and no country code is refused
 * rather than assumed to be local.
 */
export function toE164(raw: string, defaultCallingCode: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Anything that is not a digit, a leading `+`, or ordinary separator noise
  // means this is not a phone number at all — an email in the wrong column, a
  // note, "ask Sam". Refused rather than stripped down to whatever digits it
  // happens to contain.
  if (!/^\+?[0-9\s().-]+$/.test(trimmed)) return null;

  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^0-9]/g, "");
  if (digits === "") return null;

  if (hadPlus) {
    // Already international. Take it as given.
  } else if (digits.startsWith("00")) {
    // The other international prefix the club's data uses.
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // National form: drop the trunk zero, prepend the calling code.
    digits = `${defaultCallingCode}${digits.slice(1)}`;
  } else if (digits.startsWith(defaultCallingCode)) {
    // Already carries the calling code without a `+`.
  } else {
    // No `+`, no `00`, no trunk zero, and not the local calling code. This is
    // the ambiguous case, and the one where a guess would be dangerous.
    return null;
  }

  // E.164 permits at most fifteen digits, and a country code is at least one,
  // so anything outside this range is not a number that will route.
  if (digits.length < 8 || digits.length > 15) return null;

  // The generic range above is not enough for the failure this function exists
  // to prevent. Source Data Analysis §11.1 records that the club's data
  // contains numbers **one digit short**, and "07700 90012" survives every
  // check so far: it becomes eleven digits, which is inside the range and is
  // simply somebody else's number.
  //
  // So where the resulting number carries a calling code whose national length
  // is known, that length is enforced. Only the club's own is listed, and an
  // unlisted code falls back to the generic range — this narrows what can be
  // sent, and never widens it.
  const national = NATIONAL_SIGNIFICANT_LENGTHS[findCallingCode(digits)];
  if (national !== undefined && digits.length - findCallingCode(digits).length !== national) {
    return null;
  }

  return digits;
}

/**
 * Digits after the country code, for the countries this club has numbers in.
 *
 * Deliberately tiny. It is not a general phone-number library and must not grow
 * into one — the alternative to a short list of known lengths is guessing, and
 * this whole function exists because a guess sends a working RSVP link to a
 * stranger.
 */
const NATIONAL_SIGNIFICANT_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  "44": 10,
});

/** The known calling code this number starts with, or `""` for none. */
function findCallingCode(digits: string): string {
  return Object.keys(NATIONAL_SIGNIFICANT_LENGTHS).find((code) => digits.startsWith(code)) ?? "";
}

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
