/**
 * Reference data and the people who run the club — LAN-221.
 *
 * Seasons, terms, the committee year, the position vocabulary, the eleven
 * onboarding item types, the operators named in the private parameter file,
 * and the fictional committee and coaching staff who fill every other seat so
 * the administration pages have something to show.
 *
 * The role catalogue itself is never created here — it is migration-owned
 * (LAN-128) and adopted outright. A seat somebody already holds on the target
 * is adopted when that somebody is the person the parameters name, and
 * declined otherwise: `role_assignments_one_holder_per_office` would refuse a
 * second overlapping holder, and a loader that seated a fictional Treasurer
 * over the club's real one would be the defect the catalogue exists to abolish.
 */

import { id } from "../ids.mjs";

export const CURRENT_SEASON_LABEL = "2026–27";
export const ARCHIVED_SEASON_LABEL = "2025–26";

/** The club's own position vocabulary, from `Databank For Dropdowns`. */
export const POSITIONS = Object.freeze([
  ["QB", "Quarterback", "offence"],
  ["RB", "Running Back", "offence"],
  ["WB", "Wing Back", "offence"],
  ["TE", "Tight End", "offence"],
  ["WR", "Wide Receiver", "offence"],
  ["T", "Tackle", "offence"],
  ["G", "Guard", "offence"],
  ["C", "Centre", "offence"],
  ["FB", "Full Back", "offence"],
  ["E", "End", "defence"],
  ["N/T", "Nose Tackle", "defence"],
  ["S", "Safety", "defence"],
  ["LB", "Linebacker", "defence"],
  ["CB", "Cornerback", "defence"],
]);

/**
 * The approved item-and-ask inventory — eleven items, transcribed from
 * `scripts/seed-local.mjs` (LAN-214), which is where the vocabulary lives.
 * `[code, label, is_required, is_subscription, verification_class]`.
 */
export const ONBOARDING_TYPES = Object.freeze([
  ["subs_invoiced", "Subscription invoiced", true, false, "direct"],
  ["subs_paid", "Subscription paid", false, true, "direct"],
  ["kit_sorted", "Kit sorted", true, false, "direct"],
  ["bucs_play", "BUCS Play registration", true, false, "trust"],
  ["hudl_access", "Hudl access", false, false, "trust"],
  ["photo", "Squad photo", false, false, "direct"],
  ["comms_groups", "Comms groups joined", true, false, "direct"],
  ["contact_academic_details", "Contact & academic details", true, false, "direct"],
  ["code_of_conduct", "Code of Conduct", true, false, "direct"],
  ["photo_release", "Photo release", true, false, "direct"],
  ["season_welcome_consent", "Season welcome & consent", true, false, "direct"],
]);

/** The parameter keys the loader understands, in the order they are seated. */
export const OPERATOR_KEYS = Object.freeze(["brian", "stewart", "clint", "coach"]);

/**
 * Fictional holders of every seat the parameters do not fill. `player` names a
 * squad member (by index into the player list) who also holds the seat — one
 * human, two records — and `null` is a person who exists only for the seat.
 */
const STAFF_SEATS = Object.freeze([
  ["vice_president", "Perpetua", "Ashgrove-Lindqvist", null],
  ["secretary", null, null, 1],
  ["treasurer", "Bartholomew", "Nkemdirim", null],
  ["social_secretary", "Ondine", "Fetherstonhaugh", null],
  ["gameday_secretary", null, null, 8],
  ["kit_manager", "Caspian", "Wyndham-Vale", null],
  ["media_secretary", "Marisol", "Okonkwo-Bright", null],
  ["head_coach", "Teodor", "Vasquez-Lindqvist", null],
  ["offence_coach", "Ignatius", "Marchetti", null],
  ["defence_coach", null, null, 19],
  ["quarterbacks_coach", "Rosalind", "Penhaligon-Frayne", null],
  ["defensive_line_coach", "Lysander", "Croft-Wrenfield", null],
]);

