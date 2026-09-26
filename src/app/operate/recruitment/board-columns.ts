import type { RecruitmentBoardRow, RecruitmentEventColumn } from "@/lib/services/recruitment-board";
import {
  BAND_COLOURS as CLUB_BANDS,
  type Band as ClubBand,
  type BandColours,
} from "@/components/band-colours";
import { PROSPECT_STATUS_LABELS, CONSENT_LABELS } from "@/lib/services/recruitment-vocabulary";
import type { CategoryLevel, RecruitingCategory } from "@/lib/auth/grants";

/**
 * The recruit board's column model — `W1`, LAN-204. Modelled on
 * `../roster/board-columns.ts`, driving the shared banded-header machinery
 * (`../board-filter-controls.tsx`'s `groupRuns`/`bandBoundaryKeys`). Three
 * bands: Person, Recruitment, and one `events:<eventId>` band per
 * recruitment event — {@link bandKind} recovers the band kind, {@link
 * eventIdOfBand} recovers the event.
 */
export type Band = "person" | "recruitment" | `events:${string}`;
type BandKind = "person" | "recruitment" | "events";

/**
 * Where each kind of band takes its colour from. Person is the roster's Person
 * group, in the colour the club chose for it (LAN-430, `roster_group_colours`);
 * Recruitment keeps its code colour; the Events band reuses the Season band's
 * own blue, `W1`'s own reasoning.
 */
const CLUB_BAND_OF_KIND: Readonly<Record<BandKind, ClubBand>> = Object.freeze({
  person: "person",
  recruitment: "recruitment",
  events: "season",
});

export const BAND_ROW_HEIGHT = 28;
export const BAND_LABEL_INSET_PX = 16;
export const RECRUIT_COLUMN_WIDTH = 200;

/** Which of the three *kinds* of band a value is — see the module note. */
function bandKind(band: Band): BandKind {
  return band.startsWith("events:") ? "events" : (band as BandKind);
}

/**
 * The colours for a band value — `person`/`recruitment`'s own, or the one
 * shared events blue. `colours` is the board's `useBandColours()`; without it
 * the seeded colours stand.
 */
export function bandColour(
  band: Band,
  colours: Readonly<Record<ClubBand, BandColours>> = CLUB_BANDS,
): BandColours {
  return colours[CLUB_BAND_OF_KIND[bandKind(band)]];
}

/** The event id encoded in an events-band value, or `null` for `person`/`recruitment`. */
export function eventIdOfBand(band: Band): string | null {
  return band.startsWith("events:") ? band.slice("events:".length) : null;
}

type EditKind = "none" | "record" | "status";

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly band: Band;
  readonly edit: EditKind;
  readonly width: number;
  readonly sortable: boolean;
  readonly filterable: boolean;
  /**
   * The recruiting category this column belongs to (LAN-432): the recruit's
   * person columns are Person information, the Recruitment columns Recruit
   * details, every event band Event details.
   */
  readonly category: RecruitingCategory;
  /** Set by {@link visibleRecruitmentColumns} for a category held at `view`: text, no control, caption "view". */
  readonly viewOnly?: true;
  /** Not a column: the one narrow cell a folded-away group leaves behind — LAN-404, the roster board's own idiom. */
  readonly placeholder?: true;
}

/** A band's recruiting category. */
export function categoryOfRecruitmentBand(band: Band): RecruitingCategory {
  const kind = bandKind(band);
  return kind === "person"
    ? "recruit_person"
    : kind === "recruitment"
      ? "recruit_details"
      : "recruit_events";
}

/** A seat's level on each recruiting category, as the board reads it. */
export type RecruitingAccess = Readonly<Record<RecruitingCategory, CategoryLevel>>;

/** Every recruiting category at its maximum — the board drawn without a seat (a test fixture). */
export const FULL_RECRUITING_ACCESS: RecruitingAccess = Object.freeze({
  recruit_person: "edit",
  recruit_details: "edit",
  recruit_events: "view",
});

/**
 * The columns this seat may see — LAN-432, the roster board's own pattern: a
 * `none` category's columns are dropped, a `view` category's (and Event
 * details, which is never more than `view`) come back `viewOnly`.
 */
