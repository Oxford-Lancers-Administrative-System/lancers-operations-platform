import "server-only";

import { Conflict, ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { listCurrentSeasonRoster, type MembershipStatus } from "./membership";
import type { AssembledStatus, PersonFactPresence } from "./person-required";
import { missingRequiredFields } from "./person-required";
import type { Season } from "./seasons";

/**
 * The roster board's own read and write path — LAN-186, `WP-roster-board`.
 *
 * ## Why this is a new module rather than an addition to `membership.ts`
 *
 * The mission's collision plan runs this package beside `WP-people-read`
 * (LAN-184) on disjoint files, and both packages call the substrate LAN-183
 * built rather than editing it. This module adds nothing to `membership.ts`,
 * `person-record.ts` or any other existing service file — it is a new file
 * that *reads* `listCurrentSeasonRoster()` for the base roster and adds the
 * seven columns Task 08 §5 puts on the board and LAN-186 takes as scope:
 * positions, jersey numbers, coach group, formalwear, Blues, eligibility and
 * availability. All seven have storage on `main` already (LAN-182); nothing
 * here is a migration.
 *
 * ## The three decisions this module encodes, verbatim from the issue
 *
 * 1. **Positions are three single-select columns, not one multi-select one.**
 *    `Q-9`, 2026-08-28: "Doesn't need to be multi-tick, but we do need one
 *    offense, one defense, and one special teams in the columns as is."
 *    Offence and defence map directly onto `position_slot`'s `offence` and
 *    `defence` values — S1 already permits at most one current assignment per
 *    slot, so nothing about the constraint changes. **Special teams is the one
 *    genuine application decision this package takes**: the schema gives
 *    special-teams positions four independent slots (`kickoff`, `kick_return`,
 *    `punt`, `field_goal`), each individually one-current-per-slot under S1,
 *    but Brian asked for *one* Special-teams value in *one* column. This module
 *    therefore treats "this membership's special-teams assignment" as a single
 *    board-level concept: setting a new value closes every currently-open
 *    special-teams row for that membership (whichever of the four slots it
 *    was in) and opens one new row in the slot the chosen position implies.
 *    That is an application-level narrowing of what the schema would allow,
 *    not a database change, and it is the reading the issue's own words call
 *    for ("one special teams in the columns as is").
 *
 * 2. **The vocabulary is read from the season, never hardcoded.** Invariant
 *    S3: a position's vocabulary is a foreign key to the season's own. Every
 *    option this module offers comes from `readPositionOptions()`, which joins
 *    `positions` to `seasons.position_vocabulary_id`.
 *
 * 3. **Every change supersedes by effective dating (S4); nothing is deleted.**
 *    Positions and eligibility close the current row's `effective_to` before
 *    opening a new one, inside the same transaction as the insert. Jersey
 *    numbers do the same per number: unticking closes a row, it is never
 *    dropped. Availability is append-only by the schema's own design (A1), so
 *    a change is always a new row and never an update.
 *
 * ## What this module does not decide
 *
 * `is_predominant` (jersey), the football meaning of a coach group, and what a
 * position *means* on the field are Mission 9's. Where a value needs a
 * sensible default with no UI of its own — `is_predominant` is one — this
 * module keeps the schema honest (at most one predominant row per kit, per
 * `jersey_assignments_one_predominant_per_kit`) by promoting the lowest
 * current number automatically; it never asks the operator to choose one, and
 * the README on `chore/roster-fidelity-mockup` is explicit that choosing it
 * belongs on player detail's fuller editor.
 *
 * `Eligibility` is rendered against the `club_play` competition specifically —
 * a documented reading of a column the mockup and photographs never populate,
 * chosen because it is the one competition scope every player needs regardless
 * of which representative sides they may also qualify for. Widening the column
 * to show every competition is a later, deliberate UI decision, not a service
 * limitation.
 */

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** `current_date` from the database, so every date in one transaction agrees. */
async function currentDateOf(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>(
    "select to_char(current_date, 'YYYY-MM-DD') as today",
  );
  return result.rows[0].today;
}

/**
 * Closes a current, effective-dated row — but only ever onto one of these two
 * tables, named explicitly rather than taken as a caller-supplied string.
 */
type SupersedableTable = "position_assignments" | "jersey_assignments" | "eligibility_records";

/**
 * Ends a current row's effective period, or — when it was opened on the same
 * day it is being replaced — deletes it outright.
 *
 * `..._period_ordered` on every one of these tables requires
 * `effective_to > effective_from`, strictly: two `date` columns with no time
 * component. An operator correcting a same-day mis-click (set a position at
 * 10am, fix it at 2pm) would otherwise ask this module to set `effective_to`
 * equal to `effective_from`, which the database refuses outright — found by
 * this module's own test suite reproducing exactly that sequence, not assumed.
 *
 * A row that lived for zero calendar days was never "current" for anybody to
 * have read as the club's answer, so there is no history in it worth
 * preserving by superseding — deleting it and inserting the new one fresh is a
 * same-day correction, not the overwrite invariant S4 forbids. A row opened on
 * an earlier day still supersedes exactly as before.
 */
async function closeCurrentRow(
  tx: Tx,
  table: SupersedableTable,
  id: string,
  effectiveFrom: string,
  today: string,
): Promise<void> {
  if (effectiveFrom === today) {
    if (table === "position_assignments") {
      await tx.query(`delete from public.position_assignments where id = $1::uuid`, [id]);
    } else if (table === "jersey_assignments") {
      await tx.query(`delete from public.jersey_assignments where id = $1::uuid`, [id]);
    } else {
      await tx.query(`delete from public.eligibility_records where id = $1::uuid`, [id]);
    }
    return;
  }

  if (table === "position_assignments") {
    await tx.query(`update public.position_assignments set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  } else if (table === "jersey_assignments") {
    await tx.query(`update public.jersey_assignments set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  } else {
    await tx.query(`update public.eligibility_records set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  }
}

function actorRequirement(actorPersonId: string): void {
  if (typeof actorPersonId !== "string" || actorPersonId.trim() === "") {
    throw new ConstraintViolated("A board edit has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }
}

// ---------------------------------------------------------------------------
// Reading the board
// ---------------------------------------------------------------------------

export type BluesValue = "Full" | "Half" | "None";
export type FormalwearItemKey = "tie" | "bowtie" | "socks";

export interface PositionOption {
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
  /**
   * Every alias on the person record, `WP-people-read`'s substrate
   * (`person_aliases`) — including one that is not the display name, so the
   * board's search can find a player by it. LAN-186's own acceptance:
   * "Search by an alias and find the player."
   */
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
  /**
   * The raw mobile number, carried **only** to compose the phone condensed
   * view's `tel:` link — the workflow's one permitted channel action (voice
   * call, and nothing else). Never a column, never displayed as text, never
   * part of `COLUMN_ROW_FIELDS` in `board-columns.ts`: "raw contact values
   * leave the grid" governs what renders as a value, not the one functional
   * exception the approved workflow itself calls for.
   */
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
}

export interface JerseyHolders {
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

const BOARD_ELIGIBILITY_COMPETITION = "club_play";

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
 * The whole board: every membership in the current season, in any status,
 * carrying every column LAN-186 adds.
 *
 * Unfiltered on purpose. The season holds dozens of memberships, not
 * thousands (`DEC-w1-12`), so search, filter and sort are applied afterwards,
 * in the application, over the full set — exactly as the approved fidelity
 * mockup does it, and as `board-data.ts` implements it.
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
    const [
      people,
      aliasRows,
      emergencyContacts,
      positionRows,
      jerseyRows,
      coachGroupRows,
      formalwearRows,
      bluesRows,
      eligibilityRows,
      availabilityRows,
      positionOptions,
    ] = await Promise.all([
      tx.query<{
        id: string;
        college: string | null;
        matriculation_year: number | null;
        expected_graduation_year: number | null;
        degree_field: string | null;
        date_of_birth: string | null;
        has_personal_email: boolean;
      }>(
        `select id, college, matriculation_year, expected_graduation_year, degree_field,
                to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth,
                exists (
                  select 1 from public.contact_points c
                   where c.person_id = people.id and c.kind = 'email'
                     and c.scope = 'personal' and c.valid_until is null
                ) as has_personal_email
           from public.people people
          where id = any($1::uuid[])`,
        [personIds],
      ),
      tx.query<{ person_id: string; alias: string }>(
        `select person_id, alias from public.person_aliases where person_id = any($1::uuid[])`,
        [personIds],
      ),
      tx.query<{ person_id: string }>(
        `select person_id from public.person_emergency_contacts where person_id = any($1::uuid[])`,
        [personIds],
      ),
      tx.query<{ season_membership_id: string; side: string; code: string; created_at: Date }>(
        `select pa.season_membership_id, pa.side::text as side, pos.code, pa.created_at
           from public.position_assignments pa
           join public.positions pos on pos.id = pa.position_id
          where pa.season_id = $1::uuid and pa.effective_to is null`,
        [roster.season.id],
      ),
      tx.query<{ season_membership_id: string; kit: string; number: number }>(
        `select season_membership_id, kit::text as kit, number
           from public.jersey_assignments
          where season_id = $1::uuid and effective_to is null
          order by number`,
        [roster.season.id],
      ),
      tx.query<{ season_membership_id: string; coach_group: string }>(
        `select season_membership_id, coach_group
           from public.coach_group_assignments
          where season_id = $1::uuid`,
        [roster.season.id],
      ),
      tx.query<{ season_membership_id: string; item: string; ownership: string }>(
        `select season_membership_id, item::text as item, ownership
           from public.formalwear_records
          where season_id = $1::uuid`,
        [roster.season.id],
      ),
      tx.query<{
        season_membership_id: string;
        half_blue_awarded: boolean;
        full_blue_awarded: boolean;
      }>(
        `select season_membership_id, half_blue_awarded, full_blue_awarded
           from public.blues_awards
          where season_id = $1::uuid`,
        [roster.season.id],
      ),
      tx.query<{ season_membership_id: string; status: string }>(
        `select season_membership_id, status::text as status
           from public.eligibility_records
          where season_id = $1::uuid and competition = $2::public.competition_scope
            and effective_to is null`,
        [roster.season.id, BOARD_ELIGIBILITY_COMPETITION],
      ),
      tx.query<{ season_membership_id: string; level: string }>(
        `select season_membership_id, level::text as level
           from public.current_availability
          where season_id = $1::uuid`,
        [roster.season.id],
      ),
      readPositionOptionsIn(tx, roster.season.id),
    ]);

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

    const rows: RosterBoardRow[] = roster.entries.map((entry) => {
      const person = personById.get(entry.personId);
      const presence: PersonFactPresence = {
        givenName: true,
        familyName: entry.familyName !== null,
        mobile: entry.phone !== null,
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

// ---------------------------------------------------------------------------
// Writing — positions (offence / defence / special teams)
// ---------------------------------------------------------------------------

export type PositionColumn = "offence" | "defence" | "specialTeams";

/**
 * `KO → kickoff, KR → kick_return, PUNT → punt, FG → field_goal` — LAN-186's
 * own words, not this module's invention. The club's special-teams codes are
 * unchanged between `VOCAB_2023` and `VOCAB_2026` (LAN-190), so this mapping is
 * stable across the one vocabulary change the club has made; a future
 * vocabulary that renamed them would need this table updated alongside it,
 * exactly as it would need the issue's own prose updated.
 */
const SPECIAL_TEAMS_SLOT_BY_CODE: Readonly<Record<string, string>> = Object.freeze({
  KO: "kickoff",
  KR: "kick_return",
  PUNT: "punt",
  FG: "field_goal",
});

async function lookupPosition(
  tx: Tx,
  seasonId: string,
  side: "offence" | "defence" | "special_teams",
  code: string,
): Promise<{ id: string; vocabularyId: string }> {
  const result = await tx.query<{ id: string; vocabulary_id: string }>(
    `select p.id, s.position_vocabulary_id as vocabulary_id
       from public.positions p
       join public.seasons s on s.position_vocabulary_id = p.vocabulary_id
      where s.id = $1::uuid and p.side = $2::public.position_side and p.code = $3`,
    [seasonId, side, code],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      `"${code}" is not a position in this season's vocabulary for that side.`,
      { rule: "position_assignments_position_in_vocabulary" },
    );
  }
  return { id: row.id, vocabularyId: row.vocabulary_id };
}

const POSITION_COLUMN_SIDE: Readonly<
  Record<PositionColumn, "offence" | "defence" | "special_teams">
> = Object.freeze({
  offence: "offence",
  defence: "defence",
  specialTeams: "special_teams",
});

/**
 * Sets — or clears — the one position this board column holds, superseding
 * whatever was there rather than adding a second row or deleting the first
 * (invariant S4). See the module note above for the special-teams reading.
 */
export async function commitPosition(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  column: PositionColumn;
  /** The chosen position code, or `null` to clear the column. */
  code: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const side = POSITION_COLUMN_SIDE[params.column];

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; code: string; effective_from: string }>(
      `select pa.id, pos.code, to_char(pa.effective_from, 'YYYY-MM-DD') as effective_from
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.side = $2::public.position_side
          and pa.effective_to is null
        for update of pa`,
      [params.membershipId, side],
    );

    const before = current.rows.map((row) => row.code).join(", ") || null;
    if (current.rows.length === 1 && params.code === current.rows[0].code) return; // no-op

    for (const row of current.rows) {
      await closeCurrentRow(tx, "position_assignments", row.id, row.effective_from, today);
    }

    if (params.code !== null) {
      const position = await lookupPosition(tx, params.seasonId, side, params.code);
      const slot = side === "special_teams" ? SPECIAL_TEAMS_SLOT_BY_CODE[params.code] : side;
      if (!slot) {
        throw new ConstraintViolated(
          `"${params.code}" does not map to a recognised special-teams slot.`,
          { rule: "position_assignments_slot_matches_side" },
        );
      }
      await tx.query(
        `insert into public.position_assignments
           (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot,
            effective_from, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::public.position_side,
                 $6::public.position_slot, $7::date, $8::uuid)`,
        [
          params.membershipId,
          params.seasonId,
          position.vocabularyId,
          position.id,
          side,
          slot,
          today,
          params.actorPersonId,
        ],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "position_assignment_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.code,
      context: { issue: "LAN-186", column: params.column, side },
    });
  });
}

