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
 * Who an event can be sent to, read from the club's authoritative data (LAN-77). Vocabulary and derived groups are pure, in `./audience-selection` (re-exported below); this module is the database read.
 * Groups are live reads: active `season_memberships`; effective-dated coach/committee `role_assignments` (register D8, D11, invariant S4); open `recruitment_prospects` (Recruitment events only, D46). The effective-date test runs against the event's own date, not today (falls back to today for a dateless draft, which invariant E1a refuses to approve anyway).
 */

export {
  audienceCategoriesForEventType,
  audienceOptionsForEventType,
  audiencePeople,
  capacitiesForEventType,
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
import { personDisplayName } from "./person-name";

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
  is_onboarding: boolean;
  coaching_values: string[] | null;
  warmup_group: string | null;
  special_teams_squads: string[] | null;
  recruit_status: string | null;
}

/** LAN-306: one rule, in `person-name.ts`, and this list obeys it like every other surface. */
function displayNameOf(row: CandidateRow): string {
  return personDisplayName(row.given_name, row.family_name);
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

/**
 * The Coaching Assignments columns a player holds, as one flat list — LAN-414.
 * Coaching group and both sides' position groups share one `coaching:`
 * namespace because the three vocabularies share no word between them.
 */
const COACHING_VALUES_EXPRESSION = `
  (select coalesce(array_agg(distinct value), '{}'::text[])
     from (
       select cg.coach_group as value
         from public.coach_group_assignments cg
        where cg.season_membership_id = m.id
       union all
       select pg.position_group
         from public.membership_position_groups pg
        where pg.season_membership_id = m.id
     ) as assigned)`;

/** The one warmup small group a player is assigned to, or null — LAN-401, LAN-414. */
const WARMUP_GROUP_EXPRESSION = `
  (select wg.small_group from public.warmup_group_assignments wg
    where wg.season_membership_id = m.id)`;

/**
 * Every special-teams squad the player holds **any** slot in — LAN-374, LAN-414.
 * Starter or any backup, which is Stewart's own rule: "If you have an
 * assignment in kick return, you need to get a message… even if they're backup
 * three." The slot is deliberately not read: a squad is one audience.
 */
const SPECIAL_TEAMS_SQUADS_EXPRESSION = `
  (select coalesce(array_agg(distinct sta.squad::text), '{}'::text[])
     from public.special_teams_assignments sta
    where sta.season_membership_id = m.id)`;

/**
 * Open recruits (D45, D46, LAN-201). Excludes joined, disengaged, declined and
 * void — LAN-416: those four "are never offered and never resolve".
 *
 * LAN-416 also unions this arm on **every** event type, not Recruitment alone.
 * A recruit is still unreachable by accident, because no General group and no
 * assignment sub-group carries the `recruit` capacity; the Recruits category is
 * the only door, and being in the catalogue is what lets that door open.
 */
const RECRUIT_ARM = `
     select 'recruit' as capacity,
            p.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            initcap(rp.status::text) as standing,
            null as unit,
            ${CONTACT_EXPRESSION} as contact,
            false as is_bps,
            false as is_onboarding,
            '{}'::text[] as coaching_values,
            null as warmup_group,
            '{}'::text[] as special_teams_squads,
            rp.status::text as recruit_status
       from public.recruitment_prospects rp
       join public.people p on p.id = rp.person_id
      where rp.season_id = $1
        and rp.status in ('identified', 'engaged', 'committed')`;

/**
 * Every person selectable for an event in `seasonId`, in every capacity they qualify under, as at `scheduledOn` (falls back to today for a dateless draft). One statement, for a single consistent read; a person qualifying twice appears twice here, by design (collapsed later by `audiencePeople` / `resolveSelection`).
 * `eventType` no longer narrows the catalogue. It used to: D46/LAN-295 kept recruits out of it entirely on anything but a Recruitment event, and **LAN-416 (2026-09-22) reverses that** — a recruit can be invited to any event type, by explicit pick. The parameter stays because the groups a *type* offers are still a question this module answers for its callers (`groupsForEventType`) and because the rule's per-(date, type) catalogue cache is keyed on it; it is read off `events.event_type`, never a template's name (LAN-265 lets templates be renamed freely).
 */
export async function listAudienceCatalogueIn(
  tx: Tx,
  seasonId: string,
  scheduledOn: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above: kept in the signature deliberately.
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
                     where bps.season_membership_id = m.id and bps.is_selected) as is_bps,
            m.status = 'onboarding' as is_onboarding,
            ${COACHING_VALUES_EXPRESSION} as coaching_values,
            ${WARMUP_GROUP_EXPRESSION} as warmup_group,
            ${SPECIAL_TEAMS_SQUADS_EXPRESSION} as special_teams_squads,
            null as recruit_status
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       cross join as_of
      where m.season_id = $1
        -- LAN-388, Clint 2026-09-17: this arm was active-only, and an
        -- onboarding membership reached the catalogue through a second arm
        -- that required a BPS selection (WP-operator-record correction round
        -- 2, item 7, on REQ-nothing-gates: an onboarding membership counts as
        -- a player for event audiences from the moment they are on the team).
        -- The consequence was that somebody mid-onboarding could not be
        -- invited to anything unless they happened to be in the BPS. Both
        -- standings are read here now, told apart by is_onboarding, and it is
        -- AUDIENCE_GROUPS -- not this query -- that decides which group offers
        -- which. The BPS group still offers both, which is what that second
        -- arm existed to guarantee.
        and m.status in ('active', 'onboarding')

      union all

     select case when r.scope = 'season' then 'coach' else 'committee' end as capacity,
            p.id as anchor_id,
            p.id as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
            r.name as standing,
            null as unit,
            ${CONTACT_EXPRESSION} as contact,
            false as is_bps,
            false as is_onboarding,
            '{}'::text[] as coaching_values,
            null as warmup_group,
            '{}'::text[] as special_teams_squads,
            null as recruit_status
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

      union all ${RECRUIT_ARM}

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
      existing.isOnboarding = existing.isOnboarding || row.is_onboarding;
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
      isOnboarding: row.is_onboarding,
      coachingValues: row.coaching_values ?? [],
      warmupGroup: row.warmup_group,
      specialTeamsSquads: row.special_teams_squads ?? [],
      recruitStatus: row.recruit_status,
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
