import { EVENTS, type Recruit } from "./fixtures";

/**
 * The recruit board's column model — LAN-200, `W1`.
 *
 * The same idea `src/app/operate/roster/board-columns.ts` ships for the roster
 * board, and deliberately the same *shape*: a column is one entry here, and
 * that entry drives banding, width, sorting, filtering and whether the cell
 * edits in place or routes out. Adding a column should be one entry, never a
 * new `<TableCell>` in four places.
 *
 * It is a separate file rather than an extension of the shipped one because a
 * recruit holds no membership. Two of the roster's three bands — Onboarding
 * and Season — describe nothing about somebody who has not joined, and a band
 * over no facts is noise.
 */

export type Band = "person" | "recruitment" | "event";

export interface BandDef {
  readonly key: string;
  readonly label: string;
  readonly header: string;
  readonly tint: string;
  readonly solid: string;
}

/** The shipped board's own constants, so the two surfaces line up pixel for pixel. */
export const BAND_ROW_HEIGHT = 28;
export const BAND_LABEL_INSET_PX = 16;
export const RECRUIT_COLUMN_WIDTH = 200;

/**
 * Person keeps the roster's slate and Events reuses the Season blue, both
 * unchanged. The Recruitment band's teal is the one genuinely new colour in
 * the mission, and `W1` records it as **proposed rather than locked**: it sits
 * beside slate and blue without competing, and it is not the amber that
 * already means Onboarding. If Brian would rather the recruitment band reuse
 * the Season blue and the event columns take the new colour, that is the two
 * hex values below and nothing else.
 */
export const PERSON_BAND: BandDef = Object.freeze({
  key: "person",
  label: "Person",
  header: "#455a64",
  tint: "rgba(69, 90, 100, 0.045)",
  solid: "#f4f5f6",
});

export const RECRUITMENT_BAND: BandDef = Object.freeze({
  key: "recruitment",
  label: "Recruitment",
  header: "#00695c",
  tint: "rgba(0, 105, 92, 0.05)",
  solid: "#f1f7f6",
});

export const EVENT_BAND: Pick<BandDef, "header" | "tint" | "solid"> = Object.freeze({
  header: "#0b3d91",
  tint: "rgba(11, 61, 145, 0.04)",
  solid: "#f4f6fa",
});

/** The attendance card's own violet, from the shipped player record. */
export const ATTENDANCE_BAND: Pick<BandDef, "header" | "tint"> = Object.freeze({
  header: "#4527a0",
  tint: "rgba(69, 39, 160, 0.05)",
});

/**
 * `record` — a person fact: renders, routes to the person record, and carries
 * `edit on the record` under its header, exactly as the roster board's person
 * columns do. `select` and `text` — this mission's own facts, edited in the
 * cell. `none` — derived or displayed only.
 */
export type EditKind = "none" | "record" | "select" | "text";

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly band: Band;
  /** Which event this column belongs to, for the Events band only. */
  readonly eventId?: string;
  readonly bandKey: string;
  readonly bandLabel: string;
  readonly edit: EditKind;
  readonly options?: readonly string[];
  readonly width: number;
  readonly sortable: boolean;
  readonly filterable: boolean;
}

/**
 * The board's columns, in order: Person, Recruitment, then one band per
 * recruitment event appended at the right end, oldest first.
 *
 * `On WhatsApp` and `Last touch` are **absent by decision**, not by omission.
 * Brian struck both on 2026-08-31 — "let's just make events events" — because
 * neither is a fact stored about a recruit. `Invitation` is absent for the
 * same kind of reason: "I don't care if they were invited or not." A walk-up
 * therefore needs no special rendering at all — it reads as RSVP `Not
 * recorded` against an attendance of `Present`, which is exactly what
 * happened.
 */
