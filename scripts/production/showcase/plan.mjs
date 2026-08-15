/**
 * The showcase, as a list of rows — LAN-124.
 *
 * A pure function. It takes the two workbooks' parsed contents and the private
 * parameters Brian supplies at execution time, and returns every row the load
 * would write, in dependency order, each with the provenance that put it there.
 * It opens no connection and reads no environment.
 *
 * That purity is what makes the preview trustworthy. `showcase preview` prints
 * *this* plan; `showcase load` writes *this* plan. They cannot disagree, because
 * there is only one of them — which is the failure mode a dry run usually has.
 *
 * ## Two kinds of row, and the line between them
 *
 * **source-derived** — a faithful transformation of the roster or the Michaelmas
 * term card. Names, positions, kit signal, event wording, venues, dates.
 *
 * **illustrative** — realistic operational state invented to exercise the
 * product: which memberships are active, who answered an invitation, who turned
 * up. The club's own status column could not be used for this even if we wanted
 * it to, because its vocabulary includes `Injured` and the schema deliberately
 * has nowhere to put that.
 *
 * Every row carries its classification, and the manifest records it. Nothing in
 * the database itself says which is which, because LAN-124 forbids a visible
 * marker — the manifest is the record, and that is exactly why it matters.
 */

import { id } from "./ids.mjs";

/** The season the showcase operates in, and the one it archives. */
export const CURRENT_SEASON_LABEL = "2026–27";
export const ARCHIVED_SEASON_LABEL = "2025–26";

/** The walkthrough anchor. Everything illustrative is placed relative to this. */
export const ANCHOR = "2026-08-17";

/**
 * The club's own position vocabulary, from `Databank For Dropdowns`.
 *
 * Loaded as reference data because `position_assignments` cannot reference a
 * position that does not exist, and hosted Supabase has no rows at all.
 */
