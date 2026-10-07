import { MEMBERSHIP_STATUS_LABELS } from "@/app/operate/roster/presentation";
import type { MembershipStatus } from "@/lib/services/membership";
import type {
  RecruitDuplicateCandidate,
  RecruitImportApplied,
  RecruitImportColumn,
  RecruitImportPlan,
  RecruitPlannedRow,
  RecruitRowOutcome,
} from "@/lib/services/recruit-csv";
import {
  PROSPECT_STATUS_LABELS,
  RECRUITMENT_ADD_OPT_IN_OPTIONS,
  type ProspectStatus,
} from "@/lib/services/recruitment-vocabulary";

// How the recruit import's proposal reads — LAN-487, the roster import's
// `../../roster/import/presentation.ts` with recruit nouns.

export const OUTCOME_LABELS: Readonly<Record<RecruitRowOutcome, string>> = Object.freeze({
  new: "New",
  existing: "Known to the club",
  already_recruit: "Already a recruit",
  refused: "Refused",
});

export const COLUMN_HEADINGS: Readonly<Partial<Record<RecruitImportColumn, string>>> =
  Object.freeze({
    mobile: "Mobile",
    college_email: "College email",
    personal_email: "Personal email",
    college: "College",
    opt_in: "Opt-in",
  });

export const SHOWN_COLUMNS: readonly RecruitImportColumn[] = Object.freeze([
  "mobile",
  "college_email",
  "personal_email",
  "college",
  "opt_in",
]);

const OPT_IN_SHORT: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(RECRUITMENT_ADD_OPT_IN_OPTIONS.map((option) => [option.value, option.label])),
);

/** A cell as the proposal shows it — the opt-in by its label. */
export function cellValue(row: RecruitPlannedRow, column: RecruitImportColumn): string {
  const value = row.cells[column];
  if (column === "opt_in" && value !== "") return OPT_IN_SHORT[value] ?? value;
  return value;
}

export function cellText(value: string): string {
  return value === "" ? "—" : value;
}

export function changeSummary(row: RecruitPlannedRow): string {
  if (row.outcome === "refused") return row.reasons.join(" ");
  if (row.outcome === "new") return "Added as a recruit · welcome queued";
  const matched = row.resolvedOn ? ` · matched on ${row.resolvedOn.join(", ")}` : "";
  if (row.outcome === "existing") return `Known to the club${matched} · added as a recruit`;
  return `Already a recruit this season${matched} · nothing written`;
}

export function applyLabel(applicableCount: number): string {
  if (applicableCount === 0) return "Nothing to apply";
  return `Confirm — add ${applicableCount} recruit${applicableCount > 1 ? "s" : ""}`;
}

export function describeProposal(seasonLabel: string, rowCount: number): string {
  return `Season ${seasonLabel} · ${rowCount} row${rowCount === 1 ? "" : "s"} read · nothing is written until you confirm`;
}

export function describeUnanswered(unansweredLines: readonly number[]): string {
  const count = unansweredLines.length;
  return count === 1 ? "1 to answer" : `${count} to answer`;
}

export function describeTotals(plan: RecruitImportPlan): readonly [number, string][] {
  return [
    [plan.totals.new, "New"],
    [plan.totals.existing, "Known to the club"],
    [plan.totals.already_recruit, "Already a recruit"],
    [plan.totals.refused, "Refused"],
    [plan.audienceAdds, "Added to event audiences"],
  ];
}

/** "Player · Active · 2026-27" — the hand-add's own reading of who a candidate is (`W8`). */
export function standingLabel(candidate: RecruitDuplicateCandidate): string {
  const identity = candidate.identity;
  const parts = (kind: string, status: string, season: string) =>
    [kind, status, season].filter(Boolean).join(" · ");
  if (identity.kind === "player") {
    return parts(
      "Player",
      MEMBERSHIP_STATUS_LABELS[identity.membershipStatus as MembershipStatus] ??
        identity.membershipStatus,
      identity.seasonLabel,
    );
  }
  if (identity.kind === "recruit") {
    return parts(
      "Recruit",
      PROSPECT_STATUS_LABELS[identity.prospectStatus as ProspectStatus] ?? identity.prospectStatus,
      identity.seasonLabel,
    );
  }
  if (identity.kind === "past_member")
    return `Past member · last played ${identity.lastSeasonLabel}`;
  return "Not in this season";
}

/** What the operator is told after an apply that committed. */
export function describeApplied(applied: RecruitImportApplied): string {
  const arrived = applied.created + applied.existing;
  const done =
    arrived === 0
      ? "Nothing was changed"
      : `${arrived} recruit${arrived > 1 ? "s were" : " was"} added`;
  const welcomes =
    applied.welcomesQueued > 0
      ? ` ${applied.welcomesQueued} welcome${applied.welcomesQueued > 1 ? "s are" : " is"} queued.`
      : "";
  const audiences =
    applied.addedToAudiences > 0 ? ` ${applied.addedToAudiences} added to event audiences.` : "";
  const left =
    applied.refused > 0
      ? ` ${applied.refused} row${applied.refused > 1 ? "s were" : " was"} refused.`
      : "";
  return `${done}.${welcomes}${audiences}${left}`;
}
