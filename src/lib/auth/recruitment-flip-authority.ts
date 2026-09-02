/**
 * The one gate `capabilities.ts` cannot hold — LAN-204, `W14`, correction
 * round 1 (F-LAN204-001, then F-LAN204-CORR1-008).
 *
 * `flipRecruitmentProspectAction`'s role list. `W14` (locked) names exactly
 * "President, Vice President, Secretary and General Manager, and nobody
 * else, ever" for the mission's one irreversible action, and `REQ-core-four`
 * is explicit that recruitment mints no new capability for it — so this is
 * not `person_record_authority` (which admits `it_officer`, LAN-124's
 * standing administrative exception, correct for every other surface in
 * this package but not for this one) and it is not a new entry in
 * `capabilities.ts` either: every "core four" capability that map has ever
 * held has since had `it_officer` added under LAN-124's own precedent
 * ("the administrative seat holds every capability in this file") — see
 * `membership_activation` and `event_calendar_management` there, both
 * widened exactly that way. A map entry for the flip would be the identical
 * shape and, on that same precedent, an equally reasonable target for the
 * next widening, which is precisely what "and nobody else, ever" forbids.
 *
 * `requireRole()` (`guards.ts`, LAN-73's own second guard, built for this
 * and until this PR never called anywhere in production) is the deliberate
 * escape from that drift: a literal, narrower-than-the-map check,
 * independent of `capabilityRoleCodes` and everything that widens through
 * it — found by review after `board-actions.test.ts` proved an
 * IT-Officer-only operator could reach the flip through
 * `person_record_authority` (F-LAN204-001).
 *
 * ## Why this lives in its own file
 *
 * `tests/capability-map-single-source.test.ts`'s row-8 scan (LAN-73, "the
 * capability map is the only place a role code decides anything") forbids a
 * role-code literal anywhere but `capabilities.ts`. This module is that
 * scan's one other, narrow, documented exception — and it holds *only* this
 * one constant, so the exception cannot silently widen to cover an
 * unrelated role literal dropped anywhere else in `board-actions.ts`. The
 * first cut of this correction put the whole of `board-actions.ts` in the
 * scan's allow-list instead; the reviewer proved the cost by injecting an
 * unrelated `"treasurer"` literal into that file and watching the invariant
 * pass 8/8, silently. Isolating the four codes here, and only here, means
 * `board-actions.ts` itself is back under the scan, and a future role
 * literal added anywhere in it — this constant excepted — is caught again.
 */
export const FLIP_ROLE_CODES = [
  "president",
  "vice_president",
  "secretary",
  "general_manager",
] as const;

export const FLIP_ROLE_RULE = "recruitment_flip_core_four_only";
