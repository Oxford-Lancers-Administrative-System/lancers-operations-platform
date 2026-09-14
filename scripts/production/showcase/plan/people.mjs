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
import { SPECIAL_TEAMS_SLOT_BY_CODE } from "./reference.mjs";

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
  "Perpetua",
  "Quenilda",
  "Rowena",
  "Sylvestra",
  "Tarquin",
  "Ursula",
  "Valentine",
  "Wilhelmina",
  "Xanthe",
  "Yseult",
  "Zephyrine",
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
// Two of these are `ready`: with five people in the environment at once, one
// membership ready to activate means whoever presses Activate first takes the
// state away from the other seat that was sent to it.
const STATUS_BY_INDEX = Object.freeze([
  ...Array(30).fill("active"),
  ...Array(5).fill("inactive"),
  ...Array(10).fill("onboarding"),
  ...Array(5).fill("departed"),
]);

/** Which onboarding story each `onboarding` player tells — see onboarding.mjs. */
export const ONBOARDING_STORIES = Object.freeze({
  35: "fresh", // welcome sent, nothing back yet
  36: "midway", // some answered, BUCS claimed, subs invoiced
  37: "disputed", // answered with a value the club disagrees with
  38: "refused", // refused messaging consent; a chase can go nowhere
  // Five ready to activate: with five testers in one environment, one ready
  // membership means whoever presses Activate first takes the state away from
  // the other four, who then report a defect that is really a collision.
  39: "ready",
  40: "ready",
  41: "ready",
  42: "ready",
  43: "ready",
  44: "ready",
});

const AVAILABILITY_BY_INDEX = (index) => {
  if (index % 9 === 4) return "orange";
  if (index % 13 === 6) return "red";
  return "green";
};

// These track `ONBOARDING_STORIES` below: the player telling the "refused"
// story is the one who refused consent, and the "fresh" one has been asked and
// not answered. Both moved when the roster grew to fifty.
const CONSENT_BY_INDEX = (index) => {
  if (index === 38) return "refused";
  if (index === 26) return "withdrawn";
  if (index === 35) return "asked";
  if (index === 30) return "never_asked";
  return "granted";
};

/**
 * Five under 18, one per seat — an operator recording a date of birth under
 * eighteen is a workflow, and it changes the record.
 *
 * Chosen explicitly rather than by a modulus, because `index % 4 === 3` leaves
 * the date of birth null and "no date of birth on file" is a different state
 * from "under 18". None of these five collides with it.
 */
