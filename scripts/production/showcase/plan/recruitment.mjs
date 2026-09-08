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

/**
 * One door, one story — LAN-238.
 *
 * The door a recruit came through is the only thing that decides how they were
 * captured, and everything the record shows about that capture is derived from
 * it here: the capture source the screen prints, the fields only the sign-up
 * form collects, the provenance on the contact point, who the first status
 * event names, and — the one that has teeth — the `season_messaging_consents`
 * source the application gates the recruitment questionnaire on.
 *
 * These used to be drawn independently, and a generated recruit could display
 * "QR sign-up at the Freshers' Fair" while carrying `operator_recorded`
 * consent. `Q-read-back-authorises-how-much` (Brian, 2026-09-02) makes that
 * combination a refusal with no visible cause: the interest track waits for
 * the recruit's own grant *through the form*, so the record said QR and the
 * button said no. Sixteen of thirty-five recruits contradicted themselves that
 * way. Deriving both from one door is what makes it unrepresentable.
 */
export const SOURCE_FOR_DOOR = Object.freeze({
  qr: "QR sign-up at the Freshers' Fair",
  "walk-up": "Walk-on at Rookie Taster Session",
  "walk-up-invited": "Rookie Taster Session",
  hand: "Referred by a current player",
  duplicate: "Sign-up sheet at the stand",
});

/**
 * The consent provenance each door produces, exactly as the application writes
 * it: `recruitment-signup.ts` writes `qr_self_entry` off the form,
 * `attendance.ts` writes `walk_up_read_back` at a touchline read-back, and
 * `recruitment-add.ts` writes `operator_recorded` for a recruit typed in by
 * hand. A recruit reached through a near-duplicate record was typed in too.
 */
const CONSENT_SOURCE_FOR_DOOR = Object.freeze({
  qr: "qr_self_entry",
  "walk-up": "walk_up_read_back",
  "walk-up-invited": "walk_up_read_back",
  hand: "operator_recorded",
  duplicate: "operator_recorded",
});

/** The consent states that carry a provenance at all; the rest record none. */
const SOURCED_CONSENT = ["granted", "refused", "withdrawn"];

/**
 * Capture source → the consent provenance it implies, for `showcase verify`.
 *
 * The same two tables read the other way round, so the check that no recruit's
 * record contradicts itself is derived from the rule that builds them rather
 * than written out a second time and left to drift. Only the loader's own five
 * capture strings appear here: a prospect the application created carries its
 * own vocabulary (`Operator add · …`), which this says nothing about.
 */
export const CONSENT_SOURCE_FOR_CAPTURE_SOURCE = Object.freeze(
  Object.fromEntries(
    Object.entries(SOURCE_FOR_DOOR).map(([door, source]) => [
      source,
      CONSENT_SOURCE_FOR_DOOR[door],
    ]),
  ),
);

/**
 * Enough of every funnel stage that five testers each get one of their own.
 *
 * The fourteen hand-written recruits below carry the shapes that matter — the
 * walk-up, the possible duplicate, the one flipped to joined — and these top
 * each stage up to five. Five testers all flipping "the committed recruit"
 * means the first takes the state away from the other four, who then report a
 * defect that is really a collision.
 *
 * Generated rather than written out so the stage counts stay obviously equal,
 * and deterministic because `id()` derives every identifier from the key.
 */
