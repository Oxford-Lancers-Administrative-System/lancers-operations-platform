/**
 * The pure E.164 conversion — no `server-only`, no database, no framework.
 * LAN-78; extracted for LAN-215, B-007.
 *
 * ## Why this exists as its own file
 *
 * `./phone.ts` turns a recorded contact into what a delivery provider will
 * accept, and it is deliberately tagged `server-only`: its job is to face
 * Meta, and that must never run in a browser. `src/lib/validation/contact.ts`
 * asks the *identical* question — "can this become E.164 without guessing" —
 * but from a form's shape check, which has to be importable by whatever
 * component renders that form, client or server, without dragging a
 * `server-only` tag along with it.
 *
 * Brian, at the roster form, LAN-215: "the same phone validation everywhere."
 * Two call sites asking one question is why this file holds the question
 * exactly once. `./phone.ts` re-exports `toE164` from here unchanged, so every
 * existing caller of `./phone.ts`'s `toE164` sees no difference at all; this
 * file is the algorithm, not a second copy of it.
 *
 * ## The rule, and why it refuses rather than repairs
 *
 * `contact_points.raw_value` is deliberately unvalidated at the point of
 * intake — the schema comment says so, and the reason is that rejecting messy
 * input at the door loses the contact entirely. The club's real data has
 * trailing spaces, missing leading zeros, numbers written with spaces, and
 * numbers that are one digit short (Source Data Analysis §11.1). All of that
 * is fine to *store*; none of it can be handed to a delivery provider, and
 * none of it should be silently guessed into something else. Guessing is the
 * failure mode that matters — a wrong guess sends a working RSVP link to a
 * stranger — so anything this cannot convert with confidence becomes `null`.
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
