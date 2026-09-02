import type { RecruitmentBoardRow, RecruitmentEventColumn } from "@/lib/services/recruitment-board";
import { PROSPECT_STATUS_LABELS, CONSENT_LABELS } from "@/lib/services/recruitment-vocabulary";

/**
 * The recruit board's column model — `W1`, LAN-204. Modelled directly on
 * `../roster/board-columns.ts`: every column is one entry here, driving which
 * filter chips exist and which cells route to the person record — never a
 * column invented outside `W1`'s own table.
 *
 * ## The bands
 *
 * `W1`'s three bands — Person (slate, unchanged from the roster), Recruitment
 * (teal, this mission's own facts), and one Events band per recruitment event
 * — replace the roster's Onboarding/Season bands, because a recruit holds no
 * membership and those two describe nothing for them.
 */
export type Band = "person" | "recruitment" | "events";

export const BAND_COLOURS: Readonly<
  Record<"person" | "recruitment", { header: string; tint: string }>
> = Object.freeze({
  person: { header: "#455a64", tint: "rgba(69, 90, 100, 0.045)" },
  recruitment: { header: "#00695c", tint: "rgba(0, 105, 92, 0.05)" },
});

/** The Events band reuses the Season band's own blue, `W1`'s own reasoning. */
export const EVENTS_BAND_COLOUR = { header: "#0b3d91", tint: "rgba(11, 61, 145, 0.04)" };

export const BAND_ROW_HEIGHT = 28;
export const BAND_LABEL_INSET_PX = 16;
export const RECRUIT_COLUMN_WIDTH = 200;

export type EditKind = "none" | "record" | "status";

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly band: Band;
  readonly edit: EditKind;
  readonly width: number;
  readonly sortable: boolean;
  readonly filterable: boolean;
}

/** `W1`'s own column table. Person band first, then Recruitment — do not invent a column. */
export const RECRUITMENT_COLUMNS: readonly ColumnDef[] = Object.freeze([
  // ---------------------------------------------------------------- Person --
  {
    key: "college",
    label: "College",
    band: "person",
    edit: "record",
    width: 132,
    sortable: true,
    filterable: false,
  },
  {
    key: "matriculation",
    label: "Matric",
    band: "person",
    edit: "record",
    width: 96,
    sortable: true,
    filterable: false,
  },
  {
    key: "graduation",
    label: "Grad",
    band: "person",
    edit: "record",
    width: 88,
    sortable: true,
    filterable: false,
  },
  {
    key: "degree",
    label: "Degree field",
    band: "person",
    edit: "record",
    width: 148,
    sortable: true,
    filterable: false,
  },
  {
    key: "contactable",
    label: "Contactable",
    band: "person",
    edit: "none",
    width: 128,
    sortable: true,
    filterable: false,
  },
  // ------------------------------------------------------------ Recruitment --
  {
    key: "status",
    label: "Status",
    band: "recruitment",
    edit: "status",
    width: 128,
    sortable: true,
    filterable: true,
  },
  {
    key: "source",
    label: "Source",
    band: "recruitment",
    edit: "none",
    width: 128,
    sortable: true,
    filterable: false,
  },
  {
    key: "firstContact",
    label: "First contact",
    band: "recruitment",
    edit: "none",
    width: 120,
    sortable: true,
    filterable: false,
  },
  {
    key: "personalSent",
    label: "Personal sent",
    band: "recruitment",
    edit: "none",
    width: 118,
    sortable: true,
    filterable: true,
  },
  {
    key: "recruitmentSent",
    label: "Recruitment sent",
    band: "recruitment",
    edit: "none",
    width: 140,
    sortable: true,
    filterable: true,
  },
  {
    // LAN-204, item 7 (Brian, 2026-09-02: "It's WhatsApp consent, as in,
    // have they consented to being contacted? That's important."). The key
    // stays `consent` — the field this reads (`season_messaging_consents`)
    // is unchanged and season-scoped, not WhatsApp-specific by schema — but
    // the label says what an operator needs it to say. `width` widened to
    // fit the longer label without wrapping.
    key: "consent",
    label: "WhatsApp consent",
    band: "recruitment",
    edit: "none",
    width: 152,
    sortable: true,
    filterable: true,
  },
  {
    key: "playedBefore",
    label: "Played before",
    band: "recruitment",
    edit: "none",
    width: 116,
    sortable: true,
    filterable: false,
  },
  {
    key: "watchedBefore",
    label: "Watched before",
    band: "recruitment",
    edit: "none",
    width: 128,
    sortable: true,
    filterable: false,
  },
  {
    key: "positionInterest",
    label: "Position interest",
    band: "recruitment",
    edit: "none",
    width: 140,
    sortable: true,
    filterable: false,
  },
  {
    key: "gearOwned",
    label: "Gear owned",
    band: "recruitment",
    edit: "none",
    width: 128,
    sortable: true,
    filterable: false,
  },
  {
    key: "howTheyHeard",
    label: "How they heard",
    band: "recruitment",
    edit: "none",
    width: 140,
    sortable: true,
    filterable: false,
  },
  {
    key: "anythingElse",
    label: "Anything else",
    band: "recruitment",
    edit: "none",
    width: 160,
    sortable: true,
    filterable: false,
  },
]);

export const STATUS_FILTER_OPTIONS = Object.freeze(Object.keys(PROSPECT_STATUS_LABELS));
export const CONSENT_FILTER_OPTIONS = Object.freeze(Object.keys(CONSENT_LABELS));

export function eventColumnKey(eventId: string, cell: "rsvp" | "attendance"): string {
  return `event:${eventId}:${cell}`;
}

/** Two columns per event — RSVP and Attendance, side by side, `W1`. */
export function eventColumns(events: readonly RecruitmentEventColumn[]): readonly ColumnDef[] {
  return events.flatMap((event) => [
    {
      key: eventColumnKey(event.eventId, "rsvp"),
      label: "RSVP",
      band: "events" as const,
      edit: "none" as const,
      width: 90,
      sortable: false,
      filterable: false,
    },
    {
      key: eventColumnKey(event.eventId, "attendance"),
      label: "Attendance",
      band: "events" as const,
      edit: "none" as const,
      width: 108,
      sortable: false,
      filterable: false,
    },
  ]);
}

export function rawValue(row: RecruitmentBoardRow, key: string): string | number | boolean | null {
  switch (key) {
    case "college":
      return row.college;
    case "matriculation":
      return row.matriculationYear;
    case "graduation":
      return row.expectedGraduationYear;
    case "degree":
      return row.degreeField;
    case "contactable":
      return [row.hasMobile ? "Mobile" : "", row.hasEmail ? "Email" : ""]
        .filter(Boolean)
        .join(", ");
    case "status":
      return row.status;
    case "source":
      return row.source;
    case "firstContact":
      return row.firstContactOn;
    case "personalSent":
      return row.personalSent;
    case "recruitmentSent":
      return row.recruitmentSent;
    case "consent":
      return row.consent;
    case "playedBefore":
      return row.playedBefore;
    case "watchedBefore":
      return row.watchedBefore;
    case "positionInterest":
      return row.positionInterest;
    case "gearOwned":
      return row.gearOwned;
    case "howTheyHeard":
      return row.howTheyHeard;
    case "anythingElse":
      return row.anythingElse;
    default: {
      if (key.startsWith("event:")) {
        const [, eventId, cell] = key.split(":");
        const eventCell = row.events[eventId];
        if (!eventCell) return null;
        return cell === "rsvp" ? eventCell.rsvp : eventCell.attendance;
      }
      return null;
    }
  }
}
