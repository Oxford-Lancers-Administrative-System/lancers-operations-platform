import "server-only";

import { HEAD_COACH_ROLE_CODE } from "@/lib/auth/capabilities";
import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { readEventIn, type EventDetail } from "./events";

/**
 * The BAFRA roster form — LAN-267. Reads everything the form prints, from
 * the record, at the moment the operator asks; writes exactly one audit row.
 * Its own reader (not `roster-board.ts`, which reads the current season
 * only): a form is generated against a game, whose season is
 * `events.season_id`, and it is the only reader selecting the student number
 * and BAFA registration number (`tests/schema-restricted-fields.test.ts`).
 * No `events.opponent` column exists (D14 removed it) — the generation
 * screen offers an editable Opponent box seeded from the event's name.
 */

import {
  type Kit,
  type RosterFormCoachRow,
  type RosterFormPlayer,
  type SidelineRoleCode,
} from "./roster-form-shape";

export * from "./roster-form-shape";

/** The whole payload one generation needs — carries an `EventDetail`, which `events.ts` only assembles server-side. */
export interface RosterFormData {
  readonly event: EventDetail;
  readonly players: readonly RosterFormPlayer[];
  readonly coaches: readonly RosterFormCoachRow[];
}

const ROSTER_FORM_NOT_A_GAME = "A roster form is only for a game. This event is not one.";

export const ROSTER_FORM_NOT_APPROVED =
  "This game is still a draft. Approve it before handing the officials a roster form.";

interface PlayerRow {
  membership_id: string;
  person_id: string;
  given_name: string;
  family_name: string | null;
  student_number: string | null;
  jersey_number: number | null;
  rsvp: "yes" | "no" | null;
}

interface CoachRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  bafa_registration_number: string | null;
  role_code: string;
  role_label: string;
}

/** Head coach is `HC`; every other coaching seat is `AC` (LAN-267). `TR`/`SL` have no seat in the catalogue, so those rows print blank. */
function sidelineCodeFor(roleCode: string): SidelineRoleCode {
  return roleCode === HEAD_COACH_ROLE_CODE ? "HC" : "AC";
}

/** Everything the form prints, for one game and one kit. `kit` decides jersey number, never filters — a player with none comes back `jerseyNumber: null`. */
export async function readRosterFormDataIn(
  tx: Tx,
  eventId: string,
  kit: Kit,
): Promise<RosterFormData> {
  const event = await readEventIn(tx, eventId);
  if (event.eventType !== "game") {
    throw new NotFound(ROSTER_FORM_NOT_A_GAME, { rule: "roster_form_requires_a_game" });
  }

  const players = await tx.query<PlayerRow>(
    `with jerseys as (
       -- One number per player, not one row per assignment. A membership may
       -- hold more than one current number in a kit — jersey_assignments
       -- allows it, and the roster board's own rule promotes the lowest to
       -- is_predominant — and joining them all would print the same player
       -- twice on a form where each row is one person in one shirt.
       select distinct on (j.season_membership_id) j.season_membership_id, j.number
         from public.jersey_assignments j
        where j.season_id = $2::uuid
          and j.kit = $3::public.kit
          and j.effective_to is null
        order by j.season_membership_id, j.is_predominant desc, j.number
     ),
     answered as (
       -- One row per membership invited to this event, carrying the standing
       -- answer. A membership with no invitation simply has no row here and
       -- reads as unanswered, which is what the screen's own filter calls it.
       select i.season_membership_id, r.response::text as response
         from public.invitations i
         left join public.current_rsvp r on r.invitation_id = i.id
        where i.event_id = $1::uuid
          and i.season_membership_id is not null
     )
     select m.id as membership_id,
            p.id as person_id,
            p.given_name,
            p.family_name,
            p.student_number,
            j.number as jersey_number,
            a.response as rsvp
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       left join jerseys j on j.season_membership_id = m.id
       left join answered a on a.season_membership_id = m.id
      where m.season_id = $2::uuid
        and m.status in ('onboarding', 'active')
        and p.merged_into_person_id is null
      order by j.number nulls last, p.family_name nulls last, p.given_name, m.id`,
    [eventId, event.seasonId, kit],
  );

  const coaches = await tx.query<CoachRow>(
    `select p.id as person_id,
            p.given_name,
            p.family_name,
            p.bafa_registration_number,
            r.code as role_code,
            r.name as role_label
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
       join public.role_groups g on g.id = r.role_group_id
       join public.people p on p.id = ra.person_id
      where g.code = 'coaching_staff'
        and ra.season_id = $1::uuid
        -- In force **at the game**, not today. A form for a game already
        -- played has to name the people who were on that sideline; asking
        -- who holds the seat now would show an empty coaches table for every
        -- past fixture the moment a season's assignments were closed off.
        and ra.effective_from <= $2::date
        and (ra.effective_to is null or ra.effective_to > $2::date)
        and p.merged_into_person_id is null
      order by r.sort_order, p.family_name nulls last, p.given_name`,
    [event.seasonId, event.scheduledOn ?? new Date().toISOString().slice(0, 10)],
  );

  return {
    event,
    players: players.rows.map((row) => ({
      membershipId: row.membership_id,
      personId: row.person_id,
      givenName: row.given_name,
      familyName: row.family_name,
      studentNumber: row.student_number,
      jerseyNumber: row.jersey_number,
      rsvp: row.rsvp,
    })),
    coaches: coaches.rows.map((row) => ({
      personId: row.person_id,
      givenName: row.given_name,
      familyName: row.family_name,
      bafaRegistrationNumber: row.bafa_registration_number,
      roleLabel: row.role_label,
      roleCode: sidelineCodeFor(row.role_code),
    })),
  };
}

export async function readRosterFormData(eventId: string, kit: Kit): Promise<RosterFormData> {
  return withTransaction((tx) => readRosterFormDataIn(tx, eventId, kit));
}

/** One audit row per generation, and nothing else (LAN-267) — the form itself is never stored. */
export async function recordRosterFormGenerated(params: {
  actorPersonId: string;
  eventId: string;
  kit: Kit;
  playerCount: number;
  coachCount: number;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const event = await readEventIn(tx, params.eventId);
    if (event.eventType !== "game") {
      throw new NotFound(ROSTER_FORM_NOT_A_GAME, { rule: "roster_form_requires_a_game" });
    }
    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "roster_form.generated",
      entityTable: "events",
      entityId: params.eventId,
      context: {
        kit: params.kit,
        playersOnForm: params.playerCount,
        coachesOnForm: params.coachCount,
      },
    });
  });
}
