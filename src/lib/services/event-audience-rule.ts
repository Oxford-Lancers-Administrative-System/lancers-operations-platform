import "server-only";

import type { Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import {
  audienceGroupTokenFor,
  audienceOptionFor,
  groupSelectionKeys,
  parseAudienceGroupToken,
  RECRUITMENT_EVENT_TYPE,
  resolveSelection,
  type AudienceCapacity,
} from "./audience-selection";
import { listAudienceCatalogueIn } from "./event-audience";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";

/**
 * The audience group rule — LAN-392.
 *
 * Clint, 2026-09-17: "If I make an event with an audience and I want to add
 * more people to the audience (which happens a lot during recruitment) I can't
 * do that right now." Brian, four minutes later: "if the status of somebody
 * changes (for example, when a recruit gets added), they should automatically
 * be added to the recruitment event."
 *
 * ## The one chokepoint
 *
 * Every write that can change which derived audience group a person falls into
 * calls {@link applyAudienceGroupRuleIn}, inside its own transaction. There are
 * exactly four facts `AUDIENCE_GROUPS` is derived from — a season membership's
 * status, an effective-dated coaching or committee seat, a BPS selection, and a
 * recruitment prospect's status — and `tests/audience-group-rule-writers.test.ts`
 * enumerates every service module that writes one of them and fails when a new
 * one appears without a call. That test is the mechanism; this comment is only
 * the reason.
 *
 * This function never opens a transaction of its own. It is handed the caller's
 * `Tx` and every row it writes commits or rolls back with the caller's own
 * action — Brian's rule that "the operator's own status write must never abort
 * because of this rule" is the other half of the same sentence, and it is why
 * the audience insert ignores a conflict on the human rather than trusting that
 * one cannot already be there.
 *
 * ## What a late joiner gets
 *
 * The invitation at their own moment, and then the event's ladder exactly as it
 * already stands. `event_messaging_plans` is one row per event and says so in
 * its own migration ("Not per invitation: every invitee of one event is on the
 * same ladder"), so nothing per-person is stored: the late joiner's reminder
 * jobs are inserted at the event-wide rungs that are still in the future,
 * carrying the same `ladder_rung`, which is what makes `amend.ts`'s reschedule
 * move them with everybody else's without knowing they exist.
 *
 * ## What it never does
 *
 * It never removes a confirmed audience row, never rewrites a capacity, never
 * re-resolves the approver's list, and never reaches a person the approver
 * unticked. ADR 0022's freeze is amended to "never reduced and never
 * re-resolved", not abandoned.
 */

/** The ten-minute grace, in milliseconds. Brian's decision 4. */
const GRACE_MS = 10 * 60 * 1000;

/** How many auto-add invitations one person may be sent inside one hour, and how long the next slot is. */
const BLAST_CAP_PER_SLOT = 5;
const BLAST_SLOT_MS = 60 * 60 * 1000;

/** A declared recruit welcome is never overtaken: the invitation goes a minute after it, at the earliest. */
const AFTER_WELCOME_MS = 60 * 1000;

const AUDIENCE_GROUP_RULE_ACTOR_LABEL = "system: audience group rule";

/**
 * Which write set this rule off. Recorded in the audit so a blast can be traced
 * back to the action that caused it, and closed rather than free text so the
 * enumeration test and the audit agree about what the doors are.
 */
export type AudienceGroupTrigger =
  | "recruit_added_by_operator"
  | "recruit_signed_up"
  | "recruit_status_changed"
  | "recruit_flipped_to_onboarding"
  | "walk_up_recorded"
  | "membership_status_changed"
  | "returner_entered"
  | "bps_selection_changed"
  | "seat_assigned"
  | "seat_replaced"
  | "operator_invited";

export interface AudienceGroupRuleOutcome {
  /** Audience rows inserted by the rule. */
  readonly added: number;
  /** Invitation jobs declared. Always at most `added`. */
  readonly messagesDeclared: number;
  /** Rows added whose invitation was deliberately left undeclared — no consent, or no runway before the event. */
  readonly messagesWithheld: number;
  /** Rule-added rows taken back off an event because the person no longer falls into any of its groups. */
  readonly retracted: number;
}

interface CandidateEvent {
  readonly id: string;
  readonly eventType: string;
  readonly scheduledOn: string;
  readonly startsAtUtc: Date;
  /** LAN-414: picker tokens — a General key, or `<category>:<value>`. */
  readonly groups: readonly string[];
}

const EMPTY_OUTCOME: AudienceGroupRuleOutcome = Object.freeze({
  added: 0,
  messagesDeclared: 0,
  messagesWithheld: 0,
  retracted: 0,
});

/**
 * Apply the rule for one person whose group standing has just changed.
 *
 * Both directions in one call, because one status write is often both: a
 * recruit flipping to a player leaves `recruits` and joins `onboarding`, and
 * the same transaction must add them where they now belong and take back the
 * unsent invitations they no longer qualify for.
 */
export async function applyAudienceGroupRuleIn(
  tx: Tx,
  args: {
    personId: string;
    seasonId: string;
    trigger: AudienceGroupTrigger;
    /** The operator whose action set this off, for the audit. Null for the public sign-up door, which has no operator. */
    actorPersonId?: string | null;
  },
): Promise<AudienceGroupRuleOutcome> {
  const events = await readCandidateEventsIn(tx, args.seasonId);
  if (events.length === 0) return EMPTY_OUTCOME;

  const excluded = await readExclusionsIn(tx, args.personId);
  const existing = await readExistingAudienceIn(tx, args.personId);

  // One catalogue read per distinct (date, class) rather than one per event:
  // `listAudienceCatalogueIn` evaluates a seat's effective dates against the
  // *event's* own date, so the answer genuinely differs per date — but two
  // events on the same day of the same class have the same answer, and a bulk
  // door against thirty approved events would otherwise be thirty reads of a
  // three-armed union for every person it touches.
  const catalogues = new Map<string, Awaited<ReturnType<typeof listAudienceCatalogueIn>>>();

  let added = 0;
  let messagesDeclared = 0;
  let messagesWithheld = 0;
  let retracted = 0;

  // Where the person's next auto-add sends already sit, so the cap counts the
  // ones this transaction declares as well as the ones already on the books.
  const pending = await readPendingAutoAddSendsIn(tx, args.personId);
  const welcomeAt = await readDeclaredRecruitWelcomeAtIn(tx, args.personId);

  for (const event of events) {
    const cacheKey = `${event.scheduledOn}:${event.eventType}`;
    let catalogue = catalogues.get(cacheKey);
    if (!catalogue) {
      catalogue = await listAudienceCatalogueIn(
        tx,
        args.seasonId,
        event.scheduledOn,
        event.eventType,
      );
      catalogues.set(cacheKey, catalogue);
    }

    const ownKeys = new Set(
      catalogue.candidates
        .filter((candidate) => candidate.personId === args.personId)
        .map((candidate) => candidate.key),
    );

    const matched = event.groups.filter((group) =>
      groupSelectionKeys(catalogue.candidates, group).some((key) => ownKeys.has(key)),
    );

    if (matched.length === 0) {
      // The other direction. A recruit marked declined, a membership moved out
      // of Onboarding, a seat ended: the person no longer falls into any group
      // this event was built from, so a row the rule itself put there and never
      // sent comes back off. A row the approver confirmed is never touched —
      // `added_by_group_category is not null` is the whole guard, and it is
      // why the column exists.
      retracted += await retractRuleAddIn(tx, event.id, args.personId);
      continue;
    }

    if (excluded.has(event.id)) continue; // Brian's decision 5: a deliberate deselection sticks.
    if (existing.has(event.id)) continue; // already in this audience, under whatever capacity

    // The capacity is resolved from the matched groups alone, through the same
    // collapse `saveEventAudience` uses, so a person who qualifies as a player
    // and a committee member reaches the event as a player exactly as they
    // would have at approval.
    const matchedKeys = matched.flatMap((group) =>
      groupSelectionKeys(catalogue.candidates, group).filter((key) => ownKeys.has(key)),
    );
    const resolution = resolveSelection(catalogue.candidates, [...new Set(matchedKeys)]);
    if (!resolution.ok) continue;
    const member = resolution.members[0];
    if (!member) continue;

    const sendAt = nextAutoAddSendAt({ pending, welcomeAt });
    const joined = await joinApprovedEventIn(tx, {
      eventId: event.id,
      seasonId: args.seasonId,
      capacity: member.capacity,
      anchorId: member.anchorId,
      personId: member.personId,
      group: matched[0],
      addedByPersonId: null, // the rule acted, not an operator — the audit says which rule
      sendAt,
      eventStartsAt: event.startsAtUtc,
      eventType: event.eventType,
    });
    if (joined.audienceMemberId === null) continue; // a concurrent add won the conflict; theirs stands
    added += 1;
    if (joined.declared) {
      pending.push(sendAt);
      messagesDeclared += 1;
    } else {
      messagesWithheld += 1;
    }
    const consented = joined.withheldBecause !== "no_consent";
    const beforeTheEvent = joined.withheldBecause !== "event_starts_first";

    await recordAudit(tx, {
      actorLabel: AUDIENCE_GROUP_RULE_ACTOR_LABEL,
      action: "event.audience_added_by_group_rule",
      entityTable: "events",
      entityId: event.id,
      context: {
        // Ids only. No name, no number, no address: this row is read by
        // whoever is working out why a message went out, and it needs to say
        // which person and which rule, not who they are.
        personId: member.personId,
        audienceGroup: matched[0],
        matchedGroups: matched,
        capacity: member.capacity,
        trigger: args.trigger,
        triggeredByPersonId: args.actorPersonId ?? null,
        scheduledFor: consented && beforeTheEvent ? sendAt.toISOString() : null,
        withheldBecause: consented ? (beforeTheEvent ? null : "event_starts_first") : "no_consent",
      },
    });
  }

  return { added, messagesDeclared, messagesWithheld, retracted };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The approved, not-yet-started events in this season that carry a stored group
 * rule at all. "Not yet started" is the same clause `readDueJobs` uses to
 * decide a player-facing rung is still dispatchable, spelled the same way, so
 * the rule cannot add somebody to an event the sweep would then refuse to
 * message.
 */
async function readCandidateEventsIn(tx: Tx, seasonId: string): Promise<CandidateEvent[]> {
  const result = await tx.query<{
    id: string;
    event_type: string;
    scheduled_on: string;
    starts_at_utc: Date;
    group_categories: string[];
    group_audience_groups: (string | null)[];
    group_values: (string | null)[];
  }>(
    // LAN-414: the stored triple, three parallel arrays rather than one joined
    // string. A separator would have to be a character no roster value can
    // hold, and the obvious one — a NUL byte — is a character Postgres refuses
    // in `text` outright; three `array_agg`s under one `order by` are exact and
    // need no such character to exist.
    `select e.id,
            e.event_type::text as event_type,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
              at time zone 'Europe/London' as starts_at_utc,
            array_agg(g.category::text
              order by g.category::text, g.audience_group::text, g.value)
              as group_categories,
            array_agg(g.audience_group::text
              order by g.category::text, g.audience_group::text, g.value)
              as group_audience_groups,
            array_agg(g.value
              order by g.category::text, g.audience_group::text, g.value)
              as group_values
       from public.events e
       join public.event_audience_groups g on g.event_id = e.id
      where e.season_id = $1
        and e.status = 'approved'
        and e.scheduled_on is not null
        and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
              at time zone 'Europe/London' > now()
      group by e.id, e.event_type, e.scheduled_on, e.starts_at
      order by starts_at_utc, e.id`,
    [seasonId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    scheduledOn: row.scheduled_on,
    startsAtUtc: row.starts_at_utc,
    // Filtered against the vocabulary rather than cast: a group the enum holds
    // and the catalogue has retired would otherwise reach `groupSelectionKeys`,
    // which answers `[]` for an unknown token and would quietly mean "this
    // event has no rule" instead of saying so.
    groups: row.group_categories
      .map((category, at) =>
        audienceGroupTokenFor(
          category,
          row.group_audience_groups[at] ?? null,
          row.group_values[at] ?? null,
        ),
      )
      .filter(
        (token): token is string =>
          token !== null && audienceOptionFor(row.event_type, token) !== null,
      ),
  }));
}

async function readExclusionsIn(tx: Tx, personId: string): Promise<ReadonlySet<string>> {
  const result = await tx.query<{ event_id: string }>(
    `select event_id from public.event_audience_exclusions where person_id = $1::uuid`,
    [personId],
  );
  return new Set(result.rows.map((row) => row.event_id));
}

async function readExistingAudienceIn(tx: Tx, personId: string): Promise<ReadonlySet<string>> {
  const result = await tx.query<{ event_id: string }>(
    `select event_id from public.event_audience_members where invitee_person_id = $1::uuid`,
    [personId],
  );
  return new Set(result.rows.map((row) => row.event_id));
}

/** Every auto-add invitation this person already has queued and unsent, so the cap counts them. */
async function readPendingAutoAddSendsIn(tx: Tx, personId: string): Promise<Date[]> {
  const result = await tx.query<{ scheduled_for: Date }>(
    `select j.scheduled_for
       from public.notification_jobs j
       join public.invitations i on i.id = j.invitation_id
       join public.event_audience_members a on a.id = i.audience_member_id
      where a.invitee_person_id = $1::uuid
        and a.added_by_group_category is not null
        and j.job_type = 'invitation'
        and j.status in ('pending', 'ready')
        and j.scheduled_for is not null
        and j.scheduled_for > now()
      order by j.scheduled_for`,
    [personId],
  );
  return result.rows.map((row) => row.scheduled_for);
}

/**
 * When this person's recruit welcome is due, if one is declared and unsent.
 *
 * Brian's decision 4: "A new recruit's auto-add invitation is scheduled after
 * the recruit welcome, never before it." Stated as arithmetic rather than as
 * ordering, because `scheduled_for` is not delivery order — the sweep takes a
 * batch of fifty by due time and a failed welcome retries later — so the
 * honest guarantee is that the invitation is never *scheduled* first. Where no
 * welcome is declared at all, which is what happens for a recruit with no
 * consent evidence, there is nothing to be after.
 */
async function readDeclaredRecruitWelcomeAtIn(tx: Tx, personId: string): Promise<Date | null> {
  const result = await tx.query<{ scheduled_for: Date | null }>(
    `select scheduled_for
       from public.notification_jobs
      where person_id = $1::uuid
        and job_type = 'other'
        and idempotency_key like 'recruit-cycle:welcome:%'
        and status in ('pending', 'ready')
      order by scheduled_for desc nulls last
      limit 1`,
    [personId],
  );
  return result.rows[0]?.scheduled_for ?? null;
}

// ---------------------------------------------------------------------------
// When the invitation goes
// ---------------------------------------------------------------------------

/**
 * The moment this auto-add invitation is scheduled for.
 *
 * Three rules, in order, and they only ever push it later:
 *
 *   1. **The ten-minute grace.** Nothing leaves inside ten minutes of the
 *      status write, so an operator who mis-clicks and puts it back has a
 *      window in which nothing has been sent and the row comes off again.
 *   2. **After the welcome.** See {@link readDeclaredRecruitWelcomeAtIn}.
 *   3. **Five an hour.** Brian: "no more than five auto-add invitations to one
 *      person inside any hour; the rest queue one per hour." The slots are
 *      measured from this person's own earliest queued auto-add send rather
 *      than from the clock, so six events at once are five now and the sixth an
 *      hour after the first five — which is what the acceptance asks for, and
 *      is not what clock-hour buckets would give.
 *
 * There is no send-time throttle anywhere in this system — `SWEEP_BATCH_LIMIT`
 * and `SWEEP_BUDGET_MS` are throughput valves, not per-recipient caps — so the
 * cap can only be expressed by choosing this instant.
 */
export function nextAutoAddSendAt(state: {
  pending: readonly Date[];
  welcomeAt: Date | null;
  now?: Date;
}): Date {
  const now = state.now ?? new Date();
  let earliest = now.getTime() + GRACE_MS;
  if (state.welcomeAt !== null) {
    earliest = Math.max(earliest, state.welcomeAt.getTime() + AFTER_WELCOME_MS);
  }

  const queued = [...state.pending].map((at) => at.getTime()).sort((a, b) => a - b);
  const anchor = queued.length > 0 ? Math.min(queued[0], earliest) : earliest;

  for (let slot = 0; ; slot += 1) {
    const start = anchor + slot * BLAST_SLOT_MS;
    const end = start + BLAST_SLOT_MS;
    if (end <= earliest) continue; // a slot entirely in the past of the grace window
    const taken = queued.filter((at) => at >= start && at < end).length;
    if (taken < BLAST_CAP_PER_SLOT) return new Date(Math.max(start, earliest));
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Put one person into an approved event's audience and on to its ladder.
 *
 * Shared by the group rule above and by LAN-393's hand-add, because they are
 * the same four writes in the same order and differ only in who is said to have
 * done it and when the invitation is scheduled for. Everything that could
 * silently diverge between the two — the conflict rule, the deadline the
 * invitation carries, the idempotency keys, which rungs are still ahead — lives
 * here once.
 */
export async function joinApprovedEventIn(
  tx: Tx,
  args: {
    eventId: string;
    seasonId: string;
    capacity: AudienceCapacity;
    anchorId: string;
    personId: string;
    /** The stored group token that pulled them in, or null for an operator's hand-add. */
    group: string | null;
    addedByPersonId: string | null;
    sendAt: Date;
    eventStartsAt: Date;
    /**
     * LAN-416. The event's own class, so a recruit joining a Training event
     * rides that event's player ladder and a recruit joining a Recruitment
     * event keeps the gentle one. Before LAN-416 a recruit could only ever be
     * on a Recruitment event, so the capacity alone answered this.
     */
    eventType: string;
  },
): Promise<{
  audienceMemberId: string | null;
  declared: boolean;
  withheldBecause: "no_consent" | "event_starts_first" | null;
}> {
  const audienceMemberId = await insertAudienceRowIn(tx, args);
  if (audienceMemberId === null) {
    return { audienceMemberId: null, declared: false, withheldBecause: null };
  }

  const invitationId = await insertInvitationIn(tx, args.eventId, audienceMemberId);

  // Consent gates a recruit-capacity send and nothing else — `claimJobIn` says
  // so in as many words, and this is the same test in the same terms, moved to
  // the moment the job would be declared. Brian's decision 7: the row and the
  // invitation are written either way, and only the message is withheld.
  const consented =
    args.capacity !== "recruit" ||
    (await hasGrantedSeasonMessagingConsentIn(tx, args.personId, args.seasonId));
  const beforeTheEvent = args.sendAt.getTime() < args.eventStartsAt.getTime();

  if (invitationId === null || !consented || !beforeTheEvent) {
    const withheldBecause = consented ? "event_starts_first" : "no_consent";
    // Written on the invitation itself, because the fact has to outlive this
    // call: `invitation_response_state` reads any pending invitation as
    // `awaiting_response`, which would put somebody nobody ever messaged into
    // `nonresponse_queue`, the Follow-ups list and the Monday report's "no
    // answer" column, to be chased about a message that was never sent. With
    // the reason recorded the view answers `never_asked` instead and every one
    // of those queues leaves them alone. See the column's own comment.
    if (invitationId !== null) {
      await tx.query(
        `update public.invitations set message_withheld_reason = $2 where id = $1::uuid`,
        [invitationId, withheldBecause],
      );
    }
    return { audienceMemberId, declared: false, withheldBecause };
  }

  await declareInvitationJobIn(tx, invitationId, args.sendAt);
  await declareRemainingRungsIn(tx, {
    eventId: args.eventId,
    invitationId,
    // LAN-416: the gentle ladder is the Recruitment event's, not the recruit's.
    isRecruit: args.capacity === "recruit" && args.eventType === RECRUITMENT_EVENT_TYPE,
    after: args.sendAt,
  });

  return { audienceMemberId, declared: true, withheldBecause: null };
}

/**
 * The audience row, ignoring a conflict on the human.
 *
 * `event_audience_members_one_per_human_per_event` (invariant P9) is a total
 * unique index on `(event_id, invitee_person_id)`. A recruit who already holds
 * a recruit-anchored row on an approved recruitment event and then flips to a
 * player would, without this, be inserted a second time under the player anchor
 * — a `ConstraintViolated` that rolls back the operator's flip and leaves them
 * unable to flip that recruit at all. `do nothing` is therefore not tidiness:
 * it is what keeps this rule from breaking the action that triggered it. The
 * existing row always wins, and its capacity is never upgraded.
 */
async function insertAudienceRowIn(
  tx: Tx,
  args: {
    eventId: string;
    seasonId: string;
    capacity: AudienceCapacity;
    anchorId: string;
    personId: string;
    group: string | null;
    addedByPersonId: string | null;
  },
): Promise<string | null> {
  // LAN-414: the stored pair. `added_by_group_category` is set for every rule
  // add whatever its category, and is the "the rule put this here" predicate
  // the retraction, the five-an-hour cap and the ladder anchor all read.
  const parsed = args.group === null ? null : parseAudienceGroupToken(args.group);
  const inserted = await tx.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id,
        invitee_person_id, added_at, added_by_person_id,
        added_by_group, added_by_group_category, added_by_group_value)
     values ($1::uuid, $2::uuid, $3::public.invitation_capacity,
             case when $3 = 'player' then $4::uuid end,
             case when $3 <> 'player' then $4::uuid end,
             $5::uuid, now(), $7::uuid,
             $6::public.audience_group,
             $8::public.audience_group_category,
             $9)
     on conflict (event_id, invitee_person_id) do nothing
     returning id`,
    [
      args.eventId,
      args.seasonId,
      args.capacity,
      args.anchorId,
      args.personId,
      parsed?.audienceGroup ?? null,
      args.addedByPersonId,
      parsed?.category ?? null,
      parsed?.value ?? null,
    ],
  );
  return inserted.rows[0]?.id ?? null;
}

/**
 * The invitation, carrying the event's own deadline.
 *
 * `expires_at` is `events.response_deadline_at`, unchanged and not recomputed.
 * A per-person deadline would give two people on one event two different
 * expiries while the event page showed a third, and the chase arithmetic would
 * quietly disagree with the screen. It is also what makes LAN-379's
 * deadline-passed wording correct for free: `claimJobIn` renders "Please
 * respond ASAP" from `expires_at <= now()` at the moment of the send, so a late
 * joiner invited after the deadline is asked the right question without a
 * single line here.
 */
async function insertInvitationIn(
  tx: Tx,
  eventId: string,
  audienceMemberId: string,
): Promise<string | null> {
  const inserted = await tx.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity,
        season_membership_id, person_id, status, expires_at, audience_member_id)
     select a.event_id, 'approved'::public.event_status, a.season_id, a.capacity,
            a.season_membership_id, a.person_id, 'pending', e.response_deadline_at, a.id
       from public.event_audience_members a
       join public.events e on e.id = a.event_id
      where a.id = $1::uuid
        and e.id = $2::uuid
     returning id`,
    [audienceMemberId, eventId],
  );
  return inserted.rows[0]?.id ?? null;
}

/** Rung 0, on the same idempotency key shape `approveEvent` uses, so a retry cannot double-send. */
async function declareInvitationJobIn(tx: Tx, invitationId: string, at: Date): Promise<void> {
  await tx.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        channel, scheduled_for, ladder_rung, template_variables)
     select 'event:' || i.event_id::text || ':invitation:' || i.capacity::text
              || ':' || i.participant_id::text,
            'invitation', 'pending', i.id, i.event_id,
            coalesce(i.person_id, m.person_id),
            'whatsapp', $2::timestamptz, 0, '{}'::jsonb
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1::uuid
     on conflict (idempotency_key) do nothing`,
    [invitationId, at],
  );

  // LAN-392, F6 (corrected 2026-09-17): the job and the reason are one fact, so
  // they are written in one place. `message_withheld_reason` means "no message
  // has ever gone out against this invitation" — `invitation_response_state`
  // answers `never_asked` on that basis alone, and every chase queue then
  // leaves the person alone for good. The rule itself is kept where a message
  // actually goes out (`claimJobIn` in `delivery.ts`); this and the clear below
  // are the earlier, narrower halves, which keep the column honest between the
  // reschedule that makes a message possible and the sweep that sends it. Declaring a message and leaving the
  // reason standing would make the column a lie in the one direction nobody
  // ever notices: the message goes, nothing chases the silence, and no report
  // shows the gap. Today this invitation was written moments ago and carries no
  // reason, so the statement clears nothing; it is here so the rule holds of the
  // function that declares the message rather than of the order its callers
  // happen to run in.
  await tx.query(
    `update public.invitations
        set message_withheld_reason = null
      where id = $1::uuid and message_withheld_reason is not null`,
    [invitationId],
  );
}

/**
 * The other half of the same rule, for the one path that declares a message
 * against an invitation this module withheld one from:
 * `backfillInvitationJobsIn` in `event-amendment/amend.ts`, which a reschedule
 * runs unconditionally and which declares the invitation job for every
 * invitation on the event, including one the rule deliberately left bare.
 *
 * A withheld invitation is not simply re-armed by that backfill, because the
 * reason it was withheld may or may not still hold, and the column has to keep
 * meaning what the view reads it as:
 *
 * - `event_starts_first` lapses the moment there is runway again. The test is
 *   the event's own start against the instant the job now carries — set by
 *   `scheduleEventLadderIn` and the amendment's rung loop, which is why this
 *   runs after both rather than beside the backfill.
 * - `no_consent` does not lapse just because a job exists: the backfill
 *   declares one for an unconsented recruit too, and `claimJobIn` refuses it at
 *   send time. Clearing it then would put somebody who will never be messaged
 *   back into the chase queue — A11's defect inverted. It lapses only once
 *   consent is on file, which the public sign-up doors and the questionnaire
 *   grant.
 *
 * A cancelled job is not a declared message, so it is not counted.
 *
 * This is not the backstop. `claimJobIn` clears the reason as it claims a send,
 * which is what makes the column true of every route — the sweep, the
 * operator's Retry after a failed job, Revoke and reissue — including the one
 * where consent arrives and nobody reschedules again. This function only brings
 * the clear forward to the reschedule, so the person is in the chase queue from
 * the moment the message is genuinely owed rather than from the moment it goes.
 */
export async function clearWithheldReasonsWhereDeclaredIn(
  tx: Tx,
  eventId: string,
): Promise<number> {
  const cleared = await tx.query<{ id: string }>(
    `update public.invitations i
        set message_withheld_reason = null
       from public.events e
      where e.id = i.event_id
        and i.event_id = $1::uuid
        and i.message_withheld_reason is not null
        and exists (
          select 1
            from public.notification_jobs j
           where j.invitation_id = i.id
             and j.job_type = 'invitation'
             and j.status in ('pending', 'ready', 'processing', 'completed')
             and j.scheduled_for is not null
             and j.scheduled_for < (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                                     at time zone 'Europe/London')
        and (i.message_withheld_reason <> 'no_consent'
             or exists (
               select 1
                 from public.season_messaging_consents c
                where c.season_id = i.season_id
                  and c.state = 'granted'
                  and c.person_id = coalesce(
                        i.person_id,
                        (select m.person_id
                           from public.season_memberships m
                          where m.id = i.season_membership_id))))
     returning i.id`,
    [eventId],
  );
  return cleared.rowCount ?? 0;
}

/**
 * The event's remaining rungs, read off the event rather than recomputed.
 *
 * This is the whole of "they join the event's existing messaging plan". The
 * rungs are taken from the jobs the event already holds — same `ladder_rung`,
 * same `channel`, same `scheduled_for` — so three things follow without any
 * further code: the late joiner is on the event's ladder rather than a private
 * one, `recomputeScheduleOnRescheduleIn` moves their rungs with everybody's
 * because it matches on `ladder_rung`, and `cancelEvent` stands theirs down
 * with everybody's because it cancels by event.
 *
 * Recomputing instead would have been the ADR 0036 §4 violation the frozen plan
 * exists to prevent: `resolveMessagingPlanIn` reads the *live*
 * `messaging_schedules` row, so an admin who edited the cadence on Tuesday
 * would retroactively change Monday's approved event for everyone who joined
 * after.
 *
 * A rung earlier than the invitation is never inserted (`> after`), so a late
 * joiner cannot be reminded about an event before being invited to it, and the
 * recruit and player ladders are kept apart on their own capacities, exactly as
 * `scheduleEventLadderIn` splits them.
 */
async function declareRemainingRungsIn(
  tx: Tx,
  args: { eventId: string; invitationId: string; isRecruit: boolean; after: Date },
): Promise<number> {
  const created = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        channel, scheduled_for, ladder_rung, template_variables)
     select 'event:' || i.event_id::text || ':reminder:' || i.capacity::text
              || ':' || i.participant_id::text || ':' || rung.ladder_rung::text,
            'reminder', 'pending', i.id, i.event_id,
            coalesce(i.person_id, m.person_id),
            rung.channel, rung.scheduled_for, rung.ladder_rung, '{}'::jsonb
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
       cross join lateral (
         select distinct on (j.ladder_rung)
                j.ladder_rung, j.channel, j.scheduled_for
           from public.notification_jobs j
           join public.invitations peer on peer.id = j.invitation_id
          where j.event_id = $1::uuid
            and j.job_type = 'reminder'
            and j.status in ('pending', 'ready')
            and j.ladder_rung is not null
            and j.scheduled_for is not null
            and j.scheduled_for > $3::timestamptz
            and (peer.capacity = 'recruit') = $4::boolean
          order by j.ladder_rung, j.scheduled_for
       ) as rung
      where i.id = $2::uuid
     on conflict (idempotency_key) do nothing
     returning id`,
    [args.eventId, args.invitationId, args.after, args.isRecruit],
  );
  return created.rowCount ?? 0;
}

