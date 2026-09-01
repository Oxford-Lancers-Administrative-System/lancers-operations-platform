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
import { normaliseLabel } from "./db.mjs";

/** A database with no reference data at all — which is hosted, today. */
const EMPTY_EXISTING = Object.freeze({ openCommitteeYear: null });

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

/**
 * The seven onboarding items LAN-124 names, using the club's own codes.
 *
 * The codes and the `is_subscription` flag mirror `ONBOARDING_TYPES` in
 * `scripts/seed-local.mjs`, which is where this vocabulary was established.
 * Inventing a parallel set — `subscription_paid` beside `subs_paid` — would
 * have produced two of each item on any database that had both, and the
 * database says so directly: `onboarding_item_types_one_subscription_per_season`
 * permits exactly one subscription item per season, so a second is refused
 * rather than duplicated.
 *
 * `[code, label, is_required, is_subscription]`.
 */
const ONBOARDING_TYPES = Object.freeze([
  ["subs_invoiced", "Subscription invoiced", true, false],
  ["subs_paid", "Subscription paid", false, true],
  ["kit_sorted", "Kit sorted", true, false],
  ["bucs_play", "BUCS Play registration", true, false],
  ["hudl_access", "Hudl access", false, false],
  ["photo", "Squad photo", false, false],
  ["comms_groups", "Comms groups joined", true, false],
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
  ["onboarding", 6],
  ["departed", 1],
]);

/** Availability across the active squad: 33 green, 4 orange, 2 red. */
const AVAILABILITY_DISTRIBUTION = Object.freeze([
  ["green", 33],
  ["orange", 4],
  ["red", 2],
]);

/**
 * Reasons attached to a "no".
 *
 * The schema requires one — `rsvp_responses_no_needs_a_reason` — and the report
 * shows them to leadership, so they have to read like things a student would
 * actually type. None of them is a health statement: availability is level-only
 * by decision, and a reason field is not a route around that.
 */
const NO_REASONS = Object.freeze([
  "Lab session runs until eight.",
  "Away for a family birthday.",
  "Essay deadline the next morning.",
  "Working a shift.",
  "Travelling back from home.",
  "Clashes with a college dinner.",
]);

/**
 * Turns a register's shape into one person's presence.
 *
 * The counts arrive as "22 present, 2 late, 2 excused, 6 absent" and are laid
 * out in that order across the audience, so the same person is in the same
 * state on every run. Anyone past the end of the register has no record at all,
 * which is what the mismatch view is for.
 */
function presenceFor(index, register) {
  const bands = [
    ["present", register.present ?? 0],
    ["late", register.late ?? 0],
    ["excused", register.excused ?? 0],
    ["absent", register.absent ?? 0],
  ];
  let ceiling = 0;
  for (const [presence, count] of bands) {
    ceiling += count;
    if (index < ceiling) return presence;
  }
  return null;
}

