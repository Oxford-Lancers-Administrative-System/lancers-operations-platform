import "server-only";

import type { Tx } from "@/lib/db";
import {
  type AudienceCandidate,
  type AudienceCapacity,
  type AudienceCatalogue,
} from "./audience-selection";

/**
 * Who an event *can* be sent to, read from the club's authoritative data.
 * LAN-77.
 *
 * The vocabulary, the derived groups and the resolution rules live in
 * `./audience-selection`, which is pure and is what the client-side builder
 * imports; see that module's header for why the split exists. This one is the
 * database half, and it is re-exported from here so a server caller has a single
 * import.
 *
 * ## The one rule this module exists to serve
 *
 * `docs/adr/0012-explicit-event-audience.md` and Brian's 12 August clarification
 * agree: **selection begins empty and nothing is ever implied**. There is no
 * default group, no whole-roster fallback, and no "if none selected then
 * everyone" anywhere here or in anything that calls it. The convenience of
 * "select all active players" is a button an operator presses, not a state the
 * system starts in.
 *
 * ## Where the groups come from
 *
 * All four derived groups are read from current authoritative domain data, not
 * from a stored list somebody has to maintain:
 *
 *   * **Active players** — the season's `active` memberships.
 *   * **Active coaches** — `season`-scoped role assignments effective then.
 *     Register D8 puts coaching staff on the season for exactly this reason.
 *   * **Active committee** — `committee_year`-scoped role assignments effective then.
 *   * **Everyone active** — the de-duplicated union of the three.
 *
 * "Effective" is the domain's own definition and not a status column:
 * `effective_from <= date < effective_to`, per register D11 and invariant S4,
 * which is what makes a mid-year handover resolve to the person holding the seat
 * rather than to whoever held it first.
 *
 * ## …and why that date is the event's, not today's
 *
 * The obvious implementation asks who holds a seat *now*, and it is wrong in the
 * ordinary case. The club plans a season before it starts: in the seeded club on
 * 13 August 2026 the 2026-27 coaches are appointed from 1 September and players
 * have no position assignments until 27 September, so a catalogue built "as of
 * today" for an October practice offers **no coaches at all** and no playing
 * units — silently, with an empty tab that looks like a club without coaching
 * staff.
 *
 * The question an audience builder is actually asking is "who holds this seat
 * when the event happens", so the effective-date test runs against the event's
 * scheduled date. A draft with no date yet falls back to today, which is the only
 * honest answer available and costs nothing: invariant E1a already refuses to
 * approve a dateless event, so no audience resolved that way can be written.
 */

export {
  AUDIENCE_GROUPS,
  CAPACITY_PRECEDENCE,
  EMPTY_AUDIENCE_MESSAGE,
  EMPTY_AUDIENCE_RULE,
  groupIsSelected,
  groupSelectionKeys,
  groupSize,
  toggleGroup,
  resolveSelection,
  selectionKey,
  UNKNOWN_SELECTION_MESSAGE,
  UNKNOWN_SELECTION_RULE,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudienceCatalogue,
  type AudienceGroup,
  type ResolvedAudienceMember,
  type SelectionResolution,
} from "./audience-selection";

interface CandidateRow {
  capacity: AudienceCapacity;
  anchor_id: string;
  person_id: string;
  given_name: string;
  family_name: string | null;
  known_as: string | null;
  standing: string;
  unit: string | null;
  contact: string | null;
}

/** Known-as where there is one, matching how the roster names people. */
function displayNameOf(row: CandidateRow): string {
  const known = row.known_as?.trim();
  const first = known && known !== "" ? known : row.given_name;
  return row.family_name ? `${first} ${row.family_name}` : first;
}

/**
 * A player's playing unit, from the position assignments effective on the day.
 *
 * UX-40 shows it as a column, and the club reads a roster by unit before it
 * reads it by name. "Both" is the common case — SDA §11.1 puts ~83% of records
 * on both sides of the ball.
 */
