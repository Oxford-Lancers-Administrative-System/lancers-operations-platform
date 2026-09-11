import "server-only";

import { InvalidTransition, NotFound, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "../audit";
import { generateOnboardingItems } from "../membership";
import { emitOnboardingOpenedWelcomeIn } from "../onboarding-welcome";
import { revokePersonTokenIn } from "../player-answer-tokens";
import { commitAvailability } from "../roster-board";

/** The flip — `W14`, LAN-215's `W3`. See `relocations.md` for the full design note. */

export interface FlipToJoinedResult {
  readonly membershipId: string;
}

/**
 * The reason recorded against the recruit's own durable link when the flip
 * supersedes it. Read by `revokePersonTokenIn`, which requires a non-blank
 * one so the decision can be reviewed later.
 */
export const RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON =
  "Superseded — this recruit was flipped to onboarding, which carries its own link.";

/**
 * One transaction: prospect → `joined`, a season membership created in
 * `onboarding`, that membership's own onboarding items generated, status
 * history and one audit row written. All of it, or none of it.
 *
 * `season_memberships_one_per_person_per_season` is the invariant that
 * refuses a second flip — `src/lib/db/errors.ts` already carries a named,
 * operator-readable mapping for it, so this function does not duplicate that
 * check before writing; it lets the constraint do the refusing and the
 * mapping do the wording.
 *
 * `entry` is `'new'`: every recruit this mission tracks is a person who has
 * never held a membership before now (a past member returning for another
 * season is `roster/write.ts`'s own returner intake, not this path).
 *
 * See `relocations.md` for LAN-215 `W3`'s four side effects this transaction
 * also performs (availability, link supersession, welcome, consent untouched).
 */
export async function flipRecruitmentProspectToJoinedIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
): Promise<FlipToJoinedResult> {
  const prospect = await tx.query<{
    person_id: string;
    season_id: string;
    status: string;
    committed_on: string | null;
  }>(
    `select person_id, season_id, status::text as status, to_char(committed_on, 'YYYY-MM-DD') as committed_on
       from public.recruitment_prospects where id = $1::uuid for update`,
    [prospectId],
  );
  const row = prospect.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });
  if (row.status === "joined") {
    throw new InvalidTransition("This recruit has already joined.", {
      rule: "recruitment_prospect_already_joined",
    });
  }

  const committedOn = row.committed_on ?? todayInClubZone();

  const membership = await tx.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', $3::date)
     returning id`,
    [row.person_id, row.season_id, committedOn],
  );
  const membershipId = membership.rows[0].id;

  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, null, 'onboarding', $2::uuid, 'Flipped from the recruit board.')`,
    [membershipId, actorPersonId],
  );

  await generateOnboardingItems(tx, membershipId, row.season_id);

  // LAN-215, B-008: arrival sets availability to Green, in this same
  // transaction, via `commitAvailability`. See this function's own doc
  // comment for the confirmer interpretation and why `effectiveFrom` is
  // `committedOn` rather than today.
  await commitAvailability({
    actorPersonId,
    membershipId,
    level: "green",
    effectiveFrom: committedOn,
  });

  // LAN-215, `W3`: supersede whatever durable link this recruit was holding,
  // and audit it — `revokePersonTokenIn` requires a reason and is a no-op
  // (rowCount 0) when nothing was live, which is itself a legitimate outcome
  // and is recorded as one rather than skipped.
  const supersededCount = await revokePersonTokenIn(
    tx,
    row.person_id,
    row.season_id,
    RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON,
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.ask_superseded",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    reason: RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON,
    context: {
      issue: "LAN-215",
      personId: row.person_id,
      seasonId: row.season_id,
      supersededCount,
    },
  });

  // LAN-215, `REQ-one-welcome`: the same emitter W1 and W2 call, on the same
  // idempotency key shape. This is the flip's `onboarding-opened` — one
  // trigger, both the welcome and the start of the chase clock.
  await emitOnboardingOpenedWelcomeIn(tx, {
    membershipId,
    personId: row.person_id,
    seasonId: row.season_id,
  });

  await tx.query(
    `update public.recruitment_prospects
        set status = 'joined', committed_on = $2::date, converted_membership_id = $3::uuid, updated_at = now()
      where id = $1::uuid`,
    [prospectId, committedOn, membershipId],
  );

  await tx.query(
    `insert into public.recruitment_prospect_status_events
       (prospect_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.prospect_status, 'joined', $3::uuid, 'Flipped to joined.')`,
    [prospectId, row.status, actorPersonId],
  );

  // The transition's own typed home is the two status-event tables above;
  // this one `audit_events` row is `W14`'s "writes one audit row" — the
  // whole action, in the club-wide trail, naming the membership it created.
  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.joined",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    fromState: row.status,
    toState: "joined",
    context: { seasonMembershipId: membershipId, seasonId: row.season_id },
  });

  return { membershipId };
}

export async function flipRecruitmentProspectToJoined(
  actorPersonId: string,
  prospectId: string,
): Promise<FlipToJoinedResult> {
  return withTransaction((tx) => flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId));
}