// ---------------------------------------------------------------------------
// Writing — jersey numbers
// ---------------------------------------------------------------------------

export type Kit = "blue" | "white";

/**
 * Sets the whole held set for one kit, effective-dating the difference:
 * a number leaving the set closes its row (never dropped, unlike the fidelity
 * mockup); a number entering it opens a new one. A number already held by
 * another current membership in this season and kit is refused — belt and
 * braces behind the UI, which should never offer it in the first place (`Q-8`).
 */
export async function commitJerseyNumbers(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  kit: Kit;
  numbers: readonly string[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; number: number; effective_from: string }>(
      `select id, number, to_char(effective_from, 'YYYY-MM-DD') as effective_from
         from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = $2::public.kit and effective_to is null
        for update`,
      [params.membershipId, params.kit],
    );

    const currentNumbers = new Set(current.rows.map((row) => String(row.number)));
    const nextNumbers = new Set(params.numbers.map(String));
    const toRemove = current.rows.filter((row) => !nextNumbers.has(String(row.number)));
    const toAdd = [...nextNumbers].filter((number) => !currentNumbers.has(number));

    for (const row of toRemove) {
      await closeCurrentRow(tx, "jersey_assignments", row.id, row.effective_from, today);
    }

    for (const number of toAdd) {
      const holder = await tx.query<{ season_membership_id: string }>(
        `select season_membership_id
           from public.jersey_assignments
          where season_id = $1::uuid and kit = $2::public.kit and number = $3
            and effective_to is null and not is_import_conflict
          for update`,
        [params.seasonId, params.kit, Number(number)],
      );
      if (holder.rows.some((row) => row.season_membership_id !== params.membershipId)) {
        // Application-level pre-check, named distinctly from the database's own
        // `jersey_assignments_unique_within_season_and_kit` exclusion below it
        // (LAN186-F2): both guard the same rule, but a test asserting on `rule`
        // has to be able to tell which layer actually refused. Reusing the
        // constraint's name here made this check and its database backstop
        // indistinguishable to a caller — disabling this block entirely still
        // left every test green, because the exclusion constraint threw the
        // identical `rule` string on the very next statement.
        throw new Conflict(
          `Number ${number} is already held by another player this season. Release it from ` +
            "them before assigning it here.",
          { rule: "roster_board_jersey_number_held_by_another_membership" },
        );
      }
      await tx.query(
        `insert into public.jersey_assignments (season_membership_id, season_id, kit, number, effective_from)
         values ($1::uuid, $2::uuid, $3::public.kit, $4, $5::date)`,
        [params.membershipId, params.seasonId, params.kit, Number(number), today],
      );
    }

    // `jersey_assignments_one_predominant_per_kit`: exactly one predominant row
    // among current ones, or none when the kit holds no number. No UI here
    // chooses which — that is player detail's fuller editor — so the lowest
    // current number is promoted automatically whenever nothing else is
    // already predominant, which keeps the column the club reports against
    // populated rather than left ambiguous.
    const after = await tx.query<{ id: string; is_predominant: boolean }>(
      `select id, is_predominant
         from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = $2::public.kit and effective_to is null
        order by number`,
      [params.membershipId, params.kit],
    );
    if (after.rows.length > 0 && !after.rows.some((row) => row.is_predominant)) {
      await tx.query(`update public.jersey_assignments set is_predominant = true where id = $1`, [
        after.rows[0].id,
      ]);
    }

    const beforeLabel =
      [...currentNumbers].sort((a, b) => Number(a) - Number(b)).join(", ") || null;
    const afterLabel = [...nextNumbers].sort((a, b) => Number(a) - Number(b)).join(", ") || null;
    if (beforeLabel === afterLabel) return;

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "jersey_numbers_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: beforeLabel,
      toState: afterLabel,
      context: { issue: "LAN-186", kit: params.kit },
    });
  });
}

