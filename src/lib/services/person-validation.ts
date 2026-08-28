/**
 * Contact validation for the person record — LAN-183, `REQ-contact-validation`.
 *
 * Pure. No database, no `server-only`, no framework: it has to be callable from
 * a form's client-side check and from the write path that finally commits a
 * value, with the same answer both times.
 *
 * ## The rule, named per field
 *
 * `DEC-w2-09`: "phone and email are validated before the save is offered, per
 * field, naming the rule." So every result carries a `rule` — a stable
 * identifier a caller can switch on — and a `message` in the club's language.
 * Neither function ever throws; a refusal is data, the same as a pass.
 *
 * ## Why phone conversion is not imported from `src/lib/delivery/phone.ts`
 *
 * That module's `toE164()` answers the identical question —
 * `DEC-w2-11`'s "does this parse with its country code, and does a bare
 * national number default to UK" — and re-deriving the algorithm here is a
 * second copy of one rule, which register D9 warns against in general. It is
 * deliberate this once: `toE164` carries `import "server-only"`, because its
 * job is turning a recorded value into what a delivery provider is handed, and
 * that must never run in a browser. This module's job is different — deciding
 * whether a save is offered at all, which a form has to be able to ask
 * *before* the value ever reaches a server — so importing `toE164` would either
 * taint this module `server-only` and break that use, or (worse) quietly
 * un-taint the delivery module's boundary. The two are kept apart on purpose;
 * `person-validation.test.ts` and `phone.test.ts` both exercise the club's data
 * from Source Data Analysis §11.1, so a divergence between them fails a test
 * rather than surfacing on a real record.
 *
 * `toE164`'s own module note explains why it refuses rather than guesses: a
 * wrong guess sends a working RSVP link to a stranger. That conservatism is
 * exactly right here too — `DEC-w2-10`, "a correct number is never refused;
 * the negative cases are acceptance criteria in their own right" — the two
 * modules ask the same question of two different call sites.
 */

/** The Oxford Lancers' own calling code — the one `DEC-w2-11` lets a bare national number default to. */
export const DEFAULT_CALLING_CODE = "44";

export interface ContactValidation {
  readonly valid: boolean;
  /** A stable identifier for the rule that passed or refused this value. */
  readonly rule: string;
  /** What an operator reads. Names the rule; never echoes a stack trace or SQL. */
  readonly message: string;
}

export interface PhoneValidation extends ContactValidation {
  /** The E.164 digits (no `+`), present only when `valid` is `true`. */
  readonly e164?: string;
}

/**
 * A reasonably strict shape check — one `@`, a domain with at least one dot,
 * no whitespace. Not a full RFC 5322 parser: the club's own `looksLikeAnEmailAddress`
 * in `src/lib/delivery/email.ts` is deliberately named as "near enough for a
 * guard that must never be the only one", and this is the same guard, reused
 * for the same reason rather than re-derived a second time.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@]+)+$/;

export function validateEmailAddress(raw: string): ContactValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return {
      valid: false,
      rule: "email_blank",
      message: "An email address is required.",
    };
  }

  if (!EMAIL_SHAPE.test(trimmed)) {
    return {
      valid: false,
      rule: "email_not_well_formed",
      message: `"${trimmed}" does not look like an email address — it needs one @ and a domain with a dot, and no spaces.`,
    };
  }

  return { valid: true, rule: "email_well_formed", message: "This is a valid email address." };
}

/** Everything that is not a digit, a leading `+`, or ordinary separator noise. */
const PHONE_SHAPE = /^\+?[0-9\s().-]+$/;

/**
 * Digits after the country code, for the countries the club's data actually
 * contains a length for. The same tiny, deliberately-not-a-library table
 * `src/lib/delivery/phone.ts` keeps, and the same reason: the alternative to a
 * short list of known lengths is guessing, which is the one thing both modules
 * refuse to do. Widening it is a one-line addition, decided the same way the
 * first entry was.
 */
const NATIONAL_SIGNIFICANT_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  [DEFAULT_CALLING_CODE]: 10,
});

function findCallingCode(digits: string): string {
  return Object.keys(NATIONAL_SIGNIFICANT_LENGTHS).find((code) => digits.startsWith(code)) ?? "";
}

/**
 * Validates one phone number, naming the rule.
 *
 * Accepts every form `DEC-w2-11` and `DEC-w2-10` require: `+44` or `00 44`
 * international, spaced or unspaced; a UK national number with its leading
 * `0`; and a number from any other country written with its own `+` or `00`
 * country code. Only a bare national number — no `+`, no `00`, no leading `0`
 * — defaults to the club's own calling code, and only when it is *already*
 * carrying that code without the `+`.
 *
 * `defaultCallingCode` defaults to the club's own — `DEFAULT_CALLING_CODE` —
 * because every surface this validates for is the Oxford Lancers' own roster.
 * A caller with a different default may still supply one.
 */
export function validatePhoneNumber(
  raw: string,
  defaultCallingCode: string = DEFAULT_CALLING_CODE,
): PhoneValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { valid: false, rule: "phone_blank", message: "A phone number is required." };
  }

  if (!PHONE_SHAPE.test(trimmed)) {
    return {
      valid: false,
      rule: "phone_not_numeric",
      message: `"${trimmed}" contains something other than digits, spaces or a leading +, so it cannot be a phone number.`,
    };
  }

  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^0-9]/g, "");

  if (digits === "") {
    return { valid: false, rule: "phone_blank", message: "A phone number is required." };
  }

  if (hadPlus) {
    // Already international. Taken as given.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    // UK national form: drop the trunk zero, prepend the default calling code.
    digits = `${defaultCallingCode}${digits.slice(1)}`;
  } else if (digits.startsWith(defaultCallingCode)) {
    // Already carries the calling code without a `+`.
  } else {
    // No `+`, no `00`, no UK trunk zero, and not the default calling code
    // written bare. This is the ambiguous case `DEC-w2-11` refuses to guess at
    // — a number from a country other than the club's default has to name its
    // own country code.
    return {
      valid: false,
      rule: "phone_country_code_required",
      message:
        `"${trimmed}" has no country code and no UK leading 0, so which country it is in cannot be told. ` +
        'Write it with a "+" and the country code, or as a UK number starting with 0.',
    };
  }

  // E.164 permits at most fifteen digits, and a country code is at least one.
  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      rule: "phone_wrong_length",
      message: `"${trimmed}" is not the right number of digits for a phone number.`,
    };
  }

  // The generic range above is not enough: the club's own data contains
  // numbers one digit short of a real UK number, and "07700 90012" survives
  // every check so far. Where the calling code's national length is known,
  // that length is enforced, narrowing what can be sent and never widening it.
  const code = findCallingCode(digits);
  const nationalLength = NATIONAL_SIGNIFICANT_LENGTHS[code];
  if (nationalLength !== undefined && digits.length - code.length !== nationalLength) {
    return {
      valid: false,
      rule: "phone_wrong_length",
      message: `"${trimmed}" is not the right number of digits for its country code.`,
    };
  }

  return {
    valid: true,
    rule: "phone_e164_convertible",
    message: "This is a valid phone number.",
    e164: digits,
  };
}
