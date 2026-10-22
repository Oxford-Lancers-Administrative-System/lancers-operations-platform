/**
 * The event page's Everyone asked table, grouped — LAN-497 (Brian's walk of
 * 22 October 2026). The register's Group by, on the event page: same families,
 * same `by` choice. With a family chosen the table is split into collapsible
 * sections — Coaches first, as their own section; then one section per value of
 * the family that somebody holds, in roster vocabulary order; then "No <family>"
 * last. A person in several groups of the family is in each of them. Each
 * section carries its attendance tally, the same `tallyAttendance` as the
 * Attendance cards.
 *
 * Pure. The rows arrive already filtered and sorted, so filters, sort and
 * columns apply within each section unchanged.
 */
import {
  ATTENDANCE_GROUP_VALUES,
  ATTENDANCE_NO_GROUP_LABELS,
  type AttendanceGroupFamily,
  type AttendanceGroupValues,
} from "./attendance-group-by";
import {
  attendanceCapacityOf,
  tallyAttendance,
  type AttendanceTally,
} from "./event-attendance-progress";
import type { ParticipationPerson } from "./participation-view";

export type GroupedPerson = ParticipationPerson & { readonly groups?: AttendanceGroupValues };

export interface ParticipationSection<T extends GroupedPerson> {
  /** Unique within one view; also the section's test id suffix. */
  readonly key: string;
  readonly label: string;
  readonly people: readonly T[];
  readonly tally: AttendanceTally;
  /** Coaches and every group open on arrival; "No <family>" is closed, as in the register. */
  readonly defaultOpen: boolean;
}

export const COACHES_SECTION_LABEL = "Coaches";

/** A value's section key — `group-offensive-line`, the register's own. */
function sectionKey(value: string): string {
  return `group-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** The anchor id a participation key ends in: the membership id, else the person id. */
export function anchorOf(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

/** Hangs each person's group values on the row; a person with none known gets none. */
export function withGroupValues<T extends ParticipationPerson>(
  people: readonly T[],
  byAnchor: Readonly<Record<string, AttendanceGroupValues>>,
): (T & { groups?: AttendanceGroupValues })[] {
  return people.map((person) => {
    const groups = byAnchor[anchorOf(person.key)];
    return groups === undefined ? { ...person } : { ...person, groups };
  });
}

export function participationSections<T extends GroupedPerson>(
  people: readonly T[],
  groupBy: AttendanceGroupFamily,
): ParticipationSection<T>[] {
  const section = (
    key: string,
    label: string,
    held: readonly T[],
    defaultOpen: boolean,
  ): ParticipationSection<T> => ({
    key,
    label,
    people: held,
    tally: tallyAttendance(held),
    defaultOpen,
  });

  const coaches = people.filter((person) => attendanceCapacityOf(person) === "coach");
  const others = people.filter((person) => attendanceCapacityOf(person) !== "coach");

  const vocabulary = ATTENDANCE_GROUP_VALUES[groupBy];
  const held = new Set(others.flatMap((person) => person.groups?.[groupBy] ?? []));
  const outside = [...held]
    .filter((value) => !vocabulary.includes(value))
    .sort((left, right) => left.localeCompare(right, "en-GB"));
  const values = [...vocabulary.filter((value) => held.has(value)), ...outside];

  const sections = [
    section("coaches", COACHES_SECTION_LABEL, coaches, true),
    ...values.map((value) =>
      section(
        sectionKey(value),
        value,
        others.filter((person) => person.groups?.[groupBy]?.includes(value)),
        true,
      ),
    ),
    section(
      "no-group",
      ATTENDANCE_NO_GROUP_LABELS[groupBy],
      others.filter((person) => (person.groups?.[groupBy] ?? []).length === 0),
      false,
    ),
  ];
  return sections.filter((entry) => entry.people.length > 0);
}