export function buildReference(ctx, { termCard }) {
  const { params, existing, labels, add, adopt, day, at, normaliseLabel } = ctx;
  const notes = [];

  // ---------------------------------------------------------------------------
  // Vocabulary, positions, term, committee year
  // ---------------------------------------------------------------------------

  const existingCurrent = existing.seasons?.get(normaliseLabel(labels.currentSeason)) ?? null;
  const existingArchived = existing.seasons?.get(normaliseLabel(labels.archivedSeason)) ?? null;

  const plannedVocabularyId = id("position_vocabularies", labels.vocabularyCode);
  const vocabularyId = adopt(
    existingCurrent
      ? existingCurrent.vocabularyId
      : existing.vocabularies?.get(labels.vocabularyCode),
    "public.position_vocabularies",
    {
      id: plannedVocabularyId,
      code: labels.vocabularyCode,
      label: "OULAFC position vocabulary",
      adopted_on: "2026-06-01",
    },
    "illustrative",
    { source: "the club's position dropdown vocabulary" },
  );

  const positionIds = new Map();
  POSITIONS.forEach(([code, label, side], index) => {
    const positionId = adopt(
      existing.positions?.get(`${vocabularyId}:${code}`),
      "public.positions",
      {
        id: id("positions", vocabularyId, code),
        vocabulary_id: vocabularyId,
        code,
        label,
        side,
        sort_order: index,
      },
      "illustrative",
      { source: "the club's position dropdown vocabulary", cell: code },
    );
    positionIds.set(code, { id: positionId, side });
  });

  const michaelmasStart = termCard.length > 0 ? termCard[0].scheduledOn : "2026-09-27";
  const michaelmasEnd = termCard.length > 0 ? termCard.at(-1).scheduledOn : "2026-12-05";
  const termId = adopt(
    existing.terms?.get("michaelmas:2026-27"),
    "public.terms",
    {
      id: id("terms", "michaelmas", "2026-27"),
      name: "michaelmas",
      academic_year: "2026–27",
      starts_on: michaelmasStart,
      ends_on: michaelmasEnd,
      first_week: -1,
      last_week: 8,
    },
    "illustrative",
    { source: "the Michaelmas term card" },
  );

  const committeeYearId = adopt(
    existing.openCommitteeYear,
    "public.committee_years",
    {
      id: id("committee_years", "2026-27"),
      label: "2026–27",
      starts_on: "2026-06-01",
      ends_on: null,
    },
    "illustrative",
    { source: "showcase" },
  );

  const roles = existing.roles ?? new Map();
  // Role pages are addressed by the catalogue's own identifiers, adopted.
  for (const [code, role] of roles) ctx.example(`role.${code}`, role.id);
  const roleFacts = (code) => {
    const role = roles.get(code);
    if (!role) {
      throw new Error(
        `public.roles has no seat with code "${code}". Apply the role-catalogue ` +
          "migration to this database before running the showcase loader.",
      );
    }
    return role;
  };

  // ---------------------------------------------------------------------------
  // The operators named privately. Their Auth users are Brian's to create.
  // ---------------------------------------------------------------------------

  const operators = [];
  const namedOperators = [
    ...OPERATOR_KEYS.map((key) => [key, params[key]]),
    ...(params.others ?? []).map((person, index) => [person.key ?? `other-${index + 1}`, person]),
  ].filter(([, person]) => person);

  for (const [key, person] of namedOperators) {
    const linked = person.authUserId ? existing.operators?.get(person.authUserId) : undefined;
    const personId = linked ? linked.personId : id("people", `operator:${key}`);

    if (linked) {
      ctx.provenance.push({
        table: "public.people",
        id: personId,
        classification: "illustrative",
        source: `private parameters (${key})`,
        note: "adopted — this Auth user already resolves to a Person, which is not this loader's to replace",
      });
    } else {
      add(
        "public.people",
        { id: personId, given_name: person.givenName, family_name: person.familyName ?? null },
        "illustrative",
        { source: `private parameters (${key})` },
        [],
        `person.operator.${key}`,
      );
    }

    if (person.phone) {
      add(
        "public.contact_points",
        {
          id: id("contact_points", `operator:${key}`),
          person_id: personId,
          kind: "phone",
          scope: null,
          raw_value: person.phone,
          normalised_value: null,
          // Preferred only when the loader created this Person: the club's own
          // record of how to reach somebody wins over one supplied for a test.
          is_preferred: !linked,
          valid_from: "2026-06-01",
          valid_until: null,
          source: "supplied privately at execution time",
        },
        "illustrative",
        { source: `private parameters (${key}) — value never recorded here` },
      );
    }

    if (person.authUserId && linked) {
      ctx.example(`operator.${key}`, linked.operatorAccountId);
      ctx.provenance.push({
        table: "public.operator_accounts",
        id: linked.operatorAccountId,
        classification: "illustrative",
        source: `private parameters (${key})`,
        note: "adopted — this Auth user is already linked to a Person",
      });
    } else if (person.authUserId) {
      add(
        "public.operator_accounts",
        {
          id: id("operator_accounts", `operator:${key}`),
          auth_user_id: person.authUserId,
          person_id: personId,
          is_active: true,
        },
        "illustrative",
        { source: `private parameters (${key})` },
        [],
        `operator.${key}`,
      );
    }

    operators.push({ key, personId, roles: person.roles ?? [], linked: Boolean(linked) });
  }

  const brian = operators.find((operator) => operator.key === "brian");
  if (!brian) {
    throw new Error(
      "The private parameters must include `brian`: seasons record who opened them, " +
        "audiences record who confirmed them, and every audit row here names him.",
    );
  }
  const actorPersonId = brian.personId;
  ctx.example("person.operator.brian", actorPersonId);

  // ---------------------------------------------------------------------------
  // Seasons
  // ---------------------------------------------------------------------------

  const archivedSeasonId = adopt(
    existingArchived?.id,
    "public.seasons",
    {
      id: id("seasons", labels.archivedSeason),
      label: labels.archivedSeason,
      status: "archived",
      position_vocabulary_id: vocabularyId,
      starts_on: "2025-09-01",
      ends_on: "2026-06-30",
      opened_at: "2025-09-01T09:00:00Z",
      opened_by_person_id: actorPersonId,
      closed_at: "2026-06-30T18:00:00Z",
      closed_by_person_id: actorPersonId,
    },
    "illustrative",
    { source: "showcase — last season, archived" },
  );

  const seasonId = adopt(
    existingCurrent?.id,
    "public.seasons",
    {
      id: id("seasons", labels.currentSeason),
      label: labels.currentSeason,
      status: labels.seasonStatus,
      position_vocabulary_id: vocabularyId,
      starts_on: "2026-07-01",
      ends_on: "2027-06-30",
      opened_at: "2026-07-01T09:00:00Z",
      opened_by_person_id: actorPersonId,
      closed_at: labels.seasonStatus === "archived" ? "2027-06-30T18:00:00Z" : null,
      closed_by_person_id: labels.seasonStatus === "archived" ? actorPersonId : null,
    },
    "illustrative",
    { source: "showcase — the season tester week operates in" },
  );

  // ---------------------------------------------------------------------------
  // Seats
  // ---------------------------------------------------------------------------

  /**
   * Seats `personId` in `code`, unless the seat is already held.
   *
   * A seat the same person already holds is adopted. A seat somebody else
   * holds is declined and noted, never contested. Multi-holder seats are always
   * assignable.
   */
  const assignSeat = (code, personId, key, { since = "2026-07-01", note } = {}) => {
    const role = roleFacts(code);
    const holders = existing.assignments?.get(code) ?? [];
    const mine = holders.find((holder) => holder.personId === personId);
    const exclusive = role.is_constitutional_office || role.is_single_holder_seat;

    const assignmentId = id("role_assignments", labels.currentSeason, key, code);
    if (mine && mine.id !== assignmentId) {
      ctx.provenance.push({
        table: "public.role_assignments",
        id: mine.id,
        classification: "illustrative",
        source: `seat ${code} (${key})`,
        note: "adopted — this person already holds the seat",
      });
      return mine.id;
    }
    if (exclusive && holders.some((holder) => holder.personId !== personId)) {
      notes.push(
        `The ${code} seat is already held by somebody the parameters do not name; ` +
          `the loader leaves it alone and does not seat ${key} there.`,
      );
      return null;
    }

    return add(
      "public.role_assignments",
      {
        id: assignmentId,
        person_id: personId,
        role_id: role.id,
        scope: role.scope,
        is_constitutional_office: role.is_constitutional_office,
        is_single_holder_seat: role.is_single_holder_seat,
        committee_year_id: role.scope === "committee_year" ? committeeYearId : null,
        season_id: role.scope === "season" ? seasonId : null,
        effective_from: since,
        effective_to: params.accessEndsOn ?? null,
        appointed_by_person_id: actorPersonId,
        note: note ?? "Tester week — LAN-221.",
      },
      "illustrative",
      { source: `seat ${code} (${key})` },
      ["seat.held"],
    );
  };

  for (const operator of operators) {
    for (const code of operator.roles) assignSeat(code, operator.personId, operator.key);
  }

  const seatedCodes = new Set(operators.flatMap((operator) => operator.roles));
  const staff = [];
  const deferredPlayerSeats = [];
  for (const [code, givenName, familyName, playerIndex] of STAFF_SEATS) {
    if (seatedCodes.has(code)) continue;
    if (playerIndex !== null) {
      deferredPlayerSeats.push({ code, playerIndex });
      continue;
    }
    const personId = add(
      "public.people",
      {
        id: id("people", `staff:${code}`),
        given_name: givenName,
        family_name: familyName,
        college: null,
        matriculation_year: null,
        expected_graduation_year: null,
        degree_field: null,
        date_of_birth: null,
      },
      "illustrative",
      { source: `fictional holder of the ${code} seat` },
      ["person.staff-only"],
    );
    add(
      "public.contact_points",
      {
        id: id("contact_points", `staff:${code}:phone`),
        person_id: personId,
        kind: "phone",
        scope: null,
        raw_value: `07700 9009${String(staff.length + 10).padStart(2, "0")}`,
        normalised_value: `077009009${String(staff.length + 10).padStart(2, "0")}`,
        is_preferred: true,
        valid_from: "2026-07-01",
        valid_until: null,
        source: "committee handover sheet",
      },
      "illustrative",
      { source: `fictional holder of the ${code} seat` },
    );
    const assignmentId = assignSeat(code, personId, `staff:${code}`);
    staff.push({
      code,
      personId,
      assignmentId,
      capacity: code.endsWith("_coach") ? "coach" : "committee",
    });
  }

  const presidentId =
    operators.find((operator) => operator.roles.includes("president"))?.personId ??
    (existing.assignments?.get("president") ?? [])[0]?.personId ??
    actorPersonId;

  // ---------------------------------------------------------------------------
  // Onboarding item types
  // ---------------------------------------------------------------------------

  const onboardingTypeIds = new Map();
  ONBOARDING_TYPES.forEach(
    ([code, label, isRequired, isSubscription, verificationClass], index) => {
      const typeId = adopt(
        existing.onboardingTypes?.get(`${seasonId}:${code}`),
        "public.onboarding_item_types",
        {
          id: id("onboarding_item_types", labels.currentSeason, code),
          season_id: seasonId,
          code,
          label,
          is_required: isRequired,
          is_subscription: isSubscription,
          sort_order: index,
          verification_class: verificationClass,
        },
        "illustrative",
        { source: "the approved item-and-ask inventory" },
      );
      onboardingTypeIds.set(code, { id: typeId, code, isRequired, verificationClass });
    },
  );

  return {
    notes,
    vocabularyId,
    positionIds,
    termId,
    committeeYearId,
    archivedSeasonId,
    seasonId,
    actorPersonId,
    presidentId,
    operators,
    staff,
    deferredPlayerSeats,
    assignSeat,
    roleFacts,
    onboardingTypeIds,
    // Placed relative to the anchor, so the same scenario reads the same in
    // any week: the season opened two months ago.
    seasonOpenedOn: day(-60),
    seasonOpenedAt: at(-60, "09:00"),
  };
}
