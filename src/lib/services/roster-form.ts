import "server-only";

import { HEAD_COACH_ROLE_CODE } from "@/lib/auth/capabilities";
import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { readEventIn, type EventDetail } from "./events";

/**
 * The BAFRA roster form — LAN-267, Brian 2026-09-09.
 *
 * > "The club has to hand the officials a BAFRA roster form at every game.
 * > Today it is a Word document filled in by hand. The ask is to generate it
 * > from the app."
 *
 * This module reads everything the form prints, from the record, at the moment
 * the operator asks for it. It writes exactly one thing: the audit row that
 * says a form was generated.
 *
 * ## Why this is its own reader and not an addition to `roster-board.ts`
 *
 * Two reasons, and the second is the one that matters.
 *
 * `roster-board.ts` reads the **current** season only (`listCurrentSeasonRoster`
 * takes no season id), and a roster form is generated against a *game*, whose
 * season is whatever `events.season_id` says. Handing the officials last
 * season's squad because the club rolled over the week before is exactly the
 * kind of failure a generated form is supposed to remove.
 *
 * And the form prints two facts — the student number and the BAFA registration
 * number — that no list, board or queue carries. `tests/schema-restricted-fields.test.ts`
 * names the modules that "decide who the club writes to, or render a list of
 * people", and keeps them clear of the record's most sensitive columns. This
 * module is neither: it is one page, for one game, for an authorised operator,
 * and it is the only reader in the codebase that selects those two columns.
 * Keeping it separate is what makes that sentence checkable.
 *
 * ## What the form's three tables come from
 *
 * | Column                | Source                                                        |
 * | --------------------- | ------------------------------------------------------------- |
 * | Team                  | Constant. There is one club.                                   |
 * | Date                  | `events.scheduled_on`                                          |
 * | Opponent              | The event's name — see below                                   |
 * | Surname, Forename     | `people.family_name`, `people.given_name`                      |
 * | Student no            | `people.student_number` (LAN-275's migration)                  |
 * | Jersey no             | `jersey_assignments`, per kit, current rows only               |
 * | BAFA no               | `people.bafa_registration_number` (LAN-275's migration)        |
 * | Role                  | `role_assignments` → `roles` → `role_groups.code = 'coaching_staff'` |
 *
 * ## The opponent is not a column, and the ticket says it is
 *
 * LAN-267 reads "`events.event_date` and `events.opponent` on a game event (D14
 * made opponent a real field)". That is the wrong way round: D14 **removed**
 * `events.opponent`. `20260822120000_events_target_state.sql` drops it —
 * "There is no opponent field, and there never was a real second one" — and
 * the event form has said "The opponent goes in the name." for a game ever
 * since. There is no column to read.
 *
 * So the generation screen offers an **Opponent** box that starts from the
 * event's own name and the operator can correct before printing. Nothing is
 * stored: the club's record of who it played is still the event's name, and
 * inventing a column to hold a second copy of it would be a schema change this
 * package has no owner decision for. The one thing that must not happen is the
 * officials being handed a form whose Opponent line says "Game vs" and a date.
 */

import {
  type Kit,
  type RosterFormCoachRow,
  type RosterFormPlayer,
  type SidelineRoleCode,
} from "./roster-form-shape";

export * from "./roster-form-shape";

/**
 * The whole payload one generation needs. It stays in this module rather
 * than beside the pure shaping because it carries an `EventDetail`, which
 * `events.ts` only assembles server-side.
 */
export interface RosterFormData {
  readonly event: EventDetail;
  readonly players: readonly RosterFormPlayer[];
  readonly coaches: readonly RosterFormCoachRow[];
}

export const ROSTER_FORM_NOT_A_GAME = "A roster form is only for a game. This event is not one.";

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

/**
 * Head coach is `HC`; every other coaching seat is `AC`.
 *
 * Brian, LAN-267: "the role catalogue's `coaching_staff` group … so HC / AC can
 * be derived: head coach → HC, every other coaching seat → AC."
 *
 * `TR` (trainer or physio) and `SL` (other sideline personnel) have no seat in
 * the catalogue at all — `20260819090100_role_catalogue.sql` closes it at
 * twenty roles and none of them is a trainer, physio or team manager. So no
 * person can currently be derived into either code, and those rows print
 * blank, which is the honest outcome: inventing a seat to fill them would be
 * adding a club concept, and that is Brian's decision, not this package's.
 */
function sidelineCodeFor(roleCode: string): SidelineRoleCode {
  return roleCode === HEAD_COACH_ROLE_CODE ? "HC" : "AC";
}

/**
 * Everything the form prints, for one game and one kit.
 *
 * `kit` decides which jersey number each player carries — the club runs two
 * sets and a player's number differs between them (`jersey_assignments` is
 * keyed per kit). It does not filter anybody out: a player with no number in
 * this kit comes back with `jerseyNumber: null`, because who is *dressed* is
 * the operator's decision on the screen, not the database's.
 */
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

/**
 * One audit row per generation — LAN-267: "A one-line audit event when a form
 * is generated (who, which event, when)."
 *
 * Nothing else is written. The form is not stored: LAN-267 puts "storing
 * generated PDFs" explicitly out of scope, and a document library is a
 * concept nobody has approved. What survives a generation is this row, which
 * is enough to answer "who handed the officials a form for this game, and
 * when" without keeping a copy of anybody's student number in a second place.
 */
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
