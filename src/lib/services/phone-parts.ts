/**
 * The two halves of a phone number — LAN-211, Brian 2026-09-01.
 *
 * > "It needs to be the country code as a dropdown list. I pick the country
 * > code, and then I do the mobile phone number. It ends up being two separate
 * > things… On the same line."
 *
 * Every phone input in the application is one shared control from here on
 * (`src/components/phone-field.tsx`), and this module is the rule underneath
 * it: which countries the dropdown offers, how a number already on file is
 * split back into the two boxes, how the two boxes are put back together, and
 * which of the two a refusal is about.
 *
 * Pure. No database, no `server-only`, no framework — the control that renders
 * it is a client component and the write path that finally commits the value
 * is not, and both have to get the same answer.
 *
 * ## Why this is not a second normaliser
 *
 * LAN-211 is explicit: "Extend that pair; do not fork it." There are exactly
 * two functions in this repository that decide whether a phone number is a
 * phone number — `toE164` in `src/lib/delivery/phone-shape.ts` and
 * `validatePhoneNumber` in `./person-validation.ts` — and this module calls
 * them rather than re-deriving anything. What it adds is *presentation of the
 * same answer*: `validatePhoneParts` runs the joined value through
 * `validatePhoneNumber` unchanged and then says which box the operator or
 * player has to look at, because "that is not the right number of digits" is
 * useless when the number is spread across two controls.
 *
 * What is stored is unchanged and still E.164, still produced by the existing
 * normaliser. The control posts a joined string through a hidden input under
 * the field's own `name`, so every server action that already reads
 * `formData.get("mobile")` and calls `validatePhoneNumber` on it keeps
 * working, byte for byte, without knowing the control changed.
 *
 * ## Why there is no country-list dependency
 *
 * LAN-211: "No new dependency for country lists unless Brian approves one —
 * check what is already installed first." Nothing installed carries one, and
 * the alternative — `libphonenumber` — is a large dependency whose value is
 * parsing arbitrary international input, which `phone-shape.ts`'s own module
 * note already records this codebase as deliberately not doing. The list below
 * is a dropdown's worth of countries, not a parsing library: it decides what
 * the control offers and nothing else. Adding a country is one line, and the
 * number still has to survive `toE164` afterwards either way.
 */

import { validatePhoneNumber, type PhoneValidation } from "./person-validation";

/** The club's own country. LAN-211: "The club is in Oxford, so the United Kingdom is the obvious default." */
export const DEFAULT_CALLING_CODE = "44";

export interface CallingCountry {
  /** ISO 3166-1 alpha-2, used only as a stable key for the option. */
  readonly iso: string;
  /** What the dropdown shows. */
  readonly name: string;
  /** Digits, no `+`. */
  readonly callingCode: string;
  /**
   * The domestic trunk prefix a national number is written with and which is
   * *not* part of the international number — `0` almost everywhere, absent in
   * the North American plan, where a number never starts with one.
   *
   * This is data rather than a rule for one reason: the club's members write
   * their own number the way they dial it at home, and dropping a leading `0`
   * where a country does not have a trunk prefix would eat a real digit.
   */
  readonly trunkPrefix: string;
}

/**
 * What the dropdown offers.
 *
 * Deliberately a short, ordinary list rather than all 250 territories: the
 * club recruits at an Oxford freshers' fair and an MBA cohort, so this is the
 * United Kingdom first and then the places its members actually come from, in
 * alphabetical order. A country nobody in the club is from is a line nobody
 * scrolls past; adding one when somebody is, is a one-line change decided the
 * same way these were.
 *
 * `toE164` still has the final word. A country here whose national length it
 * does not know falls through to its generic 8–15 digit range, which narrows
 * nothing and widens nothing — the same fallback it already applies to every
 * calling code but the club's own.
 */