function fillFunnel(existing, perStage = 5) {
  const stages = ["identified", "engaged", "committed", "joined", "declined", "disengaged", "void"];
  const held = new Map(stages.map((stage) => [stage, 0]));
  for (const row of existing) held.set(row[3], (held.get(row[3]) ?? 0) + 1);
  const given = [
    "Araminta",
    "Bertram",
    "Clemency",
    "Dorothea",
    "Ellery",
    "Fenella",
    "Godric",
    "Hesper",
    "Ivo",
    "Jocasta",
    "Kester",
    "Lettice",
    "Millicent",
    "Nathaniel",
    "Orlando",
    "Petronella",
    "Quillon",
    "Rosalind",
    "Somerled",
    "Theodora",
    "Ulric",
    "Verity",
    "Winifred",
    "Xavier",
    "Yolande",
    "Zenobia",
    "Alaric",
    "Blanche",
    "Corin",
    "Delphine",
  ];
  const family = [
    "Ashgrove",
    "Bexley",
    "Cardew",
    "Drayton",
    "Elverton",
    "Fairholme",
    "Garrow",
    "Hollis",
    "Inglewood",
    "Jarrow",
    "Kestrel",
    "Langmere",
    "Mowbray",
    "Northcote",
    "Oakhurst",
    "Prideaux",
  ];
  // Every fifth generated recruit arrives through the duplicate door, so five
  // testers each resolve a possible duplicate of their own rather than four of
  // them finding it already resolved.
  //
  // The door is the only capture fact drawn here. What the record *shows* about
  // that capture is derived from it in `buildRecruitment` — see
  // `SOURCE_FOR_DOOR`. There used to be a second, independent array of source
  // strings picked by a different modulus, which is what LAN-238 was.
  const doors = ["qr", "hand", "walk-up-invited", "qr", "duplicate", "qr"];
  const rows = [];
  let n = existing.length;
  for (const stage of stages) {
    for (let i = held.get(stage) ?? 0; i < perStage; i += 1) {
      n += 1;
      const door = doors[n % doors.length];
      rows.push([
        `r${String(n).padStart(2, "0")}`,
        given[(n * 7) % given.length],
        family[(n * 5) % family.length],
        stage,
        -46 + (n % 30),
        // Only an operator capture can be left merely `asked`. The sign-up
        // form cannot be saved without the consent tick
        // (`SIGNUP_REQUIRES_CONSENT_RULE`, `recruitment-signup.ts`), so a
        // recruit who came through it is always `granted`. This used to be
        // `n % 6 === 0`, which is exactly the QR door — four recruits whose
        // record said they signed the form and whose consent said they had
        // only been asked, refused on the record with "Consent has not been
        // granted for this season".
        door !== "qr" && n % 5 === 0 ? "asked" : "granted",
        door,
      ]);
    }
  }
  return rows;
}

const RECRUITS_AUTHORED = [
  // key, given, family, status, firstContactOffset, consent, door.
  //
  // No capture source: it is `SOURCE_FOR_DOOR[door]`, so a hand-written recruit
  // cannot contradict itself either. `r09` used to read "Rookie Taster Session"
  // while carrying a `qr_self_entry` grant, and `r13` "Sign-up sheet at the
  // stand" on the by-hand door — the same drift the generator had, in rows the
  // ticket believed were coherent.
  //
  // `r07` came through the form (it used to be the by-hand door): it is the
  // first `committed` row, so it is the example W2 and W12 open, and their
  // checklists promise "both questionnaires and the answers". Only a recruit
  // whose own grant came through the form can be sent the second one.
  ["r01", "Persephone", "Wilding", "identified", -48, "granted", "qr"],
  ["r02", "Tobias", "Wrenfield", "identified", -49, "granted", "walk-up"],
  ["r03", "Cas", null, "identified", -9, "asked", "duplicate"],
  ["r04", "Cassius", "Thorne", "engaged", -47, "granted", "qr"],
  ["r05", "Marigold", "Fenwick", "engaged", -40, "granted", "hand"],
  ["r06", "Odile", "Marchmont", "engaged", -49, "granted", "walk-up-invited"],
  ["r07", "Barnaby", "Quince-Ashby", "committed", -38, "granted", "qr"],
  ["r08", "Cordelia", "Winterbourne", "committed", -45, "granted", "qr"],
  ["r09", "Reginald", "Pemberton-Hale", "joined", -49, "granted", "qr"],
  ["r10", "Lucasta", "Meredith", "declined", -46, "refused", "qr"],
  ["r11", "Hieronymus", "Blackwood", "declined", -30, "granted", "hand"],
  ["r12", "Araminta", "Sedgwick", "disengaged", -44, "granted", "qr"],
  ["r13", "Peregrine", "Holloway", "disengaged", -42, "never_asked", "hand"],
  ["r14", "Cassius", "Thorn", "void", -47, "granted", "qr"],
];

