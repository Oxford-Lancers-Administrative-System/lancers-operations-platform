import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import {
  type AssembledStatus,
  type PersonFactPresence,
  type RequiredField,
  missingRequiredFields,
} from "./person-required";
import { readCurrentSeasonIn, type Season } from "./seasons";
import { personAssembledStatusSql, personDisplayNameSql } from "./sql-text";

/**
 * The People list and the missing-data queue — LAN-184, `REQ-entry-points`,
 * `REQ-missing-queue`. Read-only, exactly as `W1` and `W7` are.
 *
 * ## Why this module exists rather than extending `person-record.ts`
 *
 * LAN-183's `searchPeople()` finds a person by name or alias with no season
 * scoping at all — the person record is season-agnostic by design
 * (`DEC-w1-01`) and nothing about *finding* one person needed a season. This
 * mission's two new surfaces need the opposite question answered: which
 * *people* have a tie to the season in view. That tie is this package's own
 * business rule — `W1`'s specification names four kinds of tie a person may
 * hold, and nothing on `main` before this package computed any of them — so it
 * lives here rather than bent onto a module whose whole job is the single-person
 * read. `readPersonRecord()` and `missingRequiredFields()` are still the ones
 * this module calls for what they already answer.
 *
 * ## The four kinds of tie, and the committee-year pairing rule
 *
 * `W1`'s specification: "a season membership in any status, a prospect record,
 * a season-scoped role assignment, or a committee-year role in the committee
 * year paired with that season." The pairing is Brian's own ruling, 2026-08-26:
 * a committee year ties to the season sharing its label, and nothing else —
 * dates never enter into it, and there is no foreign key pairing the two
 * cycles in the schema. This module derives the pairing from the shared label
 * exactly as the specification requires and adds none of its own.
 *
 * ## Fetch wide, filter and sort in JavaScript
 *
 * `DEC-w1-12` and its `W7` counterpart delegate query shape, indexing and
 * pagination to the Mission Lead, "the club holds hundreds of people, not
 * millions." So the query below applies only the tie condition; every filter
 * — search, status, which fact is missing — and every sort are applied here in
 * JavaScript, once, over a list that is never going to be the reason a page is
 * slow. That also keeps one alias-matching rule in one place rather than a
 * second copy of `searchPeople()`'s `like` pattern living beside it.
 *
 * ## Presence, not value — `REQ-restricted-fields`
 *
 * The query below reads *whether* college, matriculation year, date of birth
 * and the emergency contact are recorded, never what they are. A boolean is
 * not the disclosure `REQ-restricted-fields` forbids; the fact that Bertram is
 * missing eight things is exactly what the People list's Missing column and
 * the whole of the missing-data queue exist to say, and neither ever renders a
 * value to say it.
 */

export type PeopleScope = "in_season" | "outside_season";

/** One row of the People list, or one row of the missing-data queue. */
export interface PersonListEntry {
  personId: string;
  displayName: string;
  /**
   * A non-display alias the current search term matched, distinct from
   * `displayName` — `REQ-person-record`'s "including an alias that is not the
   * display name" and `W1-02`'s "the row says which alias matched." `null`
   * when there is no search term, or the term did not match an alias.
   */
  matchedAlias: string | null;
  status: AssembledStatus;
  /**
   * "What they are to the club" — `DEC-w1-03`. `Player`, `Recruit`, a role
   * name (with the season or committee year it was drawn from), or a
   * combination joined by " · ". `null` for a person who is a player, coach,
   * committee member or recruit at no point this scope can see — Task 08 §4's
   * "or nothing."
   */
  clubRoleSummary: string | null;
  hasMobile: boolean;
  hasPersonalEmail: boolean;
  /** Every required field this person's rung asks for that is absent. Never a bare count. */
  missingRequiredFields: RequiredField[];
}

export interface PeopleListFilters {
  scope: PeopleScope;
  /** Free text over given name, family name and every alias. */
  search?: string | null;
  /** An `AssembledStatus` value, or `null`/`undefined` for every status. */
  status?: string | null;
  /** Only rows with at least one required fact absent. */
  missingOnly?: boolean;
  sort?: string | null;
  direction?: string | null;
}

