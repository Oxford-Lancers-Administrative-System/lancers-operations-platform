import "server-only";

/**
 * Turning what the club recorded into what a provider will accept. LAN-78.
 *
 * The conversion itself — the pure "can this become E.164 without guessing"
 * question — lives in `./phone-shape.ts`, which carries no `server-only` tag
 * so that `src/lib/validation/contact.ts` can ask the same question from a
 * form's shape check (LAN-215, B-007: "the same phone validation everywhere").
 * `toE164` is re-exported here unchanged, so every existing caller of this
 * module sees no difference at all.
 *
 * This module stays `server-only` because its own job — turning a recorded
 * contact into what gets handed to Meta — must never run in a browser, even
 * though the conversion it delegates to no longer lives in this file.
 *
 * `selectMobileNumber` followed `toE164` there for LAN-307 (R7-1), for the same
 * reason and with the same re-export; see the note on the export below.
 */

import { selectMobileNumber, toE164, type ContactPointRow } from "./phone-shape";

/**
 * `selectMobileNumber` — the number to send an invitation to, from a person's
 * recorded contact points — moved to `./phone-shape.ts` for LAN-307 (R7-1) and
 * is re-exported here unchanged, exactly as `toE164` already was. The reason is
 * the same one: the surface that shows an operator where a send will go is a
 * client component, and it has to ask this module's question rather than a
 * second copy of it. Every existing caller of this module sees no difference.
 */
export { selectMobileNumber, toE164, type ContactPointRow };

/** What an operator is told when nobody can send to this person. */
export const NO_USABLE_NUMBER_REASON =
  "No usable mobile number is recorded for this person, so nothing could be sent. " +
  "Add or correct their phone number on the roster, then retry.";