// ---------------------------------------------------------------------------
// Writing — coach group, formalwear, Blues, eligibility, availability, entry
// ---------------------------------------------------------------------------

/** One row per membership. Storage only — Mission 9 owns what the value means. */
export async function commitCoachGroup(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  coachGroup: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ coach_group: string }>(
      `select coach_group from public.coach_group_assignments where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before = existing.rows[0]?.coach_group ?? null;
    if (before === params.coachGroup) return;

    if (params.coachGroup === null) {
      await tx.query(
        `delete from public.coach_group_assignments where season_membership_id = $1::uuid`,
        [params.membershipId],
      );
    } else {
      await tx.query(
        `insert into public.coach_group_assignments
           (season_membership_id, season_id, coach_group, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3, $4::uuid)
         on conflict (season_membership_id)
         do update set coach_group = excluded.coach_group, updated_at = now()`,
        [params.membershipId, params.seasonId, params.coachGroup, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "coach_group_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.coachGroup,
      context: { issue: "LAN-186" },
    });
  });
}

/**
 * One formalwear item, ticked or unticked. The underlying fact is free text
 * (`"Yes (paid)"` is a real club answer), so unticking writes `"No"` rather
 * than deleting the row, and an already-recorded `"Yes (paid)"` is only ever
 * moved to `"No"` from here — re-ticking after that writes the plainer `"Yes"`,
 * which is the one simplification this column makes and is recorded here
 * rather than silently.
 */
export async function commitFormalwearItem(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  item: FormalwearItemKey;
  owned: boolean;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ ownership: string }>(
      `select ownership from public.formalwear_records
        where season_membership_id = $1::uuid and item = $2::public.formalwear_item`,
      [params.membershipId, params.item],
    );
    const before = existing.rows[0]?.ownership ?? null;
    const next = params.owned ? "Yes" : "No";
    if (before === next) return;

    await tx.query(
      `insert into public.formalwear_records
         (season_membership_id, season_id, item, ownership, recorded_by_person_id)
       values ($1::uuid, $2::uuid, $3::public.formalwear_item, $4, $5::uuid)
       on conflict (season_membership_id, item)
       do update set ownership = excluded.ownership, updated_at = now()`,
      [params.membershipId, params.seasonId, params.item, next, params.actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "formalwear_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: next,
      context: { issue: "LAN-186", item: params.item },
    });
  });
}

export async function commitBlues(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  value: BluesValue;
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const half = params.value === "Half";
  const full = params.value === "Full";

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ half_blue_awarded: boolean; full_blue_awarded: boolean }>(
      `select half_blue_awarded, full_blue_awarded from public.blues_awards
        where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before: BluesValue = existing.rows[0]
      ? existing.rows[0].full_blue_awarded
        ? "Full"
        : existing.rows[0].half_blue_awarded
          ? "Half"
          : "None"
      : "None";
    if (before === params.value) return;

    await tx.query(
      `insert into public.blues_awards
         (season_membership_id, season_id, half_blue_awarded, full_blue_awarded, awarded_on,
          recorded_by_person_id)
       values ($1::uuid, $2::uuid, $3, $4, case when $3 or $4 then current_date else null end, $5::uuid)
       on conflict (season_membership_id)
       do update set
         half_blue_awarded = excluded.half_blue_awarded,
         full_blue_awarded = excluded.full_blue_awarded,
         awarded_on = case
           when excluded.half_blue_awarded or excluded.full_blue_awarded
             then coalesce(public.blues_awards.awarded_on, current_date)
           else null
         end,
         updated_at = now()`,
      [params.membershipId, params.seasonId, half, full, params.actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "blues_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.value,
      context: { issue: "LAN-186" },
    });
  });
}