export interface PeopleList {
  season: Season;
  scope: PeopleScope;
  entries: PersonListEntry[];
  /** Every person tied to this scope, before search, status or missing-data filtering. */
  totalInScope: number;
}

export interface MissingQueueFilters {
  scope: PeopleScope;
  search?: string | null;
  status?: string | null;
  /** One `RequiredField`, or `null`/`undefined` for every missing fact. */
  fact?: RequiredField | null;
  sort?: string | null;
  direction?: string | null;
}

export interface MissingQueue {
  season: Season;
  scope: PeopleScope;
  entries: PersonListEntry[];
  /** Every person in this scope with at least one required fact absent, before filtering. */
  totalMissing: number;
}

// ---------------------------------------------------------------------------
// The rung order, for sorting and for the empty-vs-filtered distinction
// ---------------------------------------------------------------------------

const STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  recruit: 0,
  onboarding: 1,
  active: 2,
  inactive: 3,
  departed: 4,
  archived: 5,
});

function statusRank(status: AssembledStatus): number {
  if (status === null) return 6;
  return STATUS_RANK[status] ?? 6;
}

// ---------------------------------------------------------------------------
// The fetch — one query per scope, no search or status baked into the SQL
// ---------------------------------------------------------------------------

interface DirectoryRow {
  person_id: string;
  display_name: string;
  given_name: string;
  family_name: string | null;
  status: AssembledStatus;
  is_past_member: boolean | null;
  has_membership_tie: boolean;
  has_prospect_tie: boolean;
  roles_in_view: string[] | null;
  latest_role_label: string | null;
  has_mobile: boolean;
  has_personal_email: boolean;
  has_family_name: boolean;
  has_college: boolean;
  has_matriculation_year: boolean;
  has_expected_graduation_year: boolean;
  has_degree_field: boolean;
  has_date_of_birth: boolean;
  has_emergency_contact: boolean;
  all_aliases: string[] | null;
  non_display_aliases: string[] | null;
}

/**
 * Every person tied to (`in_season`) or excluded from (`outside_season`) the
 * season in view, unfiltered by search, status or missing data.
 *
 * `season_roles` computes the tie itself, `role_assignments.effective_from` /
 * `effective_to` notwithstanding: a role assignment scoped to the season or
 * committee year in view is a tie to it by construction, whether or not the
 * seat has since ended — the same reading `W1-05`'s own "ended" chip on a past
 * committee year gives an assignment that is over but still real.
 */
