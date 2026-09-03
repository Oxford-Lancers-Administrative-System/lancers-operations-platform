/**
 * A term of events, and everything that hangs off them — LAN-221.
 *
 * Series, alternative groups, an event in every lifecycle state the schema can
 * express, audiences, invitations, answers, questions, registers, walk-ups,
 * RSVP and club-link tokens, amendments, and the messaging ladder in every
 * state a reviewer has to be able to look at: delivered, reminded, the email
 * rung, a terminal failure, a WhatsApp failure carried by email, somebody with
 * no usable route, a held job, a cancelled job, a raised flag with the
 * President's escalation recorded — and frozen plans that agree with all of it.
 *
 * ## The one rule that shapes the calendar
 *
 * **No job the loader writes may ever be claimable.** The dispatcher claims
 * `status in ('pending','ready','failed') and held_at is null and
 * attempt_count < 5 and invitation_id is not null`. So every ladder here is
 * concluded — completed, cancelled, failed at the ceiling or rejected — or
 * held. A future event whose ladder has not run yet is therefore a **draft
 * with a confirmed audience**, waiting for a tester to approve it: approving is
 * the live path, and the jobs it creates are the application's, not this
 * loader's. Two approved events close to the anchor carry compressed
 * late-approval plans whose rungs have already gone, and one carries a hold.
 */

import { id } from "../ids.mjs";
import { addHours, addMinutes, weekdayOf } from "./context.mjs";

const NO_REASONS = Object.freeze([
  "Lab session runs until eight.",
  "Away for a family birthday.",
  "Essay deadline the next morning.",
  "Working a shift.",
  "Travelling back from home.",
  "Clashes with a college dinner.",
]);

/**
 * Copied verbatim from `src/lib/delivery/phone.ts` and `email.ts`. Both
 * `noUsableRoute` readers are an exact string match against these, so a
 * paraphrase reads as an ordinary failure rather than the named exception.
 */
export const NO_USABLE_NUMBER_REASON =
  "No usable mobile number is recorded for this person, so nothing could be sent. " +
  "Add or correct their phone number on the roster, then retry.";

/** `delivery.ts`'s own `BACKOFF_MINUTES`, cumulative. */
const BACKOFF_OFFSETS_MINUTES = Object.freeze([0, 5, 20, 80, 320]);

const SERIES = Object.freeze([
  [
    "sunday",
    "Sunday Session",
    "practice",
    "Iffley Road Astro",
    "14:00",
    "16:30",
    0,
    true,
    "Sunday practice, replaced by the fixture on match weeks.",
  ],
  [
    "wednesday",
    "Wednesday Practice",
    "practice",
    "University Parks",
    "20:00",
    "22:30",
    3,
    true,
    "Midweek practice, every week of term.",
  ],
  [
    "conditioning",
    "Tuesday S&C",
    "strength_and_conditioning",
    "Blues Gym, Iffley Road",
    "07:00",
    "08:00",
    2,
    false,
    "Early S&C, every week.",
  ],
  [
    "chalk",
    "Tuesday Chalk",
    "chalk",
    "Microsoft Teams",
    "18:00",
    "19:00",
    2,
    false,
    "Chalk talk, competitive weeks only. Online — the venue is the destination.",
  ],
]);