const UNDER_18 = new Set([1, 5, 9, 17, 21]);

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

  for (let index = 0; index < 50; index += 1) {
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
            : UNDER_18.has(index)
              ? day(-365 * 17 - 40) // the under-18s: seventeen and a bit
              : `${2003 + (index % 5)}-${String(1 + (index % 12)).padStart(2, "0")}-${String(1 + (index % 27)).padStart(2, "0")}`,
        created_at: at(-70, "09:00"),
        updated_at: at(-70, "09:00"),
      },
      "illustrative",
      { source: `player ${key}` },
      [
        "person.player",
        ...(familyName === null ? ["person.first-name-only"] : []),
        ...(UNDER_18.has(index) ? ["person.under-18"] : []),
        ...(index % 4 === 3 ? ["person.missing-required"] : []),
      ],
      index < 5 ? "person.player.first" : UNDER_18.has(index) ? "person.under-18" : null,
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
          // The malformed one is malformed in its local part — a double dot —
          // and stays inside the reserved domain, as every address here must.
          raw_value: typo
            ? exampleEmail(`${givenName.toLowerCase()}..${index}`)
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

    // Five superseded college addresses, dated, kept and not preferred — one
    // per seat, because correcting a contact point changes the record.
    if (index % 10 === 2) {
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
      // One player in four also holds a special-teams position, dealt round the
      // four slots — LAN-261. Not everyone: a squad where every row carried one
      // would prove no more than a squad where none did, and the board's own
      // "no special teams" reading has to be visible too. One in four across
      // sixty-five people leaves every slot with several holders, so the
      // audience builder's "Special teams" unit selects a real group and the
      // column reads as a mixture rather than a constant.
      const specialTeams = index % 4 === 0 ? ["KO", "KR", "PUNT", "FG"][(index / 4) % 4] : null;
      // A third of those hold nothing else. The audience builder derives a
      // player's unit as Offence / Defence / Both / Special teams, and reads
      // "Special teams" only when there is no offence or defence assignment at
      // all — so without a few genuine specialists the unit is unreachable
      // however many special-teams rows exist, and tester 4's special-teams
      // coach seat has nothing to select. A kicker who does not play a down on
      // either side of the ball is the ordinary case this represents.
      const specialistOnly = specialTeams !== null && index % 12 === 0;
      const offenceOnly = !specialistOnly && index % 7 === 6;
      const defenceOnly = !specialistOnly && index % 7 === 3;
      const unitState = specialistOnly
        ? "position.special-teams-only"
        : offenceOnly
          ? "position.offence-only"
          : defenceOnly
            ? "position.defence-only"
            : null;
      const unitTaggedSlot = specialistOnly
        ? SPECIAL_TEAMS_SLOT_BY_CODE[specialTeams]
        : offenceOnly
          ? "offence"
          : "defence";
      for (const [code, slot] of [
        ...(specialistOnly
          ? []
          : [
              [offence, "offence"],
              [defence, "defence"],
            ]),
        ...(specialTeams ? [[specialTeams, SPECIAL_TEAMS_SLOT_BY_CODE[specialTeams]]] : []),
      ]) {
        // One-sided players exist, on both sides. The offence-only case was
        // here already; the defence-only case was not, and the audience
        // builder reads a unit as Offence / Defence / Both / Special teams, so
        // "Defence" was a reading no row in the dataset could produce. The
        // same absence the Special teams column had, one column over.
        if (index % 7 === 6 && slot === "defence") continue;
        if (index % 7 === 3 && slot === "offence") continue;
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
          [
            "position.assigned",
            ...(position.side === "special_teams" ? ["position.special-teams"] : []),
            // The unit reading this membership produces on the audience list.
            // Tagged on exactly one of its rows — the specialist's
            // special-teams row, or the one side a one-sided player holds — so
            // the count is memberships and not assignments.
            ...(unitState !== null && slot === unitTaggedSlot ? [unitState] : []),
          ],
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
  // Five returners still to confirm — they exist only in last season.
  // ---------------------------------------------------------------------------
  for (const [key, givenName, familyName] of [
    ["r-last-1", "Cressida", "Wolstenholme"],
    ["r-last-2", "Barnaby", "Quince"],
    // Five, not two: the import proposes "carried forward" for each of these,
    // and applying it consumes the row, so five testers need five.
    ["r-last-3", "Hyacinth", "Ravensworth"],
    ["r-last-4", "Peregrine", "Stallard"],
    ["r-last-5", "I", "Marchbank"],
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
      "person.past-member",
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
        // One number each, 601 to 605 — LAN-260. Four of the five used to
        // share 602, so importing a CSV row for any of them surfaced a
        // duplicate panel with five candidates on one number and every tester
        // met the same tangle. The exercise is one clean pair per tester, and
        // that needs five distinct numbers.
        raw_value: dramaPhone(600 + Number(key.slice("r-last-".length)), "spaced"),
        normalised_value: `07700900${600 + Number(key.slice("r-last-".length))}`,
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
      // Entered at the stand, not at a walk-on — LAN-238. The recruitment
      // module shows every duplicate-door recruit as "Sign-up sheet at the
      // stand", and this is the contact row behind that sentence.
      source: "sign-up sheet at the stand",
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

  // Four more of each, so five testers each resolve a duplicate and read a
  // merge of their own. A merge is destructive — the loser is gone from every
  // list the moment somebody presses it — so one between five people means four
  // of them find nothing to do.
  const duplicatePeople = [];
  for (let n = 0; n < 4; n += 1) {
    // Indices whose own phone is both present and normalised: the shape rota
    // leaves some players with a null `normalised_value` and one in ten with no
    // phone at all, and the duplicate check matches on the normalised value.
    const twinIndex = 4 + n * 10;
    const twin = players[twinIndex];
    const merged = players[7 + n * 5];
    if (!twin || !merged) continue;
    const extra = add(
      "public.people",
      {
        id: id("people", `dup-extra-${n}`),
        given_name: twin.givenName.slice(0, 3),
        family_name: twin.familyName,
        created_at: at(-9 - n, "18:20"),
        updated_at: at(-9 - n, "18:20"),
      },
      "illustrative",
      { source: `near-duplicate of player ${twin.key} — entered fresh at a sign-up table` },
      ["person.near-duplicate"],
    );
    ctx.example("person.near-duplicate", extra);
    duplicatePeople.push(extra);
    add(
      "public.contact_points",
      {
        id: id("contact_points", `dup-extra-${n}`, "phone"),
        person_id: extra,
        kind: "phone",
        scope: null,
        raw_value: dramaPhone(twinIndex + 1, "plain"),
        normalised_value: `07700900${String(twinIndex + 1).padStart(3, "0")}`,
        is_preferred: true,
        valid_from: day(-9 - n),
        valid_until: null,
        // As above: entered at the stand, which is what the recruit record says.
        source: "sign-up sheet at the stand",
      },
      "illustrative",
      { source: `near-duplicate of player ${twin.key}` },
      ["contact.phone"],
    );
    add(
      "public.people",
      {
        id: id("people", `merged-loser-${n}`),
        given_name: merged.givenName,
        family_name: merged.familyName,
        merged_into_person_id: merged.personId,
        merged_at: at(-30 - n, "11:00"),
        merged_by_person_id: actorPersonId,
        merge_reason: "Entered twice at the Freshers' Fair; same phone number.",
        created_at: at(-62, "09:00"),
        updated_at: at(-30 - n, "11:00"),
      },
      "illustrative",
      { source: `the losing half of a merge into player ${merged.key}` },
      ["person.merged"],
    );
  }

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

  // ---------------------------------------------------------------------------
  // Every seat is a player, because every seat walks the player's own pages
  // ---------------------------------------------------------------------------
  //
  // `/onboarding/<token>` resolves the token to a person and then compiles that
  // person's outstanding ask; `readCompiledOutstandingAskIn` returns null when
  // they hold no membership this season, and the page 404s. Every tester walks
  // W4 and W5, and `verify` refuses a live player link for anybody who is not a
  // named seat — so each seat needs a membership of its own rather than five
  // people sharing one link and one another's answers.
  //
  // At `onboarding` with a checklist still open, which is what makes the link
  // land on the five-step form rather than the already-complete page. A coach
  // who also plays is an ordinary thing at this club; what matters is that the
  // person holding the link has something left to answer.
  const seatPlayers = [];
  for (const [position, operator] of reference.operators.entries()) {
    const membershipId = id("season_memberships", labels.currentSeason, `seat:${operator.key}`);
    add(
      "public.season_memberships",
      {
        id: membershipId,
        person_id: operator.personId,
        season_id: seasonId,
        status: "onboarding",
        entry: "new",
        carried_forward_from_id: null,
        confirmed_on: day(-30 + position),
        activated_on: null,
        departed_on: null,
        expected_return_on: null,
        departure_reason: null,
        inactivity_label: null,
        created_at: at(-30 + position, "09:00"),
        updated_at: at(-30 + position, "09:00"),
      },
      "illustrative",
      { source: `the player membership behind ${operator.key}'s own link` },
      ["membership.onboarding", "membership.entry.new"],
    );
    add(
      "public.season_membership_status_events",
      {
        id: id(
          "season_membership_status_events",
          labels.currentSeason,
          `seat:${operator.key}`,
          "onboarding",
        ),
        season_membership_id: membershipId,
        from_status: null,
        to_status: "onboarding",
        occurred_at: at(-30 + position, "09:00"),
        actor_person_id: actorPersonId,
        actor_label: null,
        reason: null,
      },
      "illustrative",
      { source: `the player membership behind ${operator.key}'s own link` },
      ["membership.status-event"],
    );
    seatPlayers.push({
      key: `seat:${operator.key}`,
      operatorKey: operator.key,
      membershipId,
      personId: operator.personId,
      status: "onboarding",
      story: "midway",
      index: 50 + position,
    });
  }

  return { players, dupA, dupB, duplicatePeople, playerStaff, seatPlayers };
}
