/**
 * Onboarding at every stage — LAN-221.
 *
 * Every current membership carries the full eleven-item checklist. Activated
 * players are mostly complete, with a reason-free waiver, a not-applicable
 * subscription and one active player with an item still open (the normal case
 * — nothing gates). The five players still onboarding each tell one story:
 * fresh, midway, disputed, ready to activate, refused consent. The flipped
 * recruit's membership is a sixth, landing exactly as W3 describes.
 *
 * Every transition is in `onboarding_item_history`, every ask and answer in
 * `onboarding_activity_log`, every signed document in `onboarding_agreements`.
 *
 * What is **not** here, and arrives with Mission 7's remaining packages
 * (LAN-215–218): the automated chase's own messages, an exhausted chase and
 * its escalation, the player's own live welcome link, and the nudge. The
 * verifier marks those states `arrives-with`.
 */

import { id } from "../ids.mjs";
import { ONBOARDING_TYPES, OPERATOR_KEYS } from "./reference.mjs";
import { addHours } from "./context.mjs";

/**
 * Where each item lands once a player is activated.
 *
 * `src/lib/services/onboarding-item-shapes.ts` owns the closed list per item
 * and `itemStateLabel` throws on anything outside it, so this table exists to
 * stay inside those lists rather than assume a shared `complete`.
 * `tests/showcase-plan.test.ts` imports `allowedItemStates` and fails if this
 * or `STORY_ITEMS` ever drifts from the application's own rules.
 */
/**
 * The items whose own list contains `invited`. Everything else goes straight
 * from `pending` to its settled state, because an `invited` history row on an
 * item that cannot be invited is the same defect as an `invited` item: the
 * history panel labels every transition through `itemStateLabel`, which throws.
 */
const INVITABLE = new Set(["comms_groups", "hudl_access", "bucs_play"]);

const SETTLED_STATE = Object.freeze({
  // Its list is pending → invited → claimed. There is no `complete`.
  hudl_access: "claimed",
  comms_groups: "complete",
});

const STORY_ITEMS = Object.freeze({
  // `season_welcome_consent` is a derived item: its list is the plain
  // pending/complete binary, with no `invited`. "Welcome sent, nothing back
  // yet" is `pending` — the welcome itself is the notification job and the
  // activity-log ask, not a third state on the item.
  fresh: { season_welcome_consent: "pending" },
  midway: {
    contact_academic_details: "complete",
    code_of_conduct: "complete",
    bucs_play: "claimed",
    hudl_access: "invited",
    subs_invoiced: "complete",
    comms_groups: "complete",
    season_welcome_consent: "complete",
  },
  disputed: {
    contact_academic_details: "complete",
    code_of_conduct: "complete",
    photo_release: "complete",
    subs_invoiced: "complete",
    season_welcome_consent: "complete",
  },
  ready: {
    subs_invoiced: "complete",
    subs_paid: "complete",
    kit_sorted: "complete",
    bucs_play: "claimed",
    hudl_access: "claimed",
    photo: "complete",
    comms_groups: "complete",
    contact_academic_details: "complete",
    code_of_conduct: "complete",
    photo_release: "complete",
    season_welcome_consent: "complete",
  },
  refused: {},
  recruit: { season_welcome_consent: "pending" },
});