/** The two fictional prospects LAN-124 asks for. Invented, and clearly so. */
const PROSPECTS = Object.freeze([
  {
    key: "prospect-1",
    givenName: "Marisol",
    familyName: "Okonkwo-Bright",
    status: "engaged",
    via: "Freshers' Fair sign-up",
    notes: "Played flag in Lagos; came to the taster and asked about kit.",
  },
  {
    key: "prospect-2",
    givenName: "Teodor",
    familyName: "Vasquez-Lindqvist",
    status: "committed",
    via: "Brought by a current player",
    notes: "Committed after the open session; waiting on BUCS registration.",
  },
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
 * @param {object} [input.existing]   from `readExisting` — reference data to adopt
 * @param {string} [input.anchor]     the walkthrough date
 */
export function buildPlan({
  players,
  termCard,
  params,
  existing = EMPTY_EXISTING,
  anchor = ANCHOR,
}) {
  const rows = [];
  const provenance = [];

  /**
   * The reference labels this run operates under.
   *
   * Overridable so the loader can be rehearsed against a database that is
   * already in use without colliding with it. The automated test relies on it:
   * it points the loader at its own season labels and its own position
   * vocabulary and marks the season `archived`, so its rows are invisible to
   * every "current season" query the rest of the suite makes. Without that, a
   * loader test that commits changes the roster another suite counts — which it
   * did, and which is a defect in the test rather than in the suites it broke.
   *
   * The defaults are the real showcase. Brian never passes these.
   */
  const labels = {
    currentSeason: params.labels?.currentSeason ?? CURRENT_SEASON_LABEL,
    archivedSeason: params.labels?.archivedSeason ?? ARCHIVED_SEASON_LABEL,
    vocabularyCode: params.labels?.vocabularyCode ?? "oulafc_2026",
    seasonStatus: params.labels?.seasonStatus ?? "active",
  };

  /**
   * Adopts an existing reference row, or plans a new one.
   *
   * Reference tables carry natural unique keys, and `committee_years` refuses
   * two overlapping years outright. Adopting is therefore not an optimisation:
   * a loader that always inserted would fail on any database that had ever been
   * seeded, and would create a second committee year in hosted the moment
   * somebody added a first.
   *
   * An adopted row is not added to the plan, so `rollback` will not delete it —
   * which is right. The loader removes what it created and nothing else.
   */
  const adopt = (existingId, table, columns, classification, source) => {
    // A row carrying the identifier this loader would have generated is *this
    // loader's*, from an earlier run — not somebody else's to leave alone.
    // Treating it as adopted left it out of the plan, so rollback kept the
    // season while deleting the person who opened it, and the foreign key
    // refused. Adoption means "not ours"; our own identifier never is.
    if (existingId && existingId === columns.id) {
      return add(table, columns, classification, source);
    }
    if (existingId) {
      provenance.push({
        table,
        id: existingId,
        classification,
        ...source,
        note: "adopted — already present, not created by this loader",
      });
      return existingId;
    }
    return add(table, columns, classification, source);
  };

  const add = (table, columns, classification, source) => {
    rows.push({ table, columns });
    provenance.push({ table, id: columns.id, classification, ...source });
    return columns.id;
  };

  // -------------------------------------------------------------------------
  // Reference data. Seasons, terms, committee years and position vocabularies
  // are created here when hosted does not have them yet. The role catalogue is
  // the exception and is adopted rather than created — see below.
  // -------------------------------------------------------------------------

  // Which season the showcase operates in decides which position vocabulary it
  // uses, so both are resolved before anything that references either.
  const existingCurrent = existing.seasons?.get(normaliseLabel(labels.currentSeason)) ?? null;
  const existingArchived = existing.seasons?.get(normaliseLabel(labels.archivedSeason)) ?? null;

  // The vocabulary the loader would create, whether or not it exists yet. Named
  // so ownership can be decided the same way in both branches below — taking it
  // from the season and skipping that question left a vocabulary the loader had
  // created surviving one rollback and disappearing on the next.
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
    "source-derived",
    { source: "OULAFC Master Table.xlsx / Databank For Dropdowns" },
  );

  if (existingCurrent) {
    provenance.push({
      table: "public.position_vocabularies",
      id: vocabularyId,
      classification: "source-derived",
      source: "the adopted season's own vocabulary",
      note: "adopted — the season names it, and position assignments must use it",
    });
  }

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
      "source-derived",
      { source: "OULAFC Master Table.xlsx / Databank For Dropdowns", cell: code },
    );
    positionIds.set(code, { id: positionId, side });
  });

  // Michaelmas 2026-27, dated from the term card's own week -1 and week 8.
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
    "source-derived",
    { source: "260720 OULAFC MT26 Term Card v0.xlsx" },
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

  // The role catalogue is not this loader's to create. Since LAN-128 it is
  // created by `supabase/migrations/20260819090100_role_catalogue.sql`, in
  // hosted and local alike, and the application role holds `select` on it and
  // nothing else. So the showcase adopts the seats the migration made and
  // creates none: a loader that invented one would be the second, divergent
  // copy of the catalogue that migration exists to abolish.
  //
  // A missing seat therefore means the migration has not been applied to this
  // database. That is a handoff step Brian performs, and the loader says so
  // rather than quietly inventing a role and continuing.
  const roles = existing.roles ?? new Map();

  const roleFacts = (code) => {
    const role = roles.get(code);
    if (!role)
      throw new Error(
        `public.roles has no seat with code "${code}". Apply the role-catalogue ` +
          "migration to this database before running the showcase loader.",
      );
    return role;
  };

  // -------------------------------------------------------------------------
  // The people who run the walkthrough. Their Auth users are created by Brian
  // by hand — no agent creates one — and their identifiers arrive as private
  // parameters rather than through any committed file.
  // -------------------------------------------------------------------------

  const operators = [];

  for (const key of ["brian", "stewart", "coach"]) {
    const person = params[key];
    if (!person) continue;

    // Look before inserting. `docs/pilot-data-manifest.md` binds this: an
    // existing hosted Auth user, Person and operator link are inventoried, not
    // duplicated. Creating a second Person for somebody who already has one is
    // invariant I1's failure mode, and it is undone by an audited merge rather
    // than by a delete — so the loader must never be the thing that does it.
    const linked = person.authUserId ? existing.operators?.get(person.authUserId) : undefined;

    const personId = linked ? linked.personId : id("people", `operator:${key}`);

    if (linked) {
      provenance.push({
        table: "public.people",
        id: personId,
        classification: "illustrative",
        source: `private parameters (${key})`,
        note: "adopted — this Auth user already resolves to a Person, which is not this loader's to replace",
      });
    } else {
      add(
        "public.people",
        {
          id: personId,
          given_name: person.givenName,
          family_name: person.familyName ?? null,
        },
        "illustrative",
        { source: `private parameters (${key})` },
      );
    }

    if (person.phone) {
      add(
        "public.contact_points",
        {
          id: id("contact_points", `operator:${key}`),
          person_id: personId,
          kind: "phone",
          raw_value: person.phone,
          // Preferred only when the loader created this Person. An adopted one
          // may already have a preferred phone, and
          // `contact_points_one_preferred_per_kind` is a *partial* unique index
          // — on `(person_id, kind) where is_preferred` — which the loader's
          // `on conflict (id)` clause does not cover. Writing a second
          // preferred number aborted the whole load, after preflight had said
          // it would not, which is exactly the failure the adoption path was
          // added to prevent.
          //
          // Not preferred is also the right answer on its own terms: the club's
          // own record of how to reach somebody should win over one supplied for
          // a demonstration. `selectMobileNumber` orders by preference and then
          // by recency, so this number is still used when there is no other.
          is_preferred: !linked,
          valid_from: "2026-06-01",
          source: "supplied privately at execution time",
        },
        "illustrative",
        { source: `private parameters (${key}) — value never recorded here` },
      );
    }

    if (person.authUserId && linked) {
      // The link is already there and already points somewhere. Left alone:
      // `operator_accounts_auth_user_key` is unique on `auth_user_id`, which the
      // loader's `on conflict (id)` clause does not cover, so writing a second
      // row would abort the entire load — and rewriting the existing one would
      // repoint a real person's login.
      provenance.push({
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
    { source: "showcase — the season the 42 source players are archived into" },
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
      // `seasons_closing_is_recorded` requires an archived season to say who
      // closed it and when. Normally this season is `active` and these are
      // null; a rehearsal that marks it archived to stay out of the way of
      // "current season" queries still has to satisfy the constraint.
      closed_at: labels.seasonStatus === "archived" ? "2027-06-30T18:00:00Z" : null,
      closed_by_person_id: labels.seasonStatus === "archived" ? actorPersonId : null,
    },
    "illustrative",
    { source: "showcase — the season the walkthrough operates in" },
  );

  // Role assignments, now that both cycles exist.
  for (const operator of operators) {
    for (const code of operator.roles) {
      const role = roleFacts(code);
      const scope = role.scope;

      add(
        "public.role_assignments",
        {
          id: id("role_assignments", labels.currentSeason, operator.key, code),
          person_id: operator.personId,
          role_id: role.id,
          scope,
          is_constitutional_office: role.is_constitutional_office,
          // Read from the catalogue, never asserted here: the composite foreign
          // key refuses an assignment that disagrees with the seat.
          is_single_holder_seat: role.is_single_holder_seat,
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
  ONBOARDING_TYPES.forEach(([code, label, isRequired, isSubscription], index) => {
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
      },
      "illustrative",
      { source: "LAN-124 — the seven onboarding types it names" },
    );
    onboardingTypeIds.set(code, typeId);
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

    const archivedMembershipId = id("season_memberships", labels.archivedSeason, player.key);
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
    const membershipId = id("season_memberships", labels.currentSeason, player.key);
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
        // Every returner links back, which is what rollover does. The old
        // `carried_forward` status used to gate this and no longer exists;
        // `entry` is where new-versus-returning always lived.
        carried_forward_from_id: entry === "returning" ? archivedMembershipId : null,
        confirmed_on: "2026-07-10",
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
          id: id("position_assignments", labels.currentSeason, player.key, slot),
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
          id: id("onboarding_items", labels.currentSeason, player.key, code),
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
        id: id("onboarding_items", labels.currentSeason, player.key, "kit_sorted"),
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
        id: id("availability_statuses", labels.currentSeason, entry.player.key),
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

  // -------------------------------------------------------------------------
  // The real Michaelmas term card. Every entry becomes a *draft* future event:
  // LAN-124 permits nothing else, and the tentative ones — the four "Lancers vs
  // TBD" fixtures and every S&C session whose venue reads TBD — must never be
  // approved or invited by the loader. Nothing here writes an audience, so none
  // of them can be.
  // -------------------------------------------------------------------------

  for (const entry of termCard) {
    add(
      "public.events",
      {
        id: entry.eventId,
        season_id: seasonId,
        term_id: termId,
        week_number: entry.week,
        name: entry.name,
        event_type: entry.eventType,
        origin: entry.eventType === "game" ? "negotiated" : "club_controlled",
        status: "draft",
        scheduled_on: entry.scheduledOn,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
        venue: entry.venue,
        is_mandatory: entry.eventType === "practice" || entry.eventType === "game",
        owner_person_id: actorPersonId,
      },
      "source-derived",
      {
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
    );
  }

  // -------------------------------------------------------------------------
  // The illustrative current week. This is the operational story the Monday
  // report is generated from, and it is invented — the source workbooks say
  // nothing about August 2026.
  // -------------------------------------------------------------------------

  const playerAudience = memberships.filter((entry) => entry.status === "active").slice(0, 32);

  const committee = operators.filter((operator) => operator.roles.length > 0);

  /** Builds one scenario event, its audience, invitations, answers and register. */
  const scenario = ({
    key,
    name,
    eventType,
    dayOffset,
    startsAt,
    endsAt,
    venue,
    status,
    audience = playerAudience,
    capacity = "player",
    answers = null,
    register = null,
    walkUps = 0,
    decisionReason = null,
  }) => {
    const eventId = id("events", "scenario", labels.currentSeason, key);
    const scheduledOn = addDays(anchor, dayOffset);
    const decided = status !== "draft";
    // D30: an event has occurred when its date has passed and it was not
    // cancelled. Nothing asserts it, so the loader derives it from the same
    // two facts every reader does.
    const concluded = status === "approved" && dayOffset < 0;

    add(
      "public.events",
      {
        id: eventId,
        season_id: seasonId,
        term_id: null,
        week_number: null,
        name,
        event_type: eventType,
        origin: "club_controlled",
        status,
        scheduled_on: scheduledOn,
        starts_at: startsAt,
        ends_at: endsAt,
        venue,
        is_mandatory: eventType === "practice",
        owner_person_id: actorPersonId,
        audience_confirmed_at: decided ? `${scheduledOn}T09:00:00Z` : null,
        audience_confirmed_by_person_id: decided ? actorPersonId : null,
        approved_at: decided ? `${scheduledOn}T09:05:00Z` : null,
        approved_by_person_id: decided ? actorPersonId : null,
        decision_reason: decisionReason,
      },
      "illustrative",
      { source: `LAN-124 current-week scenario (${key})` },
    );

    if (audience.length === 0) return eventId;

    audience.forEach((member, index) => {
      const isPlayer = capacity === "player";
      const participantKey = isPlayer ? member.player.key : member.key;
      const audienceMemberId = id(
        "event_audience_members",
        labels.currentSeason,
        key,
        participantKey,
      );

      add(
        "public.event_audience_members",
        {
          id: audienceMemberId,
          event_id: eventId,
          season_id: seasonId,
          capacity,
          season_membership_id: isPlayer ? member.membershipId : null,
          person_id: isPlayer ? null : member.personId,
          added_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `scenario audience (${key})` },
      );

      if (!decided) return;

      const invitationId = id("invitations", labels.currentSeason, key, participantKey);

      // Whether this person answered is decided before the invitation is
      // written, because the invitation's own status records it: an answered
      // invitation is `responded`, an unanswered one is `issued`. Writing the
      // invitation first and the answer afterwards left every one of them
      // looking unanswered on the delivery screen.
      const { yes = 0, no = 0 } = answers ?? {};
      const response = answers ? (index < yes ? "yes" : index < yes + no ? "no" : null) : null;

      add(
        "public.invitations",
        {
          id: invitationId,
          event_id: eventId,
          event_status: status,
          season_id: seasonId,
          capacity,
          season_membership_id: isPlayer ? member.membershipId : null,
          person_id: isPlayer ? null : member.personId,
          status: response ? "responded" : "issued",
          issued_at: `${scheduledOn}T09:10:00Z`,
          // LAN-77's audience freeze: an invitation names the audience row it
          // came from, and the column is not nullable. There is no way to
          // invite somebody who was never in the confirmed audience.
          audience_member_id: audienceMemberId,
        },
        "illustrative",
        { source: `scenario invitation (${key})` },
      );

      if (response) {
        add(
          "public.rsvp_responses",
          {
            id: id("rsvp_responses", labels.currentSeason, key, participantKey),
            invitation_id: invitationId,
            response,
            reason: response === "no" ? NO_REASONS[index % NO_REASONS.length] : null,
            source: "signed_link",
            responded_at: `${scheduledOn}T12:00:00Z`,
          },
          "illustrative",
          { source: `scenario answer (${key})` },
        );
      }

      // The register, for events that occurred.
      if (register && concluded && isPlayer) {
        const presence = presenceFor(index, register);
        if (presence) {
          add(
            "public.attendance_records",
            {
              id: id("attendance_records", labels.currentSeason, key, participantKey),
              event_id: eventId,
              event_status: status,
              season_id: seasonId,
              capacity,
              season_membership_id: member.membershipId,
              person_id: null,
              presence,
              recorded_by_person_id: actorPersonId,
            },
            "illustrative",
            { source: `scenario register (${key})` },
          );
        }
      }
    });

    // Walk-ups: present at the event, never in its audience. Taken from the
    // active squad beyond the 32 who were invited, so the register genuinely
    // holds somebody the invitation list does not.
    for (let index = 0; index < walkUps; index += 1) {
      const member = memberships.filter((entry) => entry.status === "active")[32 + index];
      if (!member) break;
      add(
        "public.attendance_records",
        {
          id: id("attendance_records", labels.currentSeason, key, "walkup", member.player.key),
          event_id: eventId,
          event_status: status,
          season_id: seasonId,
          capacity: "player",
          season_membership_id: member.membershipId,
          person_id: null,
          presence: "present",
          recorded_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `scenario walk-up (${key})` },
      );
    }

    return eventId;
  };

  // The eight events LAN-124 specifies, in its order.
  scenario({
    key: "sc-preseason",
    name: "Pre-season S&C",
    eventType: "strength_and_conditioning",
    dayOffset: -6,
    startsAt: "19:00",
    endsAt: "20:00",
    venue: "Blues Gym, Iffley Road",
    status: "approved",
    answers: { yes: 24, no: 4 },
    register: { present: 22, late: 2, excused: 2, absent: 6 },
  });

  scenario({
    key: "sc-chalk",
    name: "Team Chalk",
    eventType: "chalk",
    dayOffset: -4,
    startsAt: "18:00",
    endsAt: "19:00",
    venue: "Microsoft Teams",
    status: "approved",
    answers: { yes: 20, no: 6 },
    register: { present: 19, late: 1, excused: 4, absent: 8 },
  });

  scenario({
    key: "sc-field",
    name: "Pre-season Field Session",
    eventType: "practice",
    dayOffset: -2,
    startsAt: "10:00",
    endsAt: "13:00",
    venue: "University Parks",
    status: "approved",
    answers: { yes: 25, no: 3 },
    register: { present: 22, late: 2, excused: 3, absent: 5 },
    walkUps: 1,
  });

  scenario({
    key: "sc-equipment",
    name: "Equipment and Admin Check",
    eventType: "meeting",
    dayOffset: -1,
    startsAt: "17:00",
    endsAt: "18:00",
    venue: "Iffley Road",
    status: "approved",
    audience: committee,
    capacity: "committee",
  });

  // The live demonstration. A draft with a confirmed-nothing audience of two,
  // waiting for Brian to approve it in front of Stewart.
  scenario({
    key: "sc-walkthrough",
    name: "Leadership Walkthrough",
    eventType: "meeting",
    dayOffset: 0,
    startsAt: "14:00",
    endsAt: "15:00",
    venue: "Iffley Road",
    status: "draft",
    audience: committee,
    capacity: "committee",
  });

  scenario({
    key: "sc-practice",
    name: "Pre-season Practice",
    eventType: "practice",
    dayOffset: 2,
    startsAt: "20:00",
    endsAt: "22:30",
    venue: "Iffley Road Astro",
    status: "approved",
    answers: { yes: 13, no: 5 },
  });

  scenario({
    key: "sc-committee",
    name: "Committee Planning",
    eventType: "meeting",
    dayOffset: 4,
    startsAt: "18:00",
    endsAt: "19:30",
    venue: "Vincent's Club",
    status: "approved",
    audience: committee,
    capacity: "committee",
  });

  scenario({
    key: "sc-open",
    name: "Open Field Session",
    eventType: "practice",
    dayOffset: 6,
    startsAt: "10:00",
    endsAt: "12:00",
    venue: "University Parks",
    status: "draft",
    audience: [],
  });

  // The third stored status, so every one of the three is represented
  // somewhere. `not_held` and `withdrawn` were here until LAN-151 retired them:
  // a session called off is a cancellation, and an event that never happened is
  // a draft.
  scenario({
    key: "sc-not-held",
    name: "Kit Collection",
    eventType: "meeting",
    dayOffset: -8,
    startsAt: "12:00",
    endsAt: "13:00",
    venue: "Iffley Road",
    status: "cancelled",
    audience: committee,
    capacity: "committee",
    decisionReason: "Kit did not arrive from the supplier in time.",
  });

  scenario({
    key: "sc-withdrawn",
    name: "Alumni Touch Game",
    eventType: "social",
    dayOffset: 9,
    startsAt: "14:00",
    endsAt: "16:00",
    venue: "University Parks",
    status: "draft",
    audience: [],
    decisionReason: "Clashed with the BUCS fixture window; folded into the open session.",
  });

  // -------------------------------------------------------------------------
  // Recruitment. Two fictional prospects, so the report's section is populated
  // without inventing anything about a real person.
  // -------------------------------------------------------------------------

  PROSPECTS.forEach((prospect, index) => {
    const personId = id("people", `prospect:${labels.currentSeason}:${prospect.key}`);
    add(
      "public.people",
      {
        id: personId,
        given_name: prospect.givenName,
        family_name: prospect.familyName,
      },
      "illustrative",
      { source: "LAN-124 — fictional recruitment prospect" },
    );

    const prospectId = add(
      "public.recruitment_prospects",
      {
        id: id("recruitment_prospects", labels.currentSeason, prospect.key),
        person_id: personId,
        season_id: seasonId,
        status: prospect.status,
        source: prospect.via,
        first_contact_on: addDays(anchor, -14 + index * 3),
        committed_on: prospect.status === "committed" ? addDays(anchor, -3) : null,
      },
      "illustrative",
      { source: "LAN-124 — fictional recruitment prospect" },
    );

    // LAN-201: notes live on their own attributed, dated table now.
    add(
      "public.recruitment_prospect_notes",
      {
        id: id("recruitment_prospect_notes", labels.currentSeason, prospect.key),
        prospect_id: prospectId,
        note: prospect.notes,
        author_label: "LAN-124 — fictional recruitment prospect",
      },
      "illustrative",
      { source: "LAN-124 — fictional recruitment prospect" },
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
      roles,
      positionIds,
      onboardingTypeIds,
    },
  };
}
