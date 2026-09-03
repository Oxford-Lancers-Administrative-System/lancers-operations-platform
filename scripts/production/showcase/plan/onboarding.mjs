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
import { ONBOARDING_TYPES } from "./reference.mjs";
import { addHours } from "./context.mjs";

const STORY_ITEMS = Object.freeze({
  fresh: { season_welcome_consent: "invited" },
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
    photo: "waived",
    comms_groups: "complete",
    contact_academic_details: "complete",
    code_of_conduct: "complete",
    photo_release: "complete",
    season_welcome_consent: "complete",
  },
  refused: {},
  recruit: { season_welcome_consent: "invited" },
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
      [`onboarding.log.${kind}`],
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
        itemStatus = "complete";
        if (code === "hudl_access" && index % 7 === 0) itemStatus = "waived";
        if (code === "subs_paid" && index % 11 === 3) itemStatus = "not_applicable";
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
      if (
        story !== "refused" &&
        (activated || story !== "fresh" || code === "season_welcome_consent")
      ) {
        if (itemStatus !== "pending")
          history(itemId, membershipId, "pending", "invited", "system", null, welcomeAt);
      }
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
          "invited",
          "complete",
          byPlayer ? "player" : "operator",
          byPlayer ? personId : actorPersonId,
          when,
        );
        if (byPlayer) log(membershipId, code, "answer", "web", { personId }, when, key);
      } else if (itemStatus === "claimed") {
        history(itemId, membershipId, "invited", "claimed", "player", personId, when);
        log(membershipId, code, "answer", "web", { personId }, when, key);
      } else if (itemStatus === "waived") {
        history(itemId, membershipId, "invited", "waived", "operator", actorPersonId, when, null);
      } else if (itemStatus === "not_applicable") {
        history(
          itemId,
          membershipId,
          "invited",
          "not_applicable",
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
          channel: "whatsapp",
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
          channel: "whatsapp",
          provider: "whatsapp-business",
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
          channel: "whatsapp",
          provider: "whatsapp-business",
          provider_message_id: messageId,
          actor_person_id: null,
          detail: null,
          occurred_at: welcomeAt,
        },
        "illustrative",
        { source: `onboarding welcome for ${key}` },
        ["delivery.delivered"],
      );
      log(membershipId, "welcome", "ask", "whatsapp", { label: "the club" }, welcomeAt, key);
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

  // Disputed facts: one open, one resolved each way.
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

  // Brian's own durable player page, live — the one player-side link a tester
  // can open. Permitted because he is named in the parameters.
  const brian = reference.operators.find((operator) => operator.key === "brian");
  if (brian && (ctx.params.liveLinksFor ?? ["brian", "stewart"]).includes("brian")) {
    const minted = ctx.mintToken("person_access_tokens", "durable", "brian");
    add(
      "public.person_access_tokens",
      {
        id: id("person_access_tokens", labels.currentSeason, "durable", "brian"),
        person_id: brian.personId,
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
      { source: "Brian's own player page link" },
      ["token.durable.live"],
      "token.durable.live.brian",
    );
    ctx.example("link.me.brian", minted.plaintext);
  }

  return { memberships };
}