export const CALLING_COUNTRIES: readonly CallingCountry[] = Object.freeze([
  { iso: "GB", name: "United Kingdom", callingCode: "44", trunkPrefix: "0" },
  { iso: "AU", name: "Australia", callingCode: "61", trunkPrefix: "0" },
  { iso: "AT", name: "Austria", callingCode: "43", trunkPrefix: "0" },
  { iso: "BE", name: "Belgium", callingCode: "32", trunkPrefix: "0" },
  { iso: "BR", name: "Brazil", callingCode: "55", trunkPrefix: "0" },
  { iso: "CA", name: "Canada", callingCode: "1", trunkPrefix: "" },
  { iso: "CN", name: "China", callingCode: "86", trunkPrefix: "0" },
  { iso: "CZ", name: "Czechia", callingCode: "420", trunkPrefix: "" },
  { iso: "DK", name: "Denmark", callingCode: "45", trunkPrefix: "" },
  { iso: "FI", name: "Finland", callingCode: "358", trunkPrefix: "0" },
  { iso: "FR", name: "France", callingCode: "33", trunkPrefix: "0" },
  { iso: "DE", name: "Germany", callingCode: "49", trunkPrefix: "0" },
  { iso: "GR", name: "Greece", callingCode: "30", trunkPrefix: "" },
  { iso: "HK", name: "Hong Kong", callingCode: "852", trunkPrefix: "" },
  { iso: "HU", name: "Hungary", callingCode: "36", trunkPrefix: "0" },
  { iso: "IN", name: "India", callingCode: "91", trunkPrefix: "0" },
  { iso: "IE", name: "Ireland", callingCode: "353", trunkPrefix: "0" },
  { iso: "IL", name: "Israel", callingCode: "972", trunkPrefix: "0" },
  // Italian mobile numbers carry no trunk prefix; the leading `0` on a
  // landline is part of the number itself, so nothing is stripped here.
  { iso: "IT", name: "Italy", callingCode: "39", trunkPrefix: "" },
  { iso: "JP", name: "Japan", callingCode: "81", trunkPrefix: "0" },
  { iso: "MY", name: "Malaysia", callingCode: "60", trunkPrefix: "0" },
  { iso: "MX", name: "Mexico", callingCode: "52", trunkPrefix: "" },
  { iso: "NL", name: "Netherlands", callingCode: "31", trunkPrefix: "0" },
  { iso: "NZ", name: "New Zealand", callingCode: "64", trunkPrefix: "0" },
  { iso: "NG", name: "Nigeria", callingCode: "234", trunkPrefix: "0" },
  { iso: "NO", name: "Norway", callingCode: "47", trunkPrefix: "" },
  { iso: "PL", name: "Poland", callingCode: "48", trunkPrefix: "" },
  { iso: "PT", name: "Portugal", callingCode: "351", trunkPrefix: "" },
  { iso: "RO", name: "Romania", callingCode: "40", trunkPrefix: "0" },
  { iso: "SG", name: "Singapore", callingCode: "65", trunkPrefix: "" },
  { iso: "ZA", name: "South Africa", callingCode: "27", trunkPrefix: "0" },
  { iso: "KR", name: "South Korea", callingCode: "82", trunkPrefix: "0" },
  { iso: "ES", name: "Spain", callingCode: "34", trunkPrefix: "" },
  { iso: "SE", name: "Sweden", callingCode: "46", trunkPrefix: "0" },
  { iso: "CH", name: "Switzerland", callingCode: "41", trunkPrefix: "0" },
  { iso: "TR", name: "Türkiye", callingCode: "90", trunkPrefix: "0" },
  { iso: "AE", name: "United Arab Emirates", callingCode: "971", trunkPrefix: "0" },
  { iso: "US", name: "United States", callingCode: "1", trunkPrefix: "" },
]);

/**
 * The trunk prefix for a calling code, or `"0"` for a code the list does not
 * carry.
 *
 * `"0"` rather than `""` for the unknown case on purpose: `0` is the trunk
 * prefix nearly everywhere, so treating an unlisted code as having one is the
 * reading that matches most numbers. It only ever applies to a value typed
 * with a leading zero, which somebody in a country without a trunk prefix has
 * no reason to type.
 */
function trunkPrefixFor(callingCode: string): string {
  return CALLING_COUNTRIES.find((c) => c.callingCode === callingCode)?.trunkPrefix ?? "0";
}

export interface PhoneParts {
  /** Digits, no `+`. Always one of `CALLING_COUNTRIES`' codes when it came from {@link splitPhoneNumber}. */
  readonly callingCode: string;
  /** What goes in the second box — digits, as the person would write them at home. */
  readonly nationalNumber: string;
}

/** An empty control, on the club's own country. */
export const EMPTY_PHONE_PARTS: PhoneParts = Object.freeze({
  callingCode: DEFAULT_CALLING_CODE,
  nationalNumber: "",
});

/**
 * The longest calling code in the list that these E.164 digits start with.
 *
 * Longest wins because the codes are a prefix set — `1` and no other North
 * American code, but `44` against `4`, and `353` against `35` if either ever
 * arrives. Ties (the United States and Canada both on `1`) resolve to
 * whichever the list names first, which is fine: the two are the same calling
 * code, and the control shows a country only as a way of choosing digits.
 */
function longestCallingCodeIn(digits: string): string | null {
  let best: string | null = null;
  for (const country of CALLING_COUNTRIES) {
    if (digits.startsWith(country.callingCode)) {
      if (best === null || country.callingCode.length > best.length) best = country.callingCode;
    }
  }
  return best;
}

/**
 * Splits a value already on file back into the two boxes — LAN-211's
 * "existing stored numbers must keep working".
 *
 * The stored form is E.164 digits with no `+` (that is what `toE164` returns
 * and what `contact_points.normalised_value` holds), but `raw_value` is
 * deliberately unvalidated at intake, so this also has to cope with what a
 * human typed: `+44 7700 900123`, `07700 900123`, `0044 7700 900123`, or
 * something that is not a number at all.
 *
 * It never repairs and never guesses a country. Where the calling code cannot
 * be told, the whole value goes into the national box on the default country
 * and the person sees exactly what the club has on file, wrong or right —
 * which is the point: a value that cannot be split is a value somebody needs
 * to look at, not one to silently reinterpret.
 */
