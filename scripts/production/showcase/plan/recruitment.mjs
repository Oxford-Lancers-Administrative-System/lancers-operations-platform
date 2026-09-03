/**
 * Recruits at every funnel stage — LAN-221.
 *
 * Fourteen invented prospects across all seven statuses: a QR self sign-up, a
 * walk-up captured at the taster, a possible duplicate of a squad member, the
 * engaged, the committed, one flipped to joined and landing in onboarding, and
 * every exit. Each carries the machinery around it — status history, notes,
 * questionnaire answers, the recruitment cycle's messages as delivered, and
 * spent interest links — so the board, the record and the report all read.
 */

import { id } from "../ids.mjs";
import { dramaPhone, exampleEmail } from "./context.mjs";

const RECRUITS = Object.freeze([
  // key, given, family, status, source, firstContactOffset, consent, door
  [
    "r01",
    "Persephone",
    "Wilding",
    "identified",
    "QR sign-up at the Freshers' Fair",
    -48,
    "granted",
    "qr",
  ],
  [
    "r02",
    "Tobias",
    "Wrenfield",
    "identified",
    "Walk-on at Rookie Taster Session",
    -49,
    "granted",
    "walk-up",
  ],
  ["r03", "Cas", null, "identified", "Sign-up sheet at the stand", -9, "asked", "duplicate"],
  ["r04", "Cassius", "Thorne", "engaged", "QR sign-up at the Freshers' Fair", -47, "granted", "qr"],
  ["r05", "Marigold", "Fenwick", "engaged", "Referred by a current player", -40, "granted", "hand"],
  [
    "r06",
    "Odile",
    "Marchmont",
    "engaged",
    "Rookie Taster Session",
    -49,
    "granted",
    "walk-up-invited",
  ],
  [
    "r07",
    "Barnaby",
    "Quince-Ashby",
    "committed",
    "Referred by a current player",
    -38,
    "granted",
    "hand",
  ],
  [
    "r08",
    "Cordelia",
    "Winterbourne",
    "committed",
    "QR sign-up at the Freshers' Fair",
    -45,
    "granted",
    "qr",
  ],
  ["r09", "Reginald", "Pemberton-Hale", "joined", "Rookie Taster Session", -49, "granted", "qr"],
  [
    "r10",
    "Lucasta",
    "Meredith",
    "declined",
    "QR sign-up at the Freshers' Fair",
    -46,
    "refused",
    "qr",
  ],
  [
    "r11",
    "Hieronymus",
    "Blackwood",
    "declined",
    "Referred by a current player",
    -30,
    "granted",
    "hand",
  ],
  [
    "r12",
    "Araminta",
    "Sedgwick",
    "disengaged",
    "QR sign-up at the Freshers' Fair",
    -44,
    "granted",
    "qr",
  ],
  [
    "r13",
    "Peregrine",
    "Holloway",
    "disengaged",
    "Sign-up sheet at the stand",
    -42,
    "never_asked",
    "hand",
  ],
  ["r14", "Cassius", "Thorn", "void", "QR sign-up at the Freshers' Fair", -47, "granted", "qr"],
]);

