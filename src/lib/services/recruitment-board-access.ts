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
 * aliases search reads, the number behind the phone card's Call and the
 * personal questionnaire's send; Recruit details carries status, source, the
 * recruitment send, consent and the
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

/**
 * What the recruit's status control offers one seat — LAN-505 (Brian, 16
 * October 2026). Two grants decide it independently: Recruit details at
 * `edit` offers every status but Joined, and May move recruits to Joined
 * offers Joined, whatever the Recruit details level.
 *
 * - `full` — both: every status.
 * - `without_joined` — Recruit details at edit only: every status but
 *   Joined, and the control says why Joined is not there.
 * - `joined_only` — the switch only: the current status and Joined.
 * - `read_only` — neither: the status reads, and says so.
 */
export type StatusControl = "full" | "without_joined" | "joined_only" | "read_only";

export function statusControlFor(
  recruitDetails: CategoryLevel,
  mayMoveToJoined: boolean,
): StatusControl {
  if (recruitDetails === "edit") return mayMoveToJoined ? "full" : "without_joined";
  return mayMoveToJoined ? "joined_only" : "read_only";
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
  // The personal questionnaire's send state is Person information's on the
  // record (LAN-423), so it is here too.
  "personalSent",
] as const satisfies readonly (keyof RecruitmentBoardRow)[]);

const DETAIL_FIELDS = Object.freeze([
  "status",
  "source",
  "firstContactOn",
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

/**
 * One row narrowed to the seat's recruiting grants. LAN-505: a seat holding
 * May move recruits to Joined receives the status, and only the status, even
 * with Recruit details at `none` — the switch acts on it.
 */
export function redactRecruitmentRow(
  row: RecruitmentBoardRow,
  access: Readonly<Record<RecruitingCategory, CategoryLevel>>,
  mayMoveToJoined = false,
): Partial<RecruitmentBoardRow> {
  const out: Record<string, unknown> = {
    prospectId: row.prospectId,
    personId: row.personId,
    displayName: row.displayName,
    // LAN-426: the name's two halves travel with it, for the phone board's name sorts.
    givenName: row.givenName,
    familyName: row.familyName,
  };
  const copy = (fields: readonly (keyof RecruitmentBoardRow)[]) => {
    for (const field of fields) out[field] = row[field];
  };
  if (access.recruit_person !== "none") copy(PERSON_FIELDS);
  else out.aliases = [];
  if (access.recruit_details !== "none") copy(DETAIL_FIELDS);
  else if (mayMoveToJoined) out.status = row.status;
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
    /** LAN-505 — May move recruits to Joined. Absent means held. */
    readonly mayMoveToJoined?: boolean;
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

/**
 * The prospect record narrowed to the seat's recruiting grants. LAN-505: with
 * May move recruits to Joined and Recruit details at `none`, the status alone
 * travels, as on the board.
 */
export function redactProspectRecord(
  record: RecruitmentProspectRecord,
  access: Readonly<Record<RecruitingCategory, CategoryLevel>>,
  mayMoveToJoined = false,
): VisibleProspectRecord {
  const out: Record<string, unknown> = {
    prospectId: record.prospectId,
    personId: record.personId,
    seasonId: record.seasonId,
    seasonLabel: record.seasonLabel,
    displayName: record.displayName,
    access,
    mayMoveToJoined,
  };
  if (access.recruit_person !== "none") out.personal = record.personal;
  if (access.recruit_details !== "none") {
    for (const key of PROSPECT_DETAIL_KEYS) out[key] = record[key];
  } else if (mayMoveToJoined) {
    out.status = record.status;
  }
  if (access.recruit_events !== "none") out.events = record.events;
  return out as VisibleProspectRecord;
}