const POSITIONS = Object.freeze([
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

/** The seven onboarding items LAN-124 names, in the order it names them. */
const ONBOARDING_TYPES = Object.freeze([
  ["subscription_invoiced", "Subscription invoiced", true],
  ["subscription_paid", "Subscription paid", true],
  ["kit_sorted", "Kit sorted", false],
  ["bucs_play", "BUCS Play registration", false],
  ["hudl", "Hudl access", false],
  ["squad_photo", "Squad photo", false],
  ["comms_groups", "Communications groups joined", false],
]);

/**
 * The illustrative current-season distribution LAN-124 specifies.
 *
 * Assigned by position in a name-sorted list, so it is deterministic and a
 * rerun puts the same person in the same state. Sums to 42.
 */
const STATUS_DISTRIBUTION = Object.freeze([
  ["active", 32],
  ["inactive", 3],
  ["onboarding", 3],
  ["confirmed", 2],
  ["carried_forward", 1],
  ["departed", 1],
]);

/** Availability across the active squad: 33 green, 4 orange, 2 red. */
const AVAILABILITY_DISTRIBUTION = Object.freeze([
  ["green", 33],
  ["orange", 4],
  ["red", 2],
]);

/** Adds `days` to an ISO date, in UTC, and returns an ISO date. */
function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Expands a distribution into one value per index. */
function spread(distribution, total) {
  const values = [];
  for (const [value, count] of distribution) {
    for (let index = 0; index < count; index += 1) values.push(value);
  }
  // A source with more rows than the distribution anticipates keeps working:
  // the surplus takes the first (largest) bucket rather than being dropped.
  while (values.length < total) values.push(distribution[0][0]);
  return values.slice(0, total);
}

/**
 * A non-deliverable stand-in for a real student's mobile number.
 *
 * Ofcom reserves 07700 900000–900999 for drama; nothing in it can be dialled or
 * messaged. LAN-124 requires historical contact data to be replaced with
 * clearly non-deliverable values, and this is the range the synthetic seed
 * already uses for the same reason.
 */
function demonstrationPhone(index) {
  return `07700 900${String(index).padStart(3, "0")}`;
}

/**
 * Builds the whole plan.
 *
 * @param {object} input
 * @param {Array} input.players       from `readRoster`
 * @param {Array} input.termCard      from `readTermCard`
 * @param {object} input.params       Brian's private parameters
 * @param {string} [input.anchor]     the walkthrough date
 */
export function buildPlan({ players, termCard, params, anchor = ANCHOR }) {
  const rows = [];
  const provenance = [];

  const add = (table, columns, classification, source) => {
    rows.push({ table, columns });
    provenance.push({ table, id: columns.id, classification, ...source });
    return columns.id;
  };

  // -------------------------------------------------------------------------
  // Reference data. Hosted Supabase has none of this — LAN-73's handoff records
  // that `public.roles` is empty in production — so it is created before
  // anything that references it.
  // -------------------------------------------------------------------------

  const vocabularyId = id("position_vocabularies", "oulafc");
  add(
    "public.position_vocabularies",
    {
      id: vocabularyId,
      code: "oulafc_2026",
      label: "OULAFC position vocabulary",
      adopted_on: "2026-06-01",
    },
    "source-derived",
    { source: "OULAFC Master Table.xlsx / Databank For Dropdowns" },
  );

  const positionIds = new Map();
  POSITIONS.forEach(([code, label, side], index) => {
    const positionId = id("positions", code);
    positionIds.set(code, { id: positionId, side });
    add(
      "public.positions",
      {
        id: positionId,
        vocabulary_id: vocabularyId,
        code,
        label,
        side,
        sort_order: index,
      },
      "source-derived",
      { source: "OULAFC Master Table.xlsx / Databank For Dropdowns", cell: code },
    );
  });

  // Michaelmas 2026-27, dated from the term card's own week -1 and week 8.
  const michaelmasStart = termCard.length > 0 ? termCard[0].scheduledOn : "2026-09-27";
  const michaelmasEnd = termCard.length > 0 ? termCard.at(-1).scheduledOn : "2026-12-05";
  const termId = id("terms", "michaelmas", "2026-27");
  add(
    "public.terms",
    {
      id: termId,
      name: "michaelmas",
      academic_year: "2026–27",
      starts_on: michaelmasStart,
      ends_on: michaelmasEnd,
      first_week: -1,
      last_week: 8,
    },
    "source-derived",
    { source: "260720 OULAFC MT26 Term Card v0.xlsx" },
  );

  const committeeYearId = id("committee_years", "2026-27");
  add(
    "public.committee_years",
    {
      id: committeeYearId,
      label: "2026–27",
      starts_on: "2026-06-01",
      ends_on: null,
    },
    "illustrative",
    { source: "showcase" },
  );

  const roleIds = new Map();
  for (const [code, name, scope, isOffice] of ROLE_SPEC) {
    const roleId = id("roles", code);
    roleIds.set(code, roleId);
    add(
      "public.roles",
      {
        id: roleId,
        code,
        name,
        scope,
        is_constitutional_office: isOffice,
        constitution_edition: isOffice ? "Fourth Edition 24.04.22" : null,
        constitution_reference: isOffice ? "¶19" : null,
      },
      "source-derived",
      { source: "OULAFC Constitution / ROLE_SPEC" },
    );
  }

  // -------------------------------------------------------------------------
  // The people who run the walkthrough. Their Auth users are created by Brian
  // by hand — no agent creates one — and their identifiers arrive as private
  // parameters rather than through any committed file.
  // -------------------------------------------------------------------------

  const operators = [];

  for (const key of ["brian", "stewart", "coach"]) {
    const person = params[key];
    if (!person) continue;

    const personId = id("people", `operator:${key}`);
    add(
      "public.people",
      {
        id: personId,
        given_name: person.givenName,
        family_name: person.familyName ?? null,
        known_as: person.knownAs ?? null,
      },
      "illustrative",
      { source: `private parameters (${key})` },
    );

    if (person.phone) {
      add(
        "public.contact_points",
        {
          id: id("contact_points", `operator:${key}`),
          person_id: personId,
          kind: "phone",
          raw_value: person.phone,
          is_preferred: true,
          valid_from: "2026-06-01",
          source: "supplied privately at execution time",
        },
        "illustrative",
        { source: `private parameters (${key}) — value never recorded here` },
      );
    }

    if (person.authUserId) {
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
      );
    }

    operators.push({ key, personId, roles: person.roles ?? [] });
  }

  const actorPersonId = operators.find((operator) => operator.key === "brian")?.personId ?? null;
  if (!actorPersonId) {
    throw new Error(
      "The private parameters must include `brian`: seasons record who opened them, " +
        "and audiences record who confirmed them.",
    );
  }

  // -------------------------------------------------------------------------
  // Seasons. The application refuses to operate at all without one whose status
  // is open, active or closing.
  // -------------------------------------------------------------------------

  const archivedSeasonId = id("seasons", ARCHIVED_SEASON_LABEL);
  add(
    "public.seasons",
    {
      id: archivedSeasonId,
      label: ARCHIVED_SEASON_LABEL,
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
    { source: "showcase — the season the 42 source players are archived into" },
  );

  const seasonId = id("seasons", CURRENT_SEASON_LABEL);
  add(
    "public.seasons",
    {
      id: seasonId,
      label: CURRENT_SEASON_LABEL,
      status: "active",
      position_vocabulary_id: vocabularyId,
      starts_on: "2026-07-01",
      ends_on: "2027-06-30",
      opened_at: "2026-07-01T09:00:00Z",
      opened_by_person_id: actorPersonId,
    },
    "illustrative",
    { source: "showcase — the season the walkthrough operates in" },
  );

  // Role assignments, now that both cycles exist.
  for (const operator of operators) {
    for (const code of operator.roles) {
      const roleId = roleIds.get(code);
      if (!roleId) throw new Error(`Unknown role code in parameters: ${code}`);
      const spec = ROLE_SPEC.find((entry) => entry[0] === code);
      const scope = spec[2];

      add(
        "public.role_assignments",
        {
          id: id("role_assignments", operator.key, code),
          person_id: operator.personId,
          role_id: roleId,
          scope,
          is_constitutional_office: spec[3],
          committee_year_id: scope === "committee_year" ? committeeYearId : null,
          season_id: scope === "season" ? seasonId : null,
          effective_from: "2026-07-01",
          // Time-bounded at the moment it is made, as the pilot runbook requires.
          effective_to: params.accessEndsOn ?? null,
          note: "Showcase walkthrough access — LAN-124.",
        },
        "illustrative",
        { source: `private parameters (${operator.key})` },
      );
    }
  }

  const onboardingTypeIds = new Map();
  ONBOARDING_TYPES.forEach(([code, label, isSubscription], index) => {
    const typeId = id("onboarding_item_types", code);
    onboardingTypeIds.set(code, typeId);
    add(
      "public.onboarding_item_types",
      {
        id: typeId,
        season_id: seasonId,
        code,
        label,
        is_required: true,
        is_subscription: isSubscription,
        sort_order: index,
      },
      "illustrative",
      { source: "LAN-124 — the seven onboarding types it names" },
    );
  });

  // -------------------------------------------------------------------------
  // The roster: 42 real people, two seasons of membership each.
  // -------------------------------------------------------------------------

  const ordered = [...players].sort((a, b) => a.key.localeCompare(b.key));
  const statuses = spread(STATUS_DISTRIBUTION, ordered.length);
  const memberships = [];

  ordered.forEach((player, index) => {
    add(
      "public.people",
      {
        id: player.personId,
        given_name: player.givenName,
        family_name: player.familyName,
        known_as: null,
      },
      "source-derived",
      { source: player.source.sheet, cell: player.source.nameCell },
    );

    // Historical contact data is not imported. Every player gets an unroutable
    // stand-in so the delivery screens have something to show.
    add(
      "public.contact_points",
      {
        id: id("contact_points", player.key),
        person_id: player.personId,
        kind: "phone",
        raw_value: demonstrationPhone(index + 1),
        is_preferred: true,
        valid_from: "2026-07-01",
        source: "demonstration value — Ofcom reserved drama range",
      },
      "illustrative",
      { source: "replaces the workbook's real number, which is not imported" },
    );

    const archivedMembershipId = id("season_memberships", "archived", player.key);
    add(
      "public.season_memberships",
      {
        id: archivedMembershipId,
        person_id: player.personId,
        season_id: archivedSeasonId,
        status: "archived",
        entry: "returning",
        confirmed_on: "2025-09-15",
        activated_on: "2025-09-20",
      },
      "illustrative",
      { source: `archived membership for ${player.source.nameCell}` },
    );

    const status = statuses[index];
    const membershipId = id("season_memberships", "current", player.key);
    // Two of the forty-two are new entries; the rest returned. Chosen by
    // position so a rerun is identical.
    const entry = index < 2 ? "new" : "returning";

    add(
      "public.season_memberships",
      {
        id: membershipId,
        person_id: player.personId,
        season_id: seasonId,
        status,
        entry,
        carried_forward_from_id: status === "carried_forward" ? archivedMembershipId : null,
        confirmed_on: status === "onboarding" ? null : "2026-07-10",
        activated_on: ["active", "inactive", "departed"].includes(status) ? "2026-07-20" : null,
        departed_on: status === "departed" ? "2026-08-05" : null,
        departure_reason: status === "departed" ? "Left Oxford at the end of the year." : null,
        inactivity_label: status === "inactive" ? "Away this term" : null,
      },
      "illustrative",
      { source: `current membership for ${player.source.nameCell}` },
    );

    memberships.push({ player, membershipId, status, index });

    // Positions, which are source-derived where the workbook records them.
    for (const [column, slot] of [
      [player.offencePosition, "offence"],
      [player.defencePosition, "defence"],
    ]) {
      if (!column) continue;
      const position = positionIds.get(column);
      if (!position) continue;

      add(
        "public.position_assignments",
        {
          id: id("position_assignments", player.key, slot),
          season_membership_id: membershipId,
          season_id: seasonId,
          position_vocabulary_id: vocabularyId,
          position_id: position.id,
          side: position.side,
          slot,
          effective_from: "2026-07-20",
          recorded_by_person_id: actorPersonId,
        },
        "source-derived",
        {
          source: player.source.sheet,
          cell: slot === "offence" ? player.source.offenceCell : player.source.defenceCell,
          raw: slot === "offence" ? player.source.rawOffence : player.source.rawDefence,
        },
      );
    }

    // Onboarding. Everybody who is not still onboarding has completed the
    // required items; the three who are have a realistic mixture outstanding.
    ONBOARDING_TYPES.forEach(([code], typeIndex) => {
      const complete = status !== "onboarding" && !(index % 7 === 0 && typeIndex >= 5);
      add(
        "public.onboarding_items",
        {
          id: id("onboarding_items", player.key, code),
          season_membership_id: membershipId,
          season_id: seasonId,
          item_type_id: onboardingTypeIds.get(code),
          status: complete ? "complete" : typeIndex === 0 ? "invited" : "pending",
          completed_on: complete ? "2026-07-25" : null,
        },
        "illustrative",
        { source: "showcase onboarding state" },
      );
    });

    // Kit signal is source-derived: the workbook's `Kitted` column.
    if (player.kitIssued !== null) {
      provenance.push({
        table: "public.onboarding_items",
        id: id("onboarding_items", player.key, "kit_sorted"),
        classification: "source-derived",
        source: player.source.sheet,
        cell: player.source.kittedCell,
        raw: player.source.rawKitted,
      });
    }
  });

  // Availability, for the active squad only.
  const active = memberships.filter((entry) => entry.status === "active");
  const levels = spread(AVAILABILITY_DISTRIBUTION, active.length);
  active.forEach((entry, index) => {
    const level = levels[index];
    add(
      "public.availability_statuses",
      {
        id: id("availability_statuses", entry.player.key),
        season_membership_id: entry.membershipId,
        level,
        effective_from: addDays(anchor, -21 + (index % 14)),
        review_on: level === "green" ? null : addDays(anchor, 14),
        reported_by_person_id: entry.player.personId,
        confirmed_by_person_id: level === "green" ? actorPersonId : null,
      },
      "illustrative",
      { source: "showcase availability state" },
    );
  });

  return {
    rows,
    provenance,
    context: {
      anchor,
      seasonId,
      archivedSeasonId,
      termId,
      actorPersonId,
      vocabularyId,
      committeeYearId,
      memberships,
      operators,
      roleIds,
      positionIds,
      onboardingTypeIds,
    },
  };
}

/**
 * The club's committee and coaching seats.
 *
 * Mirrors `ROLE_SPEC` in `scripts/seed-local.mjs`, which is the catalogue's only
 * definition anywhere — LAN-73's handoff records that as a real gap, and it is
 * why hosted has no roles at all. Duplicated rather than imported because that
 * file is local-only by design and importing it here would drag the loopback
 * guard into a procedure that legitimately runs against hosted.
 */
const ROLE_SPEC = Object.freeze([
  ["president", "President", "committee_year", true],
  ["vice_president", "Vice-President", "committee_year", true],
  ["secretary", "Secretary", "committee_year", true],
  ["treasurer", "Treasurer", "committee_year", true],
  ["social_secretary", "Social Secretary", "committee_year", false],
  ["gameday_secretary", "Gameday Secretary", "committee_year", false],
  ["kit_manager", "Kit Manager", "committee_year", false],
  ["media_secretary", "Media Secretary", "committee_year", false],
  ["it_officer", "IT Officer", "committee_year", false],
  ["general_manager", "General Manager", "committee_year", false],
  ["head_coach", "Head Coach", "season", false],
  ["offence_coach", "Offence Coach", "season", false],
  ["defence_coach", "Defence Coach", "season", false],
]);

export { ROLE_SPEC };
