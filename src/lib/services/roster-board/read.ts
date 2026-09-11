import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import {
  listCurrentSeasonRoster,
  type MembershipStatus,
  type OnboardingItemStatus,
} from "../membership";
import type { AssembledStatus, PersonFactPresence } from "../person-required";
import { missingRequiredFields } from "../person-required";
import { isOxfordCollegeEmail } from "../person-validation";
import type { Season } from "../seasons";
import { BOARD_ELIGIBILITY_COMPETITION } from "./shared";

/**
 * The roster board's read path — LAN-186, `WP-roster-board`.
 * Every column's vocabulary and shape decisions are in `relocations.md`
 * (source: `roster-board.ts` module header).
 * Decision history: docs/ux/tickets/LAN-186-roster-board.md.
 */

export type BluesValue = "Full" | "Half" | "None";
export type FormalwearItemKey = "tie" | "bowtie" | "socks";
/** `public.bps_selections.is_selected`, plain yes/no — a roster attribute beside Blues and Formalwear, never an onboarding item. */
export type BpsValue = "Yes" | "No";

interface PositionOption {
  code: string;
  label: string;
}

export interface PositionOptions {
  offence: PositionOption[];
  defence: PositionOption[];
  specialTeams: PositionOption[];
}

export interface RosterBoardRow {
  membershipId: string;
  personId: string;
  displayName: string;
  /** Every alias, including one that is not the display name, so search can find a player by it (LAN-186). */
  aliases: string[];
  status: MembershipStatus;
  entry: string;

  // Person — read only here; edited on the person record (W2).
  college: string | null;
  matriculationYear: number | null;
  expectedGraduationYear: number | null;
  degreeField: string | null;
  hasMobile: boolean;
  hasEmail: boolean;
  /** Required facts for this rung, not yet recorded. `REQ-not-recorded`. */
  missingCount: number;
  /** Raw mobile, carried only for the `tel:` link — never a column, never displayed as text. */
  phoneForCall: string | null;

  // Onboarding
  itemsTotal: number;
  itemsResolved: number;
  requiredOutstanding: number;

  // Season — editable in the cell.
  offencePosition: string | null;
  defencePosition: string | null;
  specialTeamsPosition: string | null;
  blueNumbers: string[];
  whiteNumbers: string[];
  coachGroup: string | null;
  formalwear: Record<FormalwearItemKey, boolean>;
  blues: BluesValue;
  /** `public.eligibility_status`, for the `club_play` competition, or `null`. */
  eligibility: string | null;
  /** `public.availability_level`, or `null` when nothing has ever been recorded. */
  availability: string | null;
  /** `public.bps_selections.is_selected`, defaulting to "No" — no row yet means never selected. */
  bps: BpsValue;
  /** The operator-ticked onboarding items, keyed by code — LAN-217. Missing entry means not yet generated. */
  onboardingItems: Readonly<Record<string, { id: string; status: OnboardingItemStatus }>>;
}

interface JerseyHolders {
  blue: Record<string, string>;
  white: Record<string, string>;
}

export interface RosterBoardData {
  season: Season;
  rows: RosterBoardRow[];
  totalInSeason: number;
  /** Built from every row in the season, never the filtered view — README's own rule. */
  jerseyHolders: JerseyHolders;
  positionOptions: PositionOptions;
}

async function readPositionOptionsIn(tx: Tx, seasonId: string): Promise<PositionOptions> {
  const result = await tx.query<{ code: string; label: string; side: string }>(
    `select p.code, p.label, p.side::text as side
       from public.positions p
       join public.seasons s on s.position_vocabulary_id = p.vocabulary_id
      where s.id = $1::uuid
      order by p.side, p.sort_order, p.code`,
    [seasonId],
  );

  const options: PositionOptions = { offence: [], defence: [], specialTeams: [] };
  for (const row of result.rows) {
    const option = { code: row.code, label: row.label };
    if (row.side === "offence") options.offence.push(option);
    else if (row.side === "defence") options.defence.push(option);
    else options.specialTeams.push(option);
  }
  return options;
}

