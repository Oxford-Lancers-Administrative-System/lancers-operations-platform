/**
 * The two vocabularies for "RSVP and attendance disagree", and where they
 * differ — D64, W7, LAN-157 (correction R157-B3).
 *
 * ## Why this module exists rather than a comment
 *
 * There are two of them, they are not the same set, and until this file they
 * were spelled out in two places that no reader of the other would find. The
 * participation table derives its marker in TypeScript
 * (`./participation-view.ts`), and the database classifies its own in
 * `public.rsvp_attendance_mismatches`. One shared class was spelled
 * `said_no_attended` here and `said_no_but_attended` there: near-identical,
 * non-identical, and a future join or report mapping would have missed it in
 * silence. The stored spelling is the durable one — it is in shipped
 * migrations and cannot be renamed without one — so TypeScript moved to it.
 *
 * ## The divergence, stated once
 *
 * The derived set is **not** a subset and **not** a superset of the stored one.
 *
 * | Class                            | Stored view | Derived marker | Why                                                    |
 * | -------------------------------- | ----------- | -------------- | ------------------------------------------------------ |
 * | `said_yes_marked_absent`         | ✅          | ✅             | the shared case, spelled identically                    |
 * | `said_no_but_attended`           | ✅          | ✅             | the shared case this correction re-spelled              |
 * | `said_yes_no_attendance_recorded`| ✅          | ❌             | deliberately excluded — see below                       |
 * | `attended_without_invitation`    | ✅          | ❌             | deliberately excluded — see below                       |
 * | `never_answered_attended`        | ❌          | ✅             | the view does not classify it at all                    |
 *
 * **`said_yes_no_attendance_recorded` is excluded** because a person who said
 * yes and is not on the sheet is not a disagreement — it is an absence, and the
 * club already has a word for it: *not recorded*. That is LAN-152's rule, and
 * it is the same rule one row at a time: a half-filled register must not accuse
 * the half nobody has reached yet.
 *
 * **`attended_without_invitation` is excluded** because on this table it is a
 * walk-up, and the row already says so twice — the Capacity column reads
 * **Walk-up** and the Invitation column reads "—". A third marker beside the
 * name would be noise, and the approved mockup leaves Wilfrid Danecroft
 * unmarked.
 *
 * **`never_answered_attended` is added** because the approved mockup marks
 * Cassian Wolvercote — never answered, then present — and the stored view emits
 * no class for that combination at all. Reading the view would therefore not
 * have reproduced the screen Brian approved.
 *
 * ## Neither set is authoritative over the other
 *
 * They answer different questions. The view answers "what did the season's
 * completed events disagree about?" and is bounded by `occurred_events`, whose
 * `scheduled_on < today` term means it emits nothing on the evening of the
 * event — exactly when the register is open and a coach would notice somebody
 * who said no standing on the pitch. The derived marker answers "what do these
 * two records say about this person, right now?" and has no date term.
 *
 * Changing the view is a migration and belongs to whoever owns the reporting
 * question. Nothing here touches it.
 */

/**
 * What `public.rsvp_attendance_mismatches.mismatch` can hold.
 *
 * Kept in this file's own words rather than generated, because the view is SQL
 * and there is nothing to generate from. It is pinned to the shipped migration
 * by `./participation-view.test.ts`, so a fifth class added to the view without
 * a look at this file fails a test rather than drifting quietly.
 */
export const STORED_MISMATCH_CLASSES = Object.freeze([
  "said_yes_no_attendance_recorded",
  "said_yes_marked_absent",
  "said_no_but_attended",
  "attended_without_invitation",
] as const);

/**
 * What the participation table derives. Two of the stored spellings, plus one
 * case the view does not classify.
 */
export const DERIVED_DISCREPANCIES = Object.freeze([
  "said_yes_marked_absent",
  "said_no_but_attended",
  "never_answered_attended",
] as const);

export type DerivedDiscrepancy = (typeof DERIVED_DISCREPANCIES)[number];

/** Stored classes the derived marker deliberately does not raise. */
export const NOT_DERIVED = Object.freeze([
  "said_yes_no_attendance_recorded",
  "attended_without_invitation",
] as const);

/** Derived classes the stored view does not classify at all. */
export const NOT_STORED = Object.freeze(["never_answered_attended"] as const);
