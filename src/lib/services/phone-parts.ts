/**
 * The two halves of a phone number — LAN-211. One shared control
 * (`src/components/phone-field.tsx`); this module splits, joins and
 * validates the two boxes, calling `toE164`/`validatePhoneNumber` rather
 * than re-deriving anything. Pure — no database, no `server-only`.
 */

import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import metadata from "libphonenumber-js/min/metadata";

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

/**
 * Metadata layout of `libphonenumber-js/min`: a country is
 * `[callingCode, idd, pattern, lengths, formats, nationalPrefix, …]`, and
 * `country_calling_codes[code]` lists the countries sharing a code, the main one
 * first. The test file pins the positions this reads.
 */
const NATIONAL_PREFIX_AT = 5;

/** The first-listed country sharing +1; its prefix `"1"` is the dialling digit of the North American plan, never part of a national number (area codes cannot start with 1). */
const NORTH_AMERICA_CALLING_CODE = "1";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function trunkPrefixOf(iso: string, callingCode: string): string {
  if (callingCode === NORTH_AMERICA_CALLING_CODE) return "";
  const prefix = (metadata.countries as Record<string, readonly unknown[]>)[iso]?.[
    NATIONAL_PREFIX_AT
  ];
  // Only a leading-zero prefix (`0`, Hungary's `06`) is safe to strip: `8` (Russia,
  // Kazakhstan, Belarus, Turkmenistan) and `1` (Marshall Islands) can start a real
  // national number, such as an 8-800 toll-free line, and stripping would corrupt it.
  return typeof prefix === "string" && /^0[0-9]*$/.test(prefix) ? prefix : "";
}

function callingCountryFor(iso: CountryCode): CallingCountry | null {
  const name = regionNames.of(iso);
  if (name === undefined || name === iso) return null; // no English name — not a country a person can pick
  const callingCode = getCountryCallingCode(iso);
  return { iso, name, callingCode, trunkPrefix: trunkPrefixOf(iso, callingCode) };
}

/**
 * The menu, in the order it renders (`src/components/phone-field.tsx`): the
 * United States, then the United Kingdom, then every other country and
 * territory libphonenumber-js carries, alphabetically (Brian, LAN-355, LAN-485).
 * `DEFAULT_CALLING_CODE` is still 44 — this is the order the list is read in,
 * not what an empty field starts on. Countries sharing a calling code (Canada
 * and the Caribbean on +1, Jersey and Guernsey on +44) each keep their own
 * entry; `trunkPrefixFor` answers from the code, using the code's main country.
 */
export const CALLING_COUNTRIES: readonly CallingCountry[] = Object.freeze(
  (() => {
    const all = getCountries()
      .map(callingCountryFor)
      .filter((country): country is CallingCountry => country !== null);
    const first = ["US", "GB"].map((iso) => all.find((country) => country.iso === iso)!);
    const rest = all
      .filter((country) => !first.includes(country))
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    return [...first, ...rest];
  })(),
);

const TRUNK_PREFIX_BY_CALLING_CODE: ReadonlyMap<string, string> = new Map(
  Object.entries(metadata.country_calling_codes).map(([code, countries]) => [
    code,
    trunkPrefixOf(countries[0]!, code),
  ]),
);

/** The trunk prefix for a calling code, or `"0"` for a code the dataset does not carry (the common case). */
function trunkPrefixFor(callingCode: string): string {
  return TRUNK_PREFIX_BY_CALLING_CODE.get(callingCode) ?? "0";
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
