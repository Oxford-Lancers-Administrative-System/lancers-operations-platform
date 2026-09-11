import type { AttendanceEvent } from "@/lib/services/player-record";

/**
 * Sort/filter vocabulary and pure helpers for the Attendance band's table and
 * cards. Decision history: docs/ux/tickets/LAN-187-player-record.md.
 */

export type SortKey = "eventName" | "date" | "isMandatory" | "rsvp" | "attendance" | "eventStatus";
export type FilterKey = "isMandatory" | "rsvp" | "attendance" | "eventStatus";

export const COLUMNS: readonly { key: SortKey; label: string; filterKey?: FilterKey }[] =
  Object.freeze([
    { key: "eventName", label: "Event" },
    { key: "date", label: "Date" },
    { key: "isMandatory", label: "Mandatory", filterKey: "isMandatory" },
    { key: "rsvp", label: "RSVP", filterKey: "rsvp" },
    { key: "attendance", label: "Attendance", filterKey: "attendance" },
    // Appended rather than inserted earlier (W1) — the five existing columns
    // keep their own order and behaviour exactly; this is the one new column.
    { key: "eventStatus", label: "Event status", filterKey: "eventStatus" },
  ]);

/**
 * Defaults the table to `Occurred` (W1, Q-19) — Brian's walkthrough found
 * every invited event on screen, including ones that had not happened yet,
 * above a score that only ever counted occurred ones. `clearAll()` drops this
 * back to "everything", same as any other filter.
 */
export const DEFAULT_FILTERS: Readonly<Record<FilterKey, string>> = Object.freeze({
  isMandatory: "",
  rsvp: "",
  attendance: "",
  eventStatus: "Occurred",
});

export const FILTER_LABEL: Readonly<Record<FilterKey, string>> = Object.freeze({
  isMandatory: "Mandatory",
  rsvp: "RSVP",
  attendance: "Attendance",
  eventStatus: "Event status",
});

export const FILTER_OPTIONS: Readonly<Record<FilterKey, readonly string[]>> = Object.freeze({
  isMandatory: ["Mandatory", "Not mandatory"],
  rsvp: ["Yes", "No", "Not recorded"],
  attendance: ["Present", "Late", "Absent", "Excused", "Not recorded"],
  eventStatus: ["Occurred", "Upcoming", "Cancelled"],
});

export const FILTERABLE: readonly { key: FilterKey; label: string; options: readonly string[] }[] =
  Object.freeze([
    { key: "isMandatory", label: FILTER_LABEL.isMandatory, options: FILTER_OPTIONS.isMandatory },
    { key: "rsvp", label: FILTER_LABEL.rsvp, options: FILTER_OPTIONS.rsvp },
    { key: "attendance", label: FILTER_LABEL.attendance, options: FILTER_OPTIONS.attendance },
    { key: "eventStatus", label: FILTER_LABEL.eventStatus, options: FILTER_OPTIONS.eventStatus },
  ]);

export const RSVP_LABEL: Readonly<Record<"yes" | "no", string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

export const ATTENDANCE_LABEL: Readonly<Record<"present" | "late" | "excused" | "absent", string>> =
  Object.freeze({
    present: "Present",
    late: "Late",
    excused: "Excused",
    absent: "Absent",
  });

/**
 * `derivedEventState()`'s three words, in the club's language — the same
 * wording `/operate/events`'s own Status column already uses. Restyled as a
 * local constant: this package does not import from `roster-board.tsx` or the
 * events surface.
 */
export const EVENT_STATUS_LABEL: Readonly<Record<AttendanceEvent["eventStatus"], string>> =
  Object.freeze({
    upcoming: "Upcoming",
    occurred: "Occurred",
    cancelled: "Cancelled",
  });

/**
 * The third score figure (W2, Q-19) — occurred mandatory events with no
 * attendance record, out of exactly the rows given. A separate, named
 * function rather than inlined so a later reversal to a miss-counting
 * denominator is a one-line change here, not a search through the render.
 */
export function countUnrecordedOccurredMandatory(rows: readonly AttendanceEvent[]): number {
  return rows.filter(
    (event) => event.isMandatory && event.eventStatus === "occurred" && event.attendance === null,
  ).length;
}

/** One event's display value for a given filterable field — what a filter compares against. */
export function filterLabel(event: AttendanceEvent, key: FilterKey): string {
  switch (key) {
    case "isMandatory":
      return event.isMandatory ? "Mandatory" : "Not mandatory";
    case "rsvp":
      return event.rsvp === null ? "Not recorded" : RSVP_LABEL[event.rsvp];
    case "attendance":
      return event.attendance === null ? "Not recorded" : ATTENDANCE_LABEL[event.attendance];
    case "eventStatus":
      return EVENT_STATUS_LABEL[event.eventStatus];
    default:
      return "";
  }
}

/** `not recorded` sorts last in either direction, matching the board's own `comparable()`. */
export function comparable(event: AttendanceEvent, key: SortKey): string {
  switch (key) {
    case "eventName":
      return event.eventName;
    case "date":
      return event.date ?? "￿";
    case "isMandatory":
      return event.isMandatory ? "0" : "1";
    case "rsvp":
      return event.rsvp ?? "￿";
    case "attendance":
      return event.attendance ?? "￿";
    case "eventStatus":
      return event.eventStatus;
    default:
      return "";
  }
}