const RECRUITS = Object.freeze([...RECRUITS_AUTHORED, ...fillFunnel(RECRUITS_AUTHORED)]);

/**
 * Where the interest ask has plausibly already gone out.
 *
 * Narrower than the cycle's own eligibility (`identified`, `engaged`,
 * `committed`) because a recruit who answered has moved along since, and
 * wider at the far end for the same reason: the ask reached them while they
 * were still being chased, and the flip or the fade came afterwards.
 */
const ASKED_STATUSES = Object.freeze(["engaged", "committed", "joined", "disengaged"]);

/**
 * Could the recruitment questionnaire have reached this recruit at all?
 *
 * `declareRecruitmentCycleJobsIn` gates the interest track on
 * `hasGrantedViaSignupFormIn`, so an `interest_ask`, the link it carries, and
 * the answers that come back are all evidence of a `qr_self_entry` grant.
 * Hanging any of them on a walk-up or operator-recorded grant describes a send
 * the application would have refused — which is what the record then says,
 * next to a button refusing to send it.
 */
function askedThroughTheSignupForm([, , , status, , consent, door]) {
  return (
    CONSENT_SOURCE_FOR_DOOR[door] === "qr_self_entry" &&
    consent === "granted" &&
    ASKED_STATUSES.includes(status)
  );
}

/**
 * The link retired unused: disengaged, revoked, never opened. It holds no
 * answers on purpose — answers would contradict a `use_count` of nought.
 */
const RETIRED_INTEREST_LINK = "r12";

/**
 * The six recruits who answered Questionnaire B, and so hold a spent link.
 *
 * Derived rather than listed. The list used to name `r05`, `r07`, `r15` and
 * `r16` — two by-hand recruits, and one reached through a near-duplicate — none
 * of whom could have been asked. `r16` is the recruit the ticket was raised
 * against: the checklists dealt a tester her "already answered" link while her
 * record refused to send her the questionnaire it came from.
 */
const ANSWERED_KEYS = Object.freeze(
  RECRUITS.filter(askedThroughTheSignupForm)
    .map(([key]) => key)
    .filter((key) => key !== RETIRED_INTEREST_LINK)
    .slice(0, 6),
);

/** Everyone who holds an interest link: the six who answered, and the retired one. */
const INTEREST_LINK_KEYS = Object.freeze([...ANSWERED_KEYS, RETIRED_INTEREST_LINK]);

/** Each cycle step's own offset from first contact, so a step's place in the list cannot move it. */
const STEP_OFFSET_DAYS = Object.freeze({ welcome: 0, details_reminder: 4, interest_ask: 3 });