export type EligibilityStatus = "pending" | "eligible" | "ineligible" | "expired";

/**
 * Eligibility for the `club_play` competition — the one every player needs
 * regardless of which representative sides they may separately qualify for.
 * See the module note for why this column reads one competition rather than
 * all of them.
 */
export async function commitEligibility(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  status: EligibilityStatus;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; status: string; effective_from: string }>(
      `select id, status::text as status, to_char(effective_from, 'YYYY-MM-DD') as effective_from
         from public.eligibility_records
        where season_membership_id = $1::uuid and competition = $2::public.competition_scope
          and effective_to is null
        for update`,
      [params.membershipId, BOARD_ELIGIBILITY_COMPETITION],
    );
    const before = current.rows[0]?.status ?? null;
    if (before === params.status) return;

    if (current.rows[0]) {
      await closeCurrentRow(
        tx,
        "eligibility_records",
        current.rows[0].id,
        current.rows[0].effective_from,
        today,
      );
    }

    await tx.query(
      `insert into public.eligibility_records
         (season_membership_id, season_id, competition, status, determining_authority,
          checked_at, effective_from)
       values ($1::uuid, $2::uuid, $3::public.competition_scope, $4::public.eligibility_status,
               $5, now(), $6::date)`,
      [
        params.membershipId,
        params.seasonId,
        BOARD_ELIGIBILITY_COMPETITION,
        params.status,
        "Operator (roster board)",
        today,
      ],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "eligibility_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.status,
      context: { issue: "LAN-186", competition: BOARD_ELIGIBILITY_COMPETITION },
    });
  });
}

