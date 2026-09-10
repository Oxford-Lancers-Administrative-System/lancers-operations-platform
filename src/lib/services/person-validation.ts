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

/**
 * The reasonable range for a year the club records — matriculation and
 * expected graduation alike. LAN-203, Brian 2026-09-01: the sign-up form
 * "parsed leniently; unparsable input is simply not recorded" today, so a
 * typo is silently discarded rather than shown as an error. This validates
 * instead of swallowing, on the same per-field, named-rule shape every other
 * function in this module returns.
 */
const YEAR_MIN = 1900;
const YEAR_MAX = 2200;

/**
 * Validates one academic year field, named for the caller's own label so the
 * message reads "Matriculation year" or "Expected graduation" rather than a
 * generic "year".
 */
export function validateAcademicYear(raw: string, label: string): ContactValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { valid: false, rule: "year_blank", message: `${label} is required.` };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      rule: "year_not_numeric",
      message: `${label} has to be a whole number, like 2024 — "${trimmed}" is not.`,
    };
  }

  const year = Number.parseInt(trimmed, 10);
  if (year < YEAR_MIN || year > YEAR_MAX) {
    return {
      valid: false,
      rule: "year_out_of_range",
      message: `${label} has to be between ${YEAR_MIN} and ${YEAR_MAX} — "${trimmed}" is not.`,
    };
  }

  return { valid: true, rule: "year_well_formed", message: `${label} is a valid year.` };
}

/**
 * The one date-of-birth rule — LAN-245 and LAN-258, fixed from one place.
 *
 * Two surfaces refused a future date of birth two different ways, and neither
 * of them named the field. The player questionnaire's own step 1
 * (`/me/[token]/details`) let the value through to `updatePersonField`, where
 * `people_date_of_birth_in_the_past` refused it and the resulting error
 * escaped the server action — the player got the generic error boundary and a
 * 500, with no idea which of fourteen fields was wrong (LAN-245, walker M7
 * finding M7-03). The operator's own edit form
 * (`/operate/people/[personId]/edit`) reached the identical constraint and
 * showed "The database refused this change because it breaks one of the
 * club's recorded rules" — true, but it never said *which* rule or *which*
 * field (LAN-258, walker M5 finding M5-03).
 *
 * `DEC-w2-09`'s "validated before the save is offered, per field, naming the
 * rule" is what both surfaces were missing, and it is what every other
 * function in this module already provides. So this is that function, in the
 * same shape, sitting beside its siblings rather than being written twice:
 * the player form calls it through `saveDetailsStep`, the operator form calls
 * it before its first write, and `updatePersonField` calls it as the service
 * layer's own backstop so no third caller can reach the constraint raw.
 *
 * ## Why it duplicates the database's check rather than replacing it
 *
 * `people_date_of_birth_in_the_past` stays exactly as it is. A check
 * constraint is the club's last line and must never be the *first* one an
 * operator or a player meets: the constraint's job is to make the bad state
 * unrepresentable, and this function's job is to explain, in the club's own
 * words and against the right field, why a value will not be accepted. The
 * two agree by construction — "strictly before today" is the constraint's own
 * text — and `today` is injectable only so a test can pin it.
 *
 * ## The lower bound
 *
 * The database has no lower bound on a date of birth, and this does not
 * invent one as a club rule. It refuses a year outside the same 1900–2200
 * window `validateAcademicYear` already applies, for the same reason that
 * window exists: a segmented picker and a typed date both produce "0002" as
 * readily as "2002", and a year that cannot be a living person's is a typo,
 * named as one, not a fact the club is recording.
 */
export function validateDateOfBirth(raw: string, today: Date = new Date()): ContactValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { valid: false, rule: "date_of_birth_blank", message: "A date of birth is required." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      valid: false,
      rule: "date_of_birth_not_a_date",
      message: `"${trimmed}" is not a date — a date of birth is a day, a month and a year.`,
    };
  }

  const [year, month, day] = trimmed.split("-").map((part) => Number.parseInt(part, 10));

  // Checked before the date is constructed, not after: `Date.UTC` reads a
  // year below 100 as 1900 + that year, so "0002-01-01" would come back as
  // 1902 and be reported as an impossible day rather than as the implausible
  // year it actually is. The range check is also the cheaper, more specific
  // answer, and the one an operator can act on.
  if (year < YEAR_MIN || year > YEAR_MAX) {
    return {
      valid: false,
      rule: "date_of_birth_out_of_range",
      message: `A date of birth has to be in a year between ${YEAR_MIN} and ${YEAR_MAX} — "${trimmed}" is not.`,
    };
  }

  // `Date.UTC` rolls an impossible day forward into the next month
  // ("2005-02-30" becomes 2 March), so the parts are read back and compared
  // rather than trusted to have survived the round trip.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return {
      valid: false,
      rule: "date_of_birth_not_a_date",
      message: `"${trimmed}" is not a real date — that day does not exist in that month.`,
    };
  }

  // The constraint's own comparison, in the constraint's own terms: strictly
  // before today, taken as a calendar day rather than an instant, so a date
  // recorded on the day it is entered is refused exactly where the database
  // would refuse it and nowhere else.
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (parsed.getTime() >= todayUtc) {
    return {
      valid: false,
      rule: "people_date_of_birth_in_the_past",
      message: "A date of birth has to be in the past.",
    };
  }

  return {
    valid: true,
    rule: "date_of_birth_in_the_past",
    message: "This is a valid date of birth.",
  };
}