async function fetchDirectoryRows(
  tx: Tx,
  season: Season,
  scope: PeopleScope,
): Promise<DirectoryRow[]> {
  const result = await tx.query<DirectoryRow>(
    `with season_roles as (
       select ra.person_id, r.name as role_name, r.sort_order
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
        where (ra.scope = 'season' and ra.season_id = $1::uuid)
           or (ra.scope = 'committee_year' and exists (
                 select 1 from public.committee_years cy
                  where cy.id = ra.committee_year_id and cy.label = $2::text
               ))
     ),
     season_roles_agg as (
       select person_id, array_agg(role_name order by sort_order, role_name) as role_names
         from season_roles
        group by person_id
     ),
     season_membership_tie as (
       select distinct person_id from public.season_memberships where season_id = $1::uuid
     ),
     season_prospect_tie as (
       select distinct person_id from public.recruitment_prospects where season_id = $1::uuid
     ),
     latest_role as (
       select distinct on (ra.person_id)
              ra.person_id,
              r.name || ' · ' || coalesce(cy.label, sn.label) as label
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
         left join public.committee_years cy on cy.id = ra.committee_year_id
         left join public.seasons sn on sn.id = ra.season_id
        order by ra.person_id, ra.effective_from desc, ra.created_at desc
     ),
     aliases_agg as (
       select person_id,
              array_agg(alias order by is_display_name desc, noted_at) as all_aliases,
              array_agg(alias) filter (where not is_display_name) as non_display_aliases
         from public.person_aliases
        group by person_id
     )
     select
       p.id as person_id,
       ${personDisplayNameSql("p")} as display_name,
       p.given_name,
       p.family_name,
       ${personAssembledStatusSql("p")} as status,
       ps.is_past_member,
       (smt.person_id is not null) as has_membership_tie,
       (spt.person_id is not null) as has_prospect_tie,
       coalesce(sra.role_names, array[]::text[]) as roles_in_view,
       lr.label as latest_role_label,
       exists (
         select 1 from public.contact_points c
          where c.person_id = p.id and c.kind = 'phone' and c.valid_until is null
       ) as has_mobile,
       exists (
         select 1 from public.contact_points c
          where c.person_id = p.id and c.kind = 'email' and c.scope = 'personal'
            and c.valid_until is null
       ) as has_personal_email,
       (p.family_name is not null) as has_family_name,
       (p.college is not null) as has_college,
       (p.matriculation_year is not null) as has_matriculation_year,
       (p.expected_graduation_year is not null) as has_expected_graduation_year,
       (p.degree_field is not null) as has_degree_field,
       (p.date_of_birth is not null) as has_date_of_birth,
       exists (
         select 1 from public.person_emergency_contacts ec where ec.person_id = p.id
       ) as has_emergency_contact,
       coalesce(al.all_aliases, array[]::text[]) as all_aliases,
       coalesce(al.non_display_aliases, array[]::text[]) as non_display_aliases
     from public.people p
     left join public.person_standing ps on ps.person_id = p.id
     left join season_membership_tie smt on smt.person_id = p.id
     left join season_prospect_tie spt on spt.person_id = p.id
     left join season_roles_agg sra on sra.person_id = p.id
     left join latest_role lr on lr.person_id = p.id
     left join aliases_agg al on al.person_id = p.id
    where p.merged_into_person_id is null
      and (
        case
          when $3::text = 'in_season' then
            (smt.person_id is not null or spt.person_id is not null or sra.person_id is not null)
          else
            (smt.person_id is null and spt.person_id is null and sra.person_id is null)
        end
      )
    order by coalesce(p.family_name, p.given_name), p.given_name, p.id`,
    [season.id, season.label, scope],
  );
  return result.rows;
}

function presenceOf(row: DirectoryRow): PersonFactPresence {
  return {
    givenName: true,
    familyName: row.has_family_name,
    mobile: row.has_mobile,
    personalEmail: row.has_personal_email,
    college: row.has_college,
    matriculationYear: row.has_matriculation_year,
    expectedGraduationYear: row.has_expected_graduation_year,
    degreeField: row.has_degree_field,
    dateOfBirth: row.has_date_of_birth,
    emergencyContact: row.has_emergency_contact,
  };
}