export function splitPhoneNumber(stored: string | null | undefined): PhoneParts {
  if (typeof stored !== "string") return EMPTY_PHONE_PARTS;

  const trimmed = stored.trim();
  if (trimmed === "") return EMPTY_PHONE_PARTS;

  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits === "") {
    return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: trimmed };
  }

  // `00` is the other international prefix the club's data uses, and is the
  // same statement as a `+`.
  const international = hadPlus ? digits : digits.startsWith("00") ? digits.slice(2) : null;

  if (international !== null) {
    const code = longestCallingCodeIn(international);
    if (code === null) {
      // A real country the dropdown does not carry. Keeping the value whole is
      // honest; inventing a split would put digits in the wrong box.
      return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: trimmed };
    }
    return { callingCode: code, nationalNumber: international.slice(code.length) };
  }

  // No `+` and no `00`. A leading `0` is the club's own national form.
  if (digits.startsWith("0")) {
    return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: digits.replace(/^0+/, "") };
  }

  // Bare digits already carrying the club's calling code — the shape
  // `toE164` accepts without a `+`, and the shape every value normalised
  // before this control existed is in.
  const code = longestCallingCodeIn(digits);
  if (code !== null && digits.length > code.length) {
    return { callingCode: code, nationalNumber: digits.slice(code.length) };
  }

  return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: digits };
}

/**
 * Puts the two boxes back together into something `validatePhoneNumber` and
 * `toE164` already understand — an international number with an explicit `+`,
 * which is the one form neither of them has to make a judgement about.
 *
 * The domestic trunk prefix is removed here, once, because the person has
 * already said which country they are in: `07700 900123` picked against the
 * United Kingdom is `+44 7700900123`, and leaving the `0` in would make it
 * `+4407700900123`, which is not anybody's number. Countries with no trunk
 * prefix keep every digit (see {@link CallingCountry.trunkPrefix}).
 *
 * Returns `""` when there is nothing to join, so a caller can tell "blank"
 * from "blank country code".
 */
export function joinPhoneParts(callingCode: string, nationalNumber: string): string {
  const code = callingCode.replace(/[^0-9]/g, "");
  const national = nationalNumber.trim();
  if (national === "") return "";

  // Anything that is not a digit is left alone rather than stripped, so a
  // value with an `@` or a word in it still reaches `validatePhoneNumber` and
  // is refused there, by the one function that owns that refusal.
  if (!/^[0-9\s().-]+$/.test(national)) return national;

  let digits = national.replace(/[^0-9]/g, "");
  const trunk = trunkPrefixFor(code);
  if (trunk !== "" && digits.startsWith(trunk)) {
    digits = digits.slice(trunk.length);
  }

  if (code === "") return digits;
  return `+${code}${digits}`;
}

/** Which of the two controls a refusal is about. */
export type PhonePart = "country" | "number";

export interface PhonePartsValidation extends PhoneValidation {
  /** `null` when the value is valid. */
  readonly part: PhonePart | null;
}

/**
 * Validates the two boxes together, and names the one that is wrong —
 * LAN-211: "Validation errors stay inline and specific, and name which of the
 * two parts is wrong."
 *
 * The decision itself is `validatePhoneNumber`'s, unchanged and uncopied. All
 * this adds is the mapping from that function's `rule` onto a box and a
 * sentence that mentions it, because a person looking at two controls needs to
 * be told which one to fix.
 */
export function validatePhoneParts(
  callingCode: string,
  nationalNumber: string,
): PhonePartsValidation {
  const code = callingCode.replace(/[^0-9]/g, "");

  if (code === "") {
    return {
      valid: false,
      part: "country",
      rule: "phone_country_code_required",
      message: "Choose the country code.",
    };
  }

  if (nationalNumber.trim() === "") {
    return {
      valid: false,
      part: "number",
      rule: "phone_blank",
      message: "A phone number is required.",
    };
  }

  const result = validatePhoneNumber(joinPhoneParts(code, nationalNumber));
  if (result.valid) return { ...result, part: null };

  switch (result.rule) {
    case "phone_not_numeric":
      return {
        ...result,
        part: "number",
        message: "The phone number can only contain digits — remove anything else.",
      };
    case "phone_wrong_length":
      return {
        ...result,
        part: "number",
        message: `That is not the right number of digits for +${code}. Enter the number without the country code.`,
      };
    // `phone_country_code_required` cannot be reached from here — the value
    // handed to `validatePhoneNumber` always carries an explicit `+` and a
    // code — but a rule this module does not recognise is still somebody's
    // problem, and the number box is where they typed it.
    default:
      return { ...result, part: "number" };
  }
}