/**
 * Take back a rule-added row whose message has not gone.
 *
 * Brian's decision 4: "A flip reverted inside the window deletes the audience
 * row and the invitation and cancels the declared job." Cancelling the job
 * alone would not do: a pending invitation reads as `awaiting_response`, so the
 * person would sit in the non-response queue and the Monday report being chased
 * about a message nobody ever sent.
 *
 * It is guarded three ways and every one of them matters. Only a row this rule
 * added (`added_by_group_category is not null`) — an approver's confirmed row is never
 * removed by anything. Only while every one of its jobs is still unsent — once
 * a message has gone the person has been invited, and LAN-341's rule that an
 * exit keeps existing invitations applies. And only on an event that has not
 * started, which the caller has already filtered to.
 */
async function retractRuleAddIn(tx: Tx, eventId: string, personId: string): Promise<number> {
  const retractable = await tx.query<{ id: string }>(
    `select a.id
       from public.event_audience_members a
      where a.event_id = $1::uuid
        and a.invitee_person_id = $2::uuid
        and a.added_by_group_category is not null
        and not exists (
          select 1
            from public.invitations i
            join public.notification_jobs j on j.invitation_id = i.id
           where i.audience_member_id = a.id
             and j.status not in ('pending', 'ready', 'cancelled')
        )
      for update`,
    [eventId, personId],
  );
  const row = retractable.rows[0];
  if (!row) return 0;

  // Deleted, not cancelled. Brian's decision 4 says "cancels the declared job",
  // and cancelling alone is what a job whose invitation survives gets — but the
  // invitation does not survive here, and `notification_jobs.invitation_id`
  // references it `on delete restrict`, so a cancelled job would hold the
  // invitation and the audience row in place and leave the person in the
  // non-response queue being chased about a message nobody sent. Nothing was
  // ever sent (the guard above proves it), so there is no record to preserve:
  // this is the retraction of something that never happened.
  await tx.query(
    `delete from public.notification_jobs j
      using public.invitations i
      where j.invitation_id = i.id
        and i.audience_member_id = $1::uuid`,
    [row.id],
  );
  await tx.query(`delete from public.invitations where audience_member_id = $1::uuid`, [row.id]);
  await tx.query(`delete from public.event_audience_members where id = $1::uuid`, [row.id]);

  await recordAudit(tx, {
    actorLabel: AUDIENCE_GROUP_RULE_ACTOR_LABEL,
    action: "event.audience_retracted_by_group_rule",
    entityTable: "events",
    entityId: eventId,
    reason: AUDIENCE_GROUP_RULE_RETRACTED_REASON,
    context: { personId, audienceMemberId: row.id },
  });

  return 1;
}

const AUDIENCE_GROUP_RULE_RETRACTED_REASON =
  "The group rule added this person and their standing changed again before anything was sent.";
