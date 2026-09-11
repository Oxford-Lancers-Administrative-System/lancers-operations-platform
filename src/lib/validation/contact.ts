/**
 * The phone and email shape checks every roster-entry surface shares. LAN-215,
 * B-007. Imports `toE164` from `./phone-shape.ts`, never the `server-only`
 * `delivery/phone.ts`.
 * Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION
 */

import { toE164 } from "@/lib/delivery/phone-shape";

/** Shown when a phone number cannot be converted to E.164 at all. */
export const PHONE_SHAPE_MESSAGE =
  "This does not look like a phone number. Enter it with its country code (or a UK number " +
  "starting with 0), and check the digit count.";

/** Shown when an email address has no `@`, or nothing on one side of it. */
export const EMAIL_SHAPE_MESSAGE =
  "This does not look like an email address. Enter it as it was given, including the @, " +
  "or leave it blank.";

/** The Oxford Lancers' own calling code — the one a bare national number defaults to. */
const DEFAULT_CALLING_CODE = "44";

/** Whether `value` can become an E.164 number — the same question `toE164` answers. Never repairs a number. */
export function looksLikePhone(
  value: string,
  defaultCallingCode: string = DEFAULT_CALLING_CODE,
): boolean {
  return toE164(value, defaultCallingCode) !== null;
}

/** One `@`, no internal spaces (LAN-74). Not a full RFC parser: strict ones reject real addresses. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+$/.test(trimmed);
}