/**
 * The Oxford college address — LAN-268, Brian 2026-09-09.
 *
 * > "I had a weird online guy trying to join one year and he wasn't a student.
 * > At the end of the day, every student at freshers fair or MBA will have this
 * > very basic item."
 *
 * The college email is the club's own proof that a recruit or a player is
 * actually at the university, so the forms ask the tough question: an address
 * is a college address only when its domain is `ox.ac.uk` or a subdomain of
 * it. Every Oxford college and department address ends that way —
 * `@ox.ac.uk`, `@balliol.ox.ac.uk`, `@sbs.ox.ac.uk`,
 * `@dept.college.ox.ac.uk`. Nothing else is accepted: not `gmail.com`, not
 * another university, and not the look-alikes that matter most.
 * `oxford.ac.uk` is a different domain, `notox.ac.uk` merely ends in the same
 * letters, and `ox.ac.uk.evil.com` is somebody else's domain wearing the name.
 *
 * ## One rule, one message, one function
 *
 * LAN-268's own instruction. Four surfaces ask this question — the sign-up
 * door, add-by-hand, the player questionnaire's step 1, and the operator's
 * edit form — and a second copy of a rule whose whole job is to keep the wrong
 * person out is a copy that drifts. Everything below is pure and carries no
 * `server-only`, exactly like its siblings, so a form's own check and the
 * write path that finally commits the value give the same answer.
 *
 * ## Shape first, domain second
 *
 * `validateEmailAddress` already owns "does this look like an email at all",
 * and this defers to it rather than re-deriving it: a value that is not an
 * email is refused as one, naming the shape rule, and only something that got
 * that far is asked which domain it is in. So a player who typed their name
 * into the box is told they have not typed an address, not that their address
 * is not Oxford's.
 *
 * ## Required-ness is somewhere else
 *
 * This says whether a supplied value is a college address. Whether a college
 * address is *required* of a particular person is `person-required.ts`'s tier
 * table, and whether a blank field blocks a particular form is that form's own
 * required-ness check. The three are kept apart on purpose, exactly as they
 * already are for every other fact: a coach who supplies no college email is
 * not chased for one, but a coach who supplies `x@gmail.com` is still refused,
 * because a value stored as a college address has to be one.
 */

/** The one sentence every surface shows. LAN-268: "the refusal names the rule". */
export const COLLEGE_EMAIL_RULE_MESSAGE = "Enter your Oxford address; it ends in ox.ac.uk";

/**
 * `@ox.ac.uk`, or `@` any number of subdomain labels then `.ox.ac.uk`.
 *
 * Anchored at the end, so `ox.ac.uk.evil.com` cannot match; the `@` or `.`
 * immediately before `ox` is what refuses `notox.ac.uk` and `oxford.ac.uk`.
 * Applied to the lower-cased address, because a domain is case-insensitive and
 * `@Balliol.OX.AC.UK` is the same college.
 */
const OXFORD_DOMAIN = /@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*ox\.ac\.uk$/;

/**
 * Whether this address is an Oxford one. The pure predicate, for the places
 * that want the answer rather than the sentence — the missing-data queue asks
 * it of a value already on file, where "not an Oxford address" and "no
 * address" are the same outcome (LAN-268: "a person whose stored college email
 * fails the rule, or who has none, shows in the missing-data queue").
 *
 * A value that is not a well-formed email at all is not an Oxford address
 * either, so this answers `false` rather than throwing.
 */
export function isOxfordCollegeEmail(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!EMAIL_SHAPE.test(trimmed)) return false;
  return OXFORD_DOMAIN.test(trimmed.toLowerCase());
}

/**
 * Validates one college email, naming the rule — the same shape every other
 * function in this module returns, so a caller switches on `rule` and shows
 * `message` without knowing which check refused.
 *
 * A blank value is `college_email_blank`. Required-ness is the caller's
 * decision, and a caller that does not require the field simply never asks
 * this about a blank one.
 */
export function validateCollegeEmail(raw: string): ContactValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return {
      valid: false,
      rule: "college_email_blank",
      message: "A college email is required.",
    };
  }

  // Shape before domain: "that is not an address" is a more useful sentence
  // than "that is not an Oxford address" when somebody typed their name.
  const shape = validateEmailAddress(trimmed);
  if (!shape.valid) return shape;

  if (!OXFORD_DOMAIN.test(trimmed.toLowerCase())) {
    return {
      valid: false,
      rule: "college_email_not_oxford",
      message: COLLEGE_EMAIL_RULE_MESSAGE,
    };
  }

  return {
    valid: true,
    rule: "college_email_oxford",
    message: "This is a valid Oxford address.",
  };
}
