/**
 * The squad — LAN-221.
 *
 * Forty invented players, every membership status, contact details in every
 * shape the club actually types, first-name-only records, two near-duplicate
 * pairs, one already-merged pair, aliases, emergency contacts, availability in
 * every colour, and consent in every state. Nothing here corresponds to a
 * member of the club; the names are invented (Brian, 2026-09-03) and every
 * contact value is in a reserved, non-deliverable range.
 *
 * The distribution is assigned by index, never drawn, so a rerun puts the same
 * person in the same state with the same identifier.
 */

import { id } from "../ids.mjs";
import { dramaPhone, exampleEmail } from "./context.mjs";

const GIVEN = Object.freeze([
  "Alaric",
  "Beatrix",
  "Caspian",
  "Delphine",
  "Emrys",
  "Florian",
  "Guinevere",
  "Hamish",
  "Isolde",
  "Jasper",
  "Kenelm",
  "Leocadia",
  "Marius",
  "Nerissa",
  "Octavian",
  "Philippa",
  "Quentin",
  "Rowena",
  "Sebastien",
  "Tamsin",
  "Ulric",
  "Verity",
  "Wilfred",
  "Xanthe",
  "Yorick",
  "Zenobia",
  "Ambrose",
  "Bronwen",
  "Cormac",
  "Dorothea",
  "Evander",
  "Fenella",
  "Gideon",
  "Honoria",
  "Inigo",
  "Jocasta",
  "Kasimir",
  "Lavinia",
  "Montague",
  "Ottoline",
]);

const FAMILY = Object.freeze([
  "Ashcombe",
  "Blakeney",
  "Carrow",
  "Dunstable",
  "Elverton",
  "Fairweather",
  "Greatorex",
  "Hollingbery",
  "Iddesleigh",
  "Jephcott",
  "Kettering",
  "Loxley",
  "Marchbanks",
  "Northcote",
  "Oyelaran",
  "Pemberton",
  "Quarrington",
  "Ravenscroft",
  "Stancliffe",
  "Thurlestone",
  "Underhill",
  "Vavasour",
  "Wraxall",
  "Yeardley",
  "Zouche",
  "Abernethy",
  "Broughton",
  "Chudleigh",
  "Danvers",
  "Everleigh",
  "Frayne",
  "Godolphin",
  "Hazelrigg",
  "Ingoldsby",
  "Kingscote",
  "Lestrange",
  "Merriweather",
  "Oakenshaw",
  "Pennefather",
  "Rokeby",
]);

const COLLEGES = Object.freeze([
  "Balliol",
  "Brasenose",
  "Christ Church",
  "Corpus Christi",
  "Exeter",
  "Hertford",
  "Jesus",
  "Keble",
  "Lincoln",
  "Magdalen",
  "Merton",
  "New College",
  "Oriel",
  "Pembroke",
  "Queen's",
  "St Anne's",
  "St Catherine's",
  "St Hilda's",
  "St John's",
  "Somerville",
  "Trinity",
  "University",
  "Wadham",
  "Worcester",
]);

const DEGREES = Object.freeze([
  "Engineering Science",
  "History",
  "PPE",
  "Medicine",
  "Law",
  "Mathematics",
  "Chemistry",
  "Physics",
  "Biology",
  "Geography",
  "Modern Languages",
  "Computer Science",
  "Economics",
]);

/**
 * Forty players by index. Statuses: 28 active, 3 inactive, 5 onboarding,
 * 2 departed, plus two returners still to confirm this season who exist only
 * in the archived season (indexes 40, 41 — "carried forward, not yet in").
 */
const STATUS_BY_INDEX = Object.freeze([
  ...Array(28).fill("active"),
  "inactive",
  "inactive",
  "inactive",
  "onboarding",
  "onboarding",
  "onboarding",
  "onboarding",
  "onboarding",
  "departed",
  "departed",
  "active",
  "active",
]);