const UNIT_EXPRESSION = `
  (select case
            when bool_or(pa.side = 'offence') and bool_or(pa.side = 'defence') then 'Both'
            when bool_or(pa.side = 'offence') then 'Offence'
            when bool_or(pa.side = 'defence') then 'Defence'
            when bool_or(pa.side = 'special_teams') then 'Special teams'
            else null
          end
     from public.position_assignments pa
    where pa.season_membership_id = m.id
      and pa.effective_from <= as_of.day
      and (pa.effective_to is null or pa.effective_to > as_of.day))`;

/**
 * A current contact value, phone first.
 *
 * Phone before email because the slice's delivery path is 1:1 WhatsApp, so the
 * phone is the operationally relevant one; a coach with only an email still
 * shows something rather than an empty cell.
 */
const CONTACT_EXPRESSION = `
  coalesce(
    (select c.raw_value from public.contact_points c
      where c.person_id = p.id and c.kind = 'phone' and c.valid_until is null
      order by c.is_preferred desc, c.created_at desc limit 1),
    (select c.raw_value from public.contact_points c
      where c.person_id = p.id and c.kind = 'email' and c.valid_until is null
      order by c.is_preferred desc, c.created_at desc limit 1))`;

/**
 * Every person selectable for an event in `seasonId`, in every capacity they
 * qualify under, as at `scheduledOn` — the event's own date, falling back to
 * today for a draft that has none yet.
 *
 * The three arms are one statement so the catalogue is a single consistent read:
 * a role expiring between two queries would otherwise produce a list whose
 * counts disagree with its rows.
 *
 * A person qualifying twice appears twice **here**, deliberately — the builder
 * lists coaches and players separately, and collapsing them at this level would
 * hide a coach from the coaching group. The collapse happens in
 * `resolveSelection`, once, at the point it matters.
 */
export async function listAudienceCatalogueIn(
  tx: Tx,
  seasonId: string,
  scheduledOn: string | null,
): Promise<AudienceCatalogue> {
  const result = await tx.query<CandidateRow>(
    `with as_of as (select coalesce($2::date, current_date) as day)
     select 'player' as capacity,
            m.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name, p.known_as,
            initcap(m.status::text) as standing,
            ${UNIT_EXPRESSION} as unit,
            ${CONTACT_EXPRESSION} as contact
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       cross join as_of
      where m.season_id = $1
        and m.status = 'active'

      union all

     select case when r.scope = 'season' then 'coach' else 'committee' end as capacity,
            p.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name, p.known_as,
            r.name as standing,
            null as unit,
            ${CONTACT_EXPRESSION} as contact
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
       join public.people p on p.id = ra.person_id
       cross join as_of
      where ra.effective_from <= as_of.day
        and (ra.effective_to is null or ra.effective_to > as_of.day)
        and (r.scope <> 'season' or ra.season_id = $1)

      order by 1, 6, 5`,
    [seasonId, scheduledOn],
  );

  // A person holding two committee seats at once is legal and real — the model
  // names Social Sec ×2 — and would otherwise appear twice in one capacity.
  // Their seats are joined into one line rather than becoming two rows.
  const byKey = new Map<string, AudienceCandidate>();
  for (const row of result.rows) {
    const key = `${row.capacity}:${row.anchor_id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.standing = `${existing.standing}, ${row.standing}`;
      continue;
    }
    byKey.set(key, {
      key,
      capacity: row.capacity,
      anchorId: row.anchor_id,
      personId: row.person_id,
      displayName: displayNameOf(row),
      standing: row.standing,
      unit: row.unit,
      contact: row.contact,
    });
  }

  const candidates = [...byKey.values()];
  return {
    candidates,
    counts: {
      player: candidates.filter((candidate) => candidate.capacity === "player").length,
      coach: candidates.filter((candidate) => candidate.capacity === "coach").length,
      committee: candidates.filter((candidate) => candidate.capacity === "committee").length,
    },
  };
}
