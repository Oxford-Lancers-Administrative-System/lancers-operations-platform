import "server-only";

import type { Tx } from "@/lib/db";
import { COACH_ROLE_CODES } from "@/lib/auth/capabilities";
import { personDisplayAliasSql } from "./sql-text";
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
 * ## The one rule this module exists to serve, as D47 narrowed it
 *
 * `docs/adr/0012-explicit-event-audience.md` and Brian's 12 August
 * clarification said selection begins empty and nothing is ever implied. **D47
 * reverses half of that, deliberately and narrowly**, and LAN-154 is where the
 * reversal lands: a type's template supplies a default audience, which arrives
 * with a new event already set, visible and editable, so the approver checks
 * rather than builds the same thirty-two names every Wednesday.
 *
 * What survives unchanged is the part ADR 0012 was actually about. There is
 * still no whole-roster fallback and no "if none selected then everyone"
 * anywhere here or in anything that calls it: an audience that nobody put there
 * is still empty, and approval still refuses it. What the club configured once,
 * on purpose, on the template, is not the system implying anything.
 *
 * The stored audience is still an explicit resolved list. A group is a way of
 * selecting people, never a live query that changes underneath an approved
 * event — which is why `createEventDraft` resolves the template's groups to
 * people at the moment the draft is created.
 *
 * ## Where the groups come from
 *
 * All five derived groups are read from current authoritative domain data, not
 * from a stored list somebody has to maintain:
 *
 *   * **Active players** — the season's `active` memberships.
 *   * **Active coaches** — role assignments effective then whose role code is
 *     one of `COACH_ROLE_CODES`. Register D8 puts coaching staff on the season,
 *     but not everything scoped to a season coaches — see that constant.
 *   * **Active committee** — `committee_year`-scoped role assignments effective then.
 *   * **Everyone active** — the de-duplicated union of the three.
 *   * **Recruits** — open prospects in `recruitment_prospects`, offered on a
 *     Recruitment event alone (D46).
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
  groupsForEventType,
  templateGroupsForEventType,
  summariseAudienceGroups,
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
  type AudienceGroupKey,
  type AudienceGroupSummary,
  type ResolvedAudienceMember,
  type SelectionResolution,
} from "./audience-selection";

interface CandidateRow {
  capacity: AudienceCapacity;
  anchor_id: string;
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  standing: string;
  unit: string | null;
  contact: string | null;
  is_bps: boolean;
}

/** Known-as where there is one, matching how the roster names people. */
function displayNameOf(row: CandidateRow): string {
  const known = row.display_alias?.trim();
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
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            initcap(m.status::text) as standing,
            ${UNIT_EXPRESSION} as unit,
            ${CONTACT_EXPRESSION} as contact,
            exists (select 1 from public.bps_selections bps
                     where bps.season_membership_id = m.id and bps.is_selected) as is_bps
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       cross join as_of
      where m.season_id = $1
        and m.status = 'active'

      union all

     -- Correction round 2, item 7 (WP-operator-record, LAN-217): the player
     -- arm above is active-only, and an onboarding membership is not
     -- otherwise in this catalogue at all — but REQ-nothing-gates in the
     -- packet states onboarding memberships count as players for event
     -- audiences from the moment they are on the team, so a BPS selection on
     -- one still has to reach this picker. Every row here already satisfies
     -- is_selected, so it is never selectable except through the BPS group.
     select 'player' as capacity,
            m.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            initcap(m.status::text) as standing,
            ${UNIT_EXPRESSION} as unit,
            ${CONTACT_EXPRESSION} as contact,
            true as is_bps
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       join public.bps_selections bps on bps.season_membership_id = m.id and bps.is_selected
       cross join as_of
      where m.season_id = $1
        and m.status = 'onboarding'

      union all

     select case when r.scope = 'season' then 'coach' else 'committee' end as capacity,
            p.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            r.name as standing,
            null as unit,
            ${CONTACT_EXPRESSION} as contact,
            false as is_bps
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
       join public.people p on p.id = ra.person_id
       cross join as_of
      where ra.effective_from <= as_of.day
        and (ra.effective_to is null or ra.effective_to > as_of.day)
        -- A season-scoped role is only a coaching seat if its code is one of
        -- the named coaching codes. Anything else season-scoped is not offered
        -- at all, rather than taking the coach capacity because of where it
        -- hangs. See COACH_ROLE_CODES.
        and (r.scope <> 'season' or (ra.season_id = $1 and r.code = any($3::text[])))

      union all

     -- D46. The recruits group, offered on a Recruitment event alone. Read from
     -- the funnel rather than from the roster, because that is where a prospect
     -- lives: modelling them as provisional memberships would pollute the roster
     -- with people who never commit (model §1.2).
     --
     -- Joined is excluded because a joined prospect IS a member and appears
     -- above under the player capacity; disengaged, declined and void are
     -- excluded because D45 says inactive people are never invited, somebody
     -- who said no is exactly that, and a void row is not a person to invite
     -- at all (LAN-201).
     select 'recruit' as capacity,
            p.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            initcap(rp.status::text) as standing,
            null as unit,
            ${CONTACT_EXPRESSION} as contact,
            false as is_bps
       from public.recruitment_prospects rp
       join public.people p on p.id = rp.person_id
      where rp.season_id = $1
        and rp.status in ('identified', 'engaged', 'committed')

      order by 1, 6, 5`,
    [seasonId, scheduledOn, COACH_ROLE_CODES],
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
      existing.isBps = existing.isBps || row.is_bps;
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
      isBps: row.is_bps,
    });
  }

  const candidates = [...byKey.values()];
  return {
    candidates,
    counts: {
      player: candidates.filter((candidate) => candidate.capacity === "player").length,
      coach: candidates.filter((candidate) => candidate.capacity === "coach").length,
      committee: candidates.filter((candidate) => candidate.capacity === "committee").length,
      recruit: candidates.filter((candidate) => candidate.capacity === "recruit").length,
    },
  };
}