export function buildRecruitment(ctx, reference, people) {
  const { add, labels, day, at, mintToken } = ctx;
  const { seasonId, actorPersonId } = reference;
  const { dupA } = people;

  const recruits = [];

  for (const [key, givenName, familyName, status, source, firstOffset, consent, door] of RECRUITS) {
    const index = recruits.length;
    // The duplicate uses the near-duplicate person from the squad module.
    const personId =
      door === "duplicate"
        ? dupA
        : add(
            "public.people",
            {
              id: id("people", `recruit:${key}`),
              given_name: givenName,
              family_name: familyName,
              college:
                door === "qr"
                  ? ["Balliol", "Keble", "Wadham", "St Hugh's", "Oriel"][index % 5]
                  : null,
              matriculation_year: door === "qr" ? 2026 : null,
              expected_graduation_year: door === "qr" ? 2029 : null,
              degree_field:
                door === "qr" ? ["Physics", "Law", "History", "Medicine"][index % 4] : null,
              date_of_birth: index === 3 ? day(-365 * 19) : null,
              created_at: at(firstOffset, "12:00"),
              updated_at: at(firstOffset, "12:00"),
            },
            "illustrative",
            { source: `recruit ${key}` },
            ["person.recruit"],
          );

    if (door !== "duplicate") {
      add(
        "public.contact_points",
        {
          id: id("contact_points", `recruit:${key}`, "phone"),
          person_id: personId,
          kind: "phone",
          scope: null,
          raw_value: dramaPhone(700 + index, index % 3 === 0 ? "international" : "spaced"),
          normalised_value: `07700900${700 + index}`,
          is_preferred: true,
          valid_from: day(firstOffset),
          valid_until: null,
          source:
            door === "walk-up" || door === "walk-up-invited"
              ? "walk-on attendance"
              : door === "qr"
                ? "sign-up form"
                : "recruit added by hand",
        },
        "illustrative",
        { source: `recruit ${key}` },
        ["contact.phone"],
      );
      if (door === "qr") {
        add(
          "public.contact_points",
          {
            id: id("contact_points", `recruit:${key}`, "email"),
            person_id: personId,
            kind: "email",
            scope: "personal",
            raw_value: exampleEmail(`${givenName.toLowerCase()}.${key}`, "personal"),
            normalised_value: exampleEmail(`${givenName.toLowerCase()}.${key}`, "personal"),
            is_preferred: true,
            valid_from: day(firstOffset),
            valid_until: null,
            source: "sign-up form",
          },
          "illustrative",
          { source: `recruit ${key}` },
          ["contact.email"],
        );
      }
    }

    const committedOn = ["committed", "joined"].includes(status) ? day(firstOffset + 10) : null;
    if (status === "joined") {
      // W14's consequence: a membership at onboarding, entry new, one status event.
      const membershipId = add(
        "public.season_memberships",
        {
          id: id("season_memberships", labels.currentSeason, `recruit:${key}`),
          person_id: personId,
          season_id: seasonId,
          status: "onboarding",
          entry: "new",
          carried_forward_from_id: null,
          confirmed_on: committedOn,
          activated_on: null,
          created_at: at(firstOffset + 12, "10:00"),
          updated_at: at(firstOffset + 12, "10:00"),
        },
        "illustrative",
        { source: `recruit ${key} — flipped to joined` },
        ["membership.onboarding", "membership.from-recruit", "membership.entry.new"],
        "membership.from-recruit",
      );
      add(
        "public.season_membership_status_events",
        {
          id: id(
            "season_membership_status_events",
            labels.currentSeason,
            `recruit:${key}`,
            "onboarding",
          ),
          season_membership_id: membershipId,
          from_status: null,
          to_status: "onboarding",
          occurred_at: at(firstOffset + 12, "10:00"),
          actor_person_id: actorPersonId,
          actor_label: null,
          reason: "Flipped from the recruit board.",
        },
        "illustrative",
        { source: `recruit ${key} — flipped to joined` },
        ["membership.status-event"],
      );
    }

    const prospectId = add(
      "public.recruitment_prospects",
      {
        id: id("recruitment_prospects", labels.currentSeason, key),
        person_id: personId,
        season_id: seasonId,
        status,
        source,
        first_contact_on: day(firstOffset),
        committed_on: committedOn,
        converted_membership_id:
          status === "joined"
            ? id("season_memberships", labels.currentSeason, `recruit:${key}`)
            : null,
        created_at: at(firstOffset, "12:00"),
        updated_at: at(Math.min(firstOffset + 12, -1), "09:00"),
      },
      "illustrative",
      { source: `recruit ${key}` },
      [
        `prospect.${status}`,
        ...(door === "walk-up" ? ["prospect.walk-up"] : []),
        ...(door === "duplicate" ? ["prospect.possible-duplicate"] : []),
      ],
      door === "walk-up"
        ? "prospect.walk-up"
        : door === "duplicate"
          ? "prospect.possible-duplicate"
          : !ctx.examples.has(`prospect.${status}`)
            ? `prospect.${status}`
            : null,
    );

    // Status history — every transition the ladder records.
    const ladder = ["identified"];
    if (["engaged", "committed", "joined"].includes(status)) ladder.push("engaged");
    if (["committed", "joined"].includes(status)) ladder.push("committed");
    if (status === "joined") ladder.push("joined");
    if (["declined", "disengaged", "void"].includes(status)) ladder.push(status);
    ladder.forEach((to, step) => {
      const from = step === 0 ? null : ladder[step - 1];
      add(
        "public.recruitment_prospect_status_events",
        {
          id: id("recruitment_prospect_status_events", labels.currentSeason, key, to),
          prospect_id: prospectId,
          from_status: from,
          to_status: to,
          occurred_at: at(firstOffset + step * 4, "10:00"),
          actor_person_id: step === 0 && door === "qr" ? null : actorPersonId,
          actor_label: step === 0 && door === "qr" ? "recruit: sign-up form" : null,
          reason:
            to === "void"
              ? "Duplicate entry — the same person signed up twice at the same stand."
              : to === "disengaged"
                ? "No reply to two messages; will resurface in Hilary."
                : to === "declined"
                  ? "Said the training clashes with rowing."
                  : to === "joined"
                    ? "Flipped from the recruit board."
                    : null,
        },
        "illustrative",
        { source: `recruit ${key}` },
        ["prospect.status-event"],
      );
    });

    // Consent, season-scoped.
    add(
      "public.season_messaging_consents",
      {
        id: id("season_messaging_consents", labels.currentSeason, `recruit:${key}`),
        person_id: personId,
        season_id: seasonId,
        state: consent,
        source: ["granted", "refused", "withdrawn"].includes(consent)
          ? door === "qr"
            ? "qr_self_entry"
            : door.startsWith("walk-up")
              ? "walk_up_read_back"
              : "operator_recorded"
          : null,
        changed_at: at(firstOffset, "12:05"),
        recorded_by_person_id:
          ["granted", "refused", "withdrawn"].includes(consent) && door !== "qr"
            ? actorPersonId
            : null,
      },
      "illustrative",
      { source: `recruit ${key}` },
      [`consent.${consent}`],
    );

    // Notes.
    if (["r04", "r07", "r09", "r12"].includes(key)) {
      add(
        "public.recruitment_prospect_notes",
        {
          id: id("recruitment_prospect_notes", labels.currentSeason, key),
          prospect_id: prospectId,
          note: {
            r04: "Played flag in Lagos; came to the taster and asked about kit.",
            r07: "Committed after the open session; waiting on BUCS registration.",
            r09: "Rugby background, wants to try linebacker. Flipped at Monday review.",
            r12: "Came to one taster, then nothing. Try again in Hilary.",
          }[key],
          author_person_id: actorPersonId,
          author_label: null,
          created_at: at(firstOffset + 5, "16:00"),
        },
        "illustrative",
        { source: `recruit ${key}` },
        ["prospect.note"],
        key === "r04" ? "prospect.note" : null,
      );
    }

    // Questionnaire B answers, for the engaged and beyond.
    if (["r04", "r05", "r07", "r09"].includes(key)) {
      const answers = [
        ["B1", { answer_boolean: key !== "r05" }],
        ["B2", { answer_boolean: true }],
        ["B3", { answer_text: key === "r09" ? "MLB, SLB" : "WR, RB" }],
        ["B4", { answer_text: key === "r07" ? "Cleats" : "None" }],
        ["B5", { answer_choice: key === "r04" ? "freshers_fair" : "friend" }],
        ["B6", { answer_text: "Keen to learn; never played contact." }],
      ];
      for (const [code, value] of answers) {
        add(
          "public.recruitment_questionnaire_responses",
          {
            id: id("recruitment_questionnaire_responses", labels.currentSeason, key, code),
            prospect_id: prospectId,
            questionnaire: "football_background",
            question_code: code,
            answer_text: value.answer_text ?? null,
            answer_boolean: value.answer_boolean ?? null,
            answer_choice: value.answer_choice ?? null,
            responded_at: at(firstOffset + 6, "20:00"),
            superseded_at: null,
          },
          "illustrative",
          { source: `recruit ${key}` },
          ["questionnaire.answered"],
        );
      }
    }

    // The recruitment cycle's messages, as delivered.
    const steps =
      consent === "granted" && door !== "duplicate"
        ? [
            "welcome",
            ...(index % 2 === 0 ? ["details_reminder"] : []),
            ...(["engaged", "committed", "joined", "disengaged"].includes(status)
              ? ["interest_ask"]
              : []),
          ]
        : [];
    for (const [stepIndex, step] of steps.entries()) {
      const key_ = `recruit-cycle:${step}:${personId}:${seasonId}`;
      const when = at(firstOffset + [0, 4, 3][stepIndex] ?? 0, "12:10");
      const jobId = add(
        "public.notification_jobs",
        {
          id: id("notification_jobs", key_),
          idempotency_key: key_,
          job_type: "other",
          status: "completed",
          invitation_id: null,
          event_id: null,
          person_id: personId,
          channel: "whatsapp",
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
        { source: `recruit ${key} — ${step}` },
        [`job.recruit-cycle.${step}`, "job.completed"],
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
          requested_at: when,
          accepted_at: when,
          concluded_at: null,
          failure_reason: null,
        },
        "illustrative",
        { source: `recruit ${key} — ${step}` },
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
          occurred_at: when,
        },
        "illustrative",
        { source: `recruit ${key} — ${step}` },
        ["delivery.delivered"],
      );
    }

    // Interest links: spent where the questionnaire was answered, revoked at the flip.
    if (["r04", "r07", "r09", "r12"].includes(key)) {
      const minted = mintToken("person_access_tokens", "interest", key);
      const spent = key !== "r12";
      add(
        "public.person_access_tokens",
        {
          id: id("person_access_tokens", labels.currentSeason, "interest", key),
          person_id: personId,
          season_id: seasonId,
          token_hash: minted.hash,
          single_use: true,
          single_use_at: spent ? at(firstOffset + 6, "20:00") : null,
          issued_at: at(firstOffset + 3, "12:10"),
          issued_by_person_id: null,
          revoked_at:
            key === "r09" ? at(firstOffset + 12, "10:00") : key === "r12" ? at(-2, "09:00") : null,
          revoked_reason:
            key === "r09"
              ? "Superseded by the onboarding welcome at the flip."
              : key === "r12"
                ? "Recruit disengaged; link retired."
                : null,
          last_used_at: spent ? at(firstOffset + 6, "20:00") : null,
          use_count: spent ? 1 : 0,
          purpose: "recruit_interest_request",
        },
        "illustrative",
        { source: `recruit ${key} — interest link` },
        [spent ? "token.interest.spent" : "token.interest.revoked"],
        key === "r04" ? "token.interest.spent" : null,
      );
      if (key === "r04") ctx.example("link.interest.spent", minted.plaintext);
    }

    recruits.push({
      key,
      personId,
      prospectId,
      status,
      consent,
      door,
      walkUp: door === "walk-up",
      givenName,
      familyName,
    });
  }

  // Sign-up codes: one live for the season, one retired.
  const liveCode = ctx.signupCode(labels.currentSeason, "live");
  add(
    "public.recruitment_signup_codes",
    {
      id: id("recruitment_signup_codes", labels.currentSeason, "live"),
      season_id: seasonId,
      code: liveCode,
      minted_at: at(-50, "09:00"),
      minted_by_person_id: actorPersonId,
      deactivated_at: null,
      deactivated_by_person_id: null,
      deactivated_reason: null,
      sign_in_count: 6,
    },
    "illustrative",
    { source: "the season's sign-up QR" },
    ["signup-code.live"],
    "signup-code.live",
  );
  ctx.example("link.join.live", liveCode);
  add(
    "public.recruitment_signup_codes",
    {
      id: id("recruitment_signup_codes", labels.currentSeason, "retired"),
      season_id: seasonId,
      code: ctx.signupCode(labels.currentSeason, "retired"),
      minted_at: at(-58, "09:00"),
      minted_by_person_id: actorPersonId,
      deactivated_at: at(-50, "08:55"),
      deactivated_by_person_id: actorPersonId,
      deactivated_reason: "Poster reprinted with a new code.",
      sign_in_count: 2,
    },
    "illustrative",
    { source: "a retired sign-up QR" },
    ["signup-code.retired"],
    "signup-code.retired",
  );

  return { recruits };
}
