// Discrepancy vocabulary (D64, W7, LAN-157 R157-B3).
export const STORED_MISMATCH_CLASSES = Object.freeze([
  "said_yes_no_attendance_recorded",
  "said_yes_marked_absent",
  "said_no_but_attended",
  "attended_without_invitation",
] as const);

export const DERIVED_DISCREPANCIES = Object.freeze([
  "said_yes_marked_absent",
  "said_no_but_attended",
  "never_answered_attended",
] as const);

export type DerivedDiscrepancy = (typeof DERIVED_DISCREPANCIES)[number];

export const NOT_DERIVED = Object.freeze([
  "said_yes_no_attendance_recorded",
  "attended_without_invitation",
] as const);

export const NOT_STORED = Object.freeze(["never_answered_attended"] as const);
