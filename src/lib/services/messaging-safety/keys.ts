import "server-only";

import crypto from "node:crypto";

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

export const DESTINATION_KEY_VERSION = "v1";

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
