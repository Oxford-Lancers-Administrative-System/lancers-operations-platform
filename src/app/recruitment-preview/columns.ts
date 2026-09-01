import { CONSENT_LABELS, EVENTS, type Recruit } from "./fixtures";

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
  const person = (
    [
      { key: "college", label: "College", edit: "record", width: 148 },
      { key: "matriculation", label: "Matric", edit: "record", width: 104 },
      // Brian, 2026-09-01. The person set the board carries and the set the
      // record carries are the same set, so the two surfaces cannot disagree
      // about what the club knows.
      { key: "graduation", label: "Grad", edit: "record", width: 100 },
      { key: "degreeField", label: "Degree field", edit: "record", width: 172 },
      { key: "contactable", label: "Contactable", edit: "none", width: 156 },
      /*
       * Two fields that are deliberately **not** here.
       *
       * `Year` is gone: matriculated 2026 means first year in 2026-27, so it
       * said the same thing as Matric twice — and it is the half that goes
       * stale, because "First year" is wrong the moment the next season opens
       * and nothing recomputes it. Brian, 2026-09-01. The questionnaire still
       * asks; the club records the matriculation year it implies.
       *
       * `Preferred name` never existed. This mockup invented it. `main` has
       * `person_aliases`, an `Aliases` row on the record, "Search name or
       * alias" on both boards and "Known as" on the returner intake — and no
       * preferred-name field anywhere (every `isPreferred` in the tree is about
       * which contact to use, not what to call somebody). An alias is also
       * never a column: `board-columns.ts` carries it unconditionally for
       * search precisely because it is identity data rather than a restricted
       * field, and this board does the same.
       */
    ] as const
  ).map((column) => ({
    ...column,
    band: "person" as const,
    bandKey: "person",
    bandLabel: PERSON_BAND.label,
    sortable: true,
    filterable: true,
  }));

  const recruitment = (
    [
      { key: "status", label: "Status", edit: "select", width: 136, filterable: true },
      /**
       * Read-only, and it is the door — Brian, 2026-09-01: "source should not be
       * an editable field. That doesn't make sense… I shouldn't be able to edit
       * that thing." It records which of the three doors created this recruit
       * and where that happened, set once at capture.
       *
       * It carries no filter either, on his instruction: "Source doesn't need a
       * filter." Both the column funnel and the pinned control are gone.
       */
      { key: "source", label: "Source", edit: "none", width: 200, filterable: false },
      { key: "firstContact", label: "First contact", edit: "none", width: 140, filterable: true },
      /**
       * "Were they sent the questionnaire? Yes or no?" and "Were they sent the
       * personal questionnaire? Yes or no?" — Brian, 2026-09-01, at the top
       * level and on the record. These replace the `Asked` column, which he
       * struck: "'Ask' doesn't make sense as a field. I don't know what that's
       * saying."
       */
      { key: "personalSent", label: "Personal sent", edit: "none", width: 140, filterable: true },
      { key: "recruitSent", label: "Recruitment sent", edit: "none", width: 168, filterable: true },
      /**
       * Consent keeps its five words rather than reducing to Yes/No — Brian,
       * 2026-09-01. `Never asked`, `Refused` and `Withdrawn` gate the same thing
       * today and are three different facts about a person; a boolean would
       * collapse them on the one surface an operator scans.
       */
      { key: "consent", label: "Consent", edit: "none", width: 148, filterable: true },
      // The recruit-stage answers, in `W4`'s order. Read-only everywhere: they
      // are the recruit's own words, attributed to them, and an operator typing
      // over them would misattribute what the club was told.
      { key: "playedBefore", label: "Played before", edit: "none", width: 140 },
      { key: "watchedBefore", label: "Watched before", edit: "none", width: 148 },
      { key: "positionInterest", label: "Position interest", edit: "none", width: 168 },
      { key: "gearOwned", label: "Gear owned", edit: "none", width: 160 },
      { key: "heardVia", label: "How they heard", edit: "none", width: 180 },
      { key: "anythingElse", label: "Anything else", edit: "none", width: 260 },
    ] as const
  ).map((column) => ({
    ...column,
    band: "recruitment" as const,
    bandKey: "recruitment",
    bandLabel: RECRUITMENT_BAND.label,
    sortable: true,
    filterable: "filterable" in column ? column.filterable : true,
  }));

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

  return Object.freeze([...person, ...recruitment, ...events]) as readonly ColumnDef[];
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
  const answersB = recruit.questionnaireBAnswers;
  switch (key) {
    case "college":
      return recruit.college ?? NOT_RECORDED;
    case "matriculation":
      return recruit.matriculationYear === null ? NOT_RECORDED : String(recruit.matriculationYear);
    case "contactable":
      return [recruit.mobile ? "Mobile" : null, recruit.email ? "Email" : null]
        .filter(Boolean)
        .join(" · ");
    case "graduation":
      return recruit.expectedGraduationYear === null
        ? NOT_RECORDED
        : String(recruit.expectedGraduationYear);
    case "degreeField":
      return recruit.degreeField ?? NOT_RECORDED;
    case "status":
      return recruit.status;
    case "source":
      return recruit.source;
    case "firstContact":
      return recruit.firstContactOn;
    case "personalSent":
      return recruit.questionnaireASentOn.length > 0 ? "Yes" : "No";
    case "recruitSent":
      return recruit.questionnaireBSentOn.length > 0 ? "Yes" : "No";
    case "consent":
      return CONSENT_LABELS[recruit.consent];
    case "playedBefore":
      return answersB?.playedBefore ?? NOT_ANSWERED;
    case "watchedBefore":
      return answersB?.watchedBefore ?? NOT_ANSWERED;
    case "positionInterest":
      return answersB?.positionInterest ?? NOT_ANSWERED;
    case "gearOwned":
      return answersB?.gearOwned ?? NOT_ANSWERED;
    case "heardVia":
      return answersB?.heardVia ?? NOT_ANSWERED;
    case "anythingElse":
      return answersB?.anythingElse ?? NOT_ANSWERED;
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
 * The greys are two different words on purpose. A field nobody has recorded
 * reads `Not recorded`; a question the recruit was asked and did not answer
 * reads `Not answered`, because those are different facts and the second one is
 * the recruit's own silence rather than the club's omission.
 */
export const NOT_ANSWERED = "Not answered";
