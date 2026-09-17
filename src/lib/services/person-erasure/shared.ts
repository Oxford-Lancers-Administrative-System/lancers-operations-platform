import "server-only";

/**
 * Erasure means anonymisation — LAN-361, Brian 2026-09-16.
 *
 * The controller is the University of Oxford. A person who asks to be erased
 * is tombstoned, not deleted: everything that identifies them goes, and every
 * record of what the club did keeps pointing at the row that is left. Deleting
 * the row would take a season's attendance, RSVPs and agreements with it, and
 * a person asking not to be identifiable is not asking for that.
 */

/** What a tombstoned person is called on every screen that still lists them. */
export const ERASED_DISPLAY_NAME = "Erased person";

/** What a free-text value that named them becomes. Fixed, so a reader can tell it apart from a value somebody typed. */
export const ERASED_TEXT = "[erased]";

/**
 * The seats come from `@/lib/auth/capabilities`, which is the only module in
 * `src/` allowed to name a role code. The rule about them is `signoff.ts`'s.
 */
export {
  CORE_FOUR_ROLE_CODES,
  REQUIRED_ERASURE_SIGNOFF_ROLE_CODES as REQUIRED_SIGNOFF_ROLE_CODES,
} from "@/lib/auth/capabilities";