export function visibleRecruitmentColumns(
  columns: readonly ColumnDef[],
  access: RecruitingAccess,
): readonly ColumnDef[] {
  return columns
    .filter((column) => access[column.category] !== "none")
    .map((column) =>
      access[column.category] === "edit" ? column : { ...column, viewOnly: true as const },
    );
}

/**
 * Which groups this operator has folded away — LAN-404, from the same ask
 * LAN-387 answered on the roster board. Stewart, on the call of 2026-09-21:
 * "Well, any version of the roster should" have it.
 *
 * `undefined` is "they have never touched it". Nothing is closed by default:
 * the roster's rule is that the long tail closes and the facts an operator
 * came for stay open, and this board has no long tail — Person and
 * Recruitment are its subject, and every events group is one event somebody
 * put on the board deliberately.
 *
 * A stored name that is no longer a group — an event since deleted — is
 * dropped rather than refused, exactly as the roster board drops one.
 */
export function collapsedBandsFrom(
  stored: readonly string[] | undefined,
  columns: readonly ColumnDef[],
): ReadonlySet<Band> {
  if (stored === undefined) return new Set();
  const known = new Set<string>(columns.map((column) => column.band));
  return new Set(stored.filter((key): key is Band => known.has(key)));
}

/** The single cell a folded-away group occupies — its name written down it, and one click brings the columns back. */
function collapsedPlaceholder(band: Band): ColumnDef {
  return Object.freeze({
    key: `group:${band}`,
    label: "",
    band,
    edit: "none" as const,
    width: 28,
    sortable: false,
    filterable: false,
    category: categoryOfRecruitmentBand(band),
    placeholder: true as const,
  });
}

/** The columns actually drawn: a folded-away group contributes one placeholder instead of its own columns. */
export function displayColumns(
  columns: readonly ColumnDef[],
  collapsed: ReadonlySet<Band>,
): readonly ColumnDef[] {
  const drawn: ColumnDef[] = [];
  for (const column of columns) {
    if (!collapsed.has(column.band)) {
      drawn.push(column);
      continue;
    }
    if (drawn.at(-1)?.band !== column.band) drawn.push(collapsedPlaceholder(column.band));
  }
  return drawn;
}

/** `W1`'s own column table. Person band first, then Recruitment — do not invent a column. */
const RECRUITMENT_COLUMN_TABLE: readonly Omit<ColumnDef, "category">[] = [
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
    // LAN-204 item 7: label says "WhatsApp consent"; key/field unchanged.
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
];

/** The Person and Recruitment columns, each carrying its band's recruiting category (LAN-432). */
export const RECRUITMENT_COLUMNS: readonly ColumnDef[] = Object.freeze(
  RECRUITMENT_COLUMN_TABLE.map((column) =>
    Object.freeze({ ...column, category: categoryOfRecruitmentBand(column.band) }),
  ),
);

export const STATUS_FILTER_OPTIONS = Object.freeze(Object.keys(PROSPECT_STATUS_LABELS));
export const CONSENT_FILTER_OPTIONS = Object.freeze(Object.keys(CONSENT_LABELS));

function eventColumnKey(eventId: string, cell: "rsvp" | "attendance"): string {
  return `event:${eventId}:${cell}`;
}

/**
 * Two columns per event — RSVP and Attendance, `W1`. Each event's own
 * synthetic band (`events:<eventId>`) gives it its own header run (see the
 * module note). Both sortable, through the same generic column machinery.
 */
export function eventColumns(events: readonly RecruitmentEventColumn[]): readonly ColumnDef[] {
  return events.flatMap((event) => {
    const band: Band = `events:${event.eventId}`;
    return [
      {
        key: eventColumnKey(event.eventId, "rsvp"),
        label: "RSVP",
        band,
        edit: "none" as const,
        width: 90,
        sortable: true,
        filterable: false,
        category: "recruit_events" as const,
      },
      {
        key: eventColumnKey(event.eventId, "attendance"),
        label: "Attendance",
        band,
        edit: "none" as const,
        width: 108,
        sortable: true,
        filterable: false,
        category: "recruit_events" as const,
      },
    ];
  });
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