export type AvailabilityLevel = "green" | "orange" | "red";

/**
 * A new current availability status. Append-only (invariant A1) — always an
 * insert, never an update. `availability_statuses_green_records_its_confirmer`
 * requires a confirmer for Green; the acting operator is that confirmer,
 * because making the change on this board is the act of confirming it.
 *
 * `effectiveFrom` defaults to today, which is right for a change made on this
 * board in the moment. LAN-215, B-008's arrival-sets-green rule passes it
 * explicitly instead: the row has to carry the membership's own joining date,
 * which is not always today — the recruit flip (`W3`) can commit a
 * `season_memberships.confirmed_on` that was set on an earlier day than the
 * one the flip itself executes on.
 */
export async function commitAvailability(params: {
  actorPersonId: string;
  membershipId: string;
  level: AvailabilityLevel;
  effectiveFrom?: string;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const effectiveFrom = params.effectiveFrom ?? (await currentDateOf(tx));
    const current = await tx.query<{ level: string }>(
      `select level::text as level from public.current_availability where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before = current.rows[0]?.level ?? null;
    if (before === params.level) return;

    await tx.query(
      `insert into public.availability_statuses
         (season_membership_id, level, effective_from, reported_by_person_id, confirmed_by_person_id)
       values ($1::uuid, $2::public.availability_level, $3::date, $4::uuid, $5::uuid)`,
      [
        params.membershipId,
        params.level,
        effectiveFrom,
        params.actorPersonId,
        params.level === "green" ? params.actorPersonId : null,
      ],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "availability_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.level,
      context: { issue: "LAN-186" },
    });
  });
}

/**
 * `season_memberships.entry` — new or returning. A plain field with no
 * effective dating in the schema, unlike `status`.
 */
export async function commitEntry(params: {
  actorPersonId: string;
  membershipId: string;
  entry: "new" | "returning";
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const current = await tx.query<{ entry: string }>(
      `select entry::text as entry from public.season_memberships where id = $1::uuid for update`,
      [params.membershipId],
    );
    if (!current.rows[0]) {
      throw new NotFound("That membership no longer exists.", {
        rule: "season_memberships_not_found",
      });
    }
    const before = current.rows[0].entry;
    if (before === params.entry) return;

    await tx.query(
      `update public.season_memberships set entry = $2::public.membership_entry, updated_at = now()
        where id = $1::uuid`,
      [params.membershipId, params.entry],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "membership_entry_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.entry,
      context: { issue: "LAN-186" },
    });
  });
}