export function buildColumns(): readonly ColumnDef[] {
  const person: ColumnDef[] = [
    {
      key: "college",
      label: "College",
      band: "person",
      bandKey: "person",
      bandLabel: PERSON_BAND.label,
      edit: "record",
      width: 148,
      sortable: true,
      filterable: true,
    },
    {
      key: "matriculation",
      label: "Matric",
      band: "person",
      bandKey: "person",
      bandLabel: PERSON_BAND.label,
      edit: "record",
      width: 104,
      sortable: true,
      filterable: true,
    },
    {
      key: "contactable",
      label: "Contactable",
      band: "person",
      bandKey: "person",
      bandLabel: PERSON_BAND.label,
      edit: "none",
      width: 156,
      sortable: true,
      filterable: true,
    },
  ];

  const recruitment: ColumnDef[] = [
    {
      key: "status",
      label: "Status",
      band: "recruitment",
      bandKey: "recruitment",
      bandLabel: RECRUITMENT_BAND.label,
      edit: "select",
      width: 136,
      sortable: true,
      filterable: true,
    },
    {
      key: "source",
      label: "Source",
      band: "recruitment",
      bandKey: "recruitment",
      bandLabel: RECRUITMENT_BAND.label,
      edit: "text",
      width: 200,
      sortable: true,
      filterable: true,
    },
    {
      key: "firstContact",
      label: "First contact",
      band: "recruitment",
      bandKey: "recruitment",
      bandLabel: RECRUITMENT_BAND.label,
      edit: "text",
      width: 140,
      sortable: true,
      filterable: true,
    },
    {
      key: "asked",
      label: "Asked",
      band: "recruitment",
      bandKey: "recruitment",
      bandLabel: RECRUITMENT_BAND.label,
      edit: "none",
      width: 132,
      sortable: true,
      filterable: true,
    },
    {
      key: "notes",
      label: "Notes",
      band: "recruitment",
      bandKey: "recruitment",
      bandLabel: RECRUITMENT_BAND.label,
      edit: "none",
      width: 260,
      sortable: false,
      filterable: false,
    },
  ];

  /**
   * One band per event, over **two columns side by side** — Brian, 2026-08-31:
   * "a heading for what the event was, RSVP, what the RSVP status was,
   * attendance right after that. I want to see them side by side."
   *
   * This uses the shipped two-row banded header exactly as it already works:
   * the event's name and date are a band over its two columns, so there is no
   * third header row and no new structure.
   */
  const events: ColumnDef[] = EVENTS.flatMap((event) => [
    {
      key: `${event.id}:rsvp`,
      label: "RSVP",
      band: "event" as const,
      eventId: event.id,
      bandKey: `event:${event.id}`,
      bandLabel: `${event.name} · ${event.shortDate}`,
      edit: "none" as const,
      width: 132,
      sortable: true,
      filterable: true,
    },
    {
      key: `${event.id}:attendance`,
      label: "Attendance",
      band: "event" as const,
      eventId: event.id,
      bandKey: `event:${event.id}`,
      bandLabel: `${event.name} · ${event.shortDate}`,
      edit: "none" as const,
      width: 148,
      sortable: true,
      filterable: true,
    },
  ]);

  return Object.freeze([...person, ...recruitment, ...events]);
}

export function bandColoursOf(column: ColumnDef): BandDef {
  if (column.band === "person") return PERSON_BAND;
  if (column.band === "recruitment") return RECRUITMENT_BAND;
  return { ...EVENT_BAND, key: column.bandKey, label: column.bandLabel };
}

/** The word shown when a cell has nothing in it. Grey, never blank, never defaulted. */
export const NOT_RECORDED = "Not recorded";

/**
 * One cell's value as a string — the single place a column key maps onto a
 * recruit's fields, so a new column adds one arm here rather than a branch in
 * the board, the sorter and the filter list.
 */
export function valueOf(recruit: Recruit, key: string): string {
  switch (key) {
    case "college":
      return recruit.college ?? NOT_RECORDED;
    case "matriculation":
      return recruit.matriculationYear === null ? NOT_RECORDED : String(recruit.matriculationYear);
    case "contactable":
      return [recruit.mobile ? "Mobile" : null, recruit.email ? "Email" : null]
        .filter(Boolean)
        .join(" · ");
    case "status":
      return recruit.status;
    case "source":
      return recruit.source;
    case "firstContact":
      return recruit.firstContactOn;
    case "asked":
      return askedLabel(recruit);
    case "notes":
      return recruit.notes[0]?.body ?? NOT_RECORDED;
    default:
      break;
  }

  const [eventId, half] = key.split(":");
  const participation = recruit.events.find((entry) => entry.eventId === eventId);
  if (!participation) return NOT_RECORDED;
  if (half === "rsvp") {
    return participation.rsvp === null ? NOT_RECORDED : participation.rsvp === "yes" ? "Yes" : "No";
  }
  if (participation.attendance === null) return NOT_RECORDED;
  return participation.attendance.charAt(0).toUpperCase() + participation.attendance.slice(1);
}

/**
 * `Asked` — whether the recruit-stage form is open, answered, or never sent.
 *
 * `W1` records this as the one recruitment column Brian has not spoken to
 * either way, so it is here and marked open rather than quietly dropped.
 */
export function askedLabel(recruit: Recruit): string {
  if (recruit.questionnaireBAnswers !== null) return "Answered";
  if (recruit.questionnaireBSentOn.length > 0) return "Outstanding";
  return "Not sent";
}
