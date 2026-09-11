// Contact validation for the person record — LAN-183, `REQ-contact-validation`. Pure; every result
// carries a `rule` and a `message`. Phone conversion is deliberately not shared with the `server-only` `toE164()`.
// Decision history: missions/intake/M-PEOPLE-AND-ROSTER

export const DEFAULT_CALLING_CODE = "44";

export interface ContactValidation {
  readonly valid: boolean;
  readonly rule: string;
  readonly message: string;
}

export interface PhoneValidation extends ContactValidation {
  readonly e164?: string;
}

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

const PHONE_SHAPE = /^\+?[0-9\s().-]+$/;

const NATIONAL_SIGNIFICANT_LENGTHS: Readonly<Record<string, number>> = Object.freeze({
  [DEFAULT_CALLING_CODE]: 10,
});

function findCallingCode(digits: string): string {
  return Object.keys(NATIONAL_SIGNIFICANT_LENGTHS).find((code) => digits.startsWith(code)) ?? "";
}

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
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `${defaultCallingCode}${digits.slice(1)}`;
  } else if (digits.startsWith(defaultCallingCode)) {
    // already has the calling code
  } else {
    return {
      valid: false,
      rule: "phone_country_code_required",
      message:
        `"${trimmed}" has no country code and no UK leading 0, so which country it is in cannot be told. ` +
        'Write it with a "+" and the country code, or as a UK number starting with 0.',
    };
  }

  if (digits.length < 8 || digits.length > 15) {
    return {
      valid: false,
      rule: "phone_wrong_length",
      message: `"${trimmed}" is not the right number of digits for a phone number.`,
    };
  }

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

// LAN-203: validates the year instead of silently discarding a typo. Decision history: missions/intake/M-RECRUITMENT
const YEAR_MIN = 1900;
const YEAR_MAX = 2200;

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
 * The one date-of-birth rule — LAN-245 and LAN-258, fixed from one place after
 * two surfaces each mishandled the database's `people_date_of_birth_in_the_past`
 * refusal. Duplicates that check deliberately (the constraint stays the last
 * line; this explains why in the club's words) with the same 1900–2200 window
 * as `validateAcademicYear`. `today` is injectable only so a test can pin it.
 * Decision history: missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY
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

  // Checked before construction: Date.UTC reads a year below 100 as 1900+year.
  if (year < YEAR_MIN || year > YEAR_MAX) {
    return {
      valid: false,
      rule: "date_of_birth_out_of_range",
      message: `A date of birth has to be in a year between ${YEAR_MIN} and ${YEAR_MAX} — "${trimmed}" is not.`,
    };
  }

  // Date.UTC rolls an impossible day into the next month, so the parts are read back and compared.
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

// The Oxford college address — LAN-268. A domain of `ox.ac.uk` or a subdomain, one rule shared
// by four surfaces. Required-ness is `person-required.ts`'s concern, not this module's.
// Decision history: missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY

export const COLLEGE_EMAIL_RULE_MESSAGE = "Enter your Oxford address; it ends in ox.ac.uk";

/** Anchored at the end so `ox.ac.uk.evil.com` cannot match; applied to the lower-cased address. */
const OXFORD_DOMAIN = /@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*ox\.ac\.uk$/;

export function isOxfordCollegeEmail(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!EMAIL_SHAPE.test(trimmed)) return false;
  return OXFORD_DOMAIN.test(trimmed.toLowerCase());
}

export function validateCollegeEmail(raw: string): ContactValidation {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return {
      valid: false,
      rule: "college_email_blank",
      message: "A college email is required.",
    };
  }

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