/** Which onboarding story each `onboarding` player tells — see onboarding.mjs. */
export const ONBOARDING_STORIES = Object.freeze({
  31: "fresh", // welcome sent, nothing back yet
  32: "midway", // some answered, BUCS claimed, subs invoiced
  33: "disputed", // answered with a value the club disagrees with
  34: "ready", // everything complete or claimed — ready to activate
  35: "refused", // refused messaging consent; a chase can go nowhere
});

const AVAILABILITY_BY_INDEX = (index) => {
  if (index % 9 === 4) return "orange";
  if (index % 13 === 6) return "red";
  return "green";
};

const CONSENT_BY_INDEX = (index) => {
  if (index === 35) return "refused";
  if (index === 26) return "withdrawn";
  if (index === 31) return "asked";
  if (index === 30) return "never_asked";
  return "granted";
};

/** A first name only, one in five. The club's own data rate is about that. */
const firstNameOnly = (index) => index % 5 === 4;

export function buildPeople(ctx, reference) {
  const { add, labels, day, at } = ctx;
  const {
    seasonId,
    archivedSeasonId,
    actorPersonId,
    positionIds,
    deferredPlayerSeats,
    assignSeat,
  } = reference;

  const players = [];

  for (let index = 0; index < 40; index += 1) {
    const key = `p${String(index + 1).padStart(2, "0")}`;
    const givenName = GIVEN[index];
    const familyName = firstNameOnly(index) ? null : FAMILY[(index * 7 + 3) % FAMILY.length];
    const academic = index % 6 !== 5;
    const matriculation = 2022 + (index % 4);
    const status = STATUS_BY_INDEX[index];

    const personId = add(
      "public.people",
      {
        id: id("people", key),
        given_name: givenName,
        family_name: familyName,
        college: academic ? COLLEGES[(index * 5) % COLLEGES.length] : null,
        matriculation_year: academic ? matriculation : null,
        expected_graduation_year: academic ? matriculation + (index % 3 === 0 ? 4 : 3) : null,
        degree_field: academic ? DEGREES[(index * 3) % DEGREES.length] : null,
        date_of_birth:
          index % 4 === 3
            ? null
            : index === 37
              ? day(-365 * 17 - 40) // the one under-18: seventeen and a bit
              : `${2003 + (index % 5)}-${String(1 + (index % 12)).padStart(2, "0")}-${String(1 + (index % 27)).padStart(2, "0")}`,
        created_at: at(-70, "09:00"),
        updated_at: at(-70, "09:00"),
      },
      "illustrative",
      { source: `player ${key}` },
      [
        "person.player",
        ...(familyName === null ? ["person.first-name-only"] : []),
        ...(index === 37 ? ["person.under-18"] : []),
        ...(index % 4 === 3 ? ["person.missing-required"] : []),
      ],
      index === 0 ? "person.player.first" : index === 37 ? "person.under-18" : null,
    );

    // Contact points, in the shapes the club really types. Four people have
    // no phone at all (one of them is the "no usable route" invitee).
    const phoneShape = [
      "spaced",
      "spaced",
      "international",
      "plain",
      "spaced",
      "no-leading-zero",
      "spaced",
      "trailing-space",
      "one-short",
      "north-american",
    ][index % 10];
    const noPhone = index % 10 === 3 && index > 3 && index < 30; // 13, 23 → and 3 has one
    if (!noPhone) {
      const raw = dramaPhone(index + 1, phoneShape);
      const clean = ["spaced", "international", "plain"].includes(phoneShape);
      add(
        "public.contact_points",
        {
          id: id("contact_points", key, "phone"),
          person_id: personId,
          kind: "phone",
          scope: null,
          raw_value: raw,
          normalised_value: clean ? `07700900${String(index + 1).padStart(3, "0")}` : null,
          is_preferred: true,
          valid_from: day(-70),
          valid_until: null,
          source: index % 3 === 0 ? "sign-up form" : "intake form",
        },
        "illustrative",
        { source: `player ${key}` },
        ["contact.phone", ...(clean ? [] : ["contact.phone.malformed"])],
        phoneShape === "one-short" ? "contact.phone.malformed" : null,
      );
    } else {
      ctx.tag("person.no-phone", personId);
      if (index === 13) ctx.example("person.no-phone", personId);
    }

    if (index % 3 !== 1) {
      const local = `${givenName.toLowerCase()}.${(familyName ?? "x").slice(0, 4).toLowerCase()}${index}`;
      const typo = index === 8;
      add(
        "public.contact_points",
        {
          id: id("contact_points", key, "email"),
          person_id: personId,
          kind: "email",
          scope: index % 2 === 0 ? "college" : "personal",
          raw_value: typo
            ? exampleEmail(local).replace("ox.ac.example", "ox.ac.exmaple")
            : exampleEmail(local, index % 2 === 0 ? "college" : "personal"),
          normalised_value: typo
            ? null
            : exampleEmail(local, index % 2 === 0 ? "college" : "personal"),
          is_preferred: true,
          valid_from: day(-70),
          valid_until: null,
          source: "intake form",
        },
        "illustrative",
        { source: `player ${key}` },
        ["contact.email", ...(typo ? ["contact.email.malformed"] : [])],
      );
    }

    // One superseded college address, dated, kept and not preferred.
    if (index === 2) {
      add(
        "public.contact_points",
        {
          id: id("contact_points", key, "email-old"),
          person_id: personId,
          kind: "email",
          scope: "college",
          raw_value: exampleEmail(`${givenName.toLowerCase()}.old`),
          normalised_value: exampleEmail(`${givenName.toLowerCase()}.old`),
          is_preferred: false,
          valid_from: "2024-10-01",
          valid_until: day(-71),
          source: "2024 roster",
        },
        "illustrative",
        { source: `player ${key} — superseded address` },
        ["contact.superseded"],
        "contact.superseded",
      );
      ctx.example("person.contact-superseded", personId);
    }

    // Aliases: a display name for a few, and several forms for three people.
    const aliases =
      index === 0
        ? [
            ["Al", true],
            ["A. Ashcombe", false],
            ["Alaric A.", false],
          ]
        : index === 3
          ? [
              ["Delph", true],
              ["D. Vavasour", false],
            ]
          : index === 11
            ? [
                ["Leo", false],
                ["L. Frayne", false],
              ]
            : index === 21
              ? [["Vee", true]]
              : [];
    for (const [alias, isDisplay] of aliases) {
      add(
        "public.person_aliases",
        {
          id: id("person_aliases", key, alias),
          person_id: personId,
          alias,
          source: isDisplay ? "asked to be called this" : "legacy roster workbook",
          noted_at: at(-70, "09:00"),
          is_display_name: isDisplay,
        },
        "illustrative",
        { source: `player ${key}` },
        ["person.alias", ...(isDisplay ? ["person.alias.display"] : [])],
        index === 0 && isDisplay ? "person.alias.display" : null,
      );
    }

    // Emergency contacts for most of the squad; the gaps feed the missing queue.
    if (index % 5 !== 3) {
      add(
        "public.person_emergency_contacts",
        {
          id: id("person_emergency_contacts", key),
          person_id: personId,
          given_name: GIVEN[(index * 11 + 5) % GIVEN.length],
          family_name: familyName ?? FAMILY[(index * 2) % FAMILY.length],
          relationship: ["Mother", "Father", "Guardian", "Sibling", "Partner"][index % 5],
          phone: dramaPhone(500 + index, "spaced"),
          email: index % 2 === 0 ? exampleEmail(`ec.${key}`, "personal") : null,
          recorded_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `player ${key}` },
        ["person.emergency-contact"],
      );
    } else {
      ctx.tag("person.missing-required", personId);
    }

    // Consent, season-scoped, in every state.
    const consent = CONSENT_BY_INDEX(index);
    add(
      "public.season_messaging_consents",
      {
        id: id("season_messaging_consents", labels.currentSeason, key),
        person_id: personId,
        season_id: seasonId,
        state: consent,
        source: ["granted", "refused", "withdrawn"].includes(consent)
          ? index % 2 === 0
            ? "qr_self_entry"
            : "operator_recorded"
          : null,
        changed_at: at(-55 + (index % 20), "10:00"),
        recorded_by_person_id:
          ["granted", "refused", "withdrawn"].includes(consent) && index % 2 === 1
            ? actorPersonId
            : null,
      },
      "illustrative",
      { source: `player ${key}` },
      [`consent.${consent}`],
      consent !== "granted" ? `consent.${consent}` : null,
    );

    // Memberships. Thirty returners have an archived membership behind them;
    // ten are new this season.
    const returning = index % 4 !== 2;
    let archivedMembershipId = null;
    if (returning) {
      archivedMembershipId = add(
        "public.season_memberships",
        {
          id: id("season_memberships", labels.archivedSeason, key),
          person_id: personId,
          season_id: archivedSeasonId,
          status: "archived",
          entry: index % 8 === 0 ? "new" : "returning",
          carried_forward_from_id: null,
          confirmed_on: "2025-09-15",
          activated_on: "2025-10-05",
          departed_on: null,
          expected_return_on: null,
          departure_reason: null,
          inactivity_label: null,
          created_at: "2025-09-01T09:00:00Z",
          updated_at: "2026-07-01T10:00:00Z",
        },
        "illustrative",
        { source: `player ${key} — last season` },
        ["membership.archived"],
      );
      for (const [from, to, when, reason] of [
        [null, "onboarding", "2025-09-15T09:00:00Z", null],
        ["onboarding", "active", "2025-10-05T09:00:00Z", null],
        ["active", "archived", "2026-07-01T10:00:00Z", "Season close"],
      ]) {
        add(
          "public.season_membership_status_events",
          {
            id: id("season_membership_status_events", labels.archivedSeason, key, to),
            season_membership_id: archivedMembershipId,
            from_status: from,
            to_status: to,
            occurred_at: when,
            actor_person_id: actorPersonId,
            actor_label: null,
            reason,
          },
          "illustrative",
          { source: `player ${key} — last season` },
        );
      }
    }

    const membershipId = id("season_memberships", labels.currentSeason, key);
    const activatedOn = ["active", "inactive", "departed"].includes(status)
      ? day(-45 + (index % 10))
      : null;
    add(
      "public.season_memberships",
      {
        id: membershipId,
        person_id: personId,
        season_id: seasonId,
        status,
        entry: returning ? "returning" : "new",
        carried_forward_from_id: archivedMembershipId,
        confirmed_on: day(-55 + (index % 8)),
        activated_on: activatedOn,
        departed_on: status === "departed" ? day(-12 - (index % 5)) : null,
        expected_return_on: status === "inactive" ? day(40 + index) : null,
        departure_reason:
          status === "departed"
            ? index === 36
              ? "Left Oxford for a year abroad."
              : "Injured; not returning this season."
            : null,
        inactivity_label:
          status === "inactive" ? ["Exams", "Away this term", "Work placement"][index % 3] : null,
        created_at: at(-58, "09:00"),
        updated_at: at(-1, "09:00"),
      },
      "illustrative",
      { source: `player ${key}` },
      [`membership.${status}`, `membership.entry.${returning ? "returning" : "new"}`],
      [`membership.${status}`, "membership.entry.new"].includes(`membership.${status}`) &&
        !ctx.examples.has(`membership.${status}`)
        ? `membership.${status}`
        : null,
    );

    // The typed lifecycle history behind the membership.
    const transitions = [[null, "onboarding", at(-55 + (index % 8), "09:00"), null, null]];
    if (activatedOn)
      transitions.push(["onboarding", "active", `${activatedOn}T09:00:00Z`, actorPersonId, null]);
    if (status === "inactive")
      transitions.push([
        "active",
        "inactive",
        at(-20 + (index % 4), "09:00"),
        actorPersonId,
        ["Exams", "Away this term", "Work placement"][index % 3],
      ]);
    if (status === "departed")
      transitions.push([
        "active",
        "departed",
        at(-12 - (index % 5), "09:00"),
        actorPersonId,
        index === 36 ? "Left Oxford for a year abroad." : "Injured; not returning this season.",
      ]);
    for (const [from, to, when, actor, reason] of transitions) {
      add(
        "public.season_membership_status_events",
        {
          id: id("season_membership_status_events", labels.currentSeason, key, to),
          season_membership_id: membershipId,
          from_status: from,
          to_status: to,
          occurred_at: when,
          actor_person_id: actor,
          actor_label: actor ? null : "season-open process",
          reason,
        },
        "illustrative",
        { source: `player ${key}` },
        ["membership.status-event"],
      );
    }

    // Positions, for everyone who has been activated.
    if (activatedOn || status === "onboarding") {
      const offence = ["QB", "RB", "WR", "WR", "TE", "T", "G", "C", "FB", "WB"][index % 10];
      const defence = ["S", "CB", "LB", "E", "N/T", "CB", "LB", "S", "E", "LB"][(index * 3) % 10];
      for (const [code, slot] of [
        [offence, "offence"],
        [defence, "defence"],
      ]) {
        if (index % 7 === 6 && slot === "defence") continue; // one-sided players exist
        const position = positionIds.get(code);
        add(
          "public.position_assignments",
          {
            id: id("position_assignments", labels.currentSeason, key, slot),
            season_membership_id: membershipId,
            season_id: seasonId,
            position_vocabulary_id: reference.vocabularyId,
            position_id: position.id,
            side: position.side,
            slot,
            effective_from: activatedOn ?? day(-40),
            effective_to: null,
            recorded_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `player ${key}` },
          ["position.assigned"],
        );
      }
    }

    // Jerseys, coach groups, formalwear, eligibility, Blues — the roster board's
    // remaining columns, for activated players.
    if (activatedOn) {
      add(
        "public.jersey_assignments",
        {
          id: id("jersey_assignments", labels.currentSeason, key, "blue"),
          season_membership_id: membershipId,
          season_id: seasonId,
          kit: "blue",
          number: 1 + ((index * 7) % 99),
          is_predominant: true,
          is_import_conflict: false,
          effective_from: activatedOn,
          effective_to: null,
        },
        "illustrative",
        { source: `player ${key}` },
        ["jersey.assigned"],
      );
      if (index % 3 === 0) {
        add(
          "public.jersey_assignments",
          {
            id: id("jersey_assignments", labels.currentSeason, key, "white"),
            season_membership_id: membershipId,
            season_id: seasonId,
            kit: "white",
            number: 1 + ((index * 13 + 4) % 99),
            is_predominant: true,
            is_import_conflict: false,
            effective_from: activatedOn,
            effective_to: null,
          },
          "illustrative",
          { source: `player ${key}` },
        );
      }
      add(
        "public.coach_group_assignments",
        {
          id: id("coach_group_assignments", labels.currentSeason, key),
          season_membership_id: membershipId,
          season_id: seasonId,
          coach_group: ["Offence", "Defence", "Special teams"][index % 3],
          responsible_coach_person_id: null,
          recorded_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `player ${key}` },
      );
      for (const [item, owned] of [
        ["tie", index % 4 !== 0],
        ["bowtie", index % 3 === 0],
        ["socks", index % 7 !== 2],
      ]) {
        add(
          "public.formalwear_records",
          {
            id: id("formalwear_records", labels.currentSeason, key, item),
            season_membership_id: membershipId,
            season_id: seasonId,
            item,
            ownership: owned ? (index % 2 === 0 ? "Yes (paid)" : "Yes") : "No",
            recorded_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `player ${key}` },
        );
      }
      add(
        "public.eligibility_records",
        {
          id: id("eligibility_records", labels.currentSeason, key, "bucs"),
          season_membership_id: membershipId,
          season_id: seasonId,
          competition: "bucs",
          status: ["eligible", "eligible", "pending", "eligible", "ineligible"][index % 5],
          determining_authority: "BUCS Play",
          checked_at: index % 5 === 2 ? null : `${activatedOn}T12:00:00Z`,
          evidence_reference: index % 5 === 2 ? null : `BUCS-${2026}-${String(1000 + index)}`,
          effective_from: activatedOn,
          effective_to: null,
        },
        "illustrative",
        { source: `player ${key}` },
        ["eligibility.recorded"],
      );
      if (index % 8 === 1) {
        add(
          "public.bps_selections",
          {
            id: id("bps_selections", labels.currentSeason, key),
            season_membership_id: membershipId,
            season_id: seasonId,
            is_selected: true,
            recorded_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `player ${key}` },
        );
      }
    }
    if (archivedMembershipId && index % 9 === 2) {
      add(
        "public.blues_awards",
        {
          id: id("blues_awards", labels.archivedSeason, key),
          season_membership_id: archivedMembershipId,
          season_id: archivedSeasonId,
          half_blue_awarded: index % 18 === 2,
          full_blue_awarded: index % 18 !== 2,
          awarded_on: "2026-06-13",
          recorded_by_person_id: actorPersonId,
        },
        "illustrative",
        { source: `player ${key} — last season` },
        ["blues.awarded"],
      );
    }

    // Availability, for everyone with a live membership, in every colour.
    if (status !== "departed") {
      const level = AVAILABILITY_BY_INDEX(index);
      add(
        "public.availability_statuses",
        {
          id: id("availability_statuses", labels.currentSeason, key),
          season_membership_id: membershipId,
          level,
          effective_from: day(-21 + (index % 14)),
          review_on: level === "green" ? null : day(10 + (index % 7)),
          reported_by_person_id: personId,
          confirmed_by_person_id: level === "green" ? actorPersonId : null,
        },
        "illustrative",
        { source: `player ${key}` },
        [`availability.${level}`],
        level !== "green" && !ctx.examples.has(`availability.${level}`)
          ? `availability.${level}`
          : null,
      );
      if (index === 4) {
        // One earlier record, so the history shows a change rather than a state.
        add(
          "public.availability_statuses",
          {
            id: id("availability_statuses", labels.currentSeason, key, "earlier"),
            season_membership_id: membershipId,
            level: "green",
            effective_from: day(-40),
            review_on: null,
            reported_by_person_id: personId,
            confirmed_by_person_id: actorPersonId,
          },
          "illustrative",
          { source: `player ${key} — earlier availability` },
        );
      }
    }

    players.push({
      key,
      index,
      personId,
      membershipId,
      archivedMembershipId,
      status,
      givenName,
      familyName,
      consent,
      hasPhone: !noPhone,
      onboardingStory: ONBOARDING_STORIES[index] ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // Two returners still to confirm — they exist only in last season.
  // ---------------------------------------------------------------------------
  for (const [key, givenName, familyName] of [
    ["r-last-1", "Cressida", "Wolstenholme"],
    ["r-last-2", "Barnaby", "Quince"],
  ]) {
    const personId = add(
      "public.people",
      {
        id: id("people", key),
        given_name: givenName,
        family_name: familyName,
        created_at: "2025-09-01T09:00:00Z",
        updated_at: "2025-09-01T09:00:00Z",
      },
      "illustrative",
      { source: `last season's player ${key}` },
      ["person.past-member"],
      key === "r-last-1" ? "person.past-member" : null,
    );
    const archivedId = add(
      "public.season_memberships",
      {
        id: id("season_memberships", labels.archivedSeason, key),
        person_id: personId,
        season_id: archivedSeasonId,
        status: "archived",
        entry: "returning",
        carried_forward_from_id: null,
        confirmed_on: "2025-09-15",
        activated_on: "2025-10-05",
        created_at: "2025-09-01T09:00:00Z",
        updated_at: "2026-07-01T10:00:00Z",
      },
      "illustrative",
      { source: `last season's player ${key}` },
      ["membership.archived"],
    );
    add(
      "public.season_membership_status_events",
      {
        id: id("season_membership_status_events", labels.archivedSeason, key, "archived"),
        season_membership_id: archivedId,
        from_status: "active",
        to_status: "archived",
        occurred_at: "2026-07-01T10:00:00Z",
        actor_person_id: actorPersonId,
        actor_label: null,
        reason: "Season close",
      },
      "illustrative",
      { source: `last season's player ${key}` },
    );
    add(
      "public.contact_points",
      {
        id: id("contact_points", key, "phone"),
        person_id: personId,
        kind: "phone",
        scope: null,
        raw_value: dramaPhone(key === "r-last-1" ? 601 : 602, "spaced"),
        normalised_value: `07700900${key === "r-last-1" ? "601" : "602"}`,
        is_preferred: true,
        valid_from: "2025-09-01",
        valid_until: null,
        source: "intake form",
      },
      "illustrative",
      { source: `last season's player ${key}` },
    );
  }

  // ---------------------------------------------------------------------------
  // Near-duplicates and a merged pair.
  // ---------------------------------------------------------------------------

  // A second record for player 3 under a short form of the name, with the same
  // phone number, holding no membership. The duplicate check finds it by the
  // number; a merge (People W4) resolves it.
  const dupOf3 = players[2];
  const dupA = add(
    "public.people",
    {
      id: id("people", "dup-a"),
      given_name: "Cas",
      family_name: dupOf3.familyName,
      created_at: at(-9, "18:20"),
      updated_at: at(-9, "18:20"),
    },
    "illustrative",
    { source: "near-duplicate of player p03 — entered fresh at a sign-up table" },
    ["person.near-duplicate"],
    "person.near-duplicate",
  );
  add(
    "public.contact_points",
    {
      id: id("contact_points", "dup-a", "phone"),
      person_id: dupA,
      kind: "phone",
      scope: null,
      raw_value: dramaPhone(3, "plain"),
      normalised_value: "07700900003",
      is_preferred: true,
      valid_from: day(-9),
      valid_until: null,
      source: "walk-on attendance",
    },
    "illustrative",
    { source: "near-duplicate of player p03" },
    ["contact.phone"],
  );

  // A second near-duplicate: player 12 spelt differently, holding an archived
  // membership of its own — a returner entered fresh who was already there.
  const dupOf12 = players[11];
  const dupB = add(
    "public.people",
    {
      id: id("people", "dup-b"),
      given_name: "Leocadia",
      family_name: `${dupOf12.familyName}-Hale`,
      created_at: "2025-09-01T09:00:00Z",
      updated_at: "2025-09-01T09:00:00Z",
    },
    "illustrative",
    { source: "near-duplicate of player p12 — a spelling variant on last season's roster" },
    ["person.near-duplicate"],
  );
  add(
    "public.season_memberships",
    {
      id: id("season_memberships", labels.archivedSeason, "dup-b"),
      person_id: dupB,
      season_id: archivedSeasonId,
      status: "archived",
      entry: "new",
      confirmed_on: "2025-10-01",
      activated_on: "2025-10-10",
      created_at: "2025-09-01T09:00:00Z",
      updated_at: "2026-07-01T10:00:00Z",
    },
    "illustrative",
    { source: "near-duplicate of player p12" },
    ["membership.archived"],
  );

  // Already merged: a losing row pointing at player 7, kept and dated.
  const survivor = players[6];
  add(
    "public.people",
    {
      id: id("people", "merged-loser"),
      given_name: survivor.givenName,
      family_name: survivor.familyName,
      merged_into_person_id: survivor.personId,
      merged_at: at(-30, "11:00"),
      merged_by_person_id: actorPersonId,
      merge_reason: "Entered twice at the Freshers' Fair; same phone number.",
      created_at: at(-62, "09:00"),
      updated_at: at(-30, "11:00"),
    },
    "illustrative",
    { source: "the losing half of a merge into player p07" },
    ["person.merged"],
    "person.merged",
  );

  // ---------------------------------------------------------------------------
  // Player-held seats the reference module deferred until the players existed.
  // ---------------------------------------------------------------------------
  const playerStaff = [];
  for (const { code, playerIndex } of deferredPlayerSeats) {
    const player = players[playerIndex];
    const assignmentId = assignSeat(code, player.personId, `player:${player.key}`);
    playerStaff.push({
      code,
      personId: player.personId,
      assignmentId,
      capacity: code.endsWith("_coach") ? "coach" : "committee",
      player,
    });
  }

  return { players, dupA, dupB, playerStaff };
}
