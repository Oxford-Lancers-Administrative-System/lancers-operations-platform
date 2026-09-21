import "server-only";

import crypto from "node:crypto";

import { toE164 } from "@/lib/delivery/phone-shape";

/**
 * How a destination is counted without storing a second copy of it. LAN-394.
 *
 * ## What this is not
 *
 * It is **not** anonymisation. The input space is small enough to enumerate —
 * every UK mobile number is a few billion candidates, and a club email address
 * far fewer — so a fingerprint is personal data that happens to be
 * inconvenient to read, and it is treated as personal data everywhere: server
 * storage only, never a log line, never an alert label, never a browser
 * payload, and cleared with the person id after eight days.
 *
 * What it buys is that the safety machinery never needs a second raw copy of
 * somebody's number or address to count by, and that a person holding the
 * database still cannot read one out of this table.
 *
 * ## Why the namespace
 *
 * Channel and version. The same string is a different destination on WhatsApp
 * and by email, and a later change to normalisation must produce different keys
 * rather than silently merging two people's counts — so the version is in the
 * hashed input, not beside it.
 */

const DESTINATION_KEY_VERSION = "v1";

/**
 * The fingerprint of the destination actually selected for sending.
 *
 * Normalisation is the sender's, not a second opinion: WhatsApp recipients
 * arrive from `selectMobileNumber` already in E.164 digits, and email arrives
 * from `selectEmailAddress` already trimmed and lower-cased. Nothing here
 * applies Gmail dot or plus-address heuristics — two addresses the club's own
 * email route treats as different destinations must count as different
 * destinations.
 */
export function destinationKey(channel: "whatsapp" | "email", recipient: string): string {
  const normalised = channel === "email" ? recipient.trim().toLowerCase() : recipient.trim();
  return crypto
    .createHash("sha256")
    .update(`${DESTINATION_KEY_VERSION}:${channel}:${normalised}`, "utf8")
    .digest("hex");
}

/** One recorded contact point, as the two senders read it. */
export interface ContactPointValue {
  readonly kind: string;
  readonly rawValue: string;
  readonly normalisedValue: string | null;
}

/**
 * Every destination fingerprint one person's recorded contact points could
 * have produced.
 *
 * This exists for erasure, and for one specific reason (LAN-394 review, B-01):
 * a destination scope is keyed by a fingerprint, and the only other way to find
 * it — the `safety_destination_key` on the person's own delivery attempts — has
 * been null since the eight-day retention sweep cleared it. An erasure carried
 * out nine days after somebody's last message would otherwise leave their
 * number's fingerprint in this table for ever. So erasure computes the
 * fingerprints from the contact points themselves, while it still holds them.
 *
 * Deliberately generous: both the normalised and the raw form of every value,
 * on whichever channel could send to it, because the sender picks one of those
 * forms and an erasure that guessed the wrong one would leave the row behind.
 * A fingerprint of a value this person does not hold simply matches nothing.
 */
export function destinationKeysForContactPoints(
  contacts: readonly ContactPointValue[],
  defaultCallingCode: string,
): readonly string[] {
  const keys = new Set<string>();
  for (const contact of contacts) {
    for (const value of [contact.normalisedValue, contact.rawValue]) {
      const trimmed = value?.trim() ?? "";
      if (trimmed === "") continue;

      // `selectEmailAddress` lower-cases and trims whatever is in an `email`
      // row; `selectMobileNumber` converts a phone row to E.164 or refuses.
      if (contact.kind === "email") {
        keys.add(destinationKey("email", trimmed));
        continue;
      }
      const e164 = toE164(trimmed, defaultCallingCode);
      if (e164) keys.add(destinationKey("whatsapp", e164));
    }
  }
  return [...keys];
}
