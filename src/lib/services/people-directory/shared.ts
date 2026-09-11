import "server-only";

import type { Tx } from "@/lib/db";
import {
  type AssembledStatus,
  type PersonFactPresence,
  type RequiredField,
  missingRequiredFields,
} from "../person-required";
import { isOxfordCollegeEmail } from "../person-validation";
import type { Season } from "../seasons";
import { personAssembledStatusSql, personDisplayNameSql } from "../sql-text";

/**
 * The People list and missing-data queue's shared row shape, fetch, and
 * sort — LAN-184. See `relocations.md` for the module's full design note.
 */

export type PeopleScope = "in_season" | "outside_season";

/** One row of the People list, or one row of the missing-data queue. */
export interface PersonListEntry {
  personId: string;
  displayName: string;
  /** A non-display alias the search term matched (`W1-02`); `null` when no term or no alias match. */
  matchedAlias: string | null;
  status: AssembledStatus;
  /** "What they are to the club" (`DEC-w1-03`): Player, Recruit, role(s), or `null` for none this scope can see. */
  clubRoleSummary: string | null;
  hasMobile: boolean;
  hasPersonalEmail: boolean;
  /** Every required field this person's rung asks for that is absent. Never a bare count. */
  missingRequiredFields: RequiredField[];
  /** LAN-218, `W8`. This person's membership for the season in view. Optional — `listPeople` never sets it. */
  membershipId?: string | null;
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
  /** LAN-218, `W8`. Restricts to `onboarding` status. `false`/`undefined` is the original, unrestricted scope. */
  onlyOnboardingPlayers?: boolean;
}

export interface MissingQueue {
  season: Season;
  scope: PeopleScope;
  entries: PersonListEntry[];
  /** Every person in this scope with at least one required fact absent, before filtering. */
  totalMissing: number;
}

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

interface DirectoryRow {
  person_id: string;
  display_name: string;
  given_name: string;
  family_name: string | null;
  status: AssembledStatus;
  is_past_member: boolean | null;
  has_membership_tie: boolean;
  membership_id: string | null;
  has_prospect_tie: boolean;
  roles_in_view: string[] | null;
  latest_role_label: string | null;
  has_mobile: boolean;
  has_personal_email: boolean;
  college_email: string | null;
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
 * season in view, unfiltered. `season_roles` computes the tie itself — a
 * role assignment scoped to the season/committee year is a tie by
 * construction, whether or not the seat has since ended (`W1-05`).
 */
export async function fetchDirectoryRows(
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
       select person_id, id as membership_id
         from public.season_memberships where season_id = $1::uuid
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
       smt.membership_id,
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
       -- The value, not a boolean. LAN-268 counts a stored college address
       -- that fails the Oxford rule as missing, and that rule has exactly one
       -- home, isOxfordCollegeEmail; asking it in SQL as well would be the
       -- second copy the ticket forbids, in the language where a drift is
       -- hardest to see.
       (select coalesce(nullif(btrim(c.normalised_value), ''), c.raw_value)
          from public.contact_points c
         where c.person_id = p.id and c.kind = 'email' and c.scope = 'college'
           and c.valid_until is null
         order by c.is_preferred desc, c.valid_from desc
         limit 1) as college_email,
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
    collegeEmail: isOxfordCollegeEmail(row.college_email),
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

export function normaliseSearch(search: string | null | undefined): string | null {
  if (typeof search !== "string") return null;
  const trimmed = search.trim();
  return trimmed === "" ? null : trimmed;
}

function containsSearchTerm(value: string | null | undefined, term: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(term.toLowerCase());
}

/** Whether a row matches free-text search over given name, family name and every alias. */
export function matchesSearch(row: DirectoryRow, term: string): boolean {
  if (containsSearchTerm(row.given_name, term)) return true;
  if (containsSearchTerm(row.family_name, term)) return true;
  return (row.all_aliases ?? []).some((alias) => containsSearchTerm(alias, term));
}

/** The non-display alias the search term matched, if any — `W1-02`. */
function matchedAliasFor(row: DirectoryRow, term: string | null): string | null {
  if (term === null) return null;
  return (row.non_display_aliases ?? []).find((alias) => containsSearchTerm(alias, term)) ?? null;
}

export function toEntry(
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
    membershipId: row.membership_id,
  };
}

export const PEOPLE_LIST_SORT_COLUMNS: readonly string[] = Object.freeze([
  "name",
  "status",
  "club",
  "contactable",
  "missing",
  // Finding 8: binary collapse of the status ladder, never a second ranking of `status`.
  "type",
]);
export const DEFAULT_PEOPLE_SORT = "name";

export const MISSING_QUEUE_SORT_COLUMNS: readonly string[] = Object.freeze(["missing", "name"]);
export const DEFAULT_MISSING_SORT = "missing";

export function compareBy(sort: string, direction: "asc" | "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return (a: PersonListEntry, b: PersonListEntry): number => {
    let cmp = 0;
    switch (sort) {
      case "status":
        cmp = statusRank(a.status) - statusRank(b.status);
        break;
      case "type": {
        // Recruit first, ascending (finding 8).
        const rank = (status: PersonListEntry["status"]) => (status === "recruit" ? 0 : 1);
        cmp = rank(a.status) - rank(b.status);
        break;
      }
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
    // A stable tie-break.
    return a.displayName.localeCompare(b.displayName);
  };
}

export function resolveDirection(
  sort: string,
  direction: string | null | undefined,
  columns: readonly string[],
  fallback: string,
): { sort: string; direction: "asc" | "desc" } {
  const resolvedSort = columns.includes(sort) ? sort : fallback;
  const resolvedDirection = direction === "desc" ? "desc" : "asc";
  return { sort: resolvedSort, direction: resolvedDirection };
}
