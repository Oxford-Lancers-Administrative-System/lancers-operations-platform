import "server-only";

import type { Tx } from "@/lib/db";
import { COACH_ROLE_CODES } from "@/lib/auth/capabilities";
import { personDisplayAliasSql } from "./sql-text";
import {
  RECRUITMENT_EVENT_TYPE,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudienceCatalogue,
} from "./audience-selection";

/**
 * Who an event can be sent to, read from the club's authoritative data (LAN-77). Vocabulary and derived groups are pure, in `./audience-selection` (re-exported below); this module is the database read.
 * Groups are live reads: active `season_memberships`; effective-dated coach/committee `role_assignments` (register D8, D11, invariant S4); open `recruitment_prospects` (Recruitment events only, D46). The effective-date test runs against the event's own date, not today (falls back to today for a dateless draft, which invariant E1a refuses to approve anyway).
 * Decision history: docs/adr/0012-explicit-event-audience.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
 */

export {
  audiencePeople,
  summariseAudienceGroups,
  EMPTY_AUDIENCE_MESSAGE,
  EMPTY_AUDIENCE_RULE,
  groupSelectionKeys,
  resolveSelection,
  selectionKey,
  UNKNOWN_SELECTION_RULE,
  type AudienceCapacity,
  type AudienceCatalogue,
  type AudienceGroupSummary,
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

/** A player's playing unit, from position assignments effective on the day (UX-40). */
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

/** A current contact value, phone first (delivery is 1:1 WhatsApp); falls back to email. */
const CONTACT_EXPRESSION = `
  coalesce(
    (select c.raw_value from public.contact_points c
      where c.person_id = p.id and c.kind = 'phone' and c.valid_until is null
      order by c.is_preferred desc, c.created_at desc limit 1),
    (select c.raw_value from public.contact_points c
      where c.person_id = p.id and c.kind = 'email' and c.valid_until is null
      order by c.is_preferred desc, c.created_at desc limit 1))`;

/** Open recruits (D46, LAN-295); excludes joined/disengaged/declined/void (D45, LAN-201). Decision history: docs/adr/0012-explicit-event-audience.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
const RECRUIT_ARM = `
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
        and rp.status in ('identified', 'engaged', 'committed')`;

/**
 * Every person selectable for an event in `seasonId`, in every capacity they qualify under, as at `scheduledOn` (falls back to today for a dateless draft). One statement, for a single consistent read; a person qualifying twice appears twice here, by design (collapsed later by `audiencePeople` / `resolveSelection`).
 * `eventType` is required: on anything but a Recruitment event, recruits are not in the catalogue at all (D46, LAN-295), keyed off `events.event_type`, never a template's name (LAN-265 lets templates be renamed freely).
 * Decision history: docs/adr/0012-explicit-event-audience.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
 */
export async function listAudienceCatalogueIn(
  tx: Tx,
  seasonId: string,
  scheduledOn: string | null,
  eventType: string,
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

     ${eventType === RECRUITMENT_EVENT_TYPE ? `union all ${RECRUIT_ARM}` : ""}

      order by 1, 6, 5`,
    [seasonId, scheduledOn, COACH_ROLE_CODES],
  );

  // Two seats in one capacity (e.g. Social Sec ×2) join into one row, not two.
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
