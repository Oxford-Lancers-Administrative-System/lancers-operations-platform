/**
 * The two halves of a phone number — LAN-211. One shared control
 * (`src/components/phone-field.tsx`); this module splits, joins and
 * validates the two boxes, calling `toE164`/`validatePhoneNumber` rather
 * than re-deriving anything. Pure — no database, no `server-only`.
 * Decision history: LAN-211, missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION
 */

import { validatePhoneNumber, type PhoneValidation } from "./person-validation";

/** The club's own country and default dropdown value. */
export const DEFAULT_CALLING_CODE = "44";

export interface CallingCountry {
  readonly iso: string;
  readonly name: string;
  readonly callingCode: string;
  /** The domestic trunk prefix, not part of the international number — `0` almost everywhere, absent in the North American plan. */
  readonly trunkPrefix: string;
}

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

/** The trunk prefix for a calling code, or `"0"` for a code the list does not carry (the common case). */
function trunkPrefixFor(callingCode: string): string {
  return CALLING_COUNTRIES.find((c) => c.callingCode === callingCode)?.trunkPrefix ?? "0";
}

export interface PhoneParts {
  readonly callingCode: string;
  readonly nationalNumber: string;
}

export const EMPTY_PHONE_PARTS: PhoneParts = Object.freeze({
  callingCode: DEFAULT_CALLING_CODE,
  nationalNumber: "",
});

/** The longest calling code in the list these E.164 digits start with (longest wins — the codes are a prefix set). */
function longestCallingCodeIn(digits: string): string | null {
  let best: string | null = null;
  for (const country of CALLING_COUNTRIES) {
    if (digits.startsWith(country.callingCode)) {
      if (best === null || country.callingCode.length > best.length) best = country.callingCode;
    }
  }
  return best;
}

/** Splits a stored value back into the two boxes (LAN-211). Never guesses a country: an unsplittable value goes whole into the national box. */
export function splitPhoneNumber(stored: string | null | undefined): PhoneParts {
  if (typeof stored !== "string") return EMPTY_PHONE_PARTS;

  const trimmed = stored.trim();
  if (trimmed === "") return EMPTY_PHONE_PARTS;

  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits === "") {
    return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: trimmed };
  }

  const international = hadPlus ? digits : digits.startsWith("00") ? digits.slice(2) : null;

  if (international !== null) {
    const code = longestCallingCodeIn(international);
    if (code === null) {
      return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: trimmed };
    }
    return { callingCode: code, nationalNumber: international.slice(code.length) };
  }

  if (digits.startsWith("0")) {
    return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: digits.replace(/^0+/, "") };
  }

  const code = longestCallingCodeIn(digits);
  if (code !== null && digits.length > code.length) {
    return { callingCode: code, nationalNumber: digits.slice(code.length) };
  }

  return { callingCode: DEFAULT_CALLING_CODE, nationalNumber: digits };
}

/** Joins the two boxes into an explicit `+`-prefixed number for `validatePhoneNumber`/`toE164`, trunk prefix stripped. */
export function joinPhoneParts(callingCode: string, nationalNumber: string): string {
  const code = callingCode.replace(/[^0-9]/g, "");
  const national = nationalNumber.trim();
  if (national === "") return "";

  if (!/^[0-9\s().-]+$/.test(national)) return national;

  let digits = national.replace(/[^0-9]/g, "");
  const trunk = trunkPrefixFor(code);
  if (trunk !== "" && digits.startsWith(trunk)) {
    digits = digits.slice(trunk.length);
  }

  if (code === "") return digits;
  return `+${code}${digits}`;
}

type PhonePart = "country" | "number";

export interface PhonePartsValidation extends PhoneValidation {
  readonly part: PhonePart | null;
}

/** Validates the two boxes together via `validatePhoneNumber`, and names which one is wrong (LAN-211). */
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
    default:
      return { ...result, part: "number" };
  }
}
