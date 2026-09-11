/**
 * GSM-7 and segment arithmetic for one SMS body. LAN-330.
 *
 * Pure: no `server-only`, no environment, no network. It exists so the
 * fourteen rewritten bodies can be measured by a test rather than by eye,
 * and so a character outside the GSM-7 alphabet — an em dash, a curly quote,
 * an emoji — fails on a developer machine instead of silently dropping a
 * 160-character message to 70 characters per segment at the carrier.
 *
 * ## The rules this encodes
 *
 * GSM-7 fits 160 characters in one segment and 153 per segment once the
 * message is concatenated (the user-data header costs seven). Nine characters
 * in the basic alphabet's extension table — `^ { } \ [ ] ~ |` and the euro
 * sign — cost two septets each. Anything outside both tables forces the whole
 * message to UCS-2: 70 characters in one segment, 67 per segment after that.
 */

/** The GSM 03.38 basic character set, one septet each. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** The extension table: reachable, but two septets each. */
const GSM7_EXTENDED = "\f^{}\\[~]|€";

const BASIC = new Set(GSM7_BASIC);
const EXTENDED = new Set(GSM7_EXTENDED);

export interface SmsMeasurement {
  /** Code points in the body, as a person would count them. */
  readonly characters: number;
  /** `gsm7` when every character is in the alphabet, otherwise `ucs2`. */
  readonly encoding: "gsm7" | "ucs2";
  /** Septets for GSM-7 (extension characters count twice), code units for UCS-2. */
  readonly units: number;
  readonly segments: number;
  /** The characters that forced UCS-2, deduplicated, in order of appearance. */
  readonly offenders: readonly string[];
}

/** The characters in `body` that are outside GSM-7, deduplicated. */
export function nonGsm7Characters(body: string): readonly string[] {
  const seen = new Set<string>();
  for (const character of body) {
    if (!BASIC.has(character) && !EXTENDED.has(character)) seen.add(character);
  }
  return [...seen];
}

export function isGsm7(body: string): boolean {
  return nonGsm7Characters(body).length === 0;
}

/** How a carrier would encode and split this body. */
export function measureSms(body: string): SmsMeasurement {
  const characters = [...body].length;
  const offenders = nonGsm7Characters(body);

  if (offenders.length > 0) {
    // UCS-2 counts UTF-16 code units, so an astral character costs two.
    const units = body.length;
    return {
      characters,
      encoding: "ucs2",
      units,
      segments: units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67),
      offenders,
    };
  }

  let units = 0;
  for (const character of body) units += EXTENDED.has(character) ? 2 : 1;
  return {
    characters,
    encoding: "gsm7",
    units,
    segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153),
    offenders: [],
  };
}