/** "Player", "Recruit", a role (with its cycle where the person holds no membership), or none. */
function clubRoleSummaryFor(row: DirectoryRow, season: Season, scope: PeopleScope): string | null {
  if (scope === "outside_season") {
    if (row.latest_role_label) return row.latest_role_label;
    if (row.is_past_member) return "Alumnus";
    return null;
  }

  const parts: string[] = [];
  if (row.has_membership_tie) parts.push("Player");
  else if (row.has_prospect_tie) parts.push("Recruit");
  for (const roleName of row.roles_in_view ?? []) {
    parts.push(row.has_membership_tie ? roleName : `${roleName} · ${season.label}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function normaliseSearch(search: string | null | undefined): string | null {
  if (typeof search !== "string") return null;
  const trimmed = search.trim();
  return trimmed === "" ? null : trimmed;
}

function containsSearchTerm(value: string | null | undefined, term: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(term.toLowerCase());
}

/** Whether a row matches free-text search over given name, family name and every alias. */
function matchesSearch(row: DirectoryRow, term: string): boolean {
  if (containsSearchTerm(row.given_name, term)) return true;
  if (containsSearchTerm(row.family_name, term)) return true;
  return (row.all_aliases ?? []).some((alias) => containsSearchTerm(alias, term));
}

/** The non-display alias the search term matched, if any — `W1-02`. */
function matchedAliasFor(row: DirectoryRow, term: string | null): string | null {
  if (term === null) return null;
  return (row.non_display_aliases ?? []).find((alias) => containsSearchTerm(alias, term)) ?? null;
}

function toEntry(
  row: DirectoryRow,
  season: Season,
  scope: PeopleScope,
  term: string | null,
): PersonListEntry {
  return {
    personId: row.person_id,
    displayName: row.display_name,
    matchedAlias: matchedAliasFor(row, term),
    status: row.status,
    clubRoleSummary: clubRoleSummaryFor(row, season, scope),
    hasMobile: row.has_mobile,
    hasPersonalEmail: row.has_personal_email,
    missingRequiredFields: missingRequiredFields(row.status, presenceOf(row)),
  };
}

// ---------------------------------------------------------------------------
// Sorting — every meaningfully orderable column, `DEC-w1-05`
// ---------------------------------------------------------------------------

export const PEOPLE_LIST_SORT_COLUMNS: readonly string[] = Object.freeze([
  "name",
  "status",
  "club",
  "contactable",
  "missing",
]);
export const DEFAULT_PEOPLE_SORT = "name";

export const MISSING_QUEUE_SORT_COLUMNS: readonly string[] = Object.freeze(["missing", "name"]);
export const DEFAULT_MISSING_SORT = "missing";

function compareBy(sort: string, direction: "asc" | "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return (a: PersonListEntry, b: PersonListEntry): number => {
    let cmp = 0;
    switch (sort) {
      case "status":
        cmp = statusRank(a.status) - statusRank(b.status);
        break;
      case "club":
        cmp = (a.clubRoleSummary ?? "").localeCompare(b.clubRoleSummary ?? "");
        break;
      case "contactable":
        cmp =
          Number(a.hasMobile) +
          Number(a.hasPersonalEmail) -
          (Number(b.hasMobile) + Number(b.hasPersonalEmail));
        break;
      case "missing":
        cmp = a.missingRequiredFields.length - b.missingRequiredFields.length;
        break;
      case "name":
      default:
        cmp = a.displayName.localeCompare(b.displayName);
        break;
    }
    if (cmp !== 0) return cmp * sign;
    // A stable tie-break, so two operators sorting by the same column see the
    // same order rather than whatever the fetch returned it in.
    return a.displayName.localeCompare(b.displayName);
  };
}

function resolveDirection(
  sort: string,
  direction: string | null | undefined,
  columns: readonly string[],
  fallback: string,
): { sort: string; direction: "asc" | "desc" } {
  const resolvedSort = columns.includes(sort) ? sort : fallback;
  const resolvedDirection = direction === "desc" ? "desc" : "asc";
  return { sort: resolvedSort, direction: resolvedDirection };
}

// ---------------------------------------------------------------------------
// W1 — the People list
// ---------------------------------------------------------------------------

/**
 * The People list — `W1`. Scoped to the season in view unless `scope` is
 * `"outside_season"`, `W1`'s widen action.
 */
export async function listPeople(filters: PeopleListFilters): Promise<PeopleList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const rows = await fetchDirectoryRows(tx, season, filters.scope);
    const term = normaliseSearch(filters.search);

    const totalInScope = rows.length;

    let entries = rows.map((row) => toEntry(row, season, filters.scope, term));

    if (term !== null) {
      entries = entries.filter((_, index) => matchesSearch(rows[index], term));
    }
    if (filters.status) {
      entries = entries.filter((entry) => entry.status === filters.status);
    }
    if (filters.missingOnly) {
      entries = entries.filter((entry) => entry.missingRequiredFields.length > 0);
    }

    const { sort, direction } = resolveDirection(
      filters.sort ?? DEFAULT_PEOPLE_SORT,
      filters.direction,
      PEOPLE_LIST_SORT_COLUMNS,
      DEFAULT_PEOPLE_SORT,
    );
    entries = [...entries].sort(compareBy(sort, direction));

    return { season, scope: filters.scope, entries, totalInScope };
  });
}

// ---------------------------------------------------------------------------
// W7 — the missing-data queue
// ---------------------------------------------------------------------------

/**
 * The missing-data queue — `W7`. Every person tied to the scope with at least
 * one required fact absent, naming which facts per row and never a value —
 * `REQ-missing-queue`.
 */
export async function listMissingDataQueue(filters: MissingQueueFilters): Promise<MissingQueue> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const rows = await fetchDirectoryRows(tx, season, filters.scope);
    const term = normaliseSearch(filters.search);

    let entries = rows
      .map((row) => toEntry(row, season, filters.scope, term))
      .filter((entry) => entry.missingRequiredFields.length > 0);

    const totalMissing = entries.length;

    if (term !== null) {
      const missingRowIds = new Set(entries.map((entry) => entry.personId));
      const matchingIds = new Set(
        rows
          .filter((row) => missingRowIds.has(row.person_id) && matchesSearch(row, term))
          .map((row) => row.person_id),
      );
      entries = entries.filter((entry) => matchingIds.has(entry.personId));
    }
    if (filters.status) {
      entries = entries.filter((entry) => entry.status === filters.status);
    }
    if (filters.fact) {
      const fact = filters.fact;
      entries = entries.filter((entry) => entry.missingRequiredFields.includes(fact));
    }

    const { sort, direction } = resolveDirection(
      filters.sort ?? DEFAULT_MISSING_SORT,
      filters.direction,
      MISSING_QUEUE_SORT_COLUMNS,
      DEFAULT_MISSING_SORT,
    );
    // "Sort by how much is missing" reads most-missing-first by default —
    // `W7`'s own acceptance evidence 3 puts Bertram's eight ahead of Norbert's
    // one — so the missing column's own default direction is `desc`.
    const effectiveDirection = sort === "missing" && filters.direction == null ? "desc" : direction;
    entries = [...entries].sort(compareBy(sort, effectiveDirection));

    return { season, scope: filters.scope, entries, totalMissing };
  });
}

// ---------------------------------------------------------------------------
// The rest of the person record — roles and seasons — `W1-05`
// ---------------------------------------------------------------------------

/** One entry on the record's "Roles" row — amendment `W1-A4`. Read-only; granting one is Mission 1's. */
export interface PersonRoleAssignment {
  roleName: string;
  /** The committee year or season label this seat was held in. */
  cycleLabel: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Whether this seat has ended — the mockup's own "ended" chip. */
  hasEnded: boolean;
}

/**
 * Every role this person has held, any cycle, newest first — the person
 * record's "Roles" row. `PersonRecord` carries no role data of its own;
 * `role_assignments` is a different table from anything `person-record.ts`
 * reads, so this is a second, independent query rather than an extension of
 * that module.
 */
export async function listPersonRoleAssignments(personId: string): Promise<PersonRoleAssignment[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{
      role_name: string;
      cycle_label: string;
      effective_from: string;
      effective_to: string | null;
    }>(
      `select r.name as role_name,
              coalesce(cy.label, sn.label) as cycle_label,
              to_char(ra.effective_from, 'YYYY-MM-DD') as effective_from,
              to_char(ra.effective_to, 'YYYY-MM-DD') as effective_to
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
         left join public.committee_years cy on cy.id = ra.committee_year_id
         left join public.seasons sn on sn.id = ra.season_id
        where ra.person_id = $1::uuid
        order by ra.effective_from desc, r.sort_order`,
      [personId],
    );
    return result.rows.map((row) => ({
      roleName: row.role_name,
      cycleLabel: row.cycle_label,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      hasEnded: row.effective_to !== null,
    }));
  });
}

/** One of the person's season records — `W1-05`'s "Their seasons" list, each linking to `W6`. */
export interface PersonSeasonRecord {
  membershipId: string;
  seasonLabel: string;
  status: string;
}

/** Every season membership this person holds, most recent season first. */
export async function listPersonSeasons(personId: string): Promise<PersonSeasonRecord[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ membership_id: string; season_label: string; status: string }>(
      `select m.id as membership_id, s.label as season_label, m.status::text as status
         from public.season_memberships m
         join public.seasons s on s.id = m.season_id
        where m.person_id = $1::uuid
        order by s.starts_on desc nulls last, s.label desc`,
      [personId],
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      seasonLabel: row.season_label,
      status: row.status,
    }));
  });
}

// ---------------------------------------------------------------------------
// A merged-away duplicate's link resolves to the survivor — `W1-09`
// ---------------------------------------------------------------------------

export interface MergedPredecessor {
  personId: string;
  displayName: string;
  mergedAt: Date;
  mergedByDisplayName: string | null;
}

/**
 * The survivor's id, when `personId` names a person merged away under
 * invariant I6 — `readPersonRecordIn`'s own `NotFound` carries no such id, so
 * this is the second read `W1-09`'s redirect needs: "reaching its id directly
 * redirects to the surviving record."
 */
export async function resolveMergeSurvivor(personId: string): Promise<string | null> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ merged_into_person_id: string | null }>(
      `select merged_into_person_id from public.people where id = $1::uuid`,
      [personId],
    );
    return result.rows[0]?.merged_into_person_id ?? null;
  });
}

/**
 * Every person merged into this survivor, for `W1-09`'s one-sentence notice:
 * "'Holly Jarrowdale' was merged into this record on 3 October 2025 by
 * Caspian Hallowfield." A merge reads as one event naming what it moved
 * (`REQ-history-on-record`); this is that same fact, read for the record it
 * landed on rather than for the history section's own list.
 */
export async function listMergedPredecessors(
  survivorPersonId: string,
): Promise<MergedPredecessor[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{
      person_id: string;
      display_name: string;
      merged_at: Date;
      merged_by_display_name: string | null;
    }>(
      `select p.id as person_id,
              ${personDisplayNameSql("p")} as display_name,
              p.merged_at,
              ${personDisplayNameSql("actor")} as merged_by_display_name
         from public.people p
         left join public.people actor on actor.id = p.merged_by_person_id
        where p.merged_into_person_id = $1::uuid
        order by p.merged_at desc`,
      [survivorPersonId],
    );
    return result.rows.map((row) => ({
      personId: row.person_id,
      displayName: row.display_name,
      mergedAt: row.merged_at,
      mergedByDisplayName: row.merged_by_display_name,
    }));
  });
}

// ---------------------------------------------------------------------------
// The history section — `REQ-history-on-record`, `W1-11` and `W1-12`
// ---------------------------------------------------------------------------

/** One recorded change, generic over whatever actually wrote it. */
export interface PersonHistoryEntry {
  /** Stable across a render — `audit_events.id`, or a status-event id. */
  id: string;
  occurredAt: Date;
  /** What kind of thing changed — "Status", "Person", "Membership" — the field filter's own vocabulary. */
  field: string;
  /** One line naming what happened, with no further explanation. */
  summary: string;
  fromValue: string | null;
  toValue: string | null;
  actorDisplayName: string;
  reason: string | null;
}

/**
 * Turns a snake_case action into the club's words for it — "person_created"
 * becomes "Person created" — so a new action a later package writes renders
 * sensibly without this module knowing its name in advance.
 */
function humanizeAction(action: string): string {
  const words = action.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fieldFromAction(action: string, entityTable: string): string {
  if (action.includes("person")) return "Person";
  if (entityTable === "season_memberships" || action.includes("membership")) return "Membership";
  return humanizeAction(action);
}

const STATUS_HISTORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
  departed: "Departed",
  archived: "Archived",
});

/**
 * Every recorded change to this person's durable record and to the
 * memberships it holds, newest first — the `What changed` panel's whole
 * content. Read-only, and reads no more than `readPersonRecord()`'s own
 * `NotFound` already lets a caller learn: this throws nothing extra when the
 * person genuinely has no history yet, because a fresh record with no changes
 * is a real state, not an error.
 *
 * Two sources, because the frozen model gives status transitions a typed home
 * of their own (register D9) rather than duplicating them into
 * `audit_events`:
 *
 *   * `season_membership_status_events` for every membership this person
 *     holds, in any season — a real, typed history that exists today.
 *   * `audit_events` rows naming this person (`entity_table = 'people'`) or
 *     one of their memberships (`entity_table = 'season_memberships'`) —
 *     which is where `W2`'s corrections and `W4`'s merges will land once
 *     those packages write them, and where `returner_membership_confirmed`
 *     and `person_created` already do.
 *
 * `context` is deliberately never read here. It is unstructured JSON that a
 * future writer could put anything in, including a raw contact value on its
 * way to becoming the audit trail of a correction — `from_state`/`to_state`
 * are the typed, short columns this module trusts to describe a change.
 */
export async function readPersonHistory(personId: string): Promise<PersonHistoryEntry[]> {
  return withTransaction(async (tx) => {
    const memberships = await tx.query<{ id: string; season_label: string }>(
      `select m.id, s.label as season_label
         from public.season_memberships m
         join public.seasons s on s.id = m.season_id
        where m.person_id = $1::uuid`,
      [personId],
    );
    const membershipIds = memberships.rows.map((row) => row.id);
    const seasonLabelByMembership = new Map(
      memberships.rows.map((row) => [row.id, row.season_label]),
    );

    // `= any($1::uuid[])` over an empty array is a legal, empty-matching
    // predicate in PostgreSQL, so this runs unconditionally rather than
    // branching on whether the person holds a membership at all.
    const statusEvents = await tx.query<{
      id: string;
      season_membership_id: string;
      from_status: string | null;
      to_status: string;
      occurred_at: Date;
      reason: string | null;
      actor_display_name: string | null;
    }>(
      `select e.id, e.season_membership_id, e.from_status::text as from_status,
              e.to_status::text as to_status, e.occurred_at, e.reason,
              ${personDisplayNameSql("actor")} as actor_display_name
         from public.season_membership_status_events e
         left join public.people actor on actor.id = e.actor_person_id
        where e.season_membership_id = any($1::uuid[])`,
      [membershipIds],
    );

    const auditRows = await tx.query<{
      id: string;
      action: string;
      entity_table: string;
      from_state: string | null;
      to_state: string | null;
      reason: string | null;
      occurred_at: Date;
      actor_label: string | null;
      actor_display_name: string | null;
    }>(
      `select a.id, a.action, a.entity_table, a.from_state, a.to_state, a.reason, a.occurred_at,
              a.actor_label,
              ${personDisplayNameSql("actor")} as actor_display_name
         from public.audit_events a
         left join public.people actor on actor.id = a.actor_person_id
        where (a.entity_table = 'people' and a.entity_id = $1::uuid)
           or (a.entity_table = 'season_memberships' and a.entity_id = any($2::uuid[]))
        order by a.occurred_at desc`,
      [personId, membershipIds],
    );

    const fromStatusEvents: PersonHistoryEntry[] = statusEvents.rows.map((row) => {
      const seasonLabel = seasonLabelByMembership.get(row.season_membership_id) ?? "";
      const from = row.from_status
        ? (STATUS_HISTORY_LABELS[row.from_status] ?? row.from_status)
        : null;
      const to = STATUS_HISTORY_LABELS[row.to_status] ?? row.to_status;
      return {
        id: `status-event-${row.id}`,
        occurredAt: row.occurred_at,
        field: "Status",
        summary: `Status changed · ${seasonLabel}`,
        fromValue: from,
        toValue: to,
        actorDisplayName: row.actor_display_name ?? "Unknown",
        reason: row.reason,
      };
    });

    const fromAudit: PersonHistoryEntry[] = auditRows.rows.map((row) => ({
      id: `audit-event-${row.id}`,
      occurredAt: row.occurred_at,
      field: fieldFromAction(row.action, row.entity_table),
      summary: humanizeAction(row.action),
      fromValue: row.from_state,
      toValue: row.to_state,
      actorDisplayName: row.actor_display_name ?? row.actor_label ?? "Unknown",
      reason: row.reason,
    }));

    return [...fromStatusEvents, ...fromAudit].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
  });
}