export function buildRecruitment(ctx, reference, people) {
  const { add, labels, day, at, mintToken } = ctx;
  const { seasonId, actorPersonId } = reference;
  const { dupA, duplicatePeople = [] } = people;
  // Each duplicate-door recruit points at a *different* near-duplicate person.
  // They all used to reuse `dupA`, which was fine while there was one of them
  // and a unique-consent-per-person-per-season violation as soon as there were
  // five — and would have meant five testers resolving the same duplicate.
  const duplicatePool = [dupA, ...duplicatePeople];
  let duplicatesUsed = 0;

  const recruits = [];

  for (const [key, givenName, familyName, status, firstOffset, consent, door] of RECRUITS) {
    const index = recruits.length;
    const source = SOURCE_FOR_DOOR[door];
    const consentSource = SOURCED_CONSENT.includes(consent) ? CONSENT_SOURCE_FOR_DOOR[door] : null;
    // The one fact the recruitment questionnaire turns on, named once.
    const reachedTheFormThemselves = consentSource === "qr_self_entry";
    // The duplicate uses the near-duplicate person from the squad module.
    const personId =
      door === "duplicate"
        ? duplicatePool[duplicatesUsed++ % duplicatePool.length]
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
        source: consentSource,
        changed_at: at(firstOffset, "12:05"),
        recorded_by_person_id: consentSource && !reachedTheFormThemselves ? actorPersonId : null,
      },
      "illustrative",
      { source: `recruit ${key}` },
      [`consent.${consent}`],
    );

    // Notes. Only these four carry note text; `recruitment_prospect_notes.note`
    // is not-null, so widening this list means writing four more sentences.
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

    // Questionnaire B answers. Six of them, because their interest links are
    // dealt to testers as "already answered": a link whose recruit has answered
    // nothing opens on the live, blank form instead, which is the opposite of
    // what the checklist promises. Every one is a recruit the ask could have
    // reached — see `ANSWERED_KEYS`.
    const answeredIndex = ANSWERED_KEYS.indexOf(key);
    if (answeredIndex !== -1) {
      const answers = [
        ["B1", { answer_boolean: answeredIndex !== 1 }],
        ["B2", { answer_boolean: true }],
        ["B3", { answer_text: status === "joined" ? "MLB, SLB" : "WR, RB" }],
        ["B4", { answer_text: answeredIndex === 2 ? "Cleats" : "None" }],
        ["B5", { answer_choice: answeredIndex === 0 ? "freshers_fair" : "friend" }],
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

    // The recruitment cycle's messages, as delivered — each track reaching
    // exactly the recruits `declareRecruitmentCycleJobsIn` would have declared
    // it for, so no record claims a send the application would have refused.
    //
    // The welcome track carries the link to the sign-up form, which is why it
    // goes to the recruits who have *not* been through it and is skipped for
    // the ones who have (`welcomeStepComplete`). It used to go to every granted
    // recruit, including twenty-four who had signed the form themselves five
    // minutes earlier. The interest track is the mirror image: it waits for
    // that form. Neither reaches a recruit captured as a possible duplicate,
    // whose record is somebody else's to begin with.
    const welcomeTrack =
      door !== "duplicate" &&
      !reachedTheFormThemselves &&
      consent !== "refused" &&
      consent !== "withdrawn";
    const interestTrack =
      door !== "duplicate" && reachedTheFormThemselves && ASKED_STATUSES.includes(status);
    const steps = [
      ...(welcomeTrack ? ["welcome", ...(index % 2 === 0 ? ["details_reminder"] : [])] : []),
      ...(interestTrack ? ["interest_ask"] : []),
    ];
    for (const step of steps) {
      const key_ = `recruit-cycle:${step}:${personId}:${seasonId}`;
      const when = at(firstOffset + STEP_OFFSET_DAYS[step], "12:10");
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

    // Interest links: spent where the questionnaire was answered, revoked at the
    // flip. Seven — the six who answered, and one retired unused. The recruit
    // who was flipped to joined has theirs revoked at the flip, which leaves
    // five live and answered, so five testers each open one of their own.
    if (INTEREST_LINK_KEYS.includes(key)) {
      const minted = mintToken("person_access_tokens", "interest", key);
      const spent = key !== RETIRED_INTEREST_LINK;
      const revokedAtTheFlip = status === "joined";
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
          revoked_at: revokedAtTheFlip
            ? at(firstOffset + 12, "10:00")
            : spent
              ? null
              : at(-2, "09:00"),
          revoked_reason: revokedAtTheFlip
            ? "Superseded by the onboarding welcome at the flip."
            : spent
              ? null
              : "Recruit disengaged; link retired.",
          last_used_at: spent ? at(firstOffset + 6, "20:00") : null,
          use_count: spent ? 1 : 0,
          purpose: "recruit_interest_request",
        },
        "illustrative",
        { source: `recruit ${key} — interest link` },
        [spent && !revokedAtTheFlip ? "token.interest.answered" : "token.interest.revoked"],
        spent && !revokedAtTheFlip ? "token.interest.answered" : null,
      );
      // Only a live link belonging to a recruit who has answered: a revoked one
      // resolves to the uniform not-found page, so offering it here handed two
      // of five testers a dead link for a workflow that promises a page.
      if (spent && !revokedAtTheFlip) ctx.example("link.interest.answered", minted.plaintext);
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
  // Exactly one live code, because the database says so:
  // `recruitment_signup_codes_one_live_per_season` permits a single live QR per
  // season, so this is one of the three placeholders five testers must share.
  // It is the safe kind of sharing — signing up through a code increments its
  // counter rather than consuming it — except for deactivating it, which the
  // checklists flag as shared.
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