/** The season's position vocabulary, for a column's dropdown. Never hardcoded — invariant S3. */
export async function readPositionOptions(seasonId: string): Promise<PositionOptions> {
  return withTransaction(async (tx) => readPositionOptionsIn(tx, seasonId));
}

/**
 * The whole board: every membership in the current season, unfiltered —
 * search/filter/sort apply afterwards, in the application (`DEC-w1-12`).
 * The reads run sequentially, not under `Promise.all` — `pg` serialises
 * concurrent calls on one pooled client anyway (LAN-227).
 */
export async function listRosterBoard(): Promise<RosterBoardData> {
  const roster = await listCurrentSeasonRoster();
  const membershipIds = roster.entries.map((entry) => entry.membershipId);
  const personIds = roster.entries.map((entry) => entry.personId);

  if (membershipIds.length === 0) {
    return {
      season: roster.season,
      rows: [],
      totalInSeason: roster.totalInSeason,
      jerseyHolders: { blue: {}, white: {} },
      positionOptions: await readPositionOptions(roster.season.id),
    };
  }

  return withTransaction(async (tx) => {
    const people = await tx.query<{
      id: string;
      college: string | null;
      matriculation_year: number | null;
      expected_graduation_year: number | null;
      degree_field: string | null;
      date_of_birth: string | null;
      has_personal_email: boolean;
      college_email: string | null;
    }>(
      `select id, college, matriculation_year, expected_graduation_year, degree_field,
              to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth,
              exists (
                select 1 from public.contact_points c
                 where c.person_id = people.id and c.kind = 'email'
                   and c.scope = 'personal' and c.valid_until is null
              ) as has_personal_email,
              -- The value, not a boolean: whether it counts is the Oxford
              -- rule's answer, and that rule has one home (LAN-268).
              (select coalesce(nullif(btrim(c.normalised_value), ''), c.raw_value)
                 from public.contact_points c
                where c.person_id = people.id and c.kind = 'email'
                  and c.scope = 'college' and c.valid_until is null
                order by c.is_preferred desc, c.valid_from desc
                limit 1) as college_email
         from public.people people
        where id = any($1::uuid[])`,
      [personIds],
    );
    const aliasRows = await tx.query<{ person_id: string; alias: string }>(
      `select person_id, alias from public.person_aliases where person_id = any($1::uuid[])`,
      [personIds],
    );
    const emergencyContacts = await tx.query<{ person_id: string }>(
      `select person_id from public.person_emergency_contacts where person_id = any($1::uuid[])`,
      [personIds],
    );
    const positionRows = await tx.query<{
      season_membership_id: string;
      side: string;
      code: string;
      created_at: Date;
    }>(
      `select pa.season_membership_id, pa.side::text as side, pos.code, pa.created_at
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_id = $1::uuid and pa.effective_to is null`,
      [roster.season.id],
    );
    const jerseyRows = await tx.query<{
      season_membership_id: string;
      kit: string;
      number: number;
    }>(
      `select season_membership_id, kit::text as kit, number
         from public.jersey_assignments
        where season_id = $1::uuid and effective_to is null
        order by number`,
      [roster.season.id],
    );
    const coachGroupRows = await tx.query<{ season_membership_id: string; coach_group: string }>(
      `select season_membership_id, coach_group
         from public.coach_group_assignments
        where season_id = $1::uuid`,
      [roster.season.id],
    );
    const formalwearRows = await tx.query<{
      season_membership_id: string;
      item: string;
      ownership: string;
    }>(
      `select season_membership_id, item::text as item, ownership
         from public.formalwear_records
        where season_id = $1::uuid`,
      [roster.season.id],
    );
    const bluesRows = await tx.query<{
      season_membership_id: string;
      half_blue_awarded: boolean;
      full_blue_awarded: boolean;
    }>(
      `select season_membership_id, half_blue_awarded, full_blue_awarded
         from public.blues_awards
        where season_id = $1::uuid`,
      [roster.season.id],
    );
    const eligibilityRows = await tx.query<{ season_membership_id: string; status: string }>(
      `select season_membership_id, status::text as status
         from public.eligibility_records
        where season_id = $1::uuid and competition = $2::public.competition_scope
          and effective_to is null`,
      [roster.season.id, BOARD_ELIGIBILITY_COMPETITION],
    );
    const availabilityRows = await tx.query<{ season_membership_id: string; level: string }>(
      `select season_membership_id, level::text as level
         from public.current_availability
        where season_id = $1::uuid`,
      [roster.season.id],
    );
    const bpsRows = await tx.query<{ season_membership_id: string; is_selected: boolean }>(
      `select season_membership_id, is_selected
         from public.bps_selections
        where season_id = $1::uuid`,
      [roster.season.id],
    );
    // Every item this season carries; the derived two are filtered out in TypeScript below.
    const onboardingItemRows = await tx.query<{
      season_membership_id: string;
      id: string;
      code: string;
      status: string;
    }>(
      `select i.season_membership_id, i.id, t.code, i.status::text as status
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = any($1::uuid[])`,
      [membershipIds],
    );
    const positionOptions = await readPositionOptionsIn(tx, roster.season.id);

    const personById = new Map(people.rows.map((row) => [row.id, row]));
    const hasEmergencyContact = new Set(emergencyContacts.rows.map((row) => row.person_id));
    const aliasesByPerson = new Map<string, string[]>();
    for (const row of aliasRows.rows) {
      const list = aliasesByPerson.get(row.person_id) ?? [];
      list.push(row.alias);
      aliasesByPerson.set(row.person_id, list);
    }

    const offenceByMembership = new Map<string, string>();
    const defenceByMembership = new Map<string, string>();
    const specialTeamsByMembership = new Map<string, { code: string; createdAt: Date }>();
    for (const row of positionRows.rows) {
      if (row.side === "offence") offenceByMembership.set(row.season_membership_id, row.code);
      else if (row.side === "defence") defenceByMembership.set(row.season_membership_id, row.code);
      else {
        const existing = specialTeamsByMembership.get(row.season_membership_id);
        if (!existing || row.created_at > existing.createdAt) {
          specialTeamsByMembership.set(row.season_membership_id, {
            code: row.code,
            createdAt: row.created_at,
          });
        }
      }
    }

    const blueByMembership = new Map<string, string[]>();
    const whiteByMembership = new Map<string, string[]>();
    const jerseyHolders: JerseyHolders = { blue: {}, white: {} };
    const nameByMembership = new Map(
      roster.entries.map((entry) => [entry.membershipId, entry.displayName]),
    );
    for (const row of jerseyRows.rows) {
      const target = row.kit === "blue" ? blueByMembership : whiteByMembership;
      const list = target.get(row.season_membership_id) ?? [];
      list.push(String(row.number));
      target.set(row.season_membership_id, list);

      const holders = row.kit === "blue" ? jerseyHolders.blue : jerseyHolders.white;
      const name = nameByMembership.get(row.season_membership_id);
      if (name) holders[String(row.number)] = name;
    }

    const coachGroupByMembership = new Map(
      coachGroupRows.rows.map((row) => [row.season_membership_id, row.coach_group]),
    );

    const formalwearByMembership = new Map<string, Record<FormalwearItemKey, boolean>>();
    for (const row of formalwearRows.rows) {
      const current = formalwearByMembership.get(row.season_membership_id) ?? {
        tie: false,
        bowtie: false,
        socks: false,
      };
      current[row.item as FormalwearItemKey] = row.ownership !== "No";
      formalwearByMembership.set(row.season_membership_id, current);
    }

    const bluesByMembership = new Map<string, BluesValue>();
    for (const row of bluesRows.rows) {
      bluesByMembership.set(
        row.season_membership_id,
        row.full_blue_awarded ? "Full" : row.half_blue_awarded ? "Half" : "None",
      );
    }

    const eligibilityByMembership = new Map(
      eligibilityRows.rows.map((row) => [row.season_membership_id, row.status]),
    );
    const availabilityByMembership = new Map(
      availabilityRows.rows.map((row) => [row.season_membership_id, row.level]),
    );
    const bpsByMembership = new Map(
      bpsRows.rows.map((row) => [row.season_membership_id, row.is_selected]),
    );

    const onboardingItemsByMembership = new Map<
      string,
      Record<string, { id: string; status: OnboardingItemStatus }>
    >();
    for (const row of onboardingItemRows.rows) {
      const current = onboardingItemsByMembership.get(row.season_membership_id) ?? {};
      current[row.code] = { id: row.id, status: row.status as OnboardingItemStatus };
      onboardingItemsByMembership.set(row.season_membership_id, current);
    }

    const rows: RosterBoardRow[] = roster.entries.map((entry) => {
      const person = personById.get(entry.personId);
      const presence: PersonFactPresence = {
        givenName: true,
        familyName: entry.familyName !== null,
        mobile: entry.phone !== null,
        collegeEmail: isOxfordCollegeEmail(person?.college_email ?? null),
        personalEmail: person?.has_personal_email ?? false,
        college: (person?.college ?? null) !== null,
        matriculationYear: (person?.matriculation_year ?? null) !== null,
        expectedGraduationYear: (person?.expected_graduation_year ?? null) !== null,
        degreeField: (person?.degree_field ?? null) !== null,
        dateOfBirth: (person?.date_of_birth ?? null) !== null,
        emergencyContact: hasEmergencyContact.has(entry.personId),
      };
      const missingCount = missingRequiredFields(entry.status as AssembledStatus, presence).length;
      const special = specialTeamsByMembership.get(entry.membershipId);

      return {
        membershipId: entry.membershipId,
        personId: entry.personId,
        displayName: entry.displayName,
        aliases: aliasesByPerson.get(entry.personId) ?? [],
        status: entry.status,
        entry: entry.entry,
        college: person?.college ?? null,
        matriculationYear: person?.matriculation_year ?? null,
        expectedGraduationYear: person?.expected_graduation_year ?? null,
        degreeField: person?.degree_field ?? null,
        hasMobile: entry.phone !== null,
        hasEmail: entry.email !== null,
        missingCount,
        phoneForCall: entry.phone,
        itemsTotal: entry.itemsTotal,
        itemsResolved: entry.itemsResolved,
        requiredOutstanding: entry.requiredOutstanding,
        offencePosition: offenceByMembership.get(entry.membershipId) ?? null,
        defencePosition: defenceByMembership.get(entry.membershipId) ?? null,
        specialTeamsPosition: special?.code ?? null,
        blueNumbers: (blueByMembership.get(entry.membershipId) ?? []).sort(
          (a, b) => Number(a) - Number(b),
        ),
        whiteNumbers: (whiteByMembership.get(entry.membershipId) ?? []).sort(
          (a, b) => Number(a) - Number(b),
        ),
        coachGroup: coachGroupByMembership.get(entry.membershipId) ?? null,
        formalwear: formalwearByMembership.get(entry.membershipId) ?? {
          tie: false,
          bowtie: false,
          socks: false,
        },
        blues: bluesByMembership.get(entry.membershipId) ?? "None",
        eligibility: eligibilityByMembership.get(entry.membershipId) ?? null,
        availability: availabilityByMembership.get(entry.membershipId) ?? null,
        bps: bpsByMembership.get(entry.membershipId) ? "Yes" : "No",
        onboardingItems: onboardingItemsByMembership.get(entry.membershipId) ?? {},
      };
    });

    return {
      season: roster.season,
      rows,
      totalInSeason: roster.totalInSeason,
      jerseyHolders,
      positionOptions,
    };
  });
}