export function buildOnboarding(ctx, reference, people, recruitment) {
  const { add, labels, at, existing } = ctx;
  const { seasonId, actorPersonId, onboardingTypeIds } = reference;
  const agreementVersions = existing.agreementVersions ?? new Map();

  const memberships = [
    ...people.players.map((player) => ({
      key: player.key,
      membershipId: player.membershipId,
      personId: player.personId,
      status: player.status,
      story: player.onboardingStory,
      index: player.index,
      createdAt: at(-55 + (player.index % 8), "09:00"),
    })),
    ...recruitment.recruits
      .filter((recruit) => recruit.status === "joined")
      .map((recruit) => ({
        key: `recruit:${recruit.key}`,
        membershipId: id("season_memberships", labels.currentSeason, `recruit:${recruit.key}`),
        personId: recruit.personId,
        status: "onboarding",
        story: "recruit",
        index: 99,
        createdAt: at(-37, "10:00"),
      })),
    // Every seat is a player too, so its own link opens onto a form with
    // something left to answer rather than a 404.
    ...people.seatPlayers.map((seat, position) => ({
      ...seat,
      createdAt: at(-30 + position, "09:00"),
    })),
  ];

  const history = (
    itemId,
    membershipId,
    from,
    to,
    actorKind,
    actorPersonId_,
    when,
    reason = null,
  ) =>
    add(
      "public.onboarding_item_history",
      {
        id: id("onboarding_item_history", itemId, to, when),
        onboarding_item_id: itemId,
        season_membership_id: membershipId,
        from_status: from,
        to_status: to,
        actor_kind: actorKind,
        actor_person_id: actorKind === "system" ? null : actorPersonId_,
        reason,
        occurred_at: when,
      },
      "illustrative",
      { source: "onboarding item history" },
      [`onboarding.history.${to}`],
    );

  const log = (membershipId, section, kind, channel, actor, when, key) =>
    add(
      "public.onboarding_activity_log",
      {
        id: id("onboarding_activity_log", membershipId, section, kind, when),
        season_membership_id: membershipId,
        season_id: seasonId,
        section,
        kind,
        channel,
        actor_person_id: actor?.personId ?? null,
        actor_label: actor?.label ?? null,
        occurred_at: when,
      },
      "illustrative",
      { source: `onboarding activity for ${key}` },
      [
        `onboarding.log.${kind}`,
        // The player's own submission, as against an operator recording it.
        ...(kind === "answer" && channel === "signed link" ? ["onboarding.ask.submitted"] : []),
      ],
    );

  for (const membership of memberships) {
    const { key, membershipId, personId, status, story, index, createdAt } = membership;
    const activated = status !== "onboarding";
    const welcomeAt = addHours(createdAt, 1);
    let open = 0; // pending or invited — nothing back yet
    let awaiting = 0; // claimed — the player's word, awaiting a human

    for (const [code, , isRequired] of ONBOARDING_TYPES) {
      const type = onboardingTypeIds.get(code);
      let itemStatus;
      if (activated) {
        // The settled state for an activated player, per item. Not a blanket
        // `complete`: `hudl_access` has no `complete` at all — its list ends at
        // `claimed` — and `itemStateLabel` throws on a state an item cannot
        // occupy, which took out the roster board and every player record.
        //
        // The variations below stay inside each item's own list.
        // `waived` is legal on Subscription paid and nowhere else, and
        // `not_applicable` is legal nowhere, so the two overrides that used
        // those moved to the one item that can hold `waived`.
        itemStatus = SETTLED_STATE[code] ?? "complete";
        if (code === "subs_paid" && index % 7 === 0) itemStatus = "waived";
        if (code === "photo" && index % 9 === 5) itemStatus = "pending";
        if (code === "bucs_play" && index % 10 === 7) itemStatus = "claimed";
      } else {
        itemStatus = STORY_ITEMS[story]?.[code] ?? "pending";
      }
      if (["pending", "invited"].includes(itemStatus)) open += 1;
      if (itemStatus === "claimed") awaiting += 1;

      const completedOn =
        itemStatus === "complete" ? addHours(welcomeAt, 24 * (2 + (index % 9))).slice(0, 10) : null;
      const itemId = add(
        "public.onboarding_items",
        {
          id: id("onboarding_items", labels.currentSeason, key, code),
          season_membership_id: membershipId,
          season_id: seasonId,
          item_type_id: type.id,
          status: itemStatus,
          completed_on: completedOn,
          waived_reason: null,
          waived_by_person_id: itemStatus === "waived" ? actorPersonId : null,
          updated_at:
            itemStatus === "pending" ? createdAt : addHours(welcomeAt, 24 * (2 + (index % 9))),
        },
        "illustrative",
        { source: `onboarding item ${code} for ${key}` },
        [`onboarding.item.${itemStatus}`, ...(isRequired ? [] : ["onboarding.item.optional"])],
        !ctx.examples.has(`onboarding.item.${itemStatus}`) ? `onboarding.item.${itemStatus}` : null,
      );

      // History: created pending; invited when the welcome went; then wherever
      // it ended up, by whoever moved it.
      history(itemId, membershipId, null, "pending", "system", null, createdAt);
      const invitable = INVITABLE.has(code);
      if (
        story !== "refused" &&
        (activated || story !== "fresh" || code === "season_welcome_consent")
      ) {
        if (itemStatus !== "pending" && invitable)
          history(itemId, membershipId, "pending", "invited", "system", null, welcomeAt);
      }
      // What the settled transition came *from*: `invited` only where that is a
      // state this item can occupy, otherwise straight from `pending`.
      const from = invitable ? "invited" : "pending";
      const when = addHours(welcomeAt, 24 * (2 + (index % 9)));
      if (itemStatus === "complete") {
        const byPlayer = [
          "contact_academic_details",
          "code_of_conduct",
          "photo_release",
          "season_welcome_consent",
        ].includes(code);
        history(
          itemId,
          membershipId,
          from,
          "complete",
          byPlayer ? "player" : "operator",
          byPlayer ? personId : actorPersonId,
          when,
        );
        // `signed link` is the channel `player-questionnaire.ts` writes for
        // every step a player saves through `/me/<token>/details`, and the
        // channel it reads back to decide whether the player claimed a thing
        // themselves. An operator recording the same fact writes `web`, so the
        // two have to stay distinguishable — half of these are each.
        if (byPlayer)
          log(
            membershipId,
            code,
            "answer",
            index % 2 === 0 ? "signed link" : "web",
            { personId },
            when,
            key,
          );
      } else if (itemStatus === "claimed") {
        history(itemId, membershipId, from, "claimed", "player", personId, when);
        log(membershipId, code, "answer", "signed link", { personId }, when, key);
      } else if (itemStatus === "waived") {
        history(
          itemId,
          membershipId,
          from,
          "waived",
          "operator",
          actorPersonId,
          when,
          "Hardship fund covers the subscription this season.",
        );
      }

      // Signed documents.
      if (itemStatus === "complete" && (code === "code_of_conduct" || code === "photo_release")) {
        const versionId = agreementVersions.get(code);
        if (versionId) {
          add(
            "public.onboarding_agreements",
            {
              id: id("onboarding_agreements", labels.currentSeason, key, code),
              person_id: personId,
              season_id: seasonId,
              agreement_type: code,
              agreement_version_id: versionId,
              agreed_at: when,
            },
            "illustrative",
            { source: `${code} agreed by ${key}` },
            [`onboarding.agreement.${code}`],
          );
        }
      }
    }

    // The welcome: one job, one ask in the log — never for the refused.
    if (story !== "refused") {
      const welcomeKey = `onboarding-welcome:${membershipId}`;
      const jobId = add(
        "public.notification_jobs",
        {
          id: id("notification_jobs", welcomeKey),
          idempotency_key: welcomeKey,
          job_type: "other",
          status: "completed",
          invitation_id: null,
          event_id: null,
          person_id: personId,
          channel: "sms",
          scheduled_for: welcomeAt,
          claimed_at: welcomeAt,
          claimed_by: "system: automated delivery",
          attempt_count: 1,
          last_error: null,
          template_variables: JSON.stringify({}),
          cancelled_reason: null,
          created_at: createdAt,
          updated_at: welcomeAt,
          held_at: null,
          held_reason: null,
          held_by_person_id: null,
          next_attempt_at: null,
          ladder_rung: null,
          automatic_attempts: 1,
        },
        "illustrative",
        { source: `onboarding welcome for ${key}` },
        ["job.onboarding-welcome", "job.completed"],
        !ctx.examples.has("job.onboarding-welcome") ? "job.onboarding-welcome" : null,
      );
      const messageId = `wamid.${id("provider-message", jobId, "1").replace(/-/g, "")}`;
      add(
        "public.delivery_attempts",
        {
          id: id("delivery_attempts", jobId, "1"),
          notification_job_id: jobId,
          attempt_number: 1,
          channel: "sms",
          provider: "twilio_sms",
          provider_message_id: messageId,
          requested_at: welcomeAt,
          accepted_at: welcomeAt,
          concluded_at: null,
          failure_reason: null,
        },
        "illustrative",
        { source: `onboarding welcome for ${key}` },
        ["delivery.attempt.accepted"],
      );
      add(
        "public.delivery_results",
        {
          id: id("delivery_results", jobId, "1"),
          notification_job_id: jobId,
          attempt_number: 1,
          outcome: "delivered",
          channel: "sms",
          provider: "twilio_sms",
          provider_message_id: messageId,
          actor_person_id: null,
          detail: null,
          occurred_at: welcomeAt,
        },
        "illustrative",
        { source: `onboarding welcome for ${key}` },
        ["delivery.delivered"],
      );
      log(membershipId, "welcome", "ask", "sms", { label: "the club" }, welcomeAt, key);
    }

    if (!activated) {
      ctx.tag(
        open === 0 ? "onboarding.membership.ready" : "onboarding.membership.outstanding",
        membershipId,
      );
      if (story === "ready") ctx.example("onboarding.membership.ready", membershipId);
      if (story === "midway") ctx.example("onboarding.membership.outstanding", membershipId);
      if (story === "fresh") ctx.example("onboarding.membership.fresh", membershipId);
      if (story === "refused") {
        ctx.tag("onboarding.membership.refused", membershipId);
        ctx.example("onboarding.membership.refused", membershipId);
      }
    } else if (status === "active" && open + awaiting > 0) {
      ctx.tag("onboarding.membership.active-with-outstanding", membershipId);
      if (!ctx.examples.has("onboarding.membership.active-with-outstanding"))
        ctx.example("onboarding.membership.active-with-outstanding", membershipId);
    }
  }

  // ---------------------------------------------------------------------------
  // The automated chase, its ceiling, the escalation and an operator's nudge
  // ---------------------------------------------------------------------------
  //
  // `onboarding-chase.ts` keeps the whole state machine as idempotency-key
  // shapes rather than columns, and derives everything else from delivery
  // results: `onboarding-chase:<membership>:<n>` is the nth automated follow-up,
  // `onboarding-chase-exhausted:<membership>` is the marker that says the office
  // has already been told, and `onboarding-nudge:<membership>:<nonce>` is an
  // operator pressing Nudge, which is unlimited and outside the cap.
  //
  // Written as concluded rows, never offered to a provider — the same way
  // `scripts/seed-onboarding-chase.mjs` writes these states locally. Two
  // memberships get the full story so W8 and W9 have a row each rather than
  // contending over one, and both are reachable: `chase-presentation.ts` shows
  // "No phone number on file" instead of "Chase exhausted" the moment a person
  // has no number, and refuses the nudge, so an unreachable one would prove
  // the wrong thing.
  const chaseSettings = ctx.existing.chaseSettings ?? { chase_count: 4, chase_interval_days: 3 };
  const chased = memberships
    .filter((membership) => membership.status === "onboarding" && membership.story !== "refused")
    .slice(0, 2);

  const concludedJob = (key, personId, when, states, exampleKey = null) => {
    const jobId = add(
      "public.notification_jobs",
      {
        id: id("notification_jobs", key),
        idempotency_key: key,
        job_type: "other",
        status: "completed",
        invitation_id: null,
        event_id: null,
        person_id: personId,
        channel: "sms",
        scheduled_for: when,
        claimed_at: when,
        claimed_by: "system: automated delivery",
        attempt_count: 1,
        last_error: null,
        template_variables: JSON.stringify({}),
        cancelled_reason: null,
        created_at: when,
        updated_at: when,
        held_at: null,
        held_reason: null,
        held_by_person_id: null,
        next_attempt_at: null,
        ladder_rung: null,
        automatic_attempts: 1,
      },
      "illustrative",
      { source: `onboarding ${key.split(":")[0]}` },
      ["job.completed", ...states],
      exampleKey,
    );
    return jobId;
  };

  const deliveredAttempt = (jobId, when) => {
    const messageId = `wamid.${id("provider-message", jobId, "1").replace(/-/g, "")}`;
    add(
      "public.delivery_attempts",
      {
        id: id("delivery_attempts", jobId, "1"),
        notification_job_id: jobId,
        attempt_number: 1,
        channel: "sms",
        provider: "twilio_sms",
        provider_message_id: messageId,
        requested_at: when,
        accepted_at: when,
        concluded_at: when,
        failure_reason: null,
      },
      "illustrative",
      { source: "onboarding chase" },
      ["delivery.attempt.accepted"],
    );
    add(
      "public.delivery_results",
      {
        id: id("delivery_results", jobId, "1"),
        notification_job_id: jobId,
        attempt_number: 1,
        outcome: "delivered",
        channel: "sms",
        provider: "twilio_sms",
        provider_message_id: messageId,
        actor_person_id: null,
        detail: null,
        occurred_at: when,
      },
      "illustrative",
      { source: "onboarding chase" },
      ["delivery.delivered"],
    );
  };

  for (const [position, membership] of chased.entries()) {
    const { membershipId, personId, key } = membership;
    const firstChaseAt = addHours(membership.createdAt, 24 * 7);

    // `chase_count` delivered follow-ups: the ceiling `deliveredCount` reads,
    // which is what makes the queue say "Chase exhausted" rather than showing
    // another one due.
    for (let attempt = 1; attempt <= chaseSettings.chase_count; attempt += 1) {
      const when = addHours(firstChaseAt, 24 * chaseSettings.chase_interval_days * (attempt - 1));
      const jobId = concludedJob(
        `onboarding-chase:${membershipId}:${attempt}`,
        personId,
        when,
        attempt === chaseSettings.chase_count ? ["onboarding.chase.exhausted"] : [],
        attempt === chaseSettings.chase_count && position === 0
          ? "onboarding.membership.exhausted"
          : null,
      );
      deliveredAttempt(jobId, when);
      log(membershipId, "chase", "ask", "sms", { label: "the club" }, when, key);
    }

    // The marker, so this membership reads as *already* escalated once, in the
    // past — not as a pending exhaustion the next real sweep tick would
    // discover and escalate again, folding whatever else has since exhausted
    // into the same batch.
    const escalatedAt = addHours(
      firstChaseAt,
      24 * chaseSettings.chase_interval_days * (chaseSettings.chase_count - 1) + 1,
    );
    concludedJob(
      `onboarding-chase-exhausted:${membershipId}`,
      personId,
      escalatedAt,
      ["onboarding.escalation.sent"],
      position === 0 ? "onboarding.escalation.first" : null,
    );
    // W9's own record. The escalation message has no screen of its own; what
    // happened is still worth a line on the person who triggered it.
    log(
      membershipId,
      "chase",
      "ask",
      "system",
      { label: "Exhausted — stopped, and escalated" },
      escalatedAt,
      key,
    );

    // An operator pressing Nudge afterwards: a different key, outside the cap,
    // and the reason the queue keeps an active Nudge button on an exhausted
    // row that is still reachable.
    const nudgeAt = addHours(escalatedAt, 26);
    concludedJob(
      `onboarding-nudge:${membershipId}:${id("nudge", membershipId).slice(0, 8)}`,
      personId,
      nudgeAt,
      ["onboarding.nudge.sent"],
      position === 0 ? "onboarding.membership.nudged" : null,
    );
    log(membershipId, "chase", "ask", "operator nudge", { personId: actorPersonId }, nudgeAt, key);
  }

  // Disputed facts: one open, one resolved each way.
  // Five open disputes, one per seat: settling a disputed fact resolves it, so
  // five testers pointed at one dispute means four find it already settled.
  for (const [offset, index] of [30, 31, 32, 44, 45].entries()) {
    const player = people.players[index];
    if (!player) continue;
    add(
      "public.person_fact_disputes",
      {
        id: id("person_fact_disputes", labels.currentSeason, player.key, "date_of_birth"),
        person_id: player.personId,
        field: "date_of_birth",
        club_value: "2004-06-14",
        player_value: `2004-06-0${offset + 1}`,
        raised_by_person_id: player.personId,
        raised_at: at(-3 - offset, "21:15"),
        status: "open",
        resolution_note: null,
        resolved_by_person_id: null,
        resolved_at: null,
      },
      "illustrative",
      { source: `disputed fact on ${player.key}` },
      ["dispute.open"],
    );
    ctx.example("person.disputed", player.personId);
  }

  const disputed = people.players[33];
  const keptClub = people.players[4];
  const tookPlayer = people.players[5];
  add(
    "public.person_fact_disputes",
    {
      id: id("person_fact_disputes", labels.currentSeason, disputed.key, "date_of_birth"),
      person_id: disputed.personId,
      field: "date_of_birth",
      club_value: "2004-06-14",
      player_value: "2004-06-04",
      raised_by_person_id: disputed.personId,
      raised_at: at(-3, "21:15"),
      status: "open",
      resolution_note: null,
      resolved_by_person_id: null,
      resolved_at: null,
    },
    "illustrative",
    { source: `disputed fact on ${disputed.key}` },
    ["dispute.open"],
    "dispute.open",
  );
  ctx.example("person.disputed", disputed.personId);
  add(
    "public.person_fact_disputes",
    {
      id: id("person_fact_disputes", labels.currentSeason, keptClub.key, "college"),
      person_id: keptClub.personId,
      field: "college",
      club_value: "Balliol",
      player_value: "Baliol",
      raised_by_person_id: keptClub.personId,
      raised_at: at(-30, "19:00"),
      status: "resolved_kept_club",
      resolution_note: "Spelling; the club's value stands.",
      resolved_by_person_id: actorPersonId,
      resolved_at: at(-29, "09:30"),
    },
    "illustrative",
    { source: `resolved dispute on ${keptClub.key}` },
    ["dispute.resolved"],
  );
  add(
    "public.person_fact_disputes",
    {
      id: id("person_fact_disputes", labels.currentSeason, tookPlayer.key, "degree_field"),
      person_id: tookPlayer.personId,
      field: "degree_field",
      club_value: "Physics",
      player_value: "Physics and Philosophy",
      raised_by_person_id: tookPlayer.personId,
      raised_at: at(-25, "18:00"),
      status: "resolved_took_player",
      resolution_note: null,
      resolved_by_person_id: actorPersonId,
      resolved_at: at(-24, "10:00"),
    },
    "illustrative",
    { source: `resolved dispute on ${tookPlayer.key}` },
    ["dispute.resolved"],
  );

  // One live player-side link per seat. Every tester walks W4 and W5, and
  // `verify` refuses a live player link for anybody who is not a named seat —
  // so this mints one for each seat in `liveLinksFor` rather than sharing a
  // single link, which would also mean five people editing one person's
  // answers.
  const liveFor = ctx.params.liveLinksFor ?? OPERATOR_KEYS;
  for (const operator of reference.operators) {
    if (!liveFor.includes(operator.key)) continue;
    const minted = ctx.mintToken("person_access_tokens", "durable", operator.key);
    add(
      "public.person_access_tokens",
      {
        id: id("person_access_tokens", labels.currentSeason, "durable", operator.key),
        person_id: operator.personId,
        season_id: seasonId,
        token_hash: minted.hash,
        single_use: false,
        single_use_at: null,
        issued_at: at(-10, "09:00"),
        issued_by_person_id: actorPersonId,
        revoked_at: null,
        revoked_reason: null,
        last_used_at: null,
        use_count: 0,
        purpose: null,
      },
      "illustrative",
      { source: `the player-side link handed out with ${operator.key}'s list` },
      // `token.onboarding.live` as well: each seat holds a membership at
      // `onboarding` with a checklist still open (`people.mjs`), so the link
      // lands on the five-step form rather than the already-complete page.
      ["token.durable.live", "token.onboarding.live"],
    );
    ctx.example("link.me.player", minted.plaintext);
  }

  return { memberships };
}
