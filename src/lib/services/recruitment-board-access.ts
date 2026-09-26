import {
  RECRUITING_CATEGORIES,
  type CategoryLevel,
  type OperatorGrants,
  type RecruitingCategory,
} from "@/lib/auth/grants";
import { recruitingLevel } from "@/lib/auth/roster-access";
import type { RecruitmentBoardRow } from "./recruitment-board";
import type { RecruitmentProspectRecord } from "./recruitment-prospect";

/**
 * The recruitment board as one seat may receive it — LAN-432. Pure.
 *
 * The roster board's pattern, on the recruit board: the name and the ids that
 * open a record always travel (records open for anyone who reaches
 * Recruitment); Person information carries the recruit's person facts, the
 * aliases search reads and the number behind the phone card's Call; Recruit
 * details carries status, source, the two sends, consent and the
 * questionnaire answers; Event details carries every event cell. A `none`
 * category's fields are not on the row at all.
 */

/** A seat's level on each recruiting category. */
export function recruitingAccessFor(
  grants: OperatorGrants,
): Readonly<Record<RecruitingCategory, CategoryLevel>> {
  return Object.freeze(
    Object.fromEntries(
      RECRUITING_CATEGORIES.map((category) => [category, recruitingLevel(grants, category)]),
    ) as Record<RecruitingCategory, CategoryLevel>,
  );
}

const PERSON_FIELDS = Object.freeze([
  "aliases",
  "college",
  "matriculationYear",
  "expectedGraduationYear",
  "degreeField",
  "hasMobile",
  "hasEmail",
  "phoneForCall",
] as const satisfies readonly (keyof RecruitmentBoardRow)[]);

const DETAIL_FIELDS = Object.freeze([
  "status",
  "source",
  "firstContactOn",
  "personalSent",
  "recruitmentSent",
  "consent",
  "consentChangedAt",
  "consentByOperator",
  "playedBefore",
  "watchedBefore",
  "positionInterest",
  "gearOwned",
  "howTheyHeard",
  "anythingElse",
] as const satisfies readonly (keyof RecruitmentBoardRow)[]);

const EVENT_FIELDS = Object.freeze([
  "events",
  "attendedAnyEvent",
] as const satisfies readonly (keyof RecruitmentBoardRow)[]);

/** One row narrowed to the seat's recruiting grants. */
export function redactRecruitmentRow(
  row: RecruitmentBoardRow,
  access: Readonly<Record<RecruitingCategory, CategoryLevel>>,
): Partial<RecruitmentBoardRow> {
  const out: Record<string, unknown> = {
    prospectId: row.prospectId,
    personId: row.personId,
    displayName: row.displayName,
  };
  const copy = (fields: readonly (keyof RecruitmentBoardRow)[]) => {
    for (const field of fields) out[field] = row[field];
  };
  if (access.recruit_person !== "none") copy(PERSON_FIELDS);
  else out.aliases = [];
  if (access.recruit_details !== "none") copy(DETAIL_FIELDS);
  if (access.recruit_events !== "none") copy(EVENT_FIELDS);
  return out as Partial<RecruitmentBoardRow>;
}

type ProspectDetailKeys =
  | "status"
  | "source"
  | "firstContactOn"
  | "committedOn"
  | "convertedMembershipId"
  | "consent"
  | "consentSource"
  | "consentChangedAt"
  | "consentByOperator"
  | "recruitment"
  | "answers"
  | "notes"
  | "statusHistory";

/**
 * One prospect's record as a seat may receive it — LAN-432. Person
 * information owns the personal questionnaire's send state; Recruit details
 * the status, consent, the recruitment questionnaire, answers, notes and
 * status history; Event details the recruitment events. A `none` category's
 * keys are absent; the name and ids always travel.
 */
export type VisibleProspectRecord = Pick<
  RecruitmentProspectRecord,
  "prospectId" | "personId" | "seasonId" | "seasonLabel" | "displayName"
> &
  Partial<Pick<RecruitmentProspectRecord, ProspectDetailKeys | "personal" | "events">> & {
    /** The seat's level on each recruiting category. Absent means every category at its maximum. */
    readonly access?: Readonly<Record<RecruitingCategory, CategoryLevel>>;
  };

const PROSPECT_DETAIL_KEYS: readonly ProspectDetailKeys[] = Object.freeze([
  "status",
  "source",
  "firstContactOn",
  "committedOn",
  "convertedMembershipId",
  "consent",
  "consentSource",
  "consentChangedAt",
  "consentByOperator",
  "recruitment",
  "answers",
  "notes",
  "statusHistory",
]);

/** The prospect record narrowed to the seat's recruiting grants. */
export function redactProspectRecord(
  record: RecruitmentProspectRecord,
  access: Readonly<Record<RecruitingCategory, CategoryLevel>>,
): VisibleProspectRecord {
  const out: Record<string, unknown> = {
    prospectId: record.prospectId,
    personId: record.personId,
    seasonId: record.seasonId,
    seasonLabel: record.seasonLabel,
    displayName: record.displayName,
    access,
  };
  if (access.recruit_person !== "none") out.personal = record.personal;
  if (access.recruit_details !== "none") {
    for (const key of PROSPECT_DETAIL_KEYS) out[key] = record[key];
  }
  if (access.recruit_events !== "none") out.events = record.events;
  return out as VisibleProspectRecord;
}