export function buildCalendar(ctx, reference, people, recruits, { termCard }) {
  const { add, labels, day, at, anchor, mintToken, params, existing } = ctx;
  const { seasonId, termId, actorPersonId, presidentId, staff, operators } = reference;
  const { players, playerStaff } = people;

  const schedules = existing.messagingSchedules ?? new Map();
  const scheduleFor = (eventType) =>
    schedules.get(eventType) ?? {
      rsvp_by_days: 2,
      invitation_lead_days: 5,
      reminder_cadence_hours: 24,
      whatsapp_reminder_count: 2,
      email_reminder_count: 1,
      escalation_hours: 12,
      recruit_invitation_lead_days: eventType === "recruitment" ? 5 : null,
      recruit_follow_up_cadence_hours: eventType === "recruitment" ? 72 : null,
    };

  const liveFor = new Set(params.liveLinksFor ?? ["brian", "stewart"]);
  const nowIso = `${anchor}T00:00:00Z`;
  const isPast = (iso) => iso < nowIso;

  // ---------------------------------------------------------------------------
  // Series and alternative groups
  // ---------------------------------------------------------------------------
  const seriesIds = new Map();
  for (const [key, name, eventType, venue, starts, ends, weekday, , note] of SERIES) {
    seriesIds.set(
      key,
      add(
        "public.event_series",
        {
          id: id("event_series", labels.currentSeason, key),
          season_id: seasonId,
          name,
          event_type: eventType,
          default_venue: venue,
          default_starts_at: starts,
          default_ends_at: ends,
          weekday,
          recurrence_note: note,
          is_active: true,
        },
        "illustrative",
        { source: `series ${key}` },
        ["series.defined"],
      ),
    );
  }

  const socialGroupId = add(
    "public.alternative_groups",
    {
      id: id("alternative_groups", labels.currentSeason, "michaelmas-social"),
      season_id: seasonId,
      label: "Michaelmas social slot",
      note: "Two candidate Thursdays for one social. At most one may ever be approved.",
    },
    "illustrative",
    { source: "alternative group — the social" },
    ["alternative-group.defined"],
    "alternative-group",
  );

  // ---------------------------------------------------------------------------
  // Who is in an audience
  // ---------------------------------------------------------------------------
  const squad = players.filter((player) => player.status !== "departed");
  const staffInvitees = [
    ...staff.map((entry) => ({
      key: `staff:${entry.code}`,
      personId: entry.personId,
      capacity: entry.capacity,
    })),
    ...playerStaff.map((entry) => ({
      key: `player-seat:${entry.player.key}`,
      personId: entry.personId,
      capacity: entry.capacity,
    })),
    ...operators.map((operator) => ({
      key: `operator:${operator.key}`,
      personId: operator.personId,
      capacity:
        operator.roles.some((code) => code.endsWith("_coach")) &&
        !operator.roles.some((c) => !c.endsWith("_coach"))
          ? "coach"
          : "committee",
      operatorKey: operator.key,
    })),
  ];
  const committeeOnly = staffInvitees.filter((entry) => entry.capacity === "committee");

  const events = [];
  const invitationsByEvent = new Map();

  // ---------------------------------------------------------------------------
  // One event, with everything that follows from its state
  // ---------------------------------------------------------------------------
  /**
   * @param spec.status      draft | approved | cancelled
   * @param spec.audience    "squad" | "squad-30" | "committee" | "none" | "recruits"
   * @param spec.confirmed   whether a draft's audience has been confirmed
   * @param spec.register    take a register (past approved only)
   * @param spec.ladder      "full" | "invitation-only" | "late" | "held" | "none"
   * @param spec.story       fully_delivered | genuine_failure | whatsapp_carried_by_email | escalated | plain
   */
  const event = (spec) => {
    const key = spec.key;
    const eventId = spec.eventId ?? id("events", "scenario", labels.currentSeason, key);
    const scheduledOn = spec.scheduledOn ?? day(spec.offset);
    const startsAtIso = `${scheduledOn}T${spec.startsAt}:00Z`;
    const status = spec.status;
    const decided = status !== "draft";
    const confirmed = decided || spec.confirmed === true;
    const past = isPast(startsAtIso);
    const concluded = status === "approved" && past;
    const schedule = scheduleFor(spec.eventType);
    const approvedAt = decided
      ? (spec.approvedAt ?? addHours(startsAtIso, -24 * schedule.invitation_lead_days - 6))
      : null;
    // When the invitation actually went: at approval for a late plan, else on
    // the schedule's lead. Answers are spread across the three days after it,
    // so the first reminder reaches most people, the second about half, and
    // the email rung the slow few — which is what a real ladder looks like.
    const invitationWentAt = approvedAt
      ? spec.ladder === "late"
        ? approvedAt
        : addHours(startsAtIso, -24 * schedule.invitation_lead_days)
      : null;
    const answeredAtFor = (position) => addHours(invitationWentAt, 12 + ((position * 5) % 70));
    const confirmedAt = confirmed
      ? (spec.confirmedAt ??
        (approvedAt ? addMinutes(approvedAt, -5) : at(spec.offset - 1, "09:00")))
      : null;
    const states = [
      `event.type.${spec.eventType}`,
      status === "draft"
        ? spec.audience === "none"
          ? "event.draft.no-audience"
          : confirmed
            ? "event.draft.audience-confirmed"
            : "event.draft.audience-unconfirmed"
        : status === "cancelled"
          ? past
            ? "event.cancelled.not-held"
            : "event.cancelled.after-publication"
          : concluded
            ? spec.register
              ? "event.occurred.register"
              : "event.occurred.no-register"
            : "event.approved.upcoming",
      spec.mandatory ? "event.mandatory" : "event.optional",
      ...(spec.online ? ["event.online"] : []),
      ...(spec.groupId ? ["event.alternative"] : []),
      ...(spec.termCard ? ["event.term-card"] : []),
      ...(spec.extraStates ?? []),
    ];

    add(
      "public.events",
      {
        id: eventId,
        season_id: seasonId,
        series_id: spec.series ? seriesIds.get(spec.series) : null,
        alternative_group_id: spec.groupId ?? null,
        term_id: spec.termCard ? termId : null,
        week_number: spec.termCard ? spec.week : null,
        name: spec.name,
        event_type: spec.eventType,
        origin: spec.origin ?? (spec.eventType === "game" ? "negotiated" : "club_controlled"),
        status,
        scheduled_on: scheduledOn,
        starts_at: spec.startsAt,
        ends_at: spec.endsAt ?? null,
        delivery_mode: spec.online ? "online" : "in_person",
        venue: spec.venue ?? null,
        joining_url: spec.online
          ? "https://teams.example.invalid/l/meetup-join/oulafc-chalk"
          : null,
        description: spec.description ?? null,
        required_equipment: spec.equipment ?? null,
        competition: spec.competition ?? null,
        is_mandatory: Boolean(spec.mandatory),
        response_deadline_at: decided ? addHours(startsAtIso, -24 * schedule.rsvp_by_days) : null,
        reminder_offsets_hours: decided ? "{72,24}" : "{}",
        aggregate_headcount: spec.headcount ?? null,
        owner_person_id: actorPersonId,
        audience_confirmed_at: confirmedAt,
        audience_confirmed_by_person_id: confirmedAt ? actorPersonId : null,
        approved_at: approvedAt,
        approved_by_person_id: approvedAt ? actorPersonId : null,
        decision_reason: spec.decisionReason ?? null,
        created_at: spec.createdAt ?? addHours(startsAtIso, -24 * 21),
        updated_at: approvedAt ?? at(-1, "09:00"),
      },
      spec.termCard ? spec.classification : "illustrative",
      spec.source ?? { source: `event ${key}` },
      states,
      spec.example ?? null,
    );

    const record = {
      key,
      eventId,
      scheduledOn,
      startsAtIso,
      status,
      past,
      concluded,
      spec,
      schedule,
      approvedAt,
      invitationWentAt,
      invitations: [],
    };
    events.push(record);
    if (!confirmed || spec.audience === "none" || spec.termCard) return record;

    // Audience.
    const members = [];
    const squadForEvent =
      spec.audience === "squad-30"
        ? squad.slice(0, 30)
        : spec.audience === "committee"
          ? []
          : squad;
    for (const player of squadForEvent) {
      members.push({
        kind: "player",
        key: player.key,
        player,
        membershipId: player.membershipId,
        personId: player.personId,
        capacity: "player",
        hasPhone: player.hasPhone,
        consent: player.consent,
      });
    }
    const staffForEvent = spec.audience === "committee" ? committeeOnly : staffInvitees;
    for (const entry of staffForEvent) {
      members.push({
        kind: "staff",
        key: entry.key,
        personId: entry.personId,
        capacity: entry.capacity,
        hasPhone: true,
        consent: "granted",
        operatorKey: entry.operatorKey,
      });
    }
    if (spec.audience === "recruits" || spec.recruits) {
      for (const recruit of recruits.filter(
        (entry) => ["identified", "engaged", "committed"].includes(entry.status) && !entry.walkUp,
      )) {
        members.push({
          kind: "recruit",
          key: `recruit:${recruit.key}`,
          personId: recruit.personId,
          capacity: "recruit",
          hasPhone: true,
          consent: recruit.consent,
        });
      }
    }

    members.forEach((member, position) => {
      const audienceMemberId = add(
        "public.event_audience_members",
        {
          id: id("event_audience_members", labels.currentSeason, key, member.key),
          event_id: eventId,
          season_id: seasonId,
          capacity: member.capacity,
          season_membership_id: member.kind === "player" ? member.membershipId : null,
          person_id: member.kind === "player" ? null : member.personId,
          added_at: confirmedAt,
          added_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `audience of ${key}` },
        ["audience.member"],
      );
      if (!decided) return;

      // Answers are decided before the invitation is written, because the
      // invitation's own status records whether one arrived.
      const roll = (position * 7 + events.length * 3) % 20;
      const answer =
        spec.audience === "committee" || (member.capacity === "recruit" && position % 2 === 0)
          ? null
          : roll < 12
            ? "yes"
            : roll < 15
              ? "no"
              : null;
      const cancelledEvent = status === "cancelled";
      const invitationId = id("invitations", labels.currentSeason, key, member.key);
      const deadline = addHours(startsAtIso, -24 * schedule.rsvp_by_days);
      const invitationStatus =
        cancelledEvent && !past
          ? "cancelled"
          : answer
            ? "responded"
            : isPast(deadline)
              ? "expired"
              : "issued";

      add(
        "public.invitations",
        {
          id: invitationId,
          event_id: eventId,
          event_status: status,
          season_id: seasonId,
          capacity: member.capacity,
          season_membership_id: member.kind === "player" ? member.membershipId : null,
          person_id: member.kind === "player" ? null : member.personId,
          status: invitationStatus,
          issued_at: approvedAt,
          expires_at: deadline,
          cancelled_at: invitationStatus === "cancelled" ? spec.cancelledAt : null,
          audience_member_id: audienceMemberId,
        },
        "illustrative",
        { source: `invitation for ${key}` },
        [
          `invitation.${invitationStatus}`,
          ...(member.capacity === "recruit" ? ["invitation.recruit"] : []),
        ],
      );
      // One invitee changes their mind (below); the register and the tags
      // follow the answer that stands, which is the later one.
      const changesMind = answer && position === 2 && spec.story === "fully_delivered";
      const finalAnswer = changesMind ? (answer === "yes" ? "no" : "yes") : answer;
      const invitation = { invitationId, member, answer, finalAnswer, audienceMemberId, position };
      record.invitations.push(invitation);

      if (answer) {
        const respondedAt = answeredAtFor(position);
        add(
          "public.rsvp_responses",
          {
            id: id("rsvp_responses", labels.currentSeason, key, member.key),
            invitation_id: invitationId,
            response: answer,
            reason: answer === "no" ? NO_REASONS[position % NO_REASONS.length] : null,
            raw_capture: null,
            source: position % 9 === 8 ? "operator" : "signed_link",
            responded_at: respondedAt,
            recorded_at: respondedAt,
            recorded_by_person_id: position % 9 === 8 ? actorPersonId : null,
          },
          "illustrative",
          { source: `answer for ${key}` },
          [`rsvp.${answer}`, ...(position % 9 === 8 ? ["rsvp.recorded-in-person"] : [])],
        );
        // One changed mind, so history shows two answers.
        if (changesMind) {
          add(
            "public.rsvp_responses",
            {
              id: id("rsvp_responses", labels.currentSeason, key, member.key, "changed"),
              invitation_id: invitationId,
              response: answer === "yes" ? "no" : "yes",
              reason: answer === "yes" ? "Tutorial moved onto the same evening." : null,
              raw_capture: null,
              source: "signed_link",
              responded_at: addHours(respondedAt, 20),
              recorded_at: addHours(respondedAt, 20),
              recorded_by_person_id: null,
            },
            "illustrative",
            { source: `changed answer for ${key}` },
            ["rsvp.changed"],
            "rsvp.changed",
          );
        }
      }

      // RSVP tokens: expired for the past, live only for the named operators
      // on an upcoming event, and one revoke-and-reissue pair.
      if (member.capacity !== "recruit" || member.consent === "granted") {
        const liveAllowed =
          member.operatorKey && liveFor.has(member.operatorKey) && !past && !cancelledEvent;
        // Anybody not named for a live link gets a link that has already
        // expired by the anchor — a deadline later today is still live.
        const tokenExpiry = liveAllowed ? startsAtIso : deadline < nowIso ? deadline : nowIso;
        const revokeAndReissue = spec.story === "genuine_failure" && position === 2;
        if (revokeAndReissue) {
          const first = mintToken("rsvp_access_tokens", key, member.key, "revoked");
          const firstId = add(
            "public.rsvp_access_tokens",
            {
              id: id("rsvp_access_tokens", labels.currentSeason, key, member.key, "revoked"),
              invitation_id: invitationId,
              token_hash: first.hash,
              issued_at: approvedAt,
              issued_by_person_id: actorPersonId,
              expires_at: tokenExpiry,
              revoked_at: addHours(approvedAt, 2),
              revoked_reason: "Sent to a number that turned out to be somebody else's.",
              superseded_at: addHours(approvedAt, 2),
              superseded_by_token_id: id(
                "rsvp_access_tokens",
                labels.currentSeason,
                key,
                member.key,
              ),
              last_used_at: null,
              use_count: 0,
            },
            "illustrative",
            { source: `revoked token for ${key}` },
            ["token.rsvp.revoked"],
            "token.rsvp.revoked",
          );
          void firstId;
        }
        const minted = mintToken("rsvp_access_tokens", key, member.key);
        const used = Boolean(answer) && position % 9 !== 8;
        add(
          "public.rsvp_access_tokens",
          {
            id: id("rsvp_access_tokens", labels.currentSeason, key, member.key),
            invitation_id: invitationId,
            token_hash: minted.hash,
            issued_at: revokeAndReissue ? addHours(approvedAt, 2) : approvedAt,
            issued_by_person_id: actorPersonId,
            expires_at: tokenExpiry,
            revoked_at: null,
            revoked_reason: null,
            superseded_at: null,
            superseded_by_token_id: null,
            last_used_at: used ? answeredAtFor(position) : null,
            use_count: used ? 1 + (position % 2) : 0,
          },
          "illustrative",
          { source: `token for ${key}` },
          [
            liveAllowed ? "token.rsvp.live" : "token.rsvp.expired",
            ...(used ? ["token.rsvp.used"] : []),
          ],
          liveAllowed &&
            member.operatorKey === "brian" &&
            !ctx.examples.has("token.rsvp.live.brian")
            ? "token.rsvp.live.brian"
            : null,
        );
        if (liveAllowed && member.operatorKey === "brian" && !ctx.examples.has("link.rsvp.brian")) {
          ctx.example("link.rsvp.brian", minted.plaintext);
        }
        if (!liveAllowed && position === 0 && !ctx.examples.has("link.rsvp.expired")) {
          ctx.example("link.rsvp.expired", minted.plaintext);
        }
      }

      // Questions answered by those who said yes to a game.
      if (spec.questions && answer === "yes") {
        spec.questions.forEach((question, questionIndex) => {
          add(
            "public.question_responses",
            {
              id: id("question_responses", labels.currentSeason, key, member.key, question.code),
              invitation_id: invitationId,
              event_id: eventId,
              event_question_id: question.id,
              answer_text: null,
              answer_boolean: (position + questionIndex) % 3 !== 0,
              answer_choice: null,
              raw_capture: null,
              responded_at: answeredAtFor(position),
            },
            "illustrative",
            { source: `question answer for ${key}` },
            ["question.answered"],
          );
        });
      }

      // The register.
      if (spec.register && concluded) {
        const roll2 = (position * 7 + events.length) % 20;
        let presence;
        if (finalAnswer === "yes")
          presence =
            roll2 < 13 ? "present" : roll2 < 15 ? "late" : roll2 < 17 ? "excused" : "absent";
        else if (finalAnswer === "no")
          presence = roll2 < 3 ? "present" : roll2 < 16 ? "absent" : "excused";
        else presence = roll2 < 8 ? "present" : roll2 < 15 ? "absent" : null;
        if (member.capacity === "committee" && spec.audience !== "committee") presence = null;
        if (presence) {
          add(
            "public.attendance_records",
            {
              id: id("attendance_records", labels.currentSeason, key, member.key),
              event_id: eventId,
              event_status: status,
              season_id: seasonId,
              capacity: member.capacity,
              season_membership_id: member.kind === "player" ? member.membershipId : null,
              person_id: member.kind === "player" ? null : member.personId,
              presence,
              recorded_at: addHours(startsAtIso, 3),
              recorded_by_person_id:
                reference.operators.find((o) => o.key === "coach")?.personId ?? actorPersonId,
            },
            "illustrative",
            { source: `register for ${key}` },
            [
              `attendance.${presence}`,
              ...(finalAnswer === "yes" && presence === "absent"
                ? ["attendance.said-yes-absent"]
                : []),
              ...(finalAnswer === "no" && presence === "present"
                ? ["attendance.said-no-attended"]
                : []),
            ],
          );
        }
      }
    });

    // A recruit captured at the door: present, never invited, on the board.
    if (spec.register && concluded && spec.recruits) {
      for (const recruit of recruits.filter((entry) => entry.walkUp)) {
        add(
          "public.attendance_records",
          {
            id: id("attendance_records", labels.currentSeason, key, "walkup", recruit.key),
            event_id: eventId,
            event_status: status,
            season_id: seasonId,
            capacity: "recruit",
            season_membership_id: null,
            person_id: recruit.personId,
            presence: "present",
            recorded_at: addHours(startsAtIso, 1),
            recorded_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `walk-up recruit at ${key}` },
          ["attendance.walk-up", "attendance.recruit"],
          "attendance.walk-up.recruit",
        );
      }
    }

    // Walk-ups: present, never in the audience.
    if (spec.register && concluded && spec.audience === "squad-30") {
      for (const player of squad.slice(30, 32)) {
        add(
          "public.attendance_records",
          {
            id: id("attendance_records", labels.currentSeason, key, "walkup", player.key),
            event_id: eventId,
            event_status: status,
            season_id: seasonId,
            capacity: "player",
            season_membership_id: player.membershipId,
            person_id: null,
            presence: "present",
            recorded_at: addHours(startsAtIso, 3),
            recorded_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `walk-up at ${key}` },
          ["attendance.walk-up"],
          !ctx.examples.has("attendance.walk-up") ? "attendance.walk-up" : null,
        );
      }
    }

    invitationsByEvent.set(eventId, record.invitations);
    return record;
  };

  // ---------------------------------------------------------------------------
  // Messaging: the frozen plan and the ladder
  // ---------------------------------------------------------------------------
  const jobs = [];

  const job = (columns, states = [], example = null) => {
    const row = {
      claimed_at: null,
      claimed_by: null,
      attempt_count: 0,
      last_error: null,
      template_variables: JSON.stringify({}),
      cancelled_reason: null,
      held_at: null,
      held_reason: null,
      held_by_person_id: null,
      next_attempt_at: null,
      ladder_rung: null,
      automatic_attempts: 0,
      ...columns,
    };
    add(
      "public.notification_jobs",
      row,
      "illustrative",
      { source: `messaging for ${columns._key}` },
      states,
      example,
    );
    delete row._key;
    jobs.push(row);
    return row;
  };

  const delivered = (theJob, channel, at_, attempt = 1, { manual = false } = {}) => {
    const provider = channel === "email" ? "resend" : "whatsapp-business";
    const messageId =
      channel === "email"
        ? id("provider-message", theJob.id, String(attempt))
        : `wamid.${id("provider-message", theJob.id, String(attempt)).replace(/-/g, "")}`;
    add(
      "public.delivery_results",
      {
        id: id("delivery_results", theJob.id, String(attempt)),
        notification_job_id: theJob.id,
        attempt_number: attempt,
        outcome: manual ? "manual" : "delivered",
        channel: manual ? "manual" : channel,
        provider: manual ? null : provider,
        provider_message_id: manual ? null : messageId,
        actor_person_id: manual ? actorPersonId : null,
        detail: manual
          ? "Posted by hand in the squad group after the automated send failed."
          : null,
        occurred_at: at_,
      },
      "illustrative",
      { source: "delivery result" },
      [manual ? "delivery.manual" : "delivery.delivered"],
    );
    if (!manual) {
      add(
        "public.delivery_attempts",
        {
          id: id("delivery_attempts", theJob.id, String(attempt)),
          notification_job_id: theJob.id,
          attempt_number: attempt,
          channel,
          provider,
          provider_message_id: messageId,
          requested_at: at_,
          accepted_at: at_,
          concluded_at: null,
          failure_reason: null,
        },
        "illustrative",
        { source: "delivery attempt" },
        ["delivery.attempt.accepted"],
      );
    }
  };

  const failed = (theJob, channel, from, count, reason, { rejected = false } = {}) => {
    const provider = channel === "email" ? "resend" : "whatsapp-business";
    for (let n = 1; n <= count; n += 1) {
      const when = addMinutes(from, BACKOFF_OFFSETS_MINUTES[n - 1] ?? 320);
      add(
        "public.delivery_results",
        {
          id: id("delivery_results", theJob.id, String(n)),
          notification_job_id: theJob.id,
          attempt_number: n,
          outcome: rejected ? "rejected" : "failed",
          channel,
          provider,
          provider_message_id: null,
          actor_person_id: null,
          detail: reason,
          occurred_at: when,
        },
        "illustrative",
        { source: "delivery result" },
        [rejected ? "delivery.rejected" : "delivery.failed"],
      );
      add(
        "public.delivery_attempts",
        {
          id: id("delivery_attempts", theJob.id, String(n)),
          notification_job_id: theJob.id,
          attempt_number: n,
          channel,
          provider,
          provider_message_id: null,
          requested_at: when,
          accepted_at: null,
          concluded_at: when,
          failure_reason: reason,
        },
        "illustrative",
        { source: "delivery attempt" },
        ["delivery.attempt.failed"],
      );
    }
  };

  const ladderFor = (record) => {
    const { spec, eventId, key, startsAtIso, schedule, approvedAt, invitations } = record;
    if (spec.ladder === "none" || !approvedAt || invitations.length === 0) return;
    const late = spec.ladder === "late";
    const deadlineAt = addHours(startsAtIso, -24 * schedule.rsvp_by_days);
    const invitationAt = late
      ? approvedAt
      : addHours(startsAtIso, -24 * schedule.invitation_lead_days);
    const escalationAt = late ? null : addHours(deadlineAt, schedule.escalation_hours);
    const whatsappScheduled = late ? 1 : schedule.whatsapp_reminder_count;
    const emailScheduled = late ? 0 : schedule.email_reminder_count;
    const recruitsInvited = invitations.some((entry) => entry.member.capacity === "recruit");

    add(
      "public.event_messaging_plans",
      {
        id: id("event_messaging_plans", labels.currentSeason, key),
        event_id: eventId,
        rsvp_by_days: schedule.rsvp_by_days,
        invitation_lead_days: schedule.invitation_lead_days,
        reminder_cadence_hours: schedule.reminder_cadence_hours,
        whatsapp_reminder_count: schedule.whatsapp_reminder_count,
        email_reminder_count: schedule.email_reminder_count,
        escalation_hours: schedule.escalation_hours,
        response_deadline_at: deadlineAt,
        invitation_at: invitationAt,
        escalation_at: escalationAt,
        dispatches_immediately: late,
        late_approval: late,
        whatsapp_reminders_scheduled: whatsappScheduled,
        email_reminders_scheduled: emailScheduled,
        frozen_at: approvedAt,
        frozen_by_person_id: actorPersonId,
        recruit_invitation_lead_days: recruitsInvited
          ? schedule.recruit_invitation_lead_days
          : null,
        recruit_follow_up_cadence_hours: recruitsInvited
          ? schedule.recruit_follow_up_cadence_hours
          : null,
        recruit_invitation_at: recruitsInvited ? invitationAt : null,
        recruit_dispatches_immediately: recruitsInvited ? late : null,
        recruit_follow_up_at: recruitsInvited
          ? addHours(invitationAt, schedule.recruit_follow_up_cadence_hours)
          : null,
      },
      "illustrative",
      { source: `messaging plan for ${key}` },
      ["plan.frozen", ...(late ? ["plan.late-approval"] : [])],
      late && !ctx.examples.has("plan.late-approval") ? "plan.late-approval" : null,
    );

    const story = spec.story ?? "plain";
    const cancelled = record.status === "cancelled";
    const held = spec.ladder === "held";
    // The event whose delivery page shows each failure, for the checklists.
    if (story === "genuine_failure") {
      ctx.example("event.job.failed.terminal", eventId);
      if (invitations.some((entry) => !entry.member.hasPhone))
        ctx.example("event.job.failed.no-route", eventId);
    }
    if (story === "whatsapp_carried_by_email") ctx.example("event.job.failed.whatsapp", eventId);
    if (story === "escalated") ctx.example("event.escalated", eventId);

    invitations.forEach((invitation, position) => {
      const { invitationId, member, answer } = invitation;
      const participantId = member.kind === "player" ? member.membershipId : member.personId;
      const rung0Key = `event:${eventId}:invitation:${member.capacity}:${participantId}`;
      const rung0 = {
        idempotency_key: rung0Key,
        job_type: "invitation",
        invitation_id: invitationId,
        event_id: eventId,
        person_id: member.personId,
        channel: "whatsapp",
        scheduled_for: invitationAt,
        ladder_rung: 0,
        created_at: approvedAt,
        updated_at: invitationAt,
        _key: key,
      };

      // Story-specific invitees.
      if (story === "genuine_failure" && position === 0) {
        const j = job(
          {
            ...rung0,
            id: id("notification_jobs", rung0Key),
            status: "failed",
            claimed_at: invitationAt,
            claimed_by: "system: automated delivery",
            attempt_count: 5,
            automatic_attempts: 5,
            last_error:
              "The provider refused this message five times. Somebody needs to read the reason before it is retried.",
          },
          ["job.failed.terminal"],
          "job.failed.terminal",
        );
        failed(j, "whatsapp", invitationAt, 5, j.last_error);
        return;
      }
      if (story === "genuine_failure" && !member.hasPhone) {
        const j = job(
          {
            ...rung0,
            id: id("notification_jobs", rung0Key),
            status: "failed",
            claimed_at: invitationAt,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
            last_error: NO_USABLE_NUMBER_REASON,
          },
          ["job.failed.no-route"],
          "job.failed.no-route",
        );
        failed(j, "whatsapp", invitationAt, 1, NO_USABLE_NUMBER_REASON, { rejected: true });
        return;
      }
      if (story === "whatsapp_carried_by_email" && position === 0) {
        const j = job(
          {
            ...rung0,
            id: id("notification_jobs", rung0Key),
            status: "failed",
            claimed_at: invitationAt,
            claimed_by: "system: automated delivery",
            attempt_count: 5,
            automatic_attempts: 5,
            last_error: "WhatsApp did not accept this message.",
          },
          ["job.failed.whatsapp"],
          "job.failed.whatsapp",
        );
        failed(j, "whatsapp", invitationAt, 5, j.last_error);
        const fallbackAt = addMinutes(invitationAt, 320);
        const fallback = job(
          {
            ...rung0,
            id: id("notification_jobs", `${rung0Key}:email-fallback`),
            idempotency_key: `${rung0Key}:email-fallback`,
            status: "completed",
            channel: "email",
            scheduled_for: fallbackAt,
            claimed_at: fallbackAt,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
            created_at: fallbackAt,
            updated_at: fallbackAt,
          },
          ["job.email-fallback"],
          "job.email-fallback",
        );
        delivered(fallback, "email", fallbackAt);
        return;
      }
      if (member.capacity === "recruit" && member.consent !== "granted") {
        // A recruit without consent is never messaged: refused at approval.
        const j = job(
          {
            ...rung0,
            id: id("notification_jobs", rung0Key),
            status: "failed",
            claimed_at: invitationAt,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
            last_error:
              "No messaging consent is recorded for this person this season, so nothing could be sent.",
          },
          ["job.failed.no-consent"],
          "job.failed.no-consent",
        );
        failed(j, "whatsapp", invitationAt, 1, j.last_error, { rejected: true });
        return;
      }

      // Rung 0 delivered — manually for one invitee of one event.
      const manual = story === "fully_delivered" && position === 5;
      const rung0Job = job(
        {
          ...rung0,
          id: id("notification_jobs", rung0Key),
          status: "completed",
          claimed_at: invitationAt,
          claimed_by: manual ? null : "system: automated delivery",
          attempt_count: 1,
          automatic_attempts: manual ? 0 : 1,
        },
        ["job.completed", "job.invitation"],
      );
      delivered(rung0Job, "whatsapp", invitationAt, 1, { manual });

      if (spec.ladder === "invitation-only" || member.capacity === "recruit") {
        if (member.capacity === "recruit" && !late) {
          // Recruits get one follow-up and no escalation.
          const followKey = `event:${eventId}:reminder:recruit:${invitationId}:1`;
          const followAt = addHours(invitationAt, schedule.recruit_follow_up_cadence_hours ?? 72);
          const fj = job(
            {
              ...rung0,
              id: id("notification_jobs", followKey),
              idempotency_key: followKey,
              job_type: "reminder",
              scheduled_for: followAt,
              ladder_rung: 1,
              status: answer ? "cancelled" : "completed",
              cancelled_reason: answer
                ? "The recruit answered, so this follow-up is no longer needed."
                : null,
              claimed_at: answer ? null : followAt,
              claimed_by: answer ? null : "system: automated delivery",
              attempt_count: answer ? 0 : 1,
              automatic_attempts: answer ? 0 : 1,
              updated_at: followAt,
            },
            ["job.recruit-follow-up"],
          );
          if (!answer) delivered(fj, "whatsapp", followAt);
        }
        return;
      }

      const rungs = [
        ...Array.from({ length: whatsappScheduled }, (_, n) => ({
          rung: n + 1,
          channel: "whatsapp",
        })),
        ...Array.from({ length: emailScheduled }, (_, n) => ({
          rung: whatsappScheduled + n + 1,
          channel: "email",
        })),
      ];
      const answeredAt = answer ? addHours(invitationAt, 12 + ((position * 5) % 70)) : null;

      for (const { rung, channel } of rungs) {
        const dueAt = addHours(invitationAt, rung * schedule.reminder_cadence_hours);
        const rungKey = `event:${eventId}:reminder:${member.capacity}:${participantId}:${rung}`;
        const base = {
          ...rung0,
          id: id("notification_jobs", rungKey),
          idempotency_key: rungKey,
          job_type: "reminder",
          channel,
          scheduled_for: dueAt,
          ladder_rung: rung,
          updated_at: dueAt,
        };

        if (cancelled && dueAt > spec.cancelledAt) {
          job(
            {
              ...base,
              status: "cancelled",
              cancelled_reason: "The event was cancelled before this reminder was due.",
            },
            ["job.cancelled.event"],
          );
          continue;
        }
        if (answeredAt && answeredAt < dueAt) {
          job(
            {
              ...base,
              status: "cancelled",
              cancelled_reason: "The invitee responded, so this reminder is no longer needed.",
            },
            ["job.cancelled.answered"],
            !ctx.examples.has("job.cancelled.answered") ? "job.cancelled.answered" : null,
          );
          continue;
        }
        if (held && dueAt >= spec.heldAt) {
          job(
            {
              ...base,
              status: "pending",
              held_at: spec.heldAt,
              held_reason: "The venue changed after this reminder was queued.",
              held_by_person_id: actorPersonId,
            },
            ["job.held"],
            !ctx.examples.has("job.held") ? "job.held" : null,
          );
          continue;
        }
        if (story === "genuine_failure" && position === 1 && rung === 2) {
          // Retries exhausted on a reminder rather than the invitation.
          const j = job(
            {
              ...base,
              status: "failed",
              claimed_at: dueAt,
              claimed_by: "system: automated delivery",
              attempt_count: 5,
              automatic_attempts: 5,
              last_error: "The provider is not responding.",
            },
            ["job.failed.terminal"],
          );
          failed(j, channel, dueAt, 5, j.last_error);
          continue;
        }
        const j = job(
          {
            ...base,
            status: "completed",
            claimed_at: dueAt,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
          },
          ["job.completed", channel === "email" ? "job.email-rung" : "job.reminder"],
        );
        delivered(j, channel, dueAt);
      }
    });

    // Cancellation notices, when the event was called off after publication.
    if (cancelled && !record.past) {
      invitations.forEach((invitation) => {
        const { member, invitationId } = invitation;
        const participantId = member.kind === "player" ? member.membershipId : member.personId;
        const noticeKey = `event:${eventId}:cancellation:${member.capacity}:${participantId}`;
        const j = job(
          {
            id: id("notification_jobs", noticeKey),
            idempotency_key: noticeKey,
            job_type: "cancellation_notice",
            invitation_id: invitationId,
            event_id: eventId,
            person_id: member.personId,
            channel: "whatsapp",
            scheduled_for: spec.cancelledAt,
            status: "completed",
            claimed_at: spec.cancelledAt,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
            created_at: spec.cancelledAt,
            updated_at: spec.cancelledAt,
            _key: key,
          },
          ["job.cancellation-notice"],
        );
        delivered(j, "whatsapp", spec.cancelledAt);
      });
    }

    // Schedule-change notices, when the amendment was notified.
    if (spec.amendment?.notified) {
      invitations.forEach((invitation) => {
        const { member, invitationId } = invitation;
        const participantId = member.kind === "player" ? member.membershipId : member.personId;
        const noticeKey = `event:${eventId}:schedule-change:${member.capacity}:${participantId}`;
        const j = job(
          {
            id: id("notification_jobs", noticeKey),
            idempotency_key: noticeKey,
            job_type: "schedule_change_notice",
            invitation_id: invitationId,
            event_id: eventId,
            person_id: member.personId,
            channel: "whatsapp",
            scheduled_for: spec.amendment.at,
            status: "completed",
            claimed_at: spec.amendment.at,
            claimed_by: "system: automated delivery",
            attempt_count: 1,
            automatic_attempts: 1,
            created_at: spec.amendment.at,
            updated_at: spec.amendment.at,
            _key: key,
          },
          ["job.schedule-change-notice"],
        );
        delivered(j, "whatsapp", spec.amendment.at);
      });
    }

    // The escalation: one job to the President, one flag per unanswered invitee.
    if (story === "escalated" && escalationAt) {
      const unanswered = invitations.filter(
        (entry) => !entry.answer && entry.member.capacity !== "recruit",
      );
      if (unanswered.length > 0) {
        const escalationKey = `event:${eventId}:escalation`;
        const escalation = job(
          {
            id: id("notification_jobs", escalationKey),
            idempotency_key: escalationKey,
            job_type: "escalation",
            invitation_id: null,
            event_id: eventId,
            person_id: presidentId,
            channel: "whatsapp",
            scheduled_for: escalationAt,
            status: "completed",
            claimed_at: escalationAt,
            claimed_by: "system: messaging scheduler",
            attempt_count: 1,
            automatic_attempts: 1,
            template_variables: JSON.stringify({ outstanding: unanswered.length }),
            created_at: escalationAt,
            updated_at: escalationAt,
            _key: key,
          },
          ["job.escalation"],
          !ctx.examples.has("job.escalation") ? "job.escalation" : null,
        );
        delivered(escalation, "whatsapp", escalationAt);
        unanswered.forEach((entry, position) => {
          const resolved = position % 3 === 0;
          add(
            "public.nonresponse_flags",
            {
              id: id("nonresponse_flags", labels.currentSeason, key, entry.member.key),
              invitation_id: entry.invitationId,
              threshold: "escalation",
              raised_at: escalationAt,
              escalation_job_id: escalation.id,
              resolved_at: resolved ? addHours(escalationAt, 3) : null,
              resolution: resolved ? "Spoke to them at training; they are coming." : null,
              resolved_by_person_id: resolved ? presidentId : null,
            },
            "illustrative",
            { source: `nonresponse flag for ${key}` },
            [resolved ? "flag.resolved" : "flag.raised"],
            !resolved && !ctx.examples.has("flag.raised") ? "flag.raised" : null,
          );
        });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // The calendar itself
  // ---------------------------------------------------------------------------
  const STORIES = [
    "fully_delivered",
    "escalated",
    "genuine_failure",
    "whatsapp_carried_by_email",
    "plain",
    "escalated",
  ];
  let approvedPast = 0;

  // Series instances across the window, by weekday. The instances that carry
  // a particular state are chosen by *rank* — the most recent past Sunday, the
  // first Wednesday a week out — never by a fixed offset, so the same states
  // exist whatever weekday the anchor falls on.
  const instancesOf = (seriesKey) => {
    const [, , , , , , seriesWeekday] = SERIES.find((entry) => entry[0] === seriesKey);
    const offsets = [];
    for (let offset = -56; offset <= 42; offset += 1) {
      if (weekdayOf(day(offset)) !== seriesWeekday) continue;
      if (seriesKey === "chalk" && Math.floor((offset + 56) / 7) % 2 === 1) continue;
      offsets.push(offset);
    }
    return offsets;
  };
  const sundays = instancesOf("sunday");
  const wednesdays = instancesOf("wednesday");
  const conditioning = instancesOf("conditioning");
  const pastOf = (offsets) => offsets.filter((offset) => offset < 0);
  const notHeldSunday = pastOf(sundays).at(-3);
  const silentSunday = pastOf(sundays).at(-1);
  const registerSunday = pastOf(sundays).at(-2);
  const cancelledWednesday = wednesdays.find((offset) => offset >= 7);
  const noRegisterSessions = new Set(pastOf(conditioning).slice(-2));

  for (const [seriesKey, name, eventType, venue, starts, ends, , mandatory] of SERIES) {
    for (const offset of instancesOf(seriesKey)) {
      const date = day(offset);
      const key = `${seriesKey}:${date}`;
      const online = seriesKey === "chalk";
      const past = offset < 0;
      const weekIndex = Math.floor((offset + 56) / 7);

      if (seriesKey === "sunday" && offset === notHeldSunday) {
        event({
          key,
          name,
          eventType,
          venue,
          startsAt: starts,
          endsAt: ends,
          offset,
          series: seriesKey,
          mandatory,
          status: "cancelled",
          audience: "squad",
          register: false,
          ladder: "invitation-only",
          decisionReason: "Pitch frozen; called off on the morning.",
          cancelledAt: at(offset, "08:30"),
          example: "event.cancelled.not-held",
        });
        continue;
      }
      if (seriesKey === "wednesday" && offset === cancelledWednesday) {
        event({
          key,
          name,
          eventType,
          venue,
          startsAt: starts,
          endsAt: ends,
          offset,
          series: seriesKey,
          mandatory,
          status: "cancelled",
          audience: "squad",
          ladder: "full",
          approvedAt: at(-14, "19:05"),
          decisionReason: "Coaching staff away at the BAFA conference.",
          cancelledAt: at(-3, "10:00"),
          example: "event.cancelled.after-publication",
        });
        continue;
      }
      if (past) {
        const recent = offset >= -35;
        const noRegister = noRegisterSessions.has(offset) && seriesKey === "conditioning";
        const amendedSilently = seriesKey === "sunday" && offset === silentSunday;
        event({
          key,
          name,
          eventType,
          venue,
          startsAt: starts,
          endsAt: amendedSilently ? "16:00" : ends,
          offset,
          series: seriesKey,
          mandatory,
          online,
          status: "approved",
          audience: seriesKey === "sunday" ? "squad-30" : "squad",
          register: !noRegister,
          ladder: recent ? "full" : "invitation-only",
          story:
            STORIES[
              (weekIndex + SERIES.findIndex((entry) => entry[0] === seriesKey)) % STORIES.length
            ],
          amendment: amendedSilently
            ? {
                at: at(offset - 2, "12:00"),
                notified: false,
                previous: { ends_at: ends },
                source: "venue",
              }
            : null,
          example: noRegister
            ? "event.occurred.no-register"
            : amendedSilently
              ? "event.amended.silent"
              : seriesKey === "sunday" && offset === registerSunday
                ? "event.occurred.register"
                : null,
          extraStates: amendedSilently ? ["event.amended.silent"] : [],
        });
        approvedPast += 1;
        continue;
      }
      if (offset <= 14) {
        event({
          key,
          name,
          eventType,
          venue,
          startsAt: starts,
          endsAt: ends,
          offset,
          series: seriesKey,
          mandatory,
          online,
          status: "draft",
          audience: "squad",
          confirmed: true,
          ladder: "none",
          example: "event.draft.audience-confirmed",
        });
        continue;
      }
      event({
        key,
        name,
        eventType,
        venue,
        startsAt: starts,
        endsAt: ends,
        offset,
        series: seriesKey,
        mandatory,
        online,
        status: "draft",
        audience: seriesKey === "sunday" ? "squad" : "none",
        confirmed: false,
        ladder: "none",
        example: seriesKey === "conditioning" ? "event.draft.no-audience" : null,
      });
    }
  }

  // Two imminent events, placed by offset rather than weekday so they exist
  // whatever day the anchor is: one approved at short notice with a compressed
  // plan whose rungs have all gone, and one amended after its reminders were
  // queued, so those reminders are held.
  event({
    key: "extra:kicking-clinic",
    offset: 1,
    name: "Kicking Clinic",
    eventType: "practice",
    venue: "University Parks",
    startsAt: "17:30",
    endsAt: "19:00",
    mandatory: false,
    status: "approved",
    audience: "squad",
    ladder: "late",
    story: "fully_delivered",
    approvedAt: at(-2, "19:05"),
    extraStates: ["event.approved.partial-responses"],
    example: "event.approved.late",
  });
  event({
    key: "extra:film-review",
    offset: 2,
    name: "Film Review",
    eventType: "chalk",
    venue: "Iffley Road",
    startsAt: "18:00",
    endsAt: "19:30",
    mandatory: false,
    status: "approved",
    audience: "squad",
    ladder: "held",
    story: "fully_delivered",
    approvedAt: at(-4, "19:05"),
    heldAt: at(-1, "09:30"),
    amendment: {
      at: at(-1, "09:30"),
      notified: true,
      previous: { venue: "Microsoft Teams" },
      source: "venue",
    },
    extraStates: ["event.amended.notified", "event.approved.partial-responses", "event.held"],
    example: "event.held",
  });

  // Fixtures, with transport questions.
  const questionsFor = (eventId, destination) =>
    [
      ["there", `Transport to ${destination}?`, true],
      ["back", `Transport back from ${destination}?`, false],
    ].map(([code, prompt, required], index) => ({
      code,
      id: add(
        "public.event_questions",
        {
          id: id("event_questions", labels.currentSeason, eventId, code),
          event_id: eventId,
          prompt,
          answer_type: "boolean",
          choices: null,
          applies_to_capacities: "{player,coach}",
          is_required: required,
          sort_order: index,
          from_template: false,
        },
        "illustrative",
        { source: "fixture transport question" },
        ["question.asked"],
      ),
    }));

  const fixtures = [
    {
      key: "game:home-1",
      offset: -35,
      name: "Lancers vs Cambridge Pythons",
      venue: "Iffley Road",
      competition: "BUCS Division 1",
      story: "fully_delivered",
      register: true,
    },
    {
      key: "game:away-1",
      offset: -14,
      name: "Lancers vs Nottingham Outlaws",
      venue: "Nottingham",
      competition: "BUCS Division 1",
      story: "escalated",
      register: true,
      amendment: {
        at: at(-20, "11:00"),
        notified: true,
        previous: { scheduled_on: day(-21), starts_at: "13:00", venue: "Away — TBC" },
        source: "league",
      },
    },
    {
      key: "game:home-2",
      offset: 5,
      name: "Lancers vs Loughborough Aces",
      venue: "Iffley Road",
      competition: "BUCS Division 1",
      status: "draft",
      confirmed: true,
    },
    {
      key: "game:away-2",
      offset: 21,
      name: "Lancers vs Birmingham Lions",
      venue: "Birmingham",
      competition: "BUCS Division 1",
      status: "draft",
      confirmed: false,
    },
  ];
  for (const fixture of fixtures) {
    const eventId = id("events", "scenario", labels.currentSeason, fixture.key);
    const questions = questionsFor(eventId, fixture.venue);
    event({
      ...fixture,
      eventType: "game",
      startsAt: "13:00",
      endsAt: "16:00",
      mandatory: true,
      status: fixture.status ?? "approved",
      audience: "squad",
      ladder: fixture.status ? "none" : "full",
      questions,
      equipment: "Full pads. Blue shirts.",
      extraStates: [...(fixture.amendment ? ["event.amended.notified"] : []), "event.questions"],
      example:
        fixture.key === "game:away-1"
          ? "event.amended.notified"
          : fixture.key === "game:home-2"
            ? "event.game.draft"
            : fixture.key === "game:home-1"
              ? "event.questions"
              : null,
    });
  }

  // Socials, one in an alternative group.
  event({
    key: "social:crewdate",
    offset: -24,
    name: "Michaelmas Crewdate",
    eventType: "social",
    venue: "Cowley Road",
    startsAt: "19:30",
    endsAt: "23:00",
    status: "approved",
    audience: "squad",
    ladder: "full",
    story: "fully_delivered",
    register: false,
  });
  event({
    key: "social:alt-a",
    offset: 12,
    name: "Curry Night — Thursday A",
    eventType: "social",
    venue: "Cowley Road",
    startsAt: "19:30",
    endsAt: "22:30",
    status: "draft",
    audience: "squad",
    confirmed: true,
    ladder: "none",
    groupId: socialGroupId,
    example: "event.alternative",
  });
  event({
    key: "social:alt-b",
    offset: 13,
    name: "Curry Night — Thursday B",
    eventType: "social",
    venue: "Cowley Road",
    startsAt: "19:30",
    endsAt: "22:30",
    status: "draft",
    audience: "none",
    confirmed: false,
    ladder: "none",
    groupId: socialGroupId,
  });
  event({
    key: "social:dinner",
    offset: 28,
    name: "Christmas Dinner",
    eventType: "social",
    venue: "Vincent's Club",
    startsAt: "19:00",
    endsAt: "23:30",
    status: "draft",
    audience: "none",
    confirmed: false,
    ladder: "none",
  });

  // Committee meetings: approved, committee audience, nobody solicited.
  event({
    key: "meeting:committee-1",
    offset: -28,
    name: "Committee Meeting",
    eventType: "meeting",
    venue: "Iffley Road",
    startsAt: "18:00",
    endsAt: "19:30",
    status: "approved",
    audience: "committee",
    ladder: "invitation-only",
    register: false,
    extraStates: ["event.non-soliciting"],
    example: "event.non-soliciting",
  });
  event({
    key: "meeting:committee-2",
    offset: -7,
    name: "Committee Meeting",
    eventType: "meeting",
    venue: "Iffley Road",
    startsAt: "18:00",
    endsAt: "19:30",
    status: "approved",
    audience: "committee",
    ladder: "invitation-only",
    register: true,
    extraStates: ["event.non-soliciting"],
  });
  event({
    key: "meeting:committee-3",
    offset: 1,
    name: "Committee Planning",
    eventType: "meeting",
    venue: "Vincent's Club",
    startsAt: "18:00",
    endsAt: "19:30",
    status: "approved",
    audience: "committee",
    ladder: "late",
    extraStates: ["event.non-soliciting"],
  });
  event({
    key: "meeting:agm",
    offset: 30,
    name: "Extraordinary General Meeting",
    eventType: "meeting",
    venue: "Iffley Road",
    startsAt: "18:00",
    endsAt: "20:00",
    status: "draft",
    audience: "none",
    confirmed: false,
    ladder: "none",
  });

  // Recruitment: one taster that happened, one social to approve.
  event({
    key: "recruitment:taster",
    offset: -49,
    name: "Rookie Taster Session",
    eventType: "recruitment",
    venue: "University Parks",
    startsAt: "11:00",
    endsAt: "13:00",
    status: "approved",
    audience: "squad-30",
    recruits: true,
    ladder: "full",
    story: "fully_delivered",
    register: true,
    headcount: 38,
    example: "event.recruitment.occurred",
  });
  event({
    key: "recruitment:social",
    offset: 9,
    name: "Recruitment Social",
    eventType: "recruitment",
    venue: "The Bear, Alfred Street",
    startsAt: "19:00",
    endsAt: "22:00",
    status: "draft",
    audience: "squad",
    recruits: true,
    confirmed: true,
    ladder: "none",
    headcount: null,
    example: "event.recruitment.draft",
  });

  // The term card: every entry a draft, exactly as an import leaves them.
  for (const entry of termCard) {
    event({
      key: `termcard:${entry.source.cell}`,
      eventId: entry.eventId,
      name: entry.name,
      eventType: entry.eventType,
      venue: entry.venue,
      scheduledOn: entry.scheduledOn,
      startsAt: entry.startsAt ?? "12:00",
      endsAt: entry.endsAt,
      status: "draft",
      audience: "none",
      confirmed: false,
      ladder: "none",
      mandatory: entry.eventType === "practice" || entry.eventType === "game",
      origin: entry.eventType === "game" ? "negotiated" : "club_controlled",
      termCard: true,
      week: entry.week,
      classification:
        entry.source.sheet === "synthetic term card" ? "illustrative" : "source-derived",
      source: {
        source: entry.source.sheet,
        cell: entry.source.cell,
        raw: entry.source.raw,
        note: [
          `classified by ${entry.source.matchedRule}`,
          ...entry.source.normalisation,
          entry.tentative ? "tentative in the source — never approved by the loader" : null,
        ]
          .filter(Boolean)
          .join("; "),
      },
      example: !ctx.examples.has("event.term-card") ? "event.term-card" : null,
    });
  }

  // Amendments recorded as schedule changes.
  for (const record of events) {
    const amendment = record.spec.amendment;
    if (!amendment) continue;
    add(
      "public.schedule_changes",
      {
        id: id("schedule_changes", labels.currentSeason, record.key),
        event_id: record.eventId,
        source: amendment.source,
        reason: amendment.notified
          ? "BUCS reallocated the fixture and swapped the venue."
          : "Ends half an hour earlier; nobody needed telling.",
        previous_scheduled_on: amendment.previous.scheduled_on ?? record.scheduledOn,
        new_scheduled_on: record.scheduledOn,
        previous_starts_at: amendment.previous.starts_at ?? record.spec.startsAt,
        new_starts_at: record.spec.startsAt,
        previous_ends_at: amendment.previous.ends_at ?? record.spec.endsAt ?? null,
        new_ends_at: record.spec.endsAt ?? null,
        previous_venue: amendment.previous.venue ?? record.spec.venue ?? null,
        new_venue: record.spec.venue ?? null,
        previous_name: record.spec.name,
        new_name: record.spec.name,
        previous_opponent: null,
        new_opponent: null,
        notified: amendment.notified,
        changed_at: amendment.at,
        recorded_by_person_id: actorPersonId,
        approved_by_person_id: actorPersonId,
      },
      "illustrative",
      { source: `amendment of ${record.key}` },
      [amendment.notified ? "amendment.notified" : "amendment.silent"],
    );
  }

  // Club links: live on the next held event and the last home game, revoked on one.
  const clubLinkFor = (record, { revoked = false, example = null } = {}) => {
    const minted = mintToken("club_link_tokens", record.key);
    add(
      "public.club_link_tokens",
      {
        id: id("club_link_tokens", labels.currentSeason, record.key, revoked ? "revoked" : "live"),
        event_id: record.eventId,
        token_hash: minted.hash,
        issued_at: record.approvedAt ?? at(-1, "10:00"),
        issued_by_person_id: actorPersonId,
        revoked_at: revoked ? addHours(record.approvedAt, 48) : null,
        revoked_reason: revoked ? "Shared too widely; reissued." : null,
        last_used_at: revoked ? addHours(record.approvedAt, 24) : null,
        use_count: revoked ? 3 : 0,
      },
      "illustrative",
      { source: `club link for ${record.key}` },
      [revoked ? "club-link.revoked" : "club-link.live"],
      example,
    );
    if (!revoked) ctx.example(`link.club.${record.key}`, minted.plaintext);
    return minted;
  };
  const heldEvent = events.find((record) => record.spec.ladder === "held");
  const homeGame = events.find((record) => record.key === "game:home-1");
  if (heldEvent) clubLinkFor(heldEvent, { example: "club-link.live" });
  if (homeGame) {
    clubLinkFor(homeGame, { revoked: true, example: "club-link.revoked" });
    const minted = mintToken("club_link_tokens", homeGame.key, "reissued");
    add(
      "public.club_link_tokens",
      {
        id: id("club_link_tokens", labels.currentSeason, homeGame.key, "reissued"),
        event_id: homeGame.eventId,
        token_hash: minted.hash,
        issued_at: addHours(homeGame.approvedAt, 49),
        issued_by_person_id: actorPersonId,
        revoked_at: null,
        revoked_reason: null,
        last_used_at: addHours(homeGame.approvedAt, 60),
        use_count: 4,
      },
      "illustrative",
      { source: `reissued club link for ${homeGame.key}` },
      ["club-link.live"],
    );
    ctx.example("link.club.game:home-1", minted.plaintext);
  }

  // Ladders, now that every event and invitation exists.
  for (const record of events) ladderFor(record);

  return { events, jobs, invitationsByEvent, squad, staffInvitees, heldEvent, approvedPast };
}
