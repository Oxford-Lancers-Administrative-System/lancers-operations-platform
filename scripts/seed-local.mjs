#!/usr/bin/env node
/**
 * Deterministic, LOCAL-ONLY synthetic seed for the Oxford Lancers domain
 * schema.
 *
 *   npm run db:seed
 *
 * Implements Source Data Analysis §11 (the synthetic data specification) and
 * every scenario the schema ticket names. It contains NO real person, contact
 * detail, roster row or club record of any kind:
 *
 *   * names are drawn from a fixed invented pool with no correspondence to any
 *     member of the club;
 *   * every email domain is under `.example`, which RFC 2606 reserves and which
 *     can never resolve;
 *   * every UK phone number is in Ofcom's 07700 900xxx drama range and every
 *     international one in the +1 555 01xx range, both reserved for fiction.
 *
 * The point of this dataset is that it is MESSY in the specific ways the club's
 * real files are messy. Tidy fixtures would hide the problems real data causes,
 * which is the entire reason the synthetic specification exists. Everything
 * awkward in here — the first-name-only records, the drifting practice end
 * time, the attendance that stops halfway through term, the two incompatible
 * position vocabularies — is measured from the club's own workbooks.
 *
 * Determinism: one fixed PRNG seed drives every value, including the UUIDs, so
 * two runs on two machines produce identical rows. The *calendar* those rows
 * sit on is derived from the machine clock rather than fixed — see the frame
 * below — so two runs on the same day are identical, and a run tomorrow is the
 * same club one day later.
 */
import {
  connectLocal,
  insertRows,
  makeRandom,
  makeUuidFactory,
  resolveLocalDatabaseUrl,
} from "./lib/local-db.mjs";
import { seedFrame, shiftAuthoredValue, shiftedYearOf } from "./lib/seed-clock.mjs";

const SEED = 20260810;
const random = makeRandom(SEED);
const uuid = makeUuidFactory(random);

/**
 * The frame this run seeds in — see `./lib/seed-clock.mjs` for the whole rule.
 *
 * Everything below is written in the dataset's own authored calendar, whose
 * notional "now" is Hilary 2027, week 6: Michaelmas and early Hilary are
 * history with outcomes, and the rest of the season is still ahead, which is
 * what makes the nonresponse queue and the mid-term attendance lapse visible at
 * the same time. `NOW` is today expressed in that calendar, and `SHIFT_DAYS`
 * carries every date the other way — onto today — on the way into the database.
 *
 * Nothing between here and the write is re-dated when the clock moves. The
 * dataset is one club's history, slid; it is not a different history.
 */
const FRAME = seedFrame(new Date());
const SHIFT_DAYS = FRAME.shiftDays;
const NOW = FRAME.now;

/**
 * LAN-180 correction. `NOW` is deliberately day-granular — noon on today's
 * date, in the authored frame — because the frame's own job is choosing
 * which *day* things land on, never the instant within it. A "must not sit
 * in the future" bound that only checked against `NOW` therefore let a
 * generated instant land anywhere up to that noon anchor, which a real
 * `now()` check run any time before noon UTC still reads as future — proved
 * by reproducing it against a completely fresh seed with zero tests run:
 * 256 `rsvp_responses` rows, every one between 01:00 and 11:59 UTC that
 * same day, the exact pre-noon window this left open (CI's own run hit the
 * identical shape).
 *
 * `REAL_NOW_AUTHORED_MS` is the actual current instant, expressed in the
 * same authored-frame terms `NOW` already is — subtracting `SHIFT_DAYS`
 * here is what the uniform `+SHIFT_DAYS` slide at the bottom of this file
 * later undoes, landing it back on the real instant it started from.
 * `Math.min(NOW, REAL_NOW_AUTHORED_MS)` is the tightened bound: before noon
 * it is the real instant that wins and closes the gap; from noon onward
 * `NOW` is already the earlier of the two, so nothing downstream of this
 * changes for the rest of the day.
 */
const REAL_NOW_AUTHORED_MS = Date.now() - SHIFT_DAYS * 86_400_000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const pick = (items) => items[Math.floor(random() * items.length)];
const chance = (p) => random() < p;
const intBetween = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

const day = (iso) => new Date(`${iso}T00:00:00Z`);
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
const asDate = (date) => date.toISOString().slice(0, 10);
const at = (date, time) => new Date(`${asDate(date)}T${time}Z`).toISOString();
const isPast = (date) => date.getTime() < NOW.getTime();

/**
 * OWNER-LAN170-08 (correction round 3, Brian's second walkthrough): the
 * events "an operator will review" are the ones `/operate/events` opens on —
 * whatever sits nearest `NOW`, in either direction — and that is the narrow
 * slice `readQuestionsIn`/`readOperatorParticipation` and the RSVP recording
 * loop below both need to seed generously, rather than every one of the
 * roughly seventy events this file creates. Three weeks either side covers
 * the current week's practice, chalk and S&C alongside whichever fixture
 * lands closest to it, without reaching into history or the far end of the
 * season.
 */
const REVIEW_WINDOW_DAYS = 21;
function isReviewWindowEvent(event) {
  if (!event.scheduled_on || event.status === "cancelled") return false;
  const distanceDays = Math.abs(day(event.scheduled_on).getTime() - NOW.getTime()) / 86400000;
  return distanceDays <= REVIEW_WINDOW_DAYS;
}

/**
 * A housekeeping stamp pinned to the dataset's own now.
 *
 * `updated_at` on a row nobody has touched since is "when the club last looked
 * at this", and that is now, not a date typed into this file. Written as a
 * literal it would sit in the future whenever the frame put now earlier than
 * the literal — the same class of defect as the founding members whose
 * `created_at` was once tomorrow (see the People section below).
 */
const nowAt = (time) => at(NOW, time);

/** The calendar year an authored date lands in once this run's frame is applied. */
const shiftedYear = (authoredDate) => shiftedYearOf(authoredDate, SHIFT_DAYS);

/**
 * A season's or committee year's name, derived from where its opening lands.
 *
 * Derived rather than written down so that a label and the date it names cannot
 * disagree: the frame moves, and an academic year called "2026-27" whose
 * opening had slid into 2027 would be a lie of exactly the kind tidy fixtures
 * tell. Inside the residual bound this reproduces the authored labels
 * character for character; beyond a whole-year wrap it follows.
 */
const academicYearLabel = (authoredStartsOn) => {
  const opens = shiftedYear(authoredStartsOn);
  return `${opens}-${String(opens + 1).slice(2)}`;
};

function weighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Fisher–Yates using the seeded PRNG, so shuffles are reproducible too. */
function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invented name and contact pools
// ---------------------------------------------------------------------------

const GIVEN_NAMES = [
  "Alaric",
  "Bertram",
  "Caspian",
  "Dashiell",
  "Emrys",
  "Fenwick",
  "Gideon",
  "Hollis",
  "Ignatius",
  "Jarrah",
  "Kestrel",
  "Lysander",
  "Marlowe",
  "Norbert",
  "Osgood",
  "Peregrine",
  "Quillon",
  "Rufus",
  "Silas",
  "Thaddeus",
  "Ulric",
  "Vaughn",
  "Wendell",
  "Xavien",
  "Yorick",
  "Zephyr",
  "Ambrose",
  "Barnaby",
  "Corwin",
  "Dorian",
  "Ellery",
  "Fintan",
  "Garrick",
  "Hadrian",
  "Isambard",
  "Jorvik",
  "Kenelm",
  "Lucian",
  "Merrick",
  "Nicodemus",
  "Orlando",
  "Percival",
  "Quentin",
  "Roderick",
  "Sebastian",
  "Tarquin",
  "Uriah",
  "Vernon",
  "Wilbur",
  "Yarrow",
  "Zenas",
  "Alwyn",
];

const FAMILY_NAMES = [
  "Ashcombe",
  "Brindlewood",
  "Caldicott",
  "Draycott",
  "Elverton",
  "Fairhurst",
  "Gorsemoor",
  "Hallowfield",
  "Inglewhite",
  "Jarrowdale",
  "Kirkbride",
  "Lanthorne",
  "Mereworth",
  "Netherby",
  "Oakhanger",
  "Pennycuick",
  "Quorndon",
  "Ravenscar",
  "Sedgewick",
  "Thornbury",
  "Underdale",
  "Vellacott",
  "Winterbourne",
  "Yaxlington",
  "Zealander",
  "Brackenridge",
  "Cholmondley",
  "Duddingston",
  "Ettersgill",
  "Fotheringay",
  "Glenrothes",
  "Hawksmoor",
];

const HYPHENATED = ["Ashcombe-Vale", "Ravenscar-Pike", "Winterbourne-Quy"];

/** Thirty invented college subdomains, all under the reserved `.example` TLD. */
const COLLEGES = [
  "beaumont",
  "cranmere",
  "eastgate",
  "farrowgate",
  "gadsby",
  "hallamshire",
  "inglewood",
  "kestrelhall",
  "lowmoor",
  "marlbrook",
  "netherfield",
  "oldstead",
  "pyrford",
  "quarrendon",
  "rushbourne",
  "stonegate",
  "thurlestone",
  "uppingham",
  "vauxhold",
  "wardleigh",
  "yelverton",
  "ashridge",
  "bramshott",
  "coldharbour",
  "dunsfold",
  "elmswell",
  "fernhurst",
  "greatwood",
  "harewell",
  "ivybridge",
];

/** The college a person reads at, as a screen shows it, from the same list. */
const collegeName = (subdomain) => subdomain[0].toUpperCase() + subdomain.slice(1);

/** Invented courses. Ordinary enough to read as real, none of them a real one. */
const DEGREE_FIELDS = [
  "Engineering Science",
  "Philosophy, Politics and Economics",
  "History",
  "Materials Science",
  "Experimental Psychology",
  "Biochemistry",
  "Law",
  "Mathematics and Statistics",
  "Human Sciences",
  "Earth Sciences",
];

/** Relationships an emergency contact actually stands in. */
const EMERGENCY_RELATIONSHIPS = ["Parent", "Parent", "Sibling", "Partner", "Guardian"];

const DECLINE_REASONS = [
  "Tutorial clash",
  "Away from Oxford this weekend",
  "Work shift",
  "Feeling unwell",
  "Collection paper on Monday",
  "Family visiting",
  "Rowing fixture the same day",
  "Travelling back late",
];

// ---------------------------------------------------------------------------
// Position vocabularies — two incompatible taxonomies, years apart
// ---------------------------------------------------------------------------

// Each vocabulary is named for the era it was adopted in, and that name is read
// off the adoption date once the frame has been applied rather than typed
// alongside it. A workbook labelled 2023 whose adoption date had slid into 2022
// would be the map disagreeing with the territory.
const OLD_VOCAB_ADOPTED_ON = "2023-05-07";
const NEW_VOCAB_ADOPTED_ON = "2026-08-01";
const OLD_VOCAB_ERA = shiftedYear(OLD_VOCAB_ADOPTED_ON);
const NEW_VOCAB_ERA = shiftedYear(NEW_VOCAB_ADOPTED_ON);

const VOCAB_2023 = {
  code: `oulafc-${OLD_VOCAB_ERA}`,
  label: `OULAFC position list (${OLD_VOCAB_ERA} roster workbook)`,
  adopted_on: OLD_VOCAB_ADOPTED_ON,
  positions: [
    ["WR", "Wide Receiver", "offence"],
    ["RB", "Running Back", "offence"],
    ["OL", "Offensive Line", "offence"],
    ["QB", "Quarterback", "offence"],
    ["TE", "Tight End", "offence"],
    ["DB", "Defensive Back", "defence"],
    ["DL", "Defensive Line", "defence"],
    ["LB", "Linebacker", "defence"],
    ["DE", "Defensive End", "defence"],
    ["K", "Kicker", "special_teams"],
    ["P", "Punter", "special_teams"],
  ],
};

const VOCAB_2026 = {
  code: `oulafc-${NEW_VOCAB_ERA}`,
  label: `OULAFC position list (${NEW_VOCAB_ERA} term-card era)`,
  adopted_on: NEW_VOCAB_ADOPTED_ON,
  positions: [
    ["WR", "Wide Receiver", "offence"],
    ["TE", "Tight End", "offence"],
    ["WB", "Wing Back", "offence"],
    ["T", "Tackle", "offence"],
    ["G", "Guard", "offence"],
    ["C", "Centre", "offence"],
    ["QB", "Quarterback", "offence"],
    ["RB", "Running Back", "offence"],
    ["CB", "Cornerback", "defence"],
    ["NT", "Nose Tackle", "defence"],
    ["LB", "Linebacker", "defence"],
    ["E", "End", "defence"],
    ["S", "Safety", "defence"],
    // Source Data Analysis §11.1: four special-teams slots, 0% populated. The
    // structure is reproduced deliberately — the model must tolerate
    // anticipated-but-unused vocabulary.
    ["KO", "Kickoff", "special_teams"],
    ["KR", "Kick Return", "special_teams"],
    ["PUNT", "Punt", "special_teams"],
    ["FG", "Field Goal", "special_teams"],
  ],
};

/** Measured from the 2023 workbook (SDA §11.1). */
const OFFENCE_MIX_2026 = [
  ["WR", 26],
  ["TE", 12],
  ["WB", 12],
  ["T", 10],
  ["G", 10],
  ["C", 2],
  ["QB", 2],
  ["RB", 2],
  [null, 24],
];
const DEFENCE_MIX_2026 = [
  ["CB", 31],
  ["NT", 21],
  ["LB", 19],
  ["E", 7],
  ["S", 2],
  [null, 19],
];
const OFFENCE_MIX_2023 = [
  ["WR", 30],
  ["RB", 12],
  ["OL", 22],
  ["QB", 4],
  ["TE", 10],
  [null, 22],
];
const DEFENCE_MIX_2023 = [
  ["DB", 32],
  ["DL", 22],
  ["LB", 20],
  ["DE", 8],
  [null, 18],
];

// ---------------------------------------------------------------------------
// Contact generation — messy on purpose
// ---------------------------------------------------------------------------

/**
 * One email address, and which of the two kinds it is.
 *
 * LAN-182 split those apart, because they behave differently: a college address
 * is era-scoped and stops working around graduation, and a consumer one is the
 * durable alumni channel. The scope is generated here rather than inferred from
 * the domain later, so the dataset states the fact instead of inviting a guess.
 */
function makeEmail(given, family, index) {
  const shape = weighted([
    ["college", 70],
    ["sso", 15],
    ["consumer", 10],
    ["missing", 5],
  ]);
  const lower = (value) => value.toLowerCase();

  if (shape === "missing") return null;
  if (shape === "sso")
    return {
      address: `${lower(given).slice(0, 4)}${1000 + index}@ox.ac.example`,
      scope: "college",
    };
  if (shape === "consumer")
    return { address: `${lower(given)}.${index}@mail.example`, scope: "personal" };

  const college = pick(COLLEGES);
  const local = family ? `${lower(given)}.${lower(family)}` : lower(given);
  return { address: `${local}@${college}.ox.ac.example`, scope: "college" };
}

function makePhone() {
  // 71% of records carry a phone number at all (SDA §11.1).
  if (!chance(0.71)) return null;

  switch (
    weighted([
      ["uk", 65],
      ["international", 20],
      ["no-leading-zero", 10],
      ["one-short", 5],
    ])
  ) {
    // Ofcom's 07700 900xxx drama range — never allocated to a real subscriber.
    case "uk":
      return `07700 900${intBetween(100, 999)}`;
    // +1 555 01xx is reserved for fiction in North America.
    case "international":
      return `+1 555 01${intBetween(10, 99)}`;
    case "no-leading-zero":
      return `7700900${intBetween(100, 999)}`;
    default:
      return `07700 90${intBetween(10, 99)}`;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const rows = {
  people: [],
  person_aliases: [],
  contact_points: [],
  terms: [],
  committee_years: [],
  position_vocabularies: [],
  positions: [],
  seasons: [],
  role_assignments: [],
  season_memberships: [],
  season_membership_status_events: [],
  recruitment_prospects: [],
  person_emergency_contacts: [],
  position_assignments: [],
  jersey_assignments: [],
  coach_group_assignments: [],
  formalwear_records: [],
  blues_awards: [],
  onboarding_item_types: [],
  onboarding_items: [],
  eligibility_records: [],
  availability_statuses: [],
  event_series: [],
  alternative_groups: [],
  events: [],
  schedule_changes: [],
  event_questions: [],
  event_audience_members: [],
  invitations: [],
  rsvp_responses: [],
  question_responses: [],
  attendance_records: [],
  event_messaging_plans: [],
  notification_jobs: [],
  delivery_results: [],
  delivery_attempts: [],
  nonresponse_flags: [],
  weekly_reports: [],
  follow_up_actions: [],
  audit_events: [],
  "staging.legacy_roster_rows": [],
  "staging.legacy_rsvp_rows": [],
  "staging.legacy_event_rows": [],
};

const add = (table, row) => {
  rows[table].push(row);
  return row;
};

// --- People ----------------------------------------------------------------

const PLAYER_COUNT = 42;
const LEAVER_COUNT = 8;
const STAFF_COUNT = 2;
const people = [];

for (let i = 0; i < PLAYER_COUNT + LEAVER_COUNT + STAFF_COUNT; i += 1) {
  const given = GIVEN_NAMES[i % GIVEN_NAMES.length];

  // SDA §11.1: 26% of records are first-name-only. This is the single most
  // consequential messy property in the club's data, so it is reproduced at
  // its measured rate rather than sprinkled in.
  const firstNameOnly = i % 4 === 1 && i < PLAYER_COUNT;
  const family = firstNameOnly
    ? null
    : i % 17 === 3
      ? HYPHENATED[i % HYPHENATED.length]
      : FAMILY_NAMES[(i * 3 + 1) % FAMILY_NAMES.length];

  // The academic facts LAN-182 gave columns. Deliberately incomplete: the
  // missing-data queue exists because the club's records are patchy, and a
  // dataset where every academic field is filled would make that queue empty
  // and the screen that reads it untestable.
  const academic = i % 5 !== 3;
  const matriculation = 2022 + (i % 4);

  const person = {
    id: uuid(),
    given_name: given,
    family_name: family,
    college: academic ? collegeName(COLLEGES[(i * 7) % COLLEGES.length]) : null,
    matriculation_year: academic ? matriculation : null,
    // Three years for most courses, four for the engineers and scientists.
    expected_graduation_year: academic ? matriculation + (i % 3 === 0 ? 4 : 3) : null,
    degree_field: academic ? DEGREE_FIELDS[(i * 3) % DEGREE_FIELDS.length] : null,
    // Held for roughly two thirds, which is what a club that has asked twice
    // and chased once looks like. Nobody here is under eighteen: whether the
    // club holds minors at all is a club fact nobody has stated, so the
    // dataset does not assert one. `person_standing.is_under_18` is proved
    // against its own row in tests/schema-accepts.test.ts instead.
    date_of_birth:
      i % 3 === 2
        ? null
        : `${2003 + (i % 5)}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    past_member_override: null,
    merged_into_person_id: null,
    merged_at: null,
    merged_by_person_id: null,
    merge_reason: null,
    // Dated in the PAST, deliberately.
    //
    // This cohort used to be stamped 2026-08-15, which was two days in the FUTURE
    // of the machine clock. Nothing in the application read it, so nothing broke
    // visibly — but every seeded person sorted *after* anything created at
    // `now()`, and two test suites picking "the earliest person" as their acting
    // operator therefore adopted a parallel suite's row and failed when it was
    // deleted. That cost a long time to diagnose (LAN-119).
    //
    // The synthetic data is meant to mirror the real shape of club data, and a
    // club whose founding members were created tomorrow does not. It now sits
    // before the earliest season, which is what a real club's identity records
    // would do.
    created_at: "2025-06-01T09:00:00Z",
    updated_at: "2025-06-01T09:00:00Z",
  };
  people.push(person);
  add("people", person);

  // What `people.known_as` used to hold, in the place LAN-182 moved it to: an
  // alias flagged as the display name. The column is gone; the fact is not.
  if (i % 11 === 5) {
    add("person_aliases", {
      id: uuid(),
      person_id: person.id,
      alias: given.slice(0, 3),
      source: "intake form",
      noted_at: "2025-06-01T09:00:00Z",
      is_display_name: true,
    });
  }

  const email = makeEmail(given, family, i);
  if (email) {
    add("contact_points", {
      id: uuid(),
      person_id: person.id,
      kind: "email",
      scope: email.scope,
      // Deliberate defects, at the rate the files show them.
      raw_value:
        i === 6
          ? `${email.address} `
          : i === 9
            ? email.address.replace(".ox.ac.example", ".example.ac.ox")
            : email.address,
      normalised_value: i === 6 || i === 9 ? null : email.address,
      is_preferred: true,
      valid_from: "2026-08-15",
      valid_until: null,
      source: "intake form",
      created_at: "2025-06-01T09:00:00Z",
    });
  }

  // Field inventory row 14. Held for about half the club, which is what a
  // record the club has never systematically collected looks like, and never
  // for the leavers cohort — it is exactly the kind of third-party data that
  // stops being kept once somebody has gone.
  if (i % 2 === 0 && i < PLAYER_COUNT) {
    add("person_emergency_contacts", {
      id: uuid(),
      person_id: person.id,
      given_name: GIVEN_NAMES[(i * 5 + 3) % GIVEN_NAMES.length],
      family_name: family ?? FAMILY_NAMES[(i * 2) % FAMILY_NAMES.length],
      relationship: EMERGENCY_RELATIONSHIPS[i % EMERGENCY_RELATIONSHIPS.length],
      phone: `07700 900${String(100 + (i % 900)).padStart(3, "0")}`,
      // A quarter of them are a phone number and nothing else. Partial is the
      // normal state of this record, and the queue is what completes it.
      email:
        i % 4 === 0
          ? null
          : `${GIVEN_NAMES[(i * 5 + 3) % GIVEN_NAMES.length].toLowerCase()}.${i}@mail.example`,
      recorded_by_person_id: null,
      created_at: "2025-06-01T09:00:00Z",
      updated_at: "2025-06-01T09:00:00Z",
    });
  }

  const phone = makePhone();
  if (phone) {
    add("contact_points", {
      id: uuid(),
      person_id: person.id,
      kind: "phone",
      scope: null,
      raw_value: phone,
      normalised_value: /^07700 900\d{3}$/.test(phone) ? phone.replace(/\s/g, "") : null,
      is_preferred: true,
      valid_from: "2026-08-15",
      valid_until: null,
      source: "intake form",
      created_at: "2025-06-01T09:00:00Z",
    });
  }
}

// A superseded college address: the reason Contact Point is dated at all.
add("contact_points", {
  id: uuid(),
  person_id: people[3].id,
  kind: "email",
  scope: "college",
  raw_value: `${people[3].given_name.toLowerCase()}.old@${COLLEGES[0]}.ox.ac.example`,
  normalised_value: null,
  is_preferred: false,
  valid_from: "2024-10-01",
  valid_until: "2026-08-14",
  // Named for the roster it came off, which is the year its own validity opens.
  source: `${shiftedYear("2024-10-01")} roster`,
  created_at: "2025-06-01T09:00:00Z",
});

// At least three people who appear under two or three different name forms in
// different tables. This is what makes display name unusable as a join key.
for (const [index, aliases] of [
  [0, ["Al", "Alaric A.", "A. Ashcombe"]],
  [4, ["Emrys E", "E. Elverton"]],
  [12, ["Ken", "Kenelm H."]],
]) {
  for (const alias of aliases) {
    add("person_aliases", {
      id: uuid(),
      person_id: people[index].id,
      alias,
      source: "legacy roster workbook",
      noted_at: "2025-06-01T09:00:00Z",
      // Evidence that an import matched on, never a name to display.
      is_display_name: false,
    });
  }
}

// Invariant I6: an audited merge that preserves both source identities. The
// losing row is never deleted.
const mergedAway = people[PLAYER_COUNT + LEAVER_COUNT + STAFF_COUNT - 1];
mergedAway.merged_into_person_id = people[12].id;
mergedAway.merged_at = "2026-10-02T14:20:00Z";
mergedAway.merged_by_person_id = people[2].id;
mergedAway.merge_reason =
  "Duplicate created by the freshers' fair QR intake; same person as the Michaelmas returner record.";

// ---------------------------------------------------------------------------
// A duplicate pair nobody has merged yet, and a first-name-only record
// ---------------------------------------------------------------------------
//
// LAN-182 requires both, and the merge journey needs a pair it can actually
// work: the row above is a merge that has already happened, which proves the
// invariant and gives the operator nothing to do.
//
// One human, entered twice, the way the club's own files produce a duplicate —
// once by the freshers' fair QR form under a shortened first name and no
// surname at all, and once by hand off the Michaelmas sign-up sheet with the
// full name and a college address. Neither record is obviously the survivor,
// which is the point: the operator has to choose.
const duplicateShortForm = {
  id: uuid(),
  given_name: "Wilf",
  family_name: null,
  college: null,
  matriculation_year: null,
  expected_graduation_year: null,
  degree_field: null,
  date_of_birth: null,
  past_member_override: null,
  merged_into_person_id: null,
  merged_at: null,
  merged_by_person_id: null,
  merge_reason: null,
  created_at: "2026-09-14T11:20:00Z",
  updated_at: "2026-09-14T11:20:00Z",
};
const duplicateFullForm = {
  id: uuid(),
  given_name: "Wilfred",
  family_name: "Thurlestone",
  college: collegeName(COLLEGES[16]),
  matriculation_year: 2025,
  expected_graduation_year: 2028,
  degree_field: DEGREE_FIELDS[2],
  date_of_birth: "2006-02-11",
  past_member_override: null,
  merged_into_person_id: null,
  merged_at: null,
  merged_by_person_id: null,
  merge_reason: null,
  created_at: "2026-09-28T16:05:00Z",
  updated_at: "2026-09-28T16:05:00Z",
};
people.push(duplicateShortForm, duplicateFullForm);
add("people", duplicateShortForm);
add("people", duplicateFullForm);

// The same mobile on both records is what a duplicate check has to find. The
// names alone would not do it — "Wilf" is not "Wilfred" to any string match.
for (const duplicate of [duplicateShortForm, duplicateFullForm]) {
  add("contact_points", {
    id: uuid(),
    person_id: duplicate.id,
    kind: "phone",
    scope: null,
    raw_value: "07700 900412",
    normalised_value: "07700900412",
    is_preferred: true,
    valid_from: "2026-09-14",
    valid_until: null,
    source:
      duplicate === duplicateShortForm ? "freshers' fair QR form" : "Michaelmas sign-up sheet",
    created_at: duplicate.created_at,
  });
}

add("contact_points", {
  id: uuid(),
  person_id: duplicateFullForm.id,
  kind: "email",
  scope: "college",
  raw_value: `wilfred.thurlestone@${COLLEGES[16]}.ox.ac.example`,
  normalised_value: `wilfred.thurlestone@${COLLEGES[16]}.ox.ac.example`,
  is_preferred: true,
  valid_from: "2026-09-28",
  valid_until: null,
  source: "Michaelmas sign-up sheet",
  created_at: duplicateFullForm.created_at,
});

// The short form is also the mission's named first-name-only record: no
// surname, and therefore flagged the day the missing-data queue opens.
add("person_aliases", {
  id: uuid(),
  person_id: duplicateFullForm.id,
  alias: "Wilf",
  source: "freshers' fair QR form",
  noted_at: "2026-09-28T16:05:00Z",
  is_display_name: false,
});

// --- Cycles ----------------------------------------------------------------

const vocab2023 = { id: uuid(), ...VOCAB_2023 };
const vocab2026 = { id: uuid(), ...VOCAB_2026 };
const positionByVocab = { [vocab2023.id]: {}, [vocab2026.id]: {} };

for (const vocab of [vocab2023, vocab2026]) {
  add("position_vocabularies", {
    id: vocab.id,
    code: vocab.code,
    label: vocab.label,
    adopted_on: vocab.adopted_on,
    created_at: "2025-06-01T09:00:00Z",
  });
  vocab.positions.forEach(([code, label, side], order) => {
    const position = { id: uuid(), vocabulary_id: vocab.id, code, label, side, sort_order: order };
    add("positions", position);
    positionByVocab[vocab.id][code] = position;
  });
}

const seasonPrevious = {
  id: uuid(),
  label: academicYearLabel("2025-09-28"),
  status: "archived",
  position_vocabulary_id: vocab2023.id,
  starts_on: "2025-09-28",
  ends_on: "2026-06-20",
  opened_at: "2025-06-15T10:00:00Z",
  opened_by_person_id: people[2].id,
  closed_at: "2026-07-01T10:00:00Z",
  closed_by_person_id: people[2].id,
  created_at: "2025-06-15T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
};
const seasonCurrent = {
  id: uuid(),
  label: academicYearLabel("2026-09-27"),
  status: "active",
  position_vocabulary_id: vocab2026.id,
  starts_on: "2026-09-27",
  ends_on: null,
  opened_at: "2026-06-10T10:00:00Z",
  opened_by_person_id: people[1].id,
  closed_at: null,
  closed_by_person_id: null,
  created_at: "2026-06-10T10:00:00Z",
  updated_at: nowAt("10:00:00"),
};
add("seasons", seasonPrevious);
add("seasons", seasonCurrent);

// Real Oxford term boundaries (SDA §11.2). Public, non-identifying, and the
// week arithmetic below depends on them being exact.
const TERM_SPEC = [
  ["michaelmas", "2025-26", "2025-09-28", "2025-12-06", -1],
  ["hilary", "2025-26", "2026-01-11", "2026-03-14", 0],
  ["trinity", "2025-26", "2026-04-19", "2026-06-20", 0],
  ["michaelmas", "2026-27", "2026-09-27", "2026-12-05", -1],
  ["hilary", "2026-27", "2027-01-10", "2027-03-13", 0],
  ["trinity", "2026-27", "2027-04-18", "2027-06-19", 0],
];
// A term belongs to a season, so it is named by that season rather than by a
// second string that could drift from it. The keys stay the authored ones —
// they are how the rest of this file addresses a term, not something stored.
const seasonLabelByAuthoredYear = {
  "2025-26": seasonPrevious.label,
  "2026-27": seasonCurrent.label,
};
const terms = {};
for (const [name, year, starts, ends, firstWeek] of TERM_SPEC) {
  const term = {
    id: uuid(),
    name,
    academic_year: seasonLabelByAuthoredYear[year],
    starts_on: starts,
    ends_on: ends,
    first_week: firstWeek,
    last_week: 8,
    created_at: "2025-06-01T09:00:00Z",
  };
  add("terms", term);
  terms[`${name}-${year}`] = term;
}

// The AGM drifted from early March to June across a decade, so the actual date
// is data. The two years must not overlap — an exclusion constraint says so.
// A committee year is named for the season it serves, which is why these read
// off the seasons rather than repeating their labels.
const committeePrevious = {
  id: uuid(),
  label: seasonPrevious.label,
  agm_held_on: "2025-06-04",
  starts_on: "2025-06-04",
  ends_on: "2026-06-10",
  created_at: "2025-06-04T18:00:00Z",
};
const committeeCurrent = {
  id: uuid(),
  label: seasonCurrent.label,
  agm_held_on: "2026-06-10",
  starts_on: "2026-06-10",
  ends_on: null,
  created_at: "2026-06-10T18:00:00Z",
};
add("committee_years", committeePrevious);
add("committee_years", committeeCurrent);

// --- Roles -----------------------------------------------------------------

// The catalogue is NOT defined here any more, and must never be again.
// `supabase/migrations/20260819090100_role_catalogue.sql` defines it once, for
// hosted and local alike (LAN-128). This seed reads what the migration created
// and assigns people to it; a second hand-written copy here is exactly the
// drift REQ-static-role-catalogue is written against, and it was the reason
// hosted had no roles at all. The role aliases moved with the catalogue, so a
// handover document naming "Match Secretary" now resolves in hosted too.
//
// Opening the connection here rather than at the foot of the file is what lets
// the rest of this script build role assignments against the real identifiers.
// Resolved before anything is opened, and reported as a message rather than a
// stack trace — the same shape `link-test-operator.mjs` already used. This
// script truncates and reloads the whole synthetic dataset, so "which database?"
// is the first question it has to answer out loud, and since the loopback
// default was removed from the guard the honest answer can be "you did not say".
let url;
try {
  url = resolveLocalDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const client = await connectLocal(url);

const roles = Object.fromEntries(
  (
    await client.query(
      `select id, code, scope, is_constitutional_office, is_single_holder_seat
         from public.roles`,
    )
  ).rows.map((role) => [role.code, role]),
);

if (Object.keys(roles).length === 0) {
  throw new Error(
    "public.roles is empty: the role-catalogue migration has not been applied. " +
      "Run `npm run db:reset`, which applies migrations before seeding.",
  );
}

let roleAssignmentCount = 0;
function assignRole(code, person, cycle, from, to = null, note = null) {
  const role = roles[code];
  if (!role) throw new Error(`No role in public.roles with code ${code}.`);
  roleAssignmentCount += 1;
  add("role_assignments", {
    id: uuid(),
    person_id: person.id,
    role_id: role.id,
    scope: role.scope,
    is_constitutional_office: role.is_constitutional_office,
    // Denormalised from the role, never asserted here: an assignment that
    // disagreed with the catalogue about single-holder cardinality is refused
    // by `role_assignments_agree_with_single_holder_rule`.
    is_single_holder_seat: role.is_single_holder_seat,
    committee_year_id: role.scope === "committee_year" ? cycle.id : null,
    season_id: role.scope === "season" ? cycle.id : null,
    effective_from: from,
    effective_to: to,
    appointed_by_person_id: people[0].id,
    note,
    created_at: `${from}T18:00:00Z`,
  });
}

// 2025-26 committee.
assignRole("president", people[0], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("vice_president", people[1], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("secretary", people[2], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("treasurer", people[3], committeePrevious, "2025-06-04", "2026-06-10");
// Two concurrent holders of a non-Office seat is normal and legal.
assignRole("social_secretary", people[4], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("social_secretary", people[5], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("gameday_secretary", people[6], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("gameday_secretary", people[7], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("kit_manager", people[8], committeePrevious, "2025-06-04", "2026-06-10");
assignRole("general_manager", people[9], committeePrevious, "2025-06-04", "2026-06-10");

// 2026-27 committee. The VP becomes President; the Secretary continues and also
// holds two non-Office seats — one Office plus other seats on one Person is
// legal, real, and the case register D8 confirmed.
assignRole("president", people[1], committeeCurrent, "2026-06-10");
assignRole("vice_president", people[10], committeeCurrent, "2026-06-10");
assignRole("secretary", people[2], committeeCurrent, "2026-06-10");
assignRole("treasurer", people[11], committeeCurrent, "2026-06-10");
assignRole("media_secretary", people[2], committeeCurrent, "2026-06-10");
assignRole("it_officer", people[2], committeeCurrent, "2026-06-10");
assignRole("social_secretary", people[12], committeeCurrent, "2026-06-10");
assignRole("social_secretary", people[13], committeeCurrent, "2026-06-10");
assignRole("gameday_secretary", people[6], committeeCurrent, "2026-06-10");
assignRole("gameday_secretary", people[14], committeeCurrent, "2026-06-10");
assignRole("general_manager", people[9], committeeCurrent, "2026-06-10");

// Register D11: a mid-year role change end-dates the old assignment and creates
// a new one. History is the point of the entity.
assignRole(
  "kit_manager",
  people[8],
  committeeCurrent,
  "2026-06-10",
  "2027-01-15",
  "Stepped down at the end of Michaelmas",
);
assignRole("kit_manager", people[15], committeeCurrent, "2027-01-15", null, "Took over mid-year");

// Coaching hangs off the SEASON, not the committee year (register D8).
const headCoach = people[PLAYER_COUNT + LEAVER_COUNT];
const offenceCoach = people[PLAYER_COUNT + LEAVER_COUNT + 1];
const defenceCoach = people[20]; // also a player — one Person, two records.
assignRole("head_coach", headCoach, seasonPrevious, "2025-09-01", "2026-06-20");
assignRole("head_coach", headCoach, seasonCurrent, "2026-09-01");
assignRole("offence_coach", offenceCoach, seasonCurrent, "2026-09-01");
assignRole("defence_coach", defenceCoach, seasonCurrent, "2026-09-01");

// --- Memberships -----------------------------------------------------------

const ONBOARDING_TYPES = [
  ["subs_invoiced", "Subscription invoiced", true, false],
  ["subs_paid", "Subscription paid", false, true],
  ["kit_sorted", "Kit sorted", true, false],
  ["bucs_play", "BUCS Play registration", true, false],
  ["hudl_access", "Hudl access", false, false],
  ["photo", "Squad photo", false, false],
  ["comms_groups", "Comms groups joined", true, false],
];

const itemTypesBySeason = {};
for (const season of [seasonPrevious, seasonCurrent]) {
  itemTypesBySeason[season.id] = ONBOARDING_TYPES.map(([code, label, required, isSubs], order) => {
    const type = {
      id: uuid(),
      season_id: season.id,
      code,
      label,
      is_required: required,
      is_subscription: isSubs,
      sort_order: order,
    };
    add("onboarding_item_types", type);
    return type;
  });
}

/** Records a membership status transition into the typed lifecycle history. */
function recordTransition(membership, from, to, when, actor, reason = null) {
  add("season_membership_status_events", {
    id: uuid(),
    season_membership_id: membership.id,
    from_status: from,
    to_status: to,
    occurred_at: when,
    actor_person_id: actor?.id ?? null,
    actor_label: actor ? null : "season-open process",
    reason,
  });
}

// Previous season: 34 memberships — the 26 people who go on to return, plus 8
// who do not. The leavers are what make season rollover provable: they keep a
// full archived season with positions, jerseys and history, hold no membership
// in the new season, and are never duplicated as a second Person.
const previousRoster = [
  ...people.slice(0, 26),
  ...people.slice(PLAYER_COUNT, PLAYER_COUNT + LEAVER_COUNT),
];
const previousMemberships = [];
for (let i = 0; i < previousRoster.length; i += 1) {
  const person = previousRoster[i];
  const membership = {
    id: uuid(),
    person_id: person.id,
    season_id: seasonPrevious.id,
    status: "archived",
    entry: i < 18 ? "returning" : "new",
    carried_forward_from_id: null,
    confirmed_on: "2025-09-15",
    activated_on: "2025-10-05",
    departed_on: null,
    expected_return_on: null,
    departure_reason: null,
    inactivity_label: null,
    created_at: "2025-09-01T09:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
  };
  add("season_memberships", membership);
  previousMemberships.push(membership);
  recordTransition(membership, null, "onboarding", "2025-09-15T09:00:00Z", people[2]);
  recordTransition(membership, "onboarding", "active", "2025-10-05T09:00:00Z", people[2]);
  recordTransition(
    membership,
    "active",
    "archived",
    "2026-07-01T10:00:00Z",
    people[2],
    "Season close",
  );
}

// Current season: 42 player memberships across the whole status vocabulary —
// all five of it, since LAN-182. `carried_forward`, `confirmed` and `withdrawn`
// are gone: the first two were never states anybody rested in, and the third
// described somebody who under the rebuilt ladder never holds a membership at
// all. Their four rows redistribute onto `onboarding` and `departed`, which is
// where the mapping sends them.
const STATUS_PLAN = [
  ...Array(26).fill("active"),
  "active",
  "active",
  "active",
  "active",
  "active",
  "active",
  "inactive",
  "inactive",
  "inactive",
  "onboarding",
  "onboarding",
  "onboarding",
  "onboarding",
  "departed",
  "departed",
  "departed",
];

const memberships = [];
for (let i = 0; i < PLAYER_COUNT; i += 1) {
  const person = people[i];
  const status = STATUS_PLAN[i];
  const previous = previousMemberships.find((m) => m.person_id === person.id);
  const isReturning = Boolean(previous) && i < 26;

  const membership = {
    id: uuid(),
    person_id: person.id,
    season_id: seasonCurrent.id,
    status,
    entry: isReturning ? "returning" : "new",
    // Rollover links memberships and never duplicates the Person (model §3).
    carried_forward_from_id: isReturning ? previous.id : null,
    // Survives the vocabulary change as a milestone date. It records the day
    // the club said "yes, we want him", which is an event that happened even
    // though it was never a state anybody sat in.
    confirmed_on: "2026-09-20",
    activated_on: ["active", "inactive", "departed"].includes(status) ? "2026-10-04" : null,
    departed_on: status === "departed" ? "2026-11-30" : null,
    expected_return_on: status === "inactive" ? "2027-04-25" : null,
    departure_reason: status === "departed" ? "Left Oxford mid-year" : null,
    inactivity_label: status === "inactive" ? "Stepped away for term" : null,
    created_at: "2026-09-01T09:00:00Z",
    updated_at: nowAt("09:00:00"),
  };
  add("season_memberships", membership);
  memberships.push(membership);

  // One entry step, not three. A membership begins at `onboarding` — the
  // returner and the new player alike, because `entry` is what tells those two
  // apart and always was. The old sequence walked
  // `carried_forward → confirmed → onboarding` through two states that meant
  // nothing to anybody, and writing it now would produce
  // `onboarding → onboarding` twice: a history recording changes that did not
  // happen.
  recordTransition(membership, null, "onboarding", "2026-09-05T09:00:00Z", null);
  if (["active", "inactive", "departed"].includes(status)) {
    recordTransition(membership, "onboarding", "active", "2026-10-04T09:00:00Z", people[9]);
  }
  if (status === "inactive") {
    recordTransition(
      membership,
      "active",
      "inactive",
      "2026-11-10T09:00:00Z",
      people[9],
      "Stepped away for term",
    );
  }
  if (status === "departed") {
    recordTransition(
      membership,
      "active",
      "departed",
      "2026-11-30T09:00:00Z",
      people[9],
      "Left Oxford mid-year",
    );
  }
  // Register D1 in action: the Michaelmas-quit / Hilary-return case is one
  // membership whose status history carries the gap, not two records.
  //
  // Anchored to Hilary week 1 rather than to a date in February, because the
  // return has to have *happened* for the gap to be in the history at all, and
  // the frame can put now as early as Hilary week 1's Saturday.
  if (i === 30) {
    recordTransition(
      membership,
      "inactive",
      "active",
      at(addDays(day(terms["hilary-2026-27"].starts_on), 8), "09:00:00"),
      people[9],
      "Back after Christmas",
    );
    membership.status = "active";
    membership.inactivity_label = null;
  }

  for (const type of itemTypesBySeason[seasonCurrent.id]) {
    const itemStatus = type.is_subscription
      ? weighted([
          ["complete", 55],
          ["invited", 25],
          ["waived", 10],
          ["pending", 10],
        ])
      : weighted([
          ["complete", 70],
          ["invited", 15],
          ["pending", 10],
          ["not_applicable", 5],
        ]);
    add("onboarding_items", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: seasonCurrent.id,
      item_type_id: type.id,
      status: itemStatus,
      completed_on: itemStatus === "complete" ? "2026-10-01" : null,
      waived_reason: itemStatus === "waived" ? "Hardship waiver agreed by the committee" : null,
      waived_by_person_id: itemStatus === "waived" ? people[3].id : null,
      updated_at: "2026-10-01T09:00:00Z",
    });
  }

  // Invariant I4: readiness never implies competition eligibility.
  for (const competition of ["club_play", "bucs"]) {
    const eligibility =
      competition === "club_play"
        ? "eligible"
        : weighted([
            ["eligible", 70],
            ["pending", 20],
            ["ineligible", 10],
          ]);
    add("eligibility_records", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: seasonCurrent.id,
      competition,
      status: eligibility,
      determining_authority: competition === "bucs" ? "BUCS Play" : "OULAFC committee",
      checked_at: eligibility === "pending" ? null : "2026-10-02T09:00:00Z",
      evidence_reference:
        competition === "bucs" && eligibility === "eligible" ? `BUCSPLAY-${20260000 + i}` : null,
      effective_from: "2026-09-27",
      effective_to: null,
      created_at: "2026-10-02T09:00:00Z",
    });
  }

  // --- The season facts LAN-182 gave storage to ----------------------------

  // Coach group. Not everybody has one: the club assigns them as the coaching
  // staff settles, and the board's "Coach group" column has to render an empty
  // cell as readily as a filled one.
  if (i % 4 !== 3) {
    add("coach_group_assignments", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: seasonCurrent.id,
      coach_group: ["Offense", "Defense", "Special teams"][i % 3],
      responsible_coach_person_id: people[9].id,
      recorded_by_person_id: people[2].id,
      created_at: "2026-10-02T09:00:00Z",
      updated_at: "2026-10-02T09:00:00Z",
    });
  }

  // Formalwear, reasked every season. The measured ownership rates are tie 79%,
  // bowtie 31%, socks 93%, and one answer in the club's own file is the free
  // text "Yes (paid)" — owned, and paid for — which is why this is not three
  // booleans.
  for (const [item, ownedRate] of [
    ["tie", 0.79],
    ["bowtie", 0.31],
    ["socks", 0.93],
  ]) {
    const owned = chance(ownedRate);
    add("formalwear_records", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: seasonCurrent.id,
      item,
      ownership: owned ? (chance(0.4) ? "Yes (paid)" : "Yes") : "No",
      recorded_by_person_id: people[2].id,
      created_at: "2026-10-05T09:00:00Z",
      updated_at: "2026-10-05T09:00:00Z",
    });
  }
}

// Blues. Rare, recorded when known, never chased, and a row exists only where
// somebody was actually looked at.
//
// On the PREVIOUS season deliberately: a Blue is awarded at the end of a
// campaign, so putting one on a season still being played would date an award
// into the future. It also gives `public.person_blues_totals` a total to derive
// across seasons, which is the number the club actually looks at.
for (let i = 0; i < previousMemberships.length; i += 1) {
  if (i % 11 !== 4) continue;
  add("blues_awards", {
    id: uuid(),
    season_membership_id: previousMemberships[i].id,
    season_id: seasonPrevious.id,
    half_blue_awarded: i % 22 !== 4,
    full_blue_awarded: i % 22 === 4,
    awarded_on: "2026-06-13",
    recorded_by_person_id: people[2].id,
    created_at: "2026-06-13T09:00:00Z",
    updated_at: "2026-06-13T09:00:00Z",
  });
}

// A returner who never confirmed, and one who confirmed they are not coming
// back — both live on the previous season's classification.
const notReturning = previousMemberships.filter(
  (m) => !memberships.some((c) => c.person_id === m.person_id),
);

// --- Positions and jerseys -------------------------------------------------

function assignPositions(membership, season, vocab, offenceMix, defenceMix) {
  // SDA §11.1 measures TWO things that only reconcile if absence is
  // correlated: ~83% of people carry both an offence and a defence position,
  // while the per-column "None/blank" shares are 24% and 19%. Independent rolls
  // would land at ~62% carrying both. In the real workbook it is the same
  // people who are blank in both columns — a row that was never filled in — so
  // the blanks are drawn together here.
  // The two figures cannot both hold exactly, so the headline one — 83% carry
  // both — is the target, and the per-column shares land a few points high.
  const filledIn = chance(0.83);
  const partial = !filledIn && chance(0.35);
  const offenceOnly = partial && chance(0.5);

  const offence =
    filledIn || (partial && offenceOnly) ? weighted(offenceMix.filter(([code]) => code)) : null;
  const defence =
    filledIn || (partial && !offenceOnly) ? weighted(defenceMix.filter(([code]) => code)) : null;

  for (const [code, slot] of [
    [offence, "offence"],
    [defence, "defence"],
  ]) {
    if (!code) continue;
    const position = positionByVocab[vocab.id][code];
    add("position_assignments", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: season.id,
      position_vocabulary_id: vocab.id,
      position_id: position.id,
      side: position.side,
      slot,
      effective_from: season.starts_on,
      effective_to: null,
      recorded_by_person_id: headCoach.id,
      created_at: `${season.starts_on}T09:00:00Z`,
    });
  }
  return { offence, defence };
}

let bothSides = 0;
for (const membership of memberships) {
  const result = assignPositions(
    membership,
    seasonCurrent,
    vocab2026,
    OFFENCE_MIX_2026,
    DEFENCE_MIX_2026,
  );
  if (result.offence && result.defence) bothSides += 1;
}
for (const membership of previousMemberships) {
  assignPositions(membership, seasonPrevious, vocab2023, OFFENCE_MIX_2023, DEFENCE_MIX_2023);
}

// Jerseys. Two numbers are left unassigned entirely; ~8% of players hold more
// than one number in a kit.
const usedNumbers = { blue: new Set(), white: new Set() };
memberships.forEach((membership, index) => {
  if (index >= PLAYER_COUNT - 2) return;

  for (const kit of ["blue", "white"]) {
    let number = intBetween(1, 99);
    let guard = 0;
    while (usedNumbers[kit].has(number) && guard < 200) {
      number = intBetween(1, 99);
      guard += 1;
    }
    usedNumbers[kit].add(number);

    add("jersey_assignments", {
      id: uuid(),
      season_membership_id: membership.id,
      season_id: seasonCurrent.id,
      kit,
      number,
      is_predominant: kit === "blue",
      is_import_conflict: false,
      effective_from: "2026-10-08",
      effective_to: null,
      created_at: "2026-10-08T21:00:00Z",
    });

    if (kit === "blue" && chance(0.08)) {
      let second = intBetween(1, 99);
      let secondGuard = 0;
      while (usedNumbers[kit].has(second) && secondGuard < 200) {
        second = intBetween(1, 99);
        secondGuard += 1;
      }
      usedNumbers[kit].add(second);
      add("jersey_assignments", {
        id: uuid(),
        season_membership_id: membership.id,
        season_id: seasonCurrent.id,
        kit,
        number: second,
        is_predominant: false,
        is_import_conflict: false,
        effective_from: "2026-10-08",
        effective_to: null,
        created_at: "2026-10-08T21:00:00Z",
      });
    }
  }
});

// Invariant S2: historical imports may violate uniqueness. Two collisions are
// seeded into the ARCHIVED season, flagged rather than blocked — which is what
// the invariant actually says, and what refusing the row would have lost.
for (const [a, b, number] of [
  [0, 1, 44],
  [2, 3, 77],
]) {
  for (const index of [a, b]) {
    add("jersey_assignments", {
      id: uuid(),
      season_membership_id: previousMemberships[index].id,
      season_id: seasonPrevious.id,
      kit: "blue",
      number,
      is_predominant: index === a,
      is_import_conflict: true,
      effective_from: "2025-10-08",
      effective_to: null,
      created_at: "2025-10-08T21:00:00Z",
    });
  }
}

// --- Availability ----------------------------------------------------------

// Only memberships whose availability actually moved carry rows. Nobody is
// given a fabricated "confirmed green" they never received: invariant A3 says a
// green records its confirmer, and inventing confirmations would be a lie in
// exactly the field the club most needs to trust.
const availabilityCohort = shuffled(memberships.filter((m) => m.status === "active")).slice(0, 8);
availabilityCohort.forEach((membership, index) => {
  const started = addDays(day("2026-10-18"), index * 9);
  add("availability_statuses", {
    id: uuid(),
    season_membership_id: membership.id,
    level: index % 3 === 0 ? "red" : "orange",
    effective_from: asDate(started),
    review_on: asDate(addDays(started, 14)),
    reported_by_person_id: headCoach.id,
    confirmed_by_person_id: null,
    recorded_at: at(started, "20:00:00"),
  });

  if (index % 3 === 0) {
    const worsened = addDays(started, 10);
    add("availability_statuses", {
      id: uuid(),
      season_membership_id: membership.id,
      level: "red",
      effective_from: asDate(worsened),
      review_on: asDate(addDays(worsened, 21)),
      reported_by_person_id: offenceCoach.id,
      confirmed_by_person_id: null,
      recorded_at: at(worsened, "20:00:00"),
    });
  }

  if (index < 5) {
    // Requirement 8 verbatim: return to full availability requires
    // confirmation, and the confirmer is recorded.
    const returned = addDays(started, 28);
    add("availability_statuses", {
      id: uuid(),
      season_membership_id: membership.id,
      level: "green",
      effective_from: asDate(returned),
      review_on: null,
      reported_by_person_id: headCoach.id,
      confirmed_by_person_id: people[1].id,
      recorded_at: at(returned, "20:00:00"),
    });
  }
});

// --- The calendar ----------------------------------------------------------

// Weeks run Sunday–Saturday, numbered −1…8th in Michaelmas and 0th…8th in
// Hilary and Trinity (SDA §5.4). Every event's date is derived from this
// arithmetic rather than hard-coded, so the term structure is what is actually
// under test.
const calendar = [];
for (const key of ["michaelmas-2026-27", "hilary-2026-27", "trinity-2026-27"]) {
  const term = terms[key];
  const start = day(term.starts_on);
  for (let week = term.first_week; week <= term.last_week; week += 1) {
    calendar.push({ term, week, sunday: addDays(start, (week - term.first_week) * 7) });
  }
}
const weekOf = (name, week) => calendar.find((w) => w.term.name === name && w.week === week);

const series = {};
for (const [key, name, type, venue, starts, ends, weekday, note] of [
  [
    "sundaySession",
    "Sunday Session",
    "practice",
    "Iffley Road Astro",
    "14:00",
    "16:30",
    0,
    "Sunday practice, replaced by the fixture on match weeks — the replacement is why instances are materialised.",
  ],
  [
    "chalk",
    "Tuesday Chalk",
    "chalk",
    "Microsoft Teams",
    "18:00",
    "19:00",
    2,
    "Tuesday chalk talk, competitive weeks only. Online — the venue is the destination.",
  ],
  [
    "conditioning",
    "Tuesday S&C",
    "strength_and_conditioning",
    "Iffley Road Gym",
    "19:00",
    "20:00",
    2,
    "Runs through to the end of Trinity, after competitive activity has finished.",
  ],
  [
    "wednesday",
    "Wednesday Practice",
    "practice",
    "Iffley Road Astro",
    "20:00",
    "22:30",
    3,
    "Main weekly practice.",
  ],
]) {
  const record = {
    id: uuid(),
    season_id: seasonCurrent.id,
    name,
    event_type: type,
    default_venue: venue,
    default_starts_at: starts,
    default_ends_at: ends,
    weekday,
    recurrence_note: note,
    is_active: true,
    created_at: "2026-09-01T09:00:00Z",
  };
  add("event_series", record);
  series[key] = record;
}

const crewdateGroup = {
  id: uuid(),
  season_id: seasonCurrent.id,
  label: "Michaelmas crewdate slot",
  note: "Two candidate Thursdays for one social. At most one may ever be approved (invariant E3).",
  created_at: "2026-10-01T09:00:00Z",
};
const fixtureOrPracticeGroup = {
  id: uuid(),
  season_id: seasonCurrent.id,
  label: "Hilary week 4 Sunday: fixture or practice",
  note: "A single term-card cell holding two possible event types (SDA §11.2).",
  created_at: "2027-01-05T09:00:00Z",
};
add("alternative_groups", crewdateGroup);
add("alternative_groups", fixtureOrPracticeGroup);

const events = [];
let eventOrder = 0;

// LAN-170 (owner correction): approval nominally lands 12 days before the
// event, but for an event scheduled more than 12 days past the frame's `NOW`
// that lands `approved_at` — and therefore every invitation's `issued_at` and
// every notification job's `scheduled_for`, both derived from it — in the
// future. A future issue date is exactly why the owner could not record a Yes
// against a seeded invitation (2,067 of 4,912 measured with `issued_at >
// now()`). `response_deadline_at` is untouched: a deadline in the future is
// legitimate and is not part of this defect.
//
// `pastStamp` clamps the fixed time-of-day `time` on `dateOnly` to strictly
// before `NOW` whenever the naive value would land at or after it, spreading
// clamped events across the fortnight before `NOW` using the existing
// `eventOrder` counter so the spread is deterministic without any new PRNG
// draw and nothing else in the dataset shifts. The clamped date is always at
// least one full calendar day before `NOW`'s date, so the fixed time-of-day
// stamp is guaranteed to fall before `NOW` regardless of `NOW`'s own
// time-of-day.
const APPROVAL_CLAMP_SPREAD_DAYS = 13;

function pastStamp(dateOnly, time, order) {
  const candidate = at(dateOnly, time);
  if (new Date(candidate).getTime() <= NOW.getTime()) return candidate;
  const clampedDate = addDays(NOW, -1 - (order % APPROVAL_CLAMP_SPREAD_DAYS));
  return at(clampedDate, time);
}

function makeEvent(spec) {
  const scheduled = spec.date ? asDate(spec.date) : null;
  // LAN-151: three stored statuses. A past event is `approved` like any other —
  // that its date has gone by is what makes it an event that happened (D30),
  // and nobody asserts it.
  const status = spec.status ?? "approved";
  const approved = status !== "draft";

  const event = {
    id: uuid(),
    season_id: seasonCurrent.id,
    series_id: spec.series?.id ?? null,
    alternative_group_id: spec.group?.id ?? null,
    term_id: spec.term?.id ?? null,
    week_number: spec.week ?? null,
    name: spec.name,
    event_type: spec.type,
    origin: spec.origin ?? "club_controlled",
    status,
    scheduled_on: scheduled,
    starts_at: spec.starts ?? null,
    ends_at: spec.ends ?? null,
    delivery_mode: spec.online ? "online" : "in_person",
    venue: spec.venue ?? null,
    joining_url: spec.joining_url ?? null,
    description: spec.description ?? null,
    required_equipment: spec.equipment ?? null,
    competition: spec.competition ?? null,
    is_mandatory: spec.mandatory ?? false,
    response_deadline_at: approved && spec.date ? at(addDays(spec.date, -2), "18:00:00") : null,
    reminder_offsets_hours: approved ? "{72,24}" : "{}",
    aggregate_headcount: spec.headcount ?? null,
    owner_person_id: (spec.owner ?? people[1]).id,
    audience_confirmed_at: approved
      ? pastStamp(addDays(spec.date, -12), "19:00:00", eventOrder)
      : null,
    audience_confirmed_by_person_id: approved ? people[1].id : null,
    approved_at: approved ? pastStamp(addDays(spec.date, -12), "19:05:00", eventOrder) : null,
    approved_by_person_id: approved ? people[1].id : null,
    decision_reason: spec.decision_reason ?? null,
    created_at: "2026-09-01T09:00:00Z",
    updated_at: nowAt("09:00:00"),
    _order: eventOrder++,
  };

  add("events", event);
  events.push(event);
  return event;
}

// Recruitment: five events at the start of Michaelmas, before anyone is on the
// roster. Register D3 — an aggregate headcount makes unregistered turnout
// countable without fabricating person records.
for (const [week, name, headcount] of [
  [-1, "Freshers' Fair — stand", 140],
  [-1, "Taster session 1", 38],
  [0, "Taster session 2", 31],
  [0, "Come-and-try flag session", 22],
  [1, "Recruitment social", 26],
]) {
  const slot = weekOf("michaelmas", week);
  makeEvent({
    name,
    type: "recruitment",
    term: slot.term,
    week,
    date: addDays(slot.sunday, 4),
    starts: "17:00",
    ends: "19:00",
    venue: "Iffley Road Astro",
    headcount,
    owner: people[12],
  });
}

makeEvent({
  name: "Pre-season camp",
  type: "practice",
  term: weekOf("michaelmas", -1).term,
  week: -1,
  date: addDays(weekOf("michaelmas", -1).sunday, 6),
  starts: "10:00",
  ends: "16:00",
  venue: "Iffley Road Astro",
  mandatory: true,
});
makeEvent({
  name: "Varsity preparation camp",
  type: "practice",
  term: weekOf("trinity", 0).term,
  week: 0,
  date: addDays(weekOf("trinity", 0).sunday, 6),
  starts: "10:00",
  ends: "16:00",
  venue: "Iffley Road Astro",
  mandatory: true,
});

// The weekly skeleton. S&C runs through to the end of Trinity, long after
// competitive activity has finished at Varsity in week 3 (SDA §5.4).
const CONDITIONING_SKIPS = new Set(["michaelmas--1", "hilary-8", "trinity-8"]);
for (const slot of calendar) {
  const key = `${slot.term.name}-${slot.week}`;
  const tuesday = addDays(slot.sunday, 2);
  const wednesday = addDays(slot.sunday, 3);

  if (!CONDITIONING_SKIPS.has(key)) {
    makeEvent({
      name: `S&C — ${slot.term.name} week ${slot.week}`,
      type: "strength_and_conditioning",
      series: series.conditioning,
      term: slot.term,
      week: slot.week,
      date: tuesday,
      starts: "19:00",
      ends: "20:00",
      venue: "Iffley Road Gym",
    });
  }

  const chalkWeek =
    (slot.term.name === "michaelmas" && slot.week >= 4) ||
    slot.term.name === "hilary" ||
    (slot.term.name === "trinity" && slot.week <= 3);
  if (chalkWeek) {
    // D20 and D21: chalk is on Teams, and since LAN-151 that is a property of
    // the event rather than the word "Online" typed into the venue field. The
    // venue then holds the destination, and the joining link is its own field
    // and never reaches a public surface (REQ-no-joining-url).
    makeEvent({
      name: `Chalk — ${slot.term.name} week ${slot.week}`,
      type: "chalk",
      series: series.chalk,
      term: slot.term,
      week: slot.week,
      date: tuesday,
      starts: "18:00",
      ends: "19:00",
      online: true,
      venue: "Microsoft Teams",
      joining_url: `https://teams.example.invalid/l/meetup-join/chalk-${slot.term.name}-${slot.week}`,
    });
  }

  const practiceWeek =
    (slot.term.name === "michaelmas" && slot.week >= 0) ||
    slot.term.name === "hilary" ||
    (slot.term.name === "trinity" && slot.week <= 2);
  if (practiceWeek) {
    // SDA §11.2: reproduce the one-minute-per-week time drift deliberately, so
    // parsers are tested against it rather than trusting the values.
    const drift = slot.term.name === "michaelmas" ? Math.max(0, slot.week) : 0;
    makeEvent({
      name: `Practice — ${slot.term.name} week ${slot.week}`,
      type: "practice",
      series: series.wednesday,
      term: slot.term,
      week: slot.week,
      date: wednesday,
      starts: "20:00",
      ends: `22:${String(30 + drift).padStart(2, "0")}`,
      venue: "Iffley Road Astro",
      mandatory: true,
    });
  }
}

// Sundays: a fixture REPLACES the Sunday practice rather than sitting beside
// it, which is precisely why a recurrence rule alone cannot express this
// schedule and instances have to be materialised.
const FIXTURE_WEEKS = [
  ["michaelmas", 5, "Brackenridge Bulls", "home"],
  ["michaelmas", 6, "Netherfield Nomads", "away"],
  ["michaelmas", 7, "Coldharbour Corsairs", "home"],
  ["michaelmas", 8, "Dunsfold Dragoons", "away"],
  ["hilary", 0, "Elmswell Eagles", "home"],
  ["hilary", 1, "Fernhurst Falcons", "away"],
  ["hilary", 2, "Greatwood Griffins", "home"],
  ["hilary", 5, "Harewell Hawks", "away"],
  ["hilary", 6, "Ivybridge Ravens", "home"],
  ["hilary", 7, null, null],
  ["hilary", 8, null, null],
];
const SUNDAY_PRACTICE_WEEKS = [
  ["michaelmas", 1],
  ["michaelmas", 2],
  ["michaelmas", 3],
  ["hilary", 3],
  ["hilary", 4],
  ["trinity", 0],
  ["trinity", 1],
  ["trinity", 2],
];

// D14: there is no opponent field. The club writes the opponent into the name,
// exactly as it does on its own term card, and the name is what carries it.
const fixtures = [];
for (const [termName, week, opponent, side] of FIXTURE_WEEKS) {
  const slot = weekOf(termName, week);
  const unconfirmed = opponent === null;
  fixtures.push({
    opponent,
    side,
    event: makeEvent({
      // SDA §5.6: eight of eleven scheduled games currently have a confirmed
      // date and NOTHING else. Two of these reproduce that exactly — approved,
      // dated, and null on venue and both times.
      name: unconfirmed ? `BUCS fixture — ${termName} week ${week}` : `vs ${opponent}`,
      type: "game",
      term: slot.term,
      week,
      date: slot.sunday,
      starts: unconfirmed ? null : "14:00",
      ends: unconfirmed ? null : "16:30",
      venue: unconfirmed ? null : side === "home" ? "Iffley Road Astro" : "Away",
      competition: "BUCS Premier South",
      origin: "externally_assigned",
      mandatory: true,
      owner: people[6],
    }),
  });
}

for (const [termName, week] of SUNDAY_PRACTICE_WEEKS) {
  const slot = weekOf(termName, week);
  makeEvent({
    name: `Sunday session — ${termName} week ${week}`,
    type: "practice",
    series: series.sundaySession,
    term: slot.term,
    week,
    date: slot.sunday,
    starts: "14:00",
    ends: "16:30",
    venue: "Iffley Road Astro",
  });
}

const varsitySlot = weekOf("trinity", 3);
const varsityMatch = makeEvent({
  // `varsity` left `public.event_type` with LAN-151 — D14 says the name carries
  // what the old type and the dropped `opponent` column used to.
  name: "Varsity Match vs Cambridge",
  type: "game",
  term: varsitySlot.term,
  week: 3,
  date: varsitySlot.sunday,
  starts: "14:00",
  ends: "17:00",
  venue: "Iffley Road Astro",
  competition: "Varsity",
  mandatory: true,
  owner: people[1],
});

// Socials, including one on a fixture Sunday — two events on one day is a
// designed-for case, not an edge case (invariant E4).
const SOCIAL_WEEKS = [
  ["michaelmas", 2, 4],
  ["michaelmas", 4, 4],
  ["michaelmas", 6, 0],
  ["michaelmas", 8, 4],
  ["hilary", 1, 4],
  ["hilary", 3, 4],
  ["hilary", 5, 4],
  ["hilary", 7, 4],
  ["trinity", 1, 4],
  ["trinity", 3, 4],
];
for (const [termName, week, offset] of SOCIAL_WEEKS) {
  const slot = weekOf(termName, week);
  makeEvent({
    name: `Club social — ${termName} week ${week}`,
    type: "social",
    term: slot.term,
    week,
    date: addDays(slot.sunday, offset),
    starts: "19:30",
    ends: "23:00",
    venue: "The Lamb and Flag",
    owner: people[12],
  });
}

// Two candidates for one social: A was approved and B stayed a draft. LAN-151
// retired invariant E3 and its index — an unconfirmed event is simply a draft,
// and the club carries no alternative-group machinery.
const crewdateSlot = weekOf("michaelmas", 5);
makeEvent({
  name: "Potential Crewdate A",
  type: "social",
  group: crewdateGroup,
  term: crewdateSlot.term,
  week: 5,
  date: addDays(crewdateSlot.sunday, 4),
  starts: "19:30",
  ends: "23:00",
  venue: "College hall",
  owner: people[12],
});
makeEvent({
  name: "Potential Crewdate B",
  type: "social",
  group: crewdateGroup,
  term: crewdateSlot.term,
  week: 5,
  date: addDays(crewdateSlot.sunday, 5),
  status: "draft",
  decision_reason: "Crewdate A was taken instead — one slot, two candidates.",
  starts: "19:30",
  ends: "23:00",
  venue: "College hall",
  owner: people[12],
});

// One term-card cell holding two possible event types.
const eitherSlot = weekOf("hilary", 4);
makeEvent({
  name: "Hilary week 4 Sunday — practice",
  type: "practice",
  group: fixtureOrPracticeGroup,
  term: eitherSlot.term,
  week: 4,
  date: eitherSlot.sunday,
  starts: "14:00",
  ends: "16:30",
  venue: "Iffley Road Astro",
});
makeEvent({
  name: "Hilary week 4 Sunday — game",
  type: "game",
  group: fixtureOrPracticeGroup,
  term: eitherSlot.term,
  week: 4,
  date: eitherSlot.sunday,
  status: "draft",
  decision_reason: "BUCS did not allocate a fixture; the practice runs instead.",
  origin: "externally_assigned",
  competition: "BUCS Premier South",
});

// Drafts and a withdrawal: the ask-and-answer cycle before anything is public.
const draftSlot = weekOf("trinity", 5);
makeEvent({
  name: "End-of-season awards night",
  type: "social",
  term: draftSlot.term,
  week: 5,
  date: addDays(draftSlot.sunday, 4),
  status: "draft",
  starts: "19:00",
  owner: people[12],
});
// A draft. `pending_approval` left the enum with LAN-151; PR #18 had already
// removed the Submit step, so the application could not put an event into it
// and a seeded row in it was an event nobody could act on.
makeEvent({
  name: "Alumni touch game (proposed)",
  type: "social",
  term: draftSlot.term,
  week: 6,
  date: addDays(weekOf("trinity", 6).sunday, 6),
  status: "draft",
  starts: "13:00",
  ends: "16:00",
  venue: "Iffley Road Astro",
  owner: people[9],
});
makeEvent({
  name: "Second recruitment push (abandoned)",
  type: "recruitment",
  term: weekOf("hilary", 0).term,
  week: 0,
  date: addDays(weekOf("hilary", 0).sunday, 4),
  status: "draft",
  decision_reason: "Owner abandoned the idea before submitting it.",
  owner: people[12],
});

// Requirement 4's history: a cancellation and a weather call-off, both of which
// keep every response ever given (register D5), and neither of which may ever
// carry attendance (invariant P5).
const cancelledEvent = events.find(
  (e) => e.name === "Practice — michaelmas week 3" && e.event_type === "practice",
);
cancelledEvent.status = "cancelled";
cancelledEvent.decision_reason = "Astro double-booked by the university.";

// The second cancellation is the one the club used to record as `not_held`: a
// session called off on the morning. LAN-151 retired that status, and the
// approved mapping sends it here — a cancellation, carrying its internal reason
// (D76) and told to nobody after the fact.
const calledOffEvent = events.find((e) => e.name === "Sunday session — michaelmas week 2");
calledOffEvent.status = "cancelled";
calledOffEvent.decision_reason = "Pitch frozen; called off on the morning.";

// "We asked for the 8th and got the 15th" is the normal case with BUCS.
const movedFixture = fixtures[2];
add("schedule_changes", {
  id: uuid(),
  event_id: movedFixture.event.id,
  source: "league",
  reason: "BUCS reallocated the fixture to the following week and swapped the venue.",
  previous_scheduled_on: asDate(addDays(day(movedFixture.event.scheduled_on), -7)),
  new_scheduled_on: movedFixture.event.scheduled_on,
  previous_starts_at: "13:00",
  new_starts_at: "14:00",
  previous_ends_at: "15:30",
  new_ends_at: movedFixture.event.ends_at,
  previous_venue: "Away",
  new_venue: movedFixture.event.venue,
  previous_name: `vs ${movedFixture.opponent}`,
  new_name: movedFixture.event.name,
  previous_opponent: movedFixture.opponent,
  new_opponent: movedFixture.opponent,
  notified: true,
  changed_at: "2026-10-30T11:00:00Z",
  recorded_by_person_id: people[6].id,
  approved_by_person_id: people[1].id,
});

// Meetings. D23 removed "Response requested" — mandatory or optional already
// carries it, and everyone sent an event is expected to answer — so these two
// resolve an audience and ask for an answer like anything else.
const agmDate = day("2027-06-09");
makeEvent({
  name: "Annual General Meeting",
  type: "meeting",
  date: agmDate,
  starts: "18:00",
  ends: "20:00",
  venue: "College lecture room",
  owner: people[1],
});
// D20, D21: an online event. The venue field holds the destination rather than
// an address, and the joining link is its own field and never public.
makeEvent({
  name: "Committee handover briefing",
  type: "meeting",
  date: day("2027-06-16"),
  starts: "18:00",
  ends: "19:30",
  online: true,
  venue: "Microsoft Teams",
  joining_url: "https://teams.example.invalid/l/meetup-join/oulafc-handover",
  owner: people[2],
});

// Per-event questions. Historically re-invented with a different column name
// for every single game, and named after the destination every time.
for (const fixture of fixtures) {
  if (!fixture.opponent) continue;
  const destination = fixture.side === "away" ? fixture.opponent : "Iffley Road";
  add("event_questions", {
    id: uuid(),
    event_id: fixture.event.id,
    prompt: `Transport to ${destination}?`,
    answer_type: "boolean",
    choices: null,
    applies_to_capacities: "{player,coach}",
    // OWNER-LAN170-08: nothing in the whole seed marked a question required
    // before this, so there was no way to walk "a No records even when the
    // event's questions are not optional" — already correct behaviour
    // (`recordOperatorRsvpResponse` never gates on it), but unwalkable
    // without a required question somewhere to try it against. The nearest
    // fixture to the operator's own "now" carries the case.
    is_required: isReviewWindowEvent(fixture.event),
    sort_order: 0,
  });
  add("event_questions", {
    id: uuid(),
    event_id: fixture.event.id,
    prompt: `Transport back from ${destination}?`,
    answer_type: "boolean",
    choices: null,
    applies_to_capacities: "{player,coach}",
    is_required: false,
    sort_order: 1,
  });
}

// --- Invitations, RSVP and attendance --------------------------------------

const invitableMemberships = memberships.filter((m) =>
  ["active", "inactive", "onboarding"].includes(m.status),
);
const staffInvitees = [
  { person: headCoach, capacity: "coach" },
  { person: offenceCoach, capacity: "coach" },
  { person: defenceCoach, capacity: "coach" },
  ...[1, 2, 6, 9, 12, 14, 10].map((i) => ({ person: people[i], capacity: "committee" })),
];

const invitations = [];
const invitedEvents = events.filter((e) => ["approved", "cancelled"].includes(e.status));

/** Records who the approver confirmed. Invitations are resolved from this. */
function addAudienceMember(event, { membership = null, person = null, capacity }) {
  return add("event_audience_members", {
    id: uuid(),
    event_id: event.id,
    season_id: seasonCurrent.id,
    capacity,
    season_membership_id: membership?.id ?? null,
    person_id: person?.id ?? null,
    added_at: event.audience_confirmed_at ?? event.created_at,
    added_by_person_id: event.audience_confirmed_by_person_id,
  });
}

function inviteAudienceMember(event, member, status) {
  invitations.push(
    add("invitations", {
      id: uuid(),
      event_id: event.id,
      event_status: event.status,
      season_id: seasonCurrent.id,
      audience_member_id: member.id,
      capacity: member.capacity,
      season_membership_id: member.season_membership_id,
      person_id: member.person_id,
      status,
      issued_at: status === "issued" ? event.approved_at : null,
      expires_at: event.response_deadline_at,
      cancelled_at: null,
      created_at: event.approved_at,
      _event: event,
    }),
  );
}

// Invariant P7's `never-invited` state has to exist in the data for the
// reporting view to be worth anything. Two events are seeded where the approver
// confirmed people the invitation run then missed — which is precisely the
// exception public.uninvited_audience_members exists to catch, and precisely
// what the baseline schema could not tell apart from "outside the audience".
const UNINVITED_AUDIENCE = new Map([
  [3, 2],
  [11, 3],
]);

invitedEvents.forEach((event, index) => {
  // The confirmed audience is per-event and grows across the term (SDA §11.3):
  // it is not a fixed roster snapshot.
  const audienceSize = Math.min(invitableMemberships.length, 35 + Math.floor(index / 6));
  const confirmed = invitableMemberships.slice(0, audienceSize);
  const skipCount = UNINVITED_AUDIENCE.get(index) ?? 0;

  confirmed.forEach((membership, position) => {
    const member = addAudienceMember(event, { membership, capacity: "player" });
    if (position >= confirmed.length - skipCount) return;
    inviteAudienceMember(event, member, "pending");
  });

  for (const { person, capacity } of staffInvitees) {
    const member = addAudienceMember(event, { person, capacity });
    inviteAudienceMember(event, member, "pending");
  }
});

const questionsByEvent = new Map();
for (const question of rows.event_questions) {
  if (!questionsByEvent.has(question.event_id)) questionsByEvent.set(question.event_id, []);
  questionsByEvent.get(question.event_id).push(question);
}

let changedAnswers = 0;
let unsureCaptures = 0;
let confidenceMarkers = 0;

// OWNER-LAN170-08 (correction round 3): the ordinary ~7% silent rate left
// only two unanswered invitations on the event nearest the operator's own
// "now" — Brian's own count, walking it — and recording answers against them
// consumed both within two recordings. A fixed floor, forced per event rather
// than drawn, keeps every review-window event walkable through several
// recordings without touching the weighted draw itself or any event outside
// the window, so every other event's ladder of yes/no/unsure/silent/changed
// states — which LAN-173 reads — is exactly as likely as it always was.
const REVIEW_UNANSWERED_FLOOR = 10;
const reviewWindowForcedSilent = new Map();

for (const invitation of invitations) {
  const event = invitation._event;

  if (event.status === "cancelled") {
    // Register D5: cancellation cancels the invitation and preserves whatever
    // was already answered. It never deletes anything.
    invitation.status = "cancelled";
    invitation.cancelled_at = "2026-10-19T09:00:00Z";
  }
  invitation.issued_at = event.approved_at;

  // SDA §11.3: Yes ~70%, No ~17%, Unsure ~6%, no response ~7%.
  let outcome = weighted([
    ["yes", 70],
    ["no", 17],
    ["unsure", 6],
    ["silent", 7],
  ]);

  if (invitation.capacity === "player" && isReviewWindowEvent(event)) {
    const forcedSoFar = reviewWindowForcedSilent.get(event.id) ?? 0;
    if (forcedSoFar < REVIEW_UNANSWERED_FLOOR) {
      outcome = "silent";
      reviewWindowForcedSilent.set(event.id, forcedSoFar + 1);
    }
  }
  const deadline = event.response_deadline_at ? new Date(event.response_deadline_at) : null;

  if (outcome === "silent") {
    if (invitation.status !== "cancelled") {
      invitation.status = deadline && deadline.getTime() < NOW.getTime() ? "expired" : "issued";
    }
    continue;
  }

  // OWNER-LAN172-21. A seeded response's own `responded_at` must never sit
  // in the future relative to this seed's own `NOW` (which, after the slide
  // at the bottom of this file, is real today). `public.current_rsvp` picks
  // the standing answer by `order by responded_at desc`, so a future-dated
  // seed row permanently outranks every honest, real-`now()` click any
  // later test or real player makes on the same invitation, no matter how
  // many real answers get appended afterward — timing the answer relative
  // to the event's own (possibly future) deadline let exactly that happen
  // for every already-answered upcoming event. Anchoring to
  // `min(deadline, NOW)` instead means a future deadline can no longer push
  // the answer into the future; a past deadline (an event that has already
  // happened) computes exactly as before, unaffected.
  //
  // LAN-180 correction: `NOW` alone is not tight enough — see
  // `REAL_NOW_AUTHORED_MS`'s own comment above for why bounding against it
  // too is what actually closes the gap OWNER-LAN172-21 left, without
  // touching the frame's own day-level semantics.
  const nowBound = Math.min(NOW.getTime(), REAL_NOW_AUTHORED_MS);
  const answerableBy = deadline ? Math.min(deadline.getTime(), nowBound) : nowBound;
  const answeredAt = deadline
    ? new Date(answerableBy - intBetween(1, 96) * 3600000)
    : new Date(answerableBy - intBetween(1, 240) * 3600000);

  let response = outcome === "yes" ? "yes" : "no";
  let rawCapture = null;
  let reason = null;

  if (outcome === "unsure") {
    // Register D2 as revised by review F01. The historical third value is kept
    // verbatim as evidence and mapped to a non-acceptance; it is chased exactly
    // like a no, and never becomes an authoritative value.
    rawCapture = pick(["Unsure", "unsure", "maybe?", "not sure yet"]);
    reason = "Recorded as unsure on the channel — treated as a non-acceptance.";
    unsureCaptures += 1;
  } else if (outcome === "no") {
    reason = pick(DECLINE_REASONS);
    if (chance(0.08)) {
      rawCapture = "No?";
      confidenceMarkers += 1;
    }
  } else if (chance(0.04)) {
    rawCapture = "Yes?";
    confidenceMarkers += 1;
  }

  add("rsvp_responses", {
    id: uuid(),
    invitation_id: invitation.id,
    response,
    reason,
    raw_capture: rawCapture,
    source: rawCapture ? "channel_reply" : pick(["signed_link", "signed_link", "operator"]),
    responded_at: answeredAt.toISOString(),
    recorded_at: answeredAt.toISOString(),
    recorded_by_person_id: null,
  });

  // A changed answer supersedes the previous one; both are retained forever.
  // OWNER-LAN172-21: `answeredAt` is now always at least an hour before
  // `nowBound` (both branches above use a minimum one-hour offset), so
  // capping the revision at `nowBound` minus one minute both keeps it from
  // landing in the future and guarantees it still sorts after `answeredAt`
  // — the "supersedes" this comment promises. LAN-180 correction: capped at
  // `nowBound`, not `NOW`, for the identical reason `answeredAt` above is —
  // `NOW` alone was not tight enough before noon UTC.
  if (chance(0.03)) {
    const revisedAt = new Date(Math.min(answeredAt.getTime() + 6 * 3600000, nowBound - 60000));
    const revised = response === "yes" ? "no" : "yes";
    add("rsvp_responses", {
      id: uuid(),
      invitation_id: invitation.id,
      response: revised,
      reason: revised === "no" ? "Changed my mind — clash came up" : null,
      raw_capture: null,
      source: "signed_link",
      responded_at: revisedAt.toISOString(),
      recorded_at: revisedAt.toISOString(),
      recorded_by_person_id: null,
    });
    response = revised;
    changedAnswers += 1;
  }

  if (invitation.status !== "cancelled") invitation.status = "responded";
  invitation._response = response;

  // Coaches answer transport questions only, leaving everything else null —
  // null means "not applicable to this invitee", never "no answer".
  const questions = questionsByEvent.get(event.id) ?? [];
  const answersQuestions = invitation.capacity === "coach" || chance(0.6);
  if (answersQuestions) {
    for (const question of questions) {
      if (!question.applies_to_capacities.includes(invitation.capacity)) continue;
      add("question_responses", {
        id: uuid(),
        invitation_id: invitation.id,
        event_id: event.id,
        event_question_id: question.id,
        answer_text: null,
        answer_boolean: chance(0.55),
        answer_choice: null,
        raw_capture: null,
        responded_at: answeredAt.toISOString(),
      });
    }
  }
}

// Attendance. SDA §11.3: "record twelve sessions and then stop mid-term with
// the term still running. That is the normal failure mode and the system's main
// job is preventing it." The lapse is reproduced exactly — every practice after
// the twelfth has occurred and carries no attendance at all, which is what the
// mismatch view is for.
// D30: an event has occurred when its date has passed and it was not
// cancelled. Nothing asserts it, so the seed derives it the same way every
// other reader does.
const attendableSessions = events
  .filter(
    (e) =>
      e.status === "approved" &&
      e.scheduled_on !== null &&
      isPast(day(e.scheduled_on)) &&
      ["practice", "game"].includes(e.event_type),
  )
  .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on));
const recordedSessions = attendableSessions.slice(0, 12);

const invitationsByEvent = new Map();
for (const invitation of invitations) {
  if (!invitationsByEvent.has(invitation.event_id)) invitationsByEvent.set(invitation.event_id, []);
  invitationsByEvent.get(invitation.event_id).push(invitation);
}

const availabilityByMembership = new Map();
for (const status of rows.availability_statuses) {
  availabilityByMembership.set(status.season_membership_id, status.level);
}

for (const session of recordedSessions) {
  const recordedAt = at(addDays(day(session.scheduled_on), 1), "09:30:00");

  for (const membership of invitableMemberships) {
    // Turnout is 40–70% of the squad and correlated with status: injured ~20%,
    // inactive ~0%.
    const level = availabilityByMembership.get(membership.id);
    const base =
      membership.status === "inactive"
        ? 0.02
        : level === "red"
          ? 0.05
          : level === "orange"
            ? 0.2
            : 0.62;
    if (!chance(base)) continue;

    add("attendance_records", {
      id: uuid(),
      event_id: session.id,
      event_status: "approved",
      season_id: seasonCurrent.id,
      capacity: "player",
      season_membership_id: membership.id,
      person_id: null,
      presence: weighted([
        ["present", 92],
        ["late", 6],
        ["excused", 2],
      ]),
      recorded_at: recordedAt,
      recorded_by_person_id: headCoach.id,
    });
  }

  // Non-player attendance anchors to the Person via their role (invariant P8).
  add("attendance_records", {
    id: uuid(),
    event_id: session.id,
    event_status: "approved",
    season_id: seasonCurrent.id,
    capacity: "coach",
    season_membership_id: null,
    person_id: headCoach.id,
    presence: "present",
    recorded_at: recordedAt,
    recorded_by_person_id: people[2].id,
  });
}

// Invariant P6, and the case Stewart called out on 8/7: someone who said no and
// showed up anyway, plus a walk-up who was never invited at all. Neither is
// silently reconciled with the RSVP — the mismatch view surfaces both.
const walkUpSession = recordedSessions[3];
// A guard clause, and nothing more. This dereference sits about 1,150 lines
// ahead of the frame self-check at the end of the file, so a frame yielding
// fewer than four recorded sessions used to die here with a bare `TypeError`
// rather than with the message that says what to do about it. It still failed
// closed — the crash is well before `begin`, so nothing was written — but it
// cost the reader the diagnosis.
if (!walkUpSession) {
  throw new Error(
    `The seeded frame leaves ${recordedSessions.length} recorded sessions; the walk-up ` +
      `scenario needs at least 4. Frame: shift ${SHIFT_DAYS}d (${FRAME.wraps} wraps + ` +
      `${FRAME.residual}d${FRAME.clamped ? ", clamped" : ""}), notional now ` +
      `${NOW.toISOString()}. Re-base the authored constants in scripts/lib/seed-clock.mjs.`,
  );
}
const alreadyRecorded = new Set(
  rows.attendance_records
    .filter((a) => a.event_id === walkUpSession.id)
    .map((a) => a.season_membership_id),
);
const walkUps = invitableMemberships.filter((m) => !alreadyRecorded.has(m.id)).slice(0, 3);
for (const membership of walkUps) {
  add("attendance_records", {
    id: uuid(),
    event_id: walkUpSession.id,
    event_status: "approved",
    season_id: seasonCurrent.id,
    capacity: "player",
    season_membership_id: membership.id,
    person_id: null,
    presence: "present",
    recorded_at: at(addDays(day(walkUpSession.scheduled_on), 1), "09:35:00"),
    recorded_by_person_id: headCoach.id,
  });
}

// --- Notification jobs and delivery results --------------------------------

/**
 * `notification_jobs.person_id`, read the same way every real write path
 * derives it (`messaging-scheduler.ts`'s own
 * `coalesce(i.person_id, m.person_id)`) — OWNER-LAN173-06. Most invitations
 * here are issued to a season membership rather than to a raw person (every
 * player is), so `invitation.person_id` alone is `null` far more often than
 * not; the membership's own `person_id` is where the real identity lives.
 * This is fixture data only — the constraint the migration enforces
 * (`num_nonnulls(invitation_id, event_id, person_id) >= 1`) never required a
 * *correct* `person_id`, only a non-null one somewhere on the row, which is
 * exactly how `scripts/seed-local.mjs`'s own held reminder carried a `null`
 * one unnoticed.
 *
 * Defined before every loop that needs it (LAN-181, F-B2) — every job this
 * seed creates, historical or live, carries a real `person_id`, the same way
 * every real job-creation path does.
 */
const membershipPersonId = new Map(
  memberships.map((membership) => [membership.id, membership.person_id]),
);
function invitationPersonId(invitation) {
  return invitation.person_id ?? membershipPersonId.get(invitation.season_membership_id) ?? null;
}

// LAN-181, F-B2: moved up alongside `invitationPersonId` — `addFailedAttempts`
// and `addDeliveredAttempt` below (both hoisted function declarations) close
// over these, and both are now called from the bulk historical loop that
// starts immediately after this section.
let deliveryAttemptsSeeded = 0;
const shiftMinutes = (iso, count) =>
  new Date(new Date(iso).getTime() + count * 60000).toISOString();
/**
 * `delivery.ts`'s own `BACKOFF_MINUTES`, cumulative — the offset of each
 * automatic re-attempt from the first, so a multi-attempt job's
 * `delivery_attempts` rows land the same shape apart that the real backoff
 * schedule would produce rather than an arbitrary spacing.
 */
const BACKOFF_OFFSETS_MINUTES = [0, 5, 20, 80, 320];

const jobEvents = invitedEvents.slice(0, 6);
let jobSequence = 0;
let failedJobs = 0;
let manualRecoveries = 0;

for (const event of jobEvents) {
  for (const invitation of invitationsByEvent.get(event.id) ?? []) {
    jobSequence += 1;
    const kind = weighted([
      ["completed", 78],
      ["failed", 8],
      ["cancelled", 9],
      ["pending", 5],
    ]);
    const scheduledFor = event.approved_at;

    const job = {
      id: uuid(),
      idempotency_key: `invitation:${invitation.id}:invitation`,
      job_type: "invitation",
      status: kind === "pending" ? "ready" : kind,
      invitation_id: invitation.id,
      event_id: event.id,
      person_id: invitationPersonId(invitation),
      channel: kind === "pending" ? null : "whatsapp",
      scheduled_for: scheduledFor,
      claimed_at: kind === "completed" || kind === "failed" ? scheduledFor : null,
      claimed_by:
        kind === "completed" || kind === "failed" ? `worker-${(jobSequence % 3) + 1}` : null,
      attempt_count: kind === "completed" ? 1 : kind === "failed" ? 3 : 0,
      last_error:
        kind === "failed" ? "provider returned 503 after 3 attempts; retry policy exhausted" : null,
      template_variables: JSON.stringify({
        event_name: event.name,
        scheduled_on: event.scheduled_on,
      }),
      cancelled_reason: kind === "cancelled" ? "RSVP arrived before the reminder was due" : null,
      created_at: scheduledFor,
      updated_at: scheduledFor,
      // LAN-169. Rung 0 of the ladder — an invitation is the first message and
      // it is always WhatsApp. `automatic_attempts` counts what the sweep did
      // rather than what a person pressed, and `not null` means the seed has to
      // say so rather than leaving it to a default the insert would override
      // with an explicit null.
      held_at: null,
      held_reason: null,
      held_by_person_id: null,
      next_attempt_at: null,
      ladder_rung: 0,
      automatic_attempts: kind === "completed" ? 1 : kind === "failed" ? 3 : 0,
    };
    add("notification_jobs", job);

    if (kind === "completed") {
      // A manual send is another completion path, not a different operating
      // model — it is recorded here with its actor.
      const manual = jobSequence % 97 === 0;
      if (manual) manualRecoveries += 1;
      add("delivery_results", {
        id: uuid(),
        notification_job_id: job.id,
        attempt_number: 1,
        outcome: manual ? "manual" : "delivered",
        channel: manual ? "manual" : "whatsapp",
        provider: manual ? null : "whatsapp-business",
        provider_message_id: manual ? null : `wamid.${uuid().replace(/-/g, "")}`,
        actor_person_id: manual ? people[2].id : null,
        detail: manual
          ? "Posted by hand in the squad group after the automated send failed."
          : null,
        occurred_at: scheduledFor,
      });
      // LAN-181, F-B2. A manual send has no provider attempt to show — an
      // operator posted it by hand — so only the automated path gets one.
      if (!manual) addDeliveredAttempt(job, { channel: "whatsapp", provider: "whatsapp-business" });
    }

    if (kind === "failed") {
      failedJobs += 1;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        add("delivery_results", {
          id: uuid(),
          notification_job_id: job.id,
          attempt_number: attempt,
          outcome: "failed",
          channel: "whatsapp",
          provider: "whatsapp-business",
          provider_message_id: null,
          actor_person_id: null,
          detail: `Attempt ${attempt}: provider returned 503`,
          occurred_at: new Date(new Date(scheduledFor).getTime() + attempt * 900000).toISOString(),
        });
      }
      // LAN-181, F-B2. Per-attempt diagnostics for this job's own three
      // attempts, alongside the history `delivery_results` above already keeps.
      addFailedAttempts(job, {
        channel: "whatsapp",
        provider: "whatsapp-business",
        count: 3,
        reason: job.last_error,
      });
    }
  }
}

// --- The messaging plan, the chase ladder and its flags ---------------------
//
// LAN-169. Before this, `scripts/seed-local.mjs` created people, events and
// invitations and nothing sent — which is why `/operate/events/[id]/delivery`
// read **Audience 47 · Delivered 0 · Queued 0 · Failed 0** on a database full
// of events. Every state W5 and W6 exist to show was unreachable by looking.
//
// What follows seeds the ladder itself: a plan frozen on each event, the three
// reminder rungs behind every invitation, and one event in each of the states
// somebody has to be able to look at.
//
// It is deliberately **assigned rather than random**. The messiness elsewhere in
// this file is the point of the synthetic dataset, but a reviewer opening the
// delivery page needs the failure, the fallback and the escalation to be there
// every time, not four runs out of five.

/** The club's seeded defaults, so a plan reads as a plan rather than as offsets. */
const MESSAGING_DEFAULTS = {
  practice: { rsvpByDays: 2, leadDays: 5 },
  strength_and_conditioning: { rsvpByDays: 2, leadDays: 5 },
  chalk: { rsvpByDays: 2, leadDays: 5 },
  game: { rsvpByDays: 7, leadDays: 10 },
  social: { rsvpByDays: 5, leadDays: 8 },
  recruitment: { rsvpByDays: 2, leadDays: 5 },
  meeting: { rsvpByDays: 2, leadDays: 5 },
};

const shiftHours = (iso, count) =>
  new Date(new Date(iso).getTime() + count * 3600000).toISOString();

/**
 * Copied verbatim from `src/lib/delivery/phone.ts` and
 * `src/lib/delivery/email.ts` rather than imported — this script is plain ESM
 * with no TypeScript loader, so it cannot `import` from `src/`. Both
 * `participation.ts`'s `noUsableRoute` and `delivery.ts`'s own copy of the
 * same check are an exact string match against these two constants; a seed
 * that paraphrases the reason (as this file did before correction round 3)
 * produces a `failed` job that reads as an ordinary failure rather than
 * `REQ-no-channel-backstop`'s **Not dispatched — no channel**. Keep this
 * verbatim if either source constant changes.
 */
const NO_USABLE_NUMBER_REASON =
  "No usable mobile number is recorded for this person, so nothing could be sent. " +
  "Add or correct their phone number on the roster, then retry.";
const NO_USABLE_EMAIL_REASON =
  "This person has no usable email address on their record, so the email step could not be " +
  "attempted. Adding one is a change to their roster entry, not a delivery repair.";

/**
 * `delivery_attempts` for one job that never succeeded — one row per attempt,
 * each concluded with the same failure and none accepted. Correction round
 * 3: the new per-attempt diagnostics table (W6, `readEventDeliveryDiagnostics`)
 * reads `delivery_attempts` directly and had zero rows to read; this and
 * `addDeliveredAttempt` below are what a real multi-attempt failure and a
 * real successful send look like on that table, at the shapes the mockup
 * draws — several attempts on one channel, and a not-dispatched or retrying
 * row at one attempt.
 */
function addFailedAttempts(job, { channel, provider, count, reason }) {
  for (let n = 1; n <= count; n += 1) {
    const requestedAt = shiftMinutes(job.scheduled_for, BACKOFF_OFFSETS_MINUTES[n - 1] ?? 320);
    add("delivery_attempts", {
      id: uuid(),
      notification_job_id: job.id,
      attempt_number: n,
      channel,
      provider,
      provider_message_id: null,
      requested_at: requestedAt,
      accepted_at: null,
      concluded_at: requestedAt,
      failure_reason: reason,
    });
    deliveryAttemptsSeeded += 1;
  }
}

/** `delivery_attempts` for one job the provider accepted — a single row. */
function addDeliveredAttempt(job, { channel, provider }) {
  const providerMessageId = channel === "email" ? uuid() : `wamid.${uuid().replace(/-/g, "")}`;
  add("delivery_attempts", {
    id: uuid(),
    notification_job_id: job.id,
    attempt_number: 1,
    channel,
    provider,
    provider_message_id: providerMessageId,
    requested_at: job.scheduled_for,
    accepted_at: job.scheduled_for,
    concluded_at: null,
    failure_reason: null,
  });
  deliveryAttemptsSeeded += 1;
}

/**
 * The six states a reviewer has to be able to see, one per seeded event.
 *
 * Named rather than numbered so the intent survives somebody reordering
 * `jobEvents`, and so a state that stops being produced is visible here.
 */
const LADDER_STORIES = [
  "mid_chase",
  "fully_delivered",
  "queued",
  "genuine_failure",
  "whatsapp_carried_by_email",
  "escalated",
];

/** Whoever currently holds the President's seat. Escalation resolves an office. */
const escalationRecipient = people[1];

let laddersSeeded = 0;
let remindersSeeded = 0;
let flagsSeeded = 0;
let heldJobs = 0;
let noChannelJobs = 0;
let escalationsSeeded = 0;
// Correction round 3: W4/W6's two named exceptions and the per-attempt
// diagnostics table (`delivery_attempts`) had never been seeded at all — see
// the header note above `LADDER_STORIES`.
let whatsappUnresponsiveEvent = null;
let whatsappUnresponsiveInvitee = null;
let noChannelEvent = null;
let noChannelInvitee = null;
let heldEvent = null;
let heldInvitee = null;

jobEvents.forEach((event, index) => {
  const story = LADDER_STORIES[index % LADDER_STORIES.length];
  const defaults = MESSAGING_DEFAULTS[event.event_type] ?? MESSAGING_DEFAULTS.practice;
  const invitations = invitationsByEvent.get(event.id) ?? [];
  if (invitations.length === 0 || event.scheduled_on === null) return;

  const startsAt = at(day(event.scheduled_on), event.starts_at ?? "19:00:00");
  const deadlineAt = shiftHours(startsAt, -24 * defaults.rsvpByDays);
  const invitationAt = shiftHours(startsAt, -24 * defaults.leadDays);
  // Twelve hours after the deadline, for every type — REQ-schedule-defaults.
  const escalationAt = shiftHours(deadlineAt, 12);

  add("event_messaging_plans", {
    id: uuid(),
    event_id: event.id,
    rsvp_by_days: defaults.rsvpByDays,
    invitation_lead_days: defaults.leadDays,
    reminder_cadence_hours: 24,
    whatsapp_reminder_count: 2,
    email_reminder_count: 1,
    escalation_hours: 12,
    response_deadline_at: deadlineAt,
    invitation_at: invitationAt,
    escalation_at: escalationAt,
    dispatches_immediately: false,
    late_approval: false,
    whatsapp_reminders_scheduled: 2,
    email_reminders_scheduled: 1,
    frozen_at: event.approved_at,
    frozen_by_person_id: event.approved_by_person_id ?? null,
  });
  laddersSeeded += 1;

  invitations.forEach((invitation, position) => {
    // The fixed ladder: WhatsApp, WhatsApp again, then email
    // (`REQ-ladder-order`), counting forward from the invitation on the cadence
    // (`REQ-count-forward`).
    for (const rung of [1, 2, 3]) {
      // Correction round 3. This invitee's whatsapp channel fails on their
      // very first message (the invitation, rung 0, seeded outside this
      // loop) and the automatic fallback carries it there, the same instant
      // — not on a later reminder rung. Two readers disagree about "the"
      // job for an invitee: `readEventDelivery`'s per-invitee row (the
      // delivery page) is `job_type = 'invitation'` only and never sees a
      // reminder rung at all, while `participation.ts`'s own lateral spans
      // the whole ladder and always prefers whichever rung is scheduled
      // latest. The only choice both agree on is a ladder that stops at
      // rung 0 — no rung of this loop belongs to this invitee.
      if (story === "whatsapp_carried_by_email" && position === 0) continue;

      const channel = rung <= 2 ? "whatsapp" : "email";
      const dueAt = shiftHours(invitationAt, rung * 24);
      const due = new Date(dueAt).getTime() <= NOW.getTime();

      // What a rung looks like depends on the story and on whether its moment
      // has passed. A rung still ahead is `pending` whatever the story, because
      // that is what the sweep would see.
      let status = due ? "completed" : "pending";
      let lastError = null;
      let attempts = due ? 1 : 0;
      let automatic = due ? 1 : 0;
      let nextAttemptAt = null;
      let heldAt = null;
      let heldReason = null;
      let heldBy = null;
      let cancelledReason = null;
      // `recordUndeliverableIn` records outcome `'rejected'`, never `'failed'`
      // — DELIVERY_STATE_EXPRESSION's `outcome = 'rejected'` arm is what keeps
      // a no-channel refusal reading **Failed** rather than **Retryable** at
      // `attempt_count` below the ceiling. Correction round 3.
      let rejected = false;
      // OWNER-LAN173-06, and LAN-181 F-B2: every rung here carries a real
      // `person_id`, the same way every real job-creation path derives it —
      // not only the ones a story below finds by name (held, no channel,
      // WhatsApp unresponsive) or feeds to the per-attempt diagnostics table.
      let personId = invitationPersonId(invitation);

      if (!due) {
        // Queued, and there is nothing else to say about it.
      } else if (story === "genuine_failure" && position === 1) {
        // `REQ-no-channel-backstop`, correction round 3. This invitee has no
        // usable route at all — not only their invitation (seeded below,
        // outside this loop), every rung of their own ladder fails the same
        // way, so whichever row `NOTIFICATION_JOB_RECENCY_ORDER` treats as
        // "the" job for them still reads **Not dispatched — no channel**
        // rather than a later rung's default `completed` masking it. The
        // reason text is copied verbatim from `NO_USABLE_NUMBER_REASON` /
        // `NO_USABLE_EMAIL_REASON` above — an exact string match is what
        // `noUsableRoute` reads, in both `participation.ts` and `delivery.ts`.
        status = "failed";
        attempts = 1;
        automatic = 1;
        rejected = true;
        lastError = channel === "email" ? NO_USABLE_EMAIL_REASON : NO_USABLE_NUMBER_REASON;
        personId = invitationPersonId(invitation);
      } else if (story === "queued") {
        status = "pending";
        attempts = 0;
        automatic = 0;
      } else if (story === "genuine_failure" && rung === 1 && position === 0) {
        // Retries exhausted. Terminal, so no automatic attempt is pending and
        // the delivery page gives a human the reason rather than a button that
        // cannot work.
        status = "failed";
        attempts = 5;
        automatic = 5;
        lastError =
          "The provider refused this message five times. Somebody needs to read the reason " +
          "before it is retried.";
        // Named by the per-attempt diagnostics table below (correction round 3).
        personId = invitationPersonId(invitation);
      } else if (story === "genuine_failure" && rung === 2 && position === 0) {
        // Mid-backoff: attempted, failed, waiting for its next automatic
        // attempt. `REQ-retries-have-no-actor` — the page shows the attempt and
        // the next due time and offers nothing to press.
        status = "failed";
        attempts = 2;
        automatic = 2;
        lastError = "The provider is not responding. This will be attempted again.";
        nextAttemptAt = shiftHours(NOW.toISOString(), 1);
        // Named by the per-attempt diagnostics table below (correction round 3).
        personId = invitationPersonId(invitation);
      } else if (story === "mid_chase" && rung >= 2) {
        // Still climbing: the first reminder went, the rest have not.
        status = "pending";
        attempts = 0;
        automatic = 0;
      }

      // One held ladder, on one invitee of one event, so the amendment hold
      // has something to render. A hold outranks whatever the job was doing.
      //
      // Correction round 3: this used to hold rung 2 alone, leaving rung 3
      // (due later, same `created_at`) to fall through to the default
      // `completed`. `event-amendment.ts`'s own `holdUnsentMessagesIn` holds
      // *every* unsent job for the event in one statement — `pending`,
      // `ready` or `failed`, `held_at is null` — never a single rung, so a
      // fixture that lets a later rung complete past a held one is not a
      // smaller version of the real hold, it is a different, impossible
      // state (W8). Rung 1 stays untouched: it is already `completed` by the
      // time the amendment lands, exactly as `holdUnsentMessagesIn`'s own
      // `status in (...)` filter would leave it. Holding rungs 2 *and* 3
      // means the held state wins `NOTIFICATION_JOB_RECENCY_ORDER`'s
      // `scheduled_for desc` tiebreak whichever of them it picks, rather than
      // depending on which one happens to be "the" row a reader selects.
      if (story === "fully_delivered" && rung >= 2 && position === 0) {
        heldAt = event.approved_at;
        heldReason = "The venue changed after this reminder was queued.";
        heldBy = event.approved_by_person_id ?? people[1].id;
        status = "pending";
        attempts = 0;
        automatic = 0;
        lastError = null;
        nextAttemptAt = null;
        // The bug independent review found (OWNER-LAN173-06): this row's
        // `person_id` was hardcoded `null` — invisible to any reader that
        // needs it, unlike every real job-creation path, which derives it
        // exactly as `invitationPersonId` does here.
        personId = invitationPersonId(invitation);
        heldEvent = event;
        heldInvitee = invitation;
      }

      // One rung called off by an answer that arrived, so `REQ-chase-stopped` is
      // visible as a state rather than only as a transition.
      if (story === "mid_chase" && rung === 3 && position === 1) {
        status = "cancelled";
        attempts = 0;
        automatic = 0;
        cancelledReason = "The invitee responded, so this reminder is no longer needed.";
      }

      const job = {
        id: uuid(),
        idempotency_key: `invitation:${invitation.id}:reminder:${rung}`,
        job_type: "reminder",
        status,
        invitation_id: invitation.id,
        event_id: event.id,
        person_id: personId,
        channel,
        scheduled_for: dueAt,
        claimed_at: attempts > 0 ? dueAt : null,
        claimed_by: attempts > 0 ? "system: automated delivery" : null,
        attempt_count: attempts,
        last_error: lastError,
        template_variables: JSON.stringify({
          event_name: event.name,
          scheduled_on: event.scheduled_on,
        }),
        cancelled_reason: cancelledReason,
        created_at: event.approved_at,
        updated_at: dueAt,
        held_at: heldAt,
        held_reason: heldReason,
        held_by_person_id: heldBy,
        next_attempt_at: nextAttemptAt,
        ladder_rung: rung,
        automatic_attempts: automatic,
      };
      add("notification_jobs", job);
      remindersSeeded += 1;
      if (heldAt) heldJobs += 1;

      const provider = channel === "email" ? "resend" : "whatsapp-business";

      if (status === "completed") {
        add("delivery_results", {
          id: uuid(),
          notification_job_id: job.id,
          attempt_number: 1,
          outcome: "delivered",
          channel,
          provider,
          provider_message_id: channel === "email" ? uuid() : `wamid.${uuid().replace(/-/g, "")}`,
          actor_person_id: null,
          detail: null,
          occurred_at: dueAt,
        });
        // LAN-181, F-B2. Every completed rung's own accepted attempt, not
        // only the ones a named story below feeds to the diagnostics table.
        addDeliveredAttempt(job, { channel, provider });
      }

      if (status === "failed") {
        add("delivery_results", {
          id: uuid(),
          notification_job_id: job.id,
          attempt_number: attempts,
          // `recordUndeliverableIn` writes `'rejected'`, never `'failed'` —
          // see the `rejected` declaration above. Correction round 3.
          outcome: rejected ? "rejected" : "failed",
          channel,
          provider,
          provider_message_id: null,
          actor_person_id: null,
          detail: lastError,
          occurred_at: dueAt,
        });
        // LAN-181, F-B2: the per-attempt diagnostics table (W6, correction
        // round 3) — every attempt this ladder recorded, on every failed rung,
        // not only the ones a named story below feeds to it (this already
        // covers `genuine_failure`'s own rungs 1 and 2, at their own
        // `attempts` count and reason).
        addFailedAttempts(job, { channel, provider, count: attempts, reason: lastError });
      }
    }

    // `REQ-no-channel-backstop`. One person the club cannot reach at all: no
    // usable route, nothing to retry and nothing to fall back to. The only
    // delivery state that requires a human, and what it requires is a roster
    // fix rather than a message.
    if (story === "genuine_failure" && position === 1) {
      const invitationJob = rows.notification_jobs.find(
        (candidate) =>
          candidate.invitation_id === invitation.id && candidate.job_type === "invitation",
      );
      if (invitationJob) {
        invitationJob.status = "failed";
        invitationJob.channel = "whatsapp";
        invitationJob.attempt_count = 1;
        invitationJob.automatic_attempts = 1;
        invitationJob.next_attempt_at = null;
        // Correction round 3: this used to paraphrase the reason. `noUsableRoute`
        // in both `participation.ts` and `delivery.ts` is an exact string
        // match against `NO_USABLE_NUMBER_REASON`, so a paraphrase reads as an
        // ordinary unexplained failure, never the named exception.
        invitationJob.last_error = NO_USABLE_NUMBER_REASON;
        // Every real send this system makes carries the person it is about
        // (`coalesce(invitation.person_id, membership.person_id)`,
        // OWNER-LAN173-06) — including one that never sent, and
        // `readEventDeliveryDiagnostics` joins to `people` on exactly this
        // column.
        invitationJob.person_id = invitationPersonId(invitation);
        noChannelJobs += 1;
        noChannelEvent = event;
        noChannelInvitee = invitation;

        // This job's `kind` above the loop was random — `weighted(...)` may
        // already have given it a `completed` or `failed` history with its
        // own `delivery_results` row at `attempt_number: 1`, which the
        // `notification_job_id, attempt_number` uniqueness would collide
        // with once this rewrites it as never-sent. The job's entire history
        // is being overwritten to "no channel" above; its results are too.
        rows.delivery_results = rows.delivery_results.filter(
          (result) => result.notification_job_id !== invitationJob.id,
        );
        // LAN-181, F-B2: the same collision, now that the same `weighted()`
        // history also writes a `delivery_attempts` row (`attempt_number: 1`).
        rows.delivery_attempts = rows.delivery_attempts.filter(
          (attempt) => attempt.notification_job_id !== invitationJob.id,
        );

        // `recordUndeliverableIn` writes an `outcome: 'rejected'` result for
        // the refusal, before `attempt_count` ever passes `MAX_ATTEMPTS` —
        // without it, `DELIVERY_STATE_EXPRESSION` reads `attempt_count (1) <
        // MAX_ATTEMPTS (5)` and this invitee is **Retryable**, not **Failed**,
        // and `noUsableRoute` never becomes true. Correction round 3.
        add("delivery_results", {
          id: uuid(),
          notification_job_id: invitationJob.id,
          attempt_number: invitationJob.attempt_count,
          outcome: "rejected",
          channel: invitationJob.channel,
          provider: "whatsapp-business",
          provider_message_id: null,
          actor_person_id: null,
          detail: invitationJob.last_error,
          occurred_at: invitationJob.scheduled_for,
        });

        // The diagnostics table's not-dispatched row (W6, correction round 3):
        // requested and concluded in the same instant, nothing accepted.
        add("delivery_attempts", {
          id: uuid(),
          notification_job_id: invitationJob.id,
          attempt_number: invitationJob.attempt_count,
          channel: invitationJob.channel,
          provider: "whatsapp-business",
          provider_message_id: null,
          requested_at: invitationJob.scheduled_for,
          accepted_at: null,
          concluded_at: invitationJob.scheduled_for,
          failure_reason: invitationJob.last_error,
        });
        deliveryAttemptsSeeded += 1;
      }
    }

    // `REQ-whatsapp-outage-visible`, correction round 3. This invitee's
    // *invitation* — always whatsapp (rung 0) — is the one that fails
    // terminally here, not a later reminder rung: `readEventDelivery`'s
    // per-invitee row (the delivery page) is `job_type = 'invitation'` only,
    // so a failure seeded onto a reminder is invisible there no matter what
    // `participation.ts`'s whole-ladder reader does with it. This loop
    // creates no reminder rung for this invitee (skipped above) — the
    // invitation is the whole of their ladder, exactly as it is for anyone
    // never reached at all.
    if (story === "whatsapp_carried_by_email" && position === 0) {
      const invitationJob = rows.notification_jobs.find(
        (candidate) =>
          candidate.invitation_id === invitation.id && candidate.job_type === "invitation",
      );
      if (invitationJob) {
        invitationJob.status = "failed";
        invitationJob.channel = "whatsapp";
        invitationJob.attempt_count = 5;
        invitationJob.automatic_attempts = 5;
        invitationJob.next_attempt_at = null;
        invitationJob.last_error = "WhatsApp did not accept this message.";
        invitationJob.person_id = invitationPersonId(invitation);

        // Same collision this invitee's random `kind` above the loop can
        // cause for the no-channel invitation above — this rewrites the
        // job's whole history, so any `delivery_results` row `kind` already
        // gave it has to go first.
        rows.delivery_results = rows.delivery_results.filter(
          (result) => result.notification_job_id !== invitationJob.id,
        );
        // LAN-181, F-B2: same collision, now that `kind` also writes a
        // `delivery_attempts` row.
        rows.delivery_attempts = rows.delivery_attempts.filter(
          (attempt) => attempt.notification_job_id !== invitationJob.id,
        );
        add("delivery_results", {
          id: uuid(),
          notification_job_id: invitationJob.id,
          attempt_number: invitationJob.attempt_count,
          outcome: "failed",
          channel: invitationJob.channel,
          provider: "whatsapp-business",
          provider_message_id: null,
          actor_person_id: null,
          detail: invitationJob.last_error,
          occurred_at: invitationJob.scheduled_for,
        });
        addFailedAttempts(invitationJob, {
          channel: invitationJob.channel,
          provider: "whatsapp-business",
          count: invitationJob.attempt_count,
          reason: invitationJob.last_error,
        });

        // `scheduleWhatsAppFallbackIn`, called the instant a whatsapp job
        // goes terminal, inline in the same dispatch — so this lands right
        // after the last of the five attempts above, never alongside the
        // first. The new job is a shadow of the one that failed: same
        // invitee, same content, one channel over, keyed by convention
        // (`invitation:<id>:invitation:email-fallback`) rather than a second
        // foreign key — which is exactly why it never competes for "the" row
        // an invitee-level reader selects (both `participation.ts` and
        // `delivery.ts` exclude `idempotency_key like '%:email-fallback'`),
        // while `whatsappUnresponsive` reads its status directly.
        const fallbackAt = shiftMinutes(
          invitationJob.scheduled_for,
          BACKOFF_OFFSETS_MINUTES[BACKOFF_OFFSETS_MINUTES.length - 1],
        );
        const fallbackJob = {
          id: uuid(),
          idempotency_key: `${invitationJob.idempotency_key}:email-fallback`,
          job_type: invitationJob.job_type,
          status: "completed",
          invitation_id: invitationJob.invitation_id,
          event_id: invitationJob.event_id,
          person_id: invitationJob.person_id,
          channel: "email",
          scheduled_for: fallbackAt,
          claimed_at: fallbackAt,
          claimed_by: "system: automated delivery",
          attempt_count: 1,
          last_error: null,
          template_variables: invitationJob.template_variables,
          cancelled_reason: null,
          created_at: fallbackAt,
          updated_at: fallbackAt,
          held_at: null,
          held_reason: null,
          held_by_person_id: null,
          next_attempt_at: null,
          ladder_rung: invitationJob.ladder_rung,
          automatic_attempts: 1,
        };
        add("notification_jobs", fallbackJob);
        add("delivery_results", {
          id: uuid(),
          notification_job_id: fallbackJob.id,
          attempt_number: 1,
          outcome: "delivered",
          channel: "email",
          provider: "resend",
          provider_message_id: uuid(),
          actor_person_id: null,
          detail: null,
          occurred_at: fallbackJob.scheduled_for,
        });
        addDeliveredAttempt(fallbackJob, { channel: "email", provider: "resend" });
        whatsappUnresponsiveEvent = event;
        whatsappUnresponsiveInvitee = invitation;
      }
    }
  });

  // One event past its escalation threshold, with a flag on every unanswered
  // invitation and exactly one escalation sent to the President.
  //
  // `REQ-one-flag-per-threshold`: one flag per invitation per threshold, and one
  // escalation for the event however often the scheduler reruns.
  if (story === "escalated") {
    const unanswered = invitations.filter(
      (invitation) => !rows.rsvp_responses.some((row) => row.invitation_id === invitation.id),
    );

    if (unanswered.length > 0) {
      const escalationJob = {
        id: uuid(),
        idempotency_key: `event:${event.id}:escalation`,
        job_type: "escalation",
        status: "completed",
        invitation_id: null,
        event_id: event.id,
        person_id: escalationRecipient.id,
        channel: "whatsapp",
        scheduled_for: escalationAt,
        claimed_at: escalationAt,
        claimed_by: "system: messaging scheduler",
        attempt_count: 1,
        last_error: null,
        template_variables: JSON.stringify({ outstanding: unanswered.length }),
        cancelled_reason: null,
        created_at: escalationAt,
        updated_at: escalationAt,
        held_at: null,
        held_reason: null,
        held_by_person_id: null,
        next_attempt_at: null,
        ladder_rung: null,
        automatic_attempts: 1,
      };
      add("notification_jobs", escalationJob);
      escalationsSeeded += 1;

      add("delivery_results", {
        id: uuid(),
        notification_job_id: escalationJob.id,
        attempt_number: 1,
        outcome: "delivered",
        channel: "whatsapp",
        provider: "whatsapp-business",
        provider_message_id: `wamid.${uuid().replace(/-/g, "")}`,
        actor_person_id: null,
        detail: null,
        occurred_at: escalationAt,
      });
      // LAN-181, F-B2.
      addDeliveredAttempt(escalationJob, { channel: "whatsapp", provider: "whatsapp-business" });

      unanswered.forEach((invitation, position) => {
        // One flag is already resolved, so the follow-up queue carries both an
        // open exception and the history a cleared one leaves behind — which is
        // the half of `REQ-one-flag-per-threshold` a live queue cannot show.
        const resolved = position === 0 && unanswered.length > 1;
        add("nonresponse_flags", {
          id: uuid(),
          invitation_id: invitation.id,
          threshold: "escalation",
          raised_at: escalationAt,
          escalation_job_id: escalationJob.id,
          resolved_at: resolved ? shiftHours(escalationAt, 3) : null,
          resolution: resolved ? "The invitee answered." : null,
          resolved_by_person_id: null,
          created_at: escalationAt,
        });
        flagsSeeded += 1;
      });
    }
  }
});

// --- The live ladder: approved events still ahead of the frame's own now ---
//
// Fixture repair, mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY.
// `jobEvents` above is six *historical* recruitment events, each already
// resolved into a terminal story (`LADDER_STORIES`) so a reviewer can look at
// them once and see the whole shape of a chase. None of them can ever be
// "due" again — `readDueJobs` deliberately excludes a job whose event has
// already started — so a freshly seeded database carried no plan and no job
// on any of the other 97 approved events, `.lancers-runtime/delivery-sink/`
// was never created, and no genuine answer link ever existed to walk W2
// against.
//
// This section is additive, not a replacement: `jobEvents`, `LADDER_STORIES`
// and every crafted state above are untouched, so the held ladder, the two
// named delivery exceptions, the retried failure, the cancelled rung and the
// escalation all stay exactly where they are. What follows instead freezes a
// real, live ladder — the same shape `scheduleEventLadderIn` freezes at
// approval, one invitation rung and three reminder rungs per invitee — on
// every approved event whose start is still ahead of `NOW`, except a
// deliberate handful left alone (see `planLessEvents` below). Every date is
// computed from `NOW` and the event's own schedule, both of which move
// together under the frame's slide, so a rung "due now" today is still due
// (or has become an ordinary future rung, or has been dispatched for real by
// whatever ran the ticker) whenever this is looked at again.
const jobEventIds = new Set(jobEvents.map((event) => event.id));
const futureApprovedEvents = invitedEvents.filter((event) => {
  if (event.status !== "approved" || jobEventIds.has(event.id)) return false;
  if (!event.scheduled_on) return false;
  const startsAt = at(day(event.scheduled_on), event.starts_at ?? "19:00:00");
  return new Date(startsAt).getTime() > NOW.getTime();
});

// A small, clearly-intended set carries no plan at all — production
// genuinely contains events approved before the messaging feature existed,
// and a reviewer has to be able to see that state rather than mistake a
// universally-populated dataset for evidence that every approved event gets
// a ladder. Fixed at the end of the (deterministic) list, not drawn, so this
// set is the same set on every run.
const FUTURE_PLANLESS_COUNT = 4;
const planLessEvents = futureApprovedEvents.slice(-FUTURE_PLANLESS_COUNT);
const planLessIds = new Set(planLessEvents.map((event) => event.id));
const liveLadderEvents = futureApprovedEvents.filter((event) => !planLessIds.has(event.id));

let liveLaddersSeeded = 0;
let liveInvitationJobsSeeded = 0;
let liveReminderJobsSeeded = 0;
let dueInvitationJobsSeeded = 0;
let dueJobsSeeded = 0;
let firstDueEvent = null;

// LAN-181, F-B2. Walk B found no invitee anywhere in the seed who is
// mid-ladder, unanswered and not yet past the escalation threshold — every
// candidate had either finished its ladder (the six historical stories) or
// already crossed the threshold (every one of them is on an already-started
// event, so its response deadline has necessarily already passed too). A
// numbered chase position (`chasePositionLabel`) needs exactly that state,
// and it needs an event whose *escalation* is still ahead of `NOW`, which
// only a future approved event can be. The first invitee below whose event
// qualifies is picked, deterministically, and marked as: invitation and the
// first WhatsApp reminder sent, no answer, the next reminder still pending,
// nothing escalated.
let midChaseSeeded = false;
let midChaseEvent = null;
let midChaseInvitee = null;

for (const event of liveLadderEvents) {
  const invitations = invitationsByEvent.get(event.id) ?? [];
  if (invitations.length === 0) continue;

  const defaults = MESSAGING_DEFAULTS[event.event_type] ?? MESSAGING_DEFAULTS.practice;
  const startsAt = at(day(event.scheduled_on), event.starts_at ?? "19:00:00");
  const deadlineAt = shiftHours(startsAt, -24 * defaults.rsvpByDays);
  const invitationAt = shiftHours(startsAt, -24 * defaults.leadDays);
  const escalationAt = shiftHours(deadlineAt, 12);
  const eligibleForMidChase = !midChaseSeeded && new Date(escalationAt).getTime() > NOW.getTime();

  add("event_messaging_plans", {
    id: uuid(),
    event_id: event.id,
    rsvp_by_days: defaults.rsvpByDays,
    invitation_lead_days: defaults.leadDays,
    reminder_cadence_hours: 24,
    whatsapp_reminder_count: 2,
    email_reminder_count: 1,
    escalation_hours: 12,
    response_deadline_at: deadlineAt,
    invitation_at: invitationAt,
    escalation_at: escalationAt,
    dispatches_immediately: false,
    late_approval: false,
    whatsapp_reminders_scheduled: 2,
    email_reminders_scheduled: 1,
    frozen_at: event.approved_at,
    frozen_by_person_id: event.approved_by_person_id ?? null,
  });
  liveLaddersSeeded += 1;

  const templateVariables = JSON.stringify({
    event_name: event.name,
    scheduled_on: event.scheduled_on,
  });

  for (const invitation of invitations) {
    const personId = invitationPersonId(invitation);

    // Rung 0. `event-approval.ts`'s own insert, frozen with its anchor
    // already resolved rather than in the two steps approval and
    // `scheduleEventLadderIn` take, since this seed writes both in one pass.
    const invitationDue = new Date(invitationAt).getTime() <= NOW.getTime();
    const invitationJob = add("notification_jobs", {
      id: uuid(),
      idempotency_key: `invitation:${invitation.id}:invitation`,
      job_type: "invitation",
      status: "pending",
      invitation_id: invitation.id,
      event_id: event.id,
      person_id: personId,
      channel: "whatsapp",
      scheduled_for: invitationAt,
      claimed_at: null,
      claimed_by: null,
      attempt_count: 0,
      last_error: null,
      template_variables: templateVariables,
      cancelled_reason: null,
      created_at: event.approved_at,
      updated_at: event.approved_at,
      held_at: null,
      held_reason: null,
      held_by_person_id: null,
      next_attempt_at: null,
      ladder_rung: 0,
      automatic_attempts: 0,
    });
    liveInvitationJobsSeeded += 1;
    if (invitationDue) {
      dueInvitationJobsSeeded += 1;
      dueJobsSeeded += 1;
      firstDueEvent ??= event;
    }

    // Rungs 1-3: the fixed ladder, whatsapp/whatsapp/email, counting forward
    // from the invitation on the cadence — the same `REQ-ladder-order` and
    // `REQ-count-forward` the crafted stories above follow.
    let firstReminderJob = null;
    for (const rung of [1, 2, 3]) {
      const channel = rung <= 2 ? "whatsapp" : "email";
      const dueAt = shiftHours(invitationAt, rung * 24);
      if (new Date(dueAt).getTime() <= NOW.getTime()) dueJobsSeeded += 1;
      const reminderJob = add("notification_jobs", {
        id: uuid(),
        idempotency_key: `invitation:${invitation.id}:reminder:${rung}`,
        job_type: "reminder",
        status: "pending",
        invitation_id: invitation.id,
        event_id: event.id,
        person_id: personId,
        channel,
        scheduled_for: dueAt,
        claimed_at: null,
        claimed_by: null,
        attempt_count: 0,
        last_error: null,
        template_variables: templateVariables,
        cancelled_reason: null,
        created_at: event.approved_at,
        updated_at: event.approved_at,
        held_at: null,
        held_reason: null,
        held_by_person_id: null,
        next_attempt_at: null,
        ladder_rung: rung,
        automatic_attempts: 0,
      });
      liveReminderJobsSeeded += 1;
      if (rung === 1) firstReminderJob = reminderJob;
    }

    // LAN-181, F-B2. The chosen invitee's invitation and first WhatsApp
    // reminder are marked sent — completed, with the same attempt shape a
    // real dispatch leaves — so `chasePositionLabel` has an unanswered,
    // mid-ladder, not-yet-escalated invitee to read a numbered position for.
    // Rungs 2 and 3 stay `pending`, exactly as seeded above. "Unanswered"
    // has to be checked, not assumed: the RSVP responses seeded far above
    // this loop already answer the large majority of invitations, so the
    // first invitee of a qualifying event is very likely one of them.
    const midChaseAnswered = rows.rsvp_responses.some(
      (response) => response.invitation_id === invitation.id,
    );
    if (eligibleForMidChase && !midChaseSeeded && !midChaseAnswered) {
      midChaseSeeded = true;
      midChaseEvent = event;
      midChaseInvitee = invitation;

      invitationJob.status = "completed";
      invitationJob.claimed_at = invitationAt;
      invitationJob.claimed_by = "system: automated delivery";
      invitationJob.attempt_count = 1;
      invitationJob.automatic_attempts = 1;
      add("delivery_results", {
        id: uuid(),
        notification_job_id: invitationJob.id,
        attempt_number: 1,
        outcome: "delivered",
        channel: "whatsapp",
        provider: "whatsapp-business",
        provider_message_id: `wamid.${uuid().replace(/-/g, "")}`,
        actor_person_id: null,
        detail: null,
        occurred_at: invitationAt,
      });
      addDeliveredAttempt(invitationJob, { channel: "whatsapp", provider: "whatsapp-business" });

      firstReminderJob.status = "completed";
      firstReminderJob.claimed_at = firstReminderJob.scheduled_for;
      firstReminderJob.claimed_by = "system: automated delivery";
      firstReminderJob.attempt_count = 1;
      firstReminderJob.automatic_attempts = 1;
      add("delivery_results", {
        id: uuid(),
        notification_job_id: firstReminderJob.id,
        attempt_number: 1,
        outcome: "delivered",
        channel: "whatsapp",
        provider: "whatsapp-business",
        provider_message_id: `wamid.${uuid().replace(/-/g, "")}`,
        actor_person_id: null,
        detail: null,
        occurred_at: firstReminderJob.scheduled_for,
      });
      addDeliveredAttempt(firstReminderJob, { channel: "whatsapp", provider: "whatsapp-business" });
    }
  }
}

if (dueJobsSeeded === 0) {
  throw new Error(
    "The repaired seed produced zero due invitation/reminder jobs on a future approved " +
      "event — the live ladder this fixture repair exists to seed would leave the delivery " +
      `sink empty. Frame: shift ${SHIFT_DAYS}d, notional now ${NOW.toISOString()}.`,
  );
}

if (!midChaseSeeded) {
  throw new Error(
    "LAN-181, F-B2: no future approved event's escalation was still ahead of NOW, so the " +
      "mid-ladder, unanswered, not-yet-escalated invitee this fixture repair exists to seed " +
      `was never created. Frame: shift ${SHIFT_DAYS}d, notional now ${NOW.toISOString()}.`,
  );
}

// --- Monday review ---------------------------------------------------------

const reportOne = {
  id: uuid(),
  season_id: seasonCurrent.id,
  report_on: "2026-11-16",
  version: 1,
  supersedes_id: null,
  metric_definition_version: "master-table-v1",
  data_as_of: "2026-11-16T07:00:00Z",
  generated_at: "2026-11-16T07:05:00Z",
  generated_by_person_id: people[2].id,
  content: JSON.stringify({
    squad_size: PLAYER_COUNT,
    active_members: memberships.filter((m) => m.status === "active").length,
    attendance_rate_last_four_sessions: 0.58,
    outstanding_nonresponses: 37,
    availability: { green: 34, orange: 5, red: 3 },
    note: "Snapshot as leadership saw it. Regeneration creates a new version rather than rewriting this one.",
  }),
};
const reportOneRevised = {
  ...reportOne,
  id: uuid(),
  version: 2,
  supersedes_id: reportOne.id,
  data_as_of: "2026-11-16T11:00:00Z",
  generated_at: "2026-11-16T11:10:00Z",
  content: JSON.stringify({
    squad_size: PLAYER_COUNT,
    active_members: memberships.filter((m) => m.status === "active").length,
    attendance_rate_last_four_sessions: 0.61,
    outstanding_nonresponses: 34,
    availability: { green: 34, orange: 5, red: 3 },
    note: "Regenerated after Sunday's attendance was entered late. Version 1 is retained unchanged (invariant M5).",
  }),
};
add("weekly_reports", reportOne);
add("weekly_reports", reportOneRevised);

// Register D9: a follow-up row exists only where a human took ownership.
const followUps = [
  [
    "nonresponse",
    "Chase the six players who have not answered the Brackenridge fixture.",
    "resolved",
    people[6],
    "2026-11-18",
    "All six answered after a direct message.",
  ],
  [
    "availability",
    "Decide whether the three red-flagged players travel to the away fixture.",
    "open",
    people[1],
    "2026-11-20",
    null,
  ],
  [
    "rsvp_attendance_mismatch",
    "Reconcile four players who said yes and were not marked present.",
    "open",
    people[9],
    "2026-11-23",
    null,
  ],
  [
    "subscription",
    "Follow up unpaid subscriptions before the end of Hilary.",
    "in_progress",
    people[3],
    "2027-03-01",
    null,
  ],
  [
    "kit_return",
    "Collect kit from the two members who departed in Michaelmas.",
    "open",
    people[15],
    "2026-12-10",
    null,
  ],
];
for (const [category, description, status, owner, due, resolution] of followUps) {
  add("follow_up_actions", {
    id: uuid(),
    season_id: seasonCurrent.id,
    weekly_report_id: category === "nonresponse" ? reportOne.id : reportOneRevised.id,
    category,
    description,
    status,
    owner_person_id: owner.id,
    subject_person_id: null,
    subject_season_membership_id: null,
    subject_event_id: null,
    due_on: due,
    created_at: "2026-11-16T08:00:00Z",
    updated_at: "2026-11-19T08:00:00Z",
    resolved_at: resolution ? "2026-11-19T08:00:00Z" : null,
    resolution_note: resolution,
  });
}

// --- Audit ledger ----------------------------------------------------------

for (const event of events.filter((e) => e.approved_at).slice(0, 40)) {
  add("audit_events", {
    id: uuid(),
    occurred_at: event.approved_at,
    actor_person_id: event.approved_by_person_id,
    actor_label: null,
    action: "event_approved",
    entity_table: "events",
    entity_id: event.id,
    // Historical, and deliberately still `pending_approval`: these rows record
    // approvals the club made before the Submit step was removed. Rewriting
    // them to match today's workflow would be a lie about what happened, and
    // invariant M2 makes an audit row immutable.
    from_state: "pending_approval",
    to_state: "approved",
    reason: null,
    context: JSON.stringify({ audience_confirmed: true }),
  });
}
add("audit_events", {
  id: uuid(),
  occurred_at: mergedAway.merged_at,
  actor_person_id: mergedAway.merged_by_person_id,
  actor_label: null,
  action: "person_merged",
  entity_table: "people",
  entity_id: mergedAway.id,
  from_state: "distinct",
  to_state: "merged",
  reason: mergedAway.merge_reason,
  context: JSON.stringify({ merged_into: mergedAway.merged_into_person_id }),
});
add("audit_events", {
  id: uuid(),
  occurred_at: seasonPrevious.closed_at,
  actor_person_id: seasonPrevious.closed_by_person_id,
  actor_label: null,
  action: "season_closed",
  entity_table: "seasons",
  entity_id: seasonPrevious.id,
  from_state: "closing",
  to_state: "archived",
  reason: `Season close: ${previousMemberships.length} memberships archived, ${notReturning.length} classified as not returning.`,
  context: JSON.stringify({
    carried_forward: memberships.filter((m) => m.carried_forward_from_id).length,
  }),
});

// --- Legacy staging fixtures ----------------------------------------------

// Provenance the club would recognise: a batch is named for the year it was
// imported, and a workbook for the day it was exported. Both are read off the
// dates they describe, so a batch called "2026-…" is always a batch imported in
// 2026 whatever frame this run seeds in.
const LEGACY_IMPORTED_ON = "2026-09-01";
const LEGACY_IMPORTED_AT = `${LEGACY_IMPORTED_ON}T09:00:00Z`;
const LEGACY_IMPORT_YEAR = shiftedYear(LEGACY_IMPORTED_ON);

/** `YYMMDD`, the way the club's own exports are named. */
const workbookStamp = (authoredDate) =>
  shiftAuthoredValue(authoredDate, SHIFT_DAYS).replaceAll("-", "").slice(2);

const OLD_ROSTER_WORKBOOK = `OULAFC active roster ${workbookStamp(OLD_VOCAB_ADOPTED_ON)}.xlsx`;
const TERM_CARD_YEAR = shiftedYear(terms["michaelmas-2026-27"].starts_on);

// The historical vocabulary lives here and ONLY here. `Unsure`, `Yes?` and
// `No?` are normalised to the binary domain value or rejected; there is no
// column in the staging table capable of promoting a third answer.
const LEGACY_RSVP = [
  ["Al", "Michaelmas wk5 fixture", "Yes", null, "normalised", "yes", null, null],
  ["Alaric Ashcombe", "Michaelmas wk5 fixture", "Yes", null, "normalised", "yes", null, null],
  [
    "Emrys E",
    "Michaelmas wk6 fixture",
    "No",
    "away",
    "normalised",
    "no",
    "Away that weekend",
    null,
  ],
  [
    "Ken",
    "Michaelmas wk6 fixture",
    "Unsure",
    null,
    "normalised",
    "no",
    'Historical "Unsure" — recorded as a non-acceptance',
    null,
  ],
  ["Bertram B.", "Michaelmas wk7 fixture", "Yes?", null, "normalised", "yes", null, null],
  [
    "Caspian",
    "Michaelmas wk7 fixture",
    "No?",
    "maybe work",
    "normalised",
    "no",
    'Historical "No?" — recorded as a non-acceptance',
    null,
  ],
  [
    "Dashiell D",
    "Michaelmas wk8 fixture",
    "unsure",
    null,
    "normalised",
    "no",
    'Historical "unsure" — recorded as a non-acceptance',
    null,
  ],
  [
    "",
    "Michaelmas wk8 fixture",
    "Yes",
    null,
    "rejected",
    null,
    null,
    "No person identifier in the source row",
  ],
  ["Fenwick", "unknown sheet tab", "y", null, "needs_review", null, null, null],
  ["Gideon G", "Hilary wk1 fixture", "Yes but late", null, "needs_review", null, null, null],
];
LEGACY_RSVP.forEach(
  ([person, event, raw, rawReason, status, normalised, normalisedReason, rejection], index) => {
    add("staging.legacy_rsvp_rows", {
      id: uuid(),
      import_batch: `${LEGACY_IMPORT_YEAR}-legacy-rsvp-01`,
      source_file: "OULAFC Master Table.xlsx",
      source_row_number: index + 2,
      raw_person: person || null,
      raw_event: event,
      raw_response: raw,
      raw_reason: rawReason,
      normalisation_status: status,
      normalised_response: normalised,
      normalised_reason: normalisedReason,
      rejection_reason: rejection,
      imported_at: LEGACY_IMPORTED_AT,
    });
  },
);

const LEGACY_ROSTER = [
  [
    "Alaric Ashcombe",
    "alaric.ashcombe@beaumont.ox.ac.example",
    "07700 900123",
    "WR",
    "CB",
    "44",
    "12",
    "Active",
    "normalised",
    null,
    people[0].id,
  ],
  [
    "Al",
    "alaric.ashcombe@beaumont.ox.ac.example",
    "07700 900123",
    "WR",
    "",
    "44",
    "",
    "Active",
    "needs_review",
    null,
    null,
  ],
  [
    "Bertram",
    "bertram@mail.example ",
    "7700900456",
    "OL",
    "DL",
    "77",
    "",
    "Injured",
    "normalised",
    null,
    people[1].id,
  ],
  [
    "Caspian Caldicott",
    "caspian.caldicott@cranmere.example.ac.ox",
    "",
    "TE",
    "LB",
    "",
    "",
    "Inactive",
    "needs_review",
    null,
    null,
  ],
  ["Dashiell D", "", "07700 9078", "RB", "DB", "21", "21", "Active", "needs_review", null, null],
  [
    "",
    "unknown@mail.example",
    "",
    "",
    "",
    "",
    "",
    "",
    "rejected",
    "No name in the source row",
    null,
  ],
  [
    "Emrys Elverton",
    "emrys.elverton@eastgate.ox.ac.example",
    "+1 555 0142",
    "QB",
    "S",
    "9",
    "9",
    "Active",
    "normalised",
    null,
    people[4].id,
  ],
  [
    "Fenwick F.",
    "ff1234@ox.ac.example",
    "07700 900789",
    "WR",
    "CB",
    "33",
    "",
    "Unsure",
    "needs_review",
    null,
    null,
  ],
];
LEGACY_ROSTER.forEach(
  (
    [name, email, phone, off, def, blue, white, status, normalisation, rejection, matched],
    index,
  ) => {
    add("staging.legacy_roster_rows", {
      id: uuid(),
      import_batch: `${LEGACY_IMPORT_YEAR}-legacy-roster-01`,
      source_file: OLD_ROSTER_WORKBOOK,
      source_row_number: index + 2,
      raw_name: name || null,
      raw_email: email || null,
      raw_phone: phone || null,
      raw_offence_position: off || null,
      raw_defence_position: def || null,
      raw_jersey_blue: blue || null,
      raw_jersey_white: white || null,
      raw_status: status || null,
      raw_extra: JSON.stringify({
        sheet: "Squad",
        note: `Vocabulary is the ${OLD_VOCAB_ERA} taxonomy`,
      }),
      normalisation_status: normalisation,
      rejection_reason: rejection,
      matched_person_id: matched,
      imported_at: LEGACY_IMPORTED_AT,
    });
  },
);

// SDA §11.2: the term-card cell shapes that break naive parsers.
const VARSITY_YEAR = shiftedYear(varsityMatch.scheduled_on);
const LEGACY_EVENTS = [
  [
    "Iffley Road Astro — Practice — Wed 20:00",
    "3",
    "Wednesday",
    "green",
    "needs_review",
    "Reversed field order: venue precedes the event name.",
  ],
  [
    "PracticeWed2000IffleyRoad",
    "4",
    "Wednesday",
    "green",
    "needs_review",
    "No delimiters anywhere in the cell.",
  ],
  [
    "Social, The Lamb and Flag, Walton Street, 19:30",
    "2",
    "Thursday",
    "purple",
    "needs_review",
    "Comma inside the location, so field splitting produces five fields, not three.",
  ],
  ["Chalk 18:00", "5", "Tuesday", "blue", "needs_review", "Start time with no end time."],
  // The hazard here is a title a year behind the fixture it names, so both
  // years are read off the fixture itself; a fixed pair would stop being off
  // by one the moment the frame moved either of them across a New Year.
  [
    `Varsity Match ${VARSITY_YEAR - 1}`,
    "3",
    "Sunday",
    "red",
    "rejected",
    `Title carries the wrong year; the fixture is in ${VARSITY_YEAR}.`,
  ],
  [
    "Fixture or practice — TBC",
    "4",
    "Sunday",
    "amber",
    "needs_review",
    "One cell holding two possible event types.",
  ],
];
LEGACY_EVENTS.forEach(([cell, week, weekday, colour, status, reason], index) => {
  add("staging.legacy_event_rows", {
    id: uuid(),
    import_batch: `${LEGACY_IMPORT_YEAR}-legacy-termcard-01`,
    source_file: `Michaelmas ${TERM_CARD_YEAR} Term Card.xlsx`,
    source_sheet: `MT${String(TERM_CARD_YEAR).slice(2)}`,
    source_cell: `D${index + 4}`,
    raw_cell: cell,
    raw_week: week,
    raw_weekday: weekday,
    raw_colour: colour,
    normalisation_status: status,
    normalised_event_id: null,
    rejection_reason: status === "rejected" ? reason : null,
    imported_at: LEGACY_IMPORTED_AT,
  });
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert order is dependency order. Every table names its columns explicitly so
 * a schema change that this generator has not caught up with fails loudly
 * rather than silently seeding nulls.
 */
const WRITE_PLAN = [
  [
    "public.people",
    [
      "id",
      "given_name",
      "family_name",
      "college",
      "matriculation_year",
      "expected_graduation_year",
      "degree_field",
      "date_of_birth",
      "past_member_override",
      "merged_into_person_id",
      "merged_at",
      "merged_by_person_id",
      "merge_reason",
      "created_at",
      "updated_at",
    ],
    "people",
  ],
  [
    "public.person_aliases",
    ["id", "person_id", "alias", "source", "noted_at", "is_display_name"],
    "person_aliases",
  ],
  [
    "public.person_emergency_contacts",
    [
      "id",
      "person_id",
      "given_name",
      "family_name",
      "relationship",
      "phone",
      "email",
      "recorded_by_person_id",
      "created_at",
      "updated_at",
    ],
    "person_emergency_contacts",
  ],
  [
    "public.contact_points",
    [
      "id",
      "person_id",
      "kind",
      "scope",
      "raw_value",
      "normalised_value",
      "is_preferred",
      "valid_from",
      "valid_until",
      "source",
      "created_at",
    ],
    "contact_points",
  ],
  [
    "public.terms",
    [
      "id",
      "name",
      "academic_year",
      "starts_on",
      "ends_on",
      "first_week",
      "last_week",
      "created_at",
    ],
    "terms",
  ],
  [
    "public.committee_years",
    ["id", "label", "agm_held_on", "starts_on", "ends_on", "created_at"],
    "committee_years",
  ],
  [
    "public.position_vocabularies",
    ["id", "code", "label", "adopted_on", "created_at"],
    "position_vocabularies",
  ],
  ["public.positions", ["id", "vocabulary_id", "code", "label", "side", "sort_order"], "positions"],
  [
    "public.seasons",
    [
      "id",
      "label",
      "status",
      "position_vocabulary_id",
      "starts_on",
      "ends_on",
      "opened_at",
      "opened_by_person_id",
      "closed_at",
      "closed_by_person_id",
      "created_at",
      "updated_at",
    ],
    "seasons",
  ],
  [
    "public.role_assignments",
    [
      "id",
      "person_id",
      "role_id",
      "scope",
      "is_constitutional_office",
      "is_single_holder_seat",
      "committee_year_id",
      "season_id",
      "effective_from",
      "effective_to",
      "appointed_by_person_id",
      "note",
      "created_at",
    ],
    "role_assignments",
  ],
  [
    "public.season_memberships",
    [
      "id",
      "person_id",
      "season_id",
      "status",
      "entry",
      "carried_forward_from_id",
      "confirmed_on",
      "activated_on",
      "departed_on",
      "expected_return_on",
      "departure_reason",
      "inactivity_label",
      "created_at",
      "updated_at",
    ],
    "season_memberships",
  ],
  [
    "public.season_membership_status_events",
    [
      "id",
      "season_membership_id",
      "from_status",
      "to_status",
      "occurred_at",
      "actor_person_id",
      "actor_label",
      "reason",
    ],
    "season_membership_status_events",
  ],
  [
    "public.recruitment_prospects",
    [
      "id",
      "person_id",
      "season_id",
      "status",
      "source",
      "first_contact_on",
      "committed_on",
      "converted_membership_id",
      "notes",
      "created_at",
      "updated_at",
    ],
    "recruitment_prospects",
  ],
  [
    "public.onboarding_item_types",
    ["id", "season_id", "code", "label", "is_required", "is_subscription", "sort_order"],
    "onboarding_item_types",
  ],
  [
    "public.onboarding_items",
    [
      "id",
      "season_membership_id",
      "season_id",
      "item_type_id",
      "status",
      "completed_on",
      "waived_reason",
      "waived_by_person_id",
      "updated_at",
    ],
    "onboarding_items",
  ],
  [
    "public.position_assignments",
    [
      "id",
      "season_membership_id",
      "season_id",
      "position_vocabulary_id",
      "position_id",
      "side",
      "slot",
      "effective_from",
      "effective_to",
      "recorded_by_person_id",
      "created_at",
    ],
    "position_assignments",
  ],
  [
    "public.jersey_assignments",
    [
      "id",
      "season_membership_id",
      "season_id",
      "kit",
      "number",
      "is_predominant",
      "is_import_conflict",
      "effective_from",
      "effective_to",
      "created_at",
    ],
    "jersey_assignments",
  ],
  [
    "public.coach_group_assignments",
    [
      "id",
      "season_membership_id",
      "season_id",
      "coach_group",
      "responsible_coach_person_id",
      "recorded_by_person_id",
      "created_at",
      "updated_at",
    ],
    "coach_group_assignments",
  ],
  [
    "public.formalwear_records",
    [
      "id",
      "season_membership_id",
      "season_id",
      "item",
      "ownership",
      "recorded_by_person_id",
      "created_at",
      "updated_at",
    ],
    "formalwear_records",
  ],
  [
    "public.blues_awards",
    [
      "id",
      "season_membership_id",
      "season_id",
      "half_blue_awarded",
      "full_blue_awarded",
      "awarded_on",
      "recorded_by_person_id",
      "created_at",
      "updated_at",
    ],
    "blues_awards",
  ],
  [
    "public.eligibility_records",
    [
      "id",
      "season_membership_id",
      "season_id",
      "competition",
      "status",
      "determining_authority",
      "checked_at",
      "evidence_reference",
      "effective_from",
      "effective_to",
      "created_at",
    ],
    "eligibility_records",
  ],
  [
    "public.availability_statuses",
    [
      "id",
      "season_membership_id",
      "level",
      "effective_from",
      "review_on",
      "reported_by_person_id",
      "confirmed_by_person_id",
      "recorded_at",
    ],
    "availability_statuses",
  ],
  [
    "public.event_series",
    [
      "id",
      "season_id",
      "name",
      "event_type",
      "default_venue",
      "default_starts_at",
      "default_ends_at",
      "weekday",
      "recurrence_note",
      "is_active",
      "created_at",
    ],
    "event_series",
  ],
  [
    "public.alternative_groups",
    ["id", "season_id", "label", "note", "created_at"],
    "alternative_groups",
  ],
  [
    "public.events",
    [
      "id",
      "season_id",
      "series_id",
      "alternative_group_id",
      "term_id",
      "week_number",
      "name",
      "event_type",
      "origin",
      "status",
      "scheduled_on",
      "starts_at",
      "ends_at",
      "delivery_mode",
      "venue",
      "joining_url",
      "description",
      "required_equipment",
      "competition",
      "is_mandatory",
      "response_deadline_at",
      "reminder_offsets_hours",
      "aggregate_headcount",
      "owner_person_id",
      "audience_confirmed_at",
      "audience_confirmed_by_person_id",
      "approved_at",
      "approved_by_person_id",
      "decision_reason",
      "created_at",
      "updated_at",
    ],
    "events",
  ],
  [
    "public.schedule_changes",
    [
      "id",
      "event_id",
      "source",
      "reason",
      "previous_scheduled_on",
      "new_scheduled_on",
      "previous_starts_at",
      "new_starts_at",
      "previous_ends_at",
      "new_ends_at",
      "previous_venue",
      "new_venue",
      "previous_name",
      "new_name",
      "previous_opponent",
      "new_opponent",
      "notified",
      "changed_at",
      "recorded_by_person_id",
      "approved_by_person_id",
    ],
    "schedule_changes",
  ],
  [
    "public.event_questions",
    [
      "id",
      "event_id",
      "prompt",
      "answer_type",
      "choices",
      "applies_to_capacities",
      "is_required",
      "sort_order",
    ],
    "event_questions",
  ],
  [
    "public.event_audience_members",
    [
      "id",
      "event_id",
      "season_id",
      "capacity",
      "season_membership_id",
      "person_id",
      "added_at",
      "added_by_person_id",
    ],
    "event_audience_members",
  ],
  [
    "public.invitations",
    [
      "id",
      "event_id",
      "event_status",
      "season_id",
      "audience_member_id",
      "capacity",
      "season_membership_id",
      "person_id",
      "status",
      "issued_at",
      "expires_at",
      "cancelled_at",
      "created_at",
    ],
    "invitations",
  ],
  [
    "public.rsvp_responses",
    [
      "id",
      "invitation_id",
      "response",
      "reason",
      "raw_capture",
      "source",
      "responded_at",
      "recorded_at",
      "recorded_by_person_id",
    ],
    "rsvp_responses",
  ],
  [
    "public.question_responses",
    [
      "id",
      "invitation_id",
      "event_id",
      "event_question_id",
      "answer_text",
      "answer_boolean",
      "answer_choice",
      "raw_capture",
      "responded_at",
    ],
    "question_responses",
  ],
  [
    "public.attendance_records",
    [
      "id",
      "event_id",
      "event_status",
      "season_id",
      "capacity",
      "season_membership_id",
      "person_id",
      "presence",
      "recorded_at",
      "recorded_by_person_id",
    ],
    "attendance_records",
  ],
  [
    // LAN-169. Before the jobs, because a plan references only its event; and
    // before the flags, which reference an invitation and a job.
    "public.event_messaging_plans",
    [
      "id",
      "event_id",
      "rsvp_by_days",
      "invitation_lead_days",
      "reminder_cadence_hours",
      "whatsapp_reminder_count",
      "email_reminder_count",
      "escalation_hours",
      "response_deadline_at",
      "invitation_at",
      "escalation_at",
      "dispatches_immediately",
      "late_approval",
      "whatsapp_reminders_scheduled",
      "email_reminders_scheduled",
      "frozen_at",
      "frozen_by_person_id",
    ],
    "event_messaging_plans",
  ],
  [
    "public.notification_jobs",
    [
      "id",
      "idempotency_key",
      "job_type",
      "status",
      "invitation_id",
      "event_id",
      "person_id",
      "channel",
      "scheduled_for",
      "claimed_at",
      "claimed_by",
      "attempt_count",
      "last_error",
      "template_variables",
      "cancelled_reason",
      "created_at",
      "updated_at",
      // LAN-156's amendment hold, and LAN-169's ladder and backoff. Seeded so
      // the delivery and follow-up surfaces have a held message, a message
      // waiting on its backoff, and a real chase ladder to render — every one
      // of which read as "Nothing queued" before.
      "held_at",
      "held_reason",
      "held_by_person_id",
      "next_attempt_at",
      "ladder_rung",
      "automatic_attempts",
    ],
    "notification_jobs",
  ],
  [
    "public.delivery_results",
    [
      "id",
      "notification_job_id",
      "attempt_number",
      "outcome",
      "channel",
      "provider",
      "provider_message_id",
      "actor_person_id",
      "detail",
      "occurred_at",
    ],
    "delivery_results",
  ],
  [
    // After `notification_jobs`, which every row references. Correction round
    // 3 — the per-attempt diagnostics table (W6) reads this table directly,
    // and it carried zero rows before this.
    "public.delivery_attempts",
    [
      "id",
      "notification_job_id",
      "attempt_number",
      "channel",
      "provider",
      "provider_message_id",
      "requested_at",
      "accepted_at",
      "concluded_at",
      "failure_reason",
    ],
    "delivery_attempts",
  ],
  [
    "public.nonresponse_flags",
    [
      "id",
      "invitation_id",
      "threshold",
      "raised_at",
      "escalation_job_id",
      "resolved_at",
      "resolution",
      "resolved_by_person_id",
      "created_at",
    ],
    "nonresponse_flags",
  ],
  [
    "public.weekly_reports",
    [
      "id",
      "season_id",
      "report_on",
      "version",
      "supersedes_id",
      "metric_definition_version",
      "data_as_of",
      "generated_at",
      "generated_by_person_id",
      "content",
    ],
    "weekly_reports",
  ],
  [
    "public.follow_up_actions",
    [
      "id",
      "season_id",
      "weekly_report_id",
      "category",
      "description",
      "status",
      "owner_person_id",
      "subject_person_id",
      "subject_season_membership_id",
      "subject_event_id",
      "due_on",
      "created_at",
      "updated_at",
      "resolved_at",
      "resolution_note",
    ],
    "follow_up_actions",
  ],
  [
    "public.audit_events",
    [
      "id",
      "occurred_at",
      "actor_person_id",
      "actor_label",
      "action",
      "entity_table",
      "entity_id",
      "from_state",
      "to_state",
      "reason",
      "context",
    ],
    "audit_events",
  ],
  [
    "staging.legacy_roster_rows",
    [
      "id",
      "import_batch",
      "source_file",
      "source_row_number",
      "raw_name",
      "raw_email",
      "raw_phone",
      "raw_offence_position",
      "raw_defence_position",
      "raw_jersey_blue",
      "raw_jersey_white",
      "raw_status",
      "raw_extra",
      "normalisation_status",
      "rejection_reason",
      "matched_person_id",
      "imported_at",
    ],
    "staging.legacy_roster_rows",
  ],
  [
    "staging.legacy_rsvp_rows",
    [
      "id",
      "import_batch",
      "source_file",
      "source_row_number",
      "raw_person",
      "raw_event",
      "raw_response",
      "raw_reason",
      "normalisation_status",
      "normalised_response",
      "normalised_reason",
      "rejection_reason",
      "imported_at",
    ],
    "staging.legacy_rsvp_rows",
  ],
  [
    "staging.legacy_event_rows",
    [
      "id",
      "import_batch",
      "source_file",
      "source_sheet",
      "source_cell",
      "raw_cell",
      "raw_week",
      "raw_weekday",
      "raw_colour",
      "normalisation_status",
      "normalised_event_id",
      "rejection_reason",
      "imported_at",
    ],
    "staging.legacy_event_rows",
  ],
];

// ---------------------------------------------------------------------------
// Slide the whole calendar onto today
// ---------------------------------------------------------------------------

// Everything above was built in the dataset's authored calendar, against a NOW
// that is today expressed in that calendar. One offset now carries all of it
// the other way. It is applied here, once, over the finished rows rather than
// at each of the several hundred places a date is written, because a single
// pass cannot miss one — and a date this missed would be a row silently
// inconsistent with every row around it.
//
// Only a value that is *entirely* an ISO date or timestamp moves, plus ISO
// values inside a JSON payload. `"2026-27"`, `"oulafc-2026"` and `"{72,24}"`
// contain digits and are not dates; the year-bearing labels that do track the
// calendar are derived from it above instead.

// Counted before the slide, while `isPast` and the dates it reads are still in
// the same calendar. The slide moves both together, so these counts describe
// the stored dataset just as well.
const pastAttendable = attendableSessions.length;
const withRegister = recordedSessions.length;
const withoutRegister = pastAttendable - withRegister;
const stillToCome = events.filter(
  (event) => event.scheduled_on === null || !isPast(day(event.scheduled_on)),
).length;

for (const table of Object.keys(rows)) {
  for (const row of rows[table]) {
    for (const [column, value] of Object.entries(row)) {
      const moved = shiftAuthoredValue(value, SHIFT_DAYS);
      if (moved !== value) row[column] = moved;
    }
  }
}

// The dataset exists to be *looked at*, and the register states are the reason
// this frame is derived at all. Prove they are there rather than trusting the
// arithmetic: a seed that quietly produced a season with nothing behind it is
// exactly the failure this replaced, and it is better to refuse than to hand
// somebody a database to review that has nothing in it to review.
for (const [what, count, needed] of [
  ["past sessions carrying a saved register", withRegister, 1],
  ["past sessions with no register saved", withoutRegister, 2],
  ["events still to come", stillToCome, 1],
]) {
  if (count < needed) {
    throw new Error(
      `The seeded frame leaves ${count} ${what}; at least ${needed} is required. ` +
        `Frame: shift ${SHIFT_DAYS}d (${FRAME.wraps} wraps + ${FRAME.residual}d` +
        `${FRAME.clamped ? ", clamped" : ""}), notional now ${NOW.toISOString()}. ` +
        "Re-base the authored constants in scripts/lib/seed-clock.mjs.",
    );
  }
}

try {
  await client.query("begin");

  // Wiping first is what makes the seed re-runnable and the dataset identical
  // every time it runs on the same day. It runs as the database owner, which is
  // why the append-only privilege revocations do not block it — those bind the
  // application role.
  await client.query(
    `truncate table ${WRITE_PLAN.map(([table]) => table).join(", ")} restart identity cascade`,
  );

  let total = 0;
  for (const [table, columns, key] of WRITE_PLAN) {
    await insertRows(client, table, columns, rows[key]);
    total += rows[key].length;
  }

  await client.query("commit");

  const counts = (label, value) => `  ${label.padEnd(34)} ${String(value).padStart(6)}`;
  const eventTypes = {};
  for (const event of events)
    eventTypes[event.event_type] = (eventTypes[event.event_type] ?? 0) + 1;

  console.log(`Seeded ${total} rows into ${url}\n`);
  console.log("Calendar frame (derived from this machine's clock):");
  console.log(
    counts(
      "  slid by",
      `${SHIFT_DAYS >= 0 ? "+" : ""}${SHIFT_DAYS}d = ${FRAME.wraps}y ${FRAME.residual}d${
        FRAME.clamped ? " (bounded)" : ""
      }`,
    ),
  );
  console.log(counts("  season", `${seasonCurrent.label} opens ${seasonCurrent.starts_on}`));
  console.log("");
  console.log("Synthetic dataset (Source Data Analysis §11):");
  console.log(counts("people", rows.people.length));
  console.log(counts("  first-name-only", rows.people.filter((p) => !p.family_name).length));
  console.log(
    counts(
      "  with two or more name forms",
      new Set(rows.person_aliases.map((a) => a.person_id)).size,
    ),
  );
  console.log(counts("contact points", rows.contact_points.length));
  console.log(
    counts("seasons / memberships", `${rows.seasons.length} / ${rows.season_memberships.length}`),
  );
  console.log(
    counts(
      "  carried forward, same person",
      memberships.filter((m) => m.carried_forward_from_id).length,
    ),
  );
  console.log(counts("  holding offence and defence", bothSides));
  console.log(counts("role assignments", roleAssignmentCount));
  console.log(counts("events", rows.events.length));
  console.log(
    `  ${Object.entries(eventTypes)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  console.log(counts("confirmed audience members", rows.event_audience_members.length));
  console.log(
    counts(
      "  never invited (P7 exception)",
      rows.event_audience_members.length - rows.invitations.length,
    ),
  );
  console.log(counts("invitations", rows.invitations.length));
  console.log(counts("rsvp responses", rows.rsvp_responses.length));
  console.log(counts("  changed answers (superseded)", changedAnswers));
  console.log(counts("  raw 'unsure' captures", unsureCaptures));
  console.log(counts("  raw confidence markers", confidenceMarkers));
  console.log(counts("attendance records", rows.attendance_records.length));
  console.log(counts("  sessions recorded before lapse", recordedSessions.length));
  console.log(
    counts("  sessions occurred, unrecorded", attendableSessions.length - recordedSessions.length),
  );
  console.log(counts("notification jobs", rows.notification_jobs.length));
  console.log(counts("  failed with retry history", failedJobs));
  console.log(counts("  manual recoveries", manualRecoveries));
  // LAN-169. The ladder, so a reviewer can tell at a glance whether the states
  // W5 and W6 exist to show are actually in this dataset — rather than opening
  // the delivery page and finding the zeros this seed used to produce.
  console.log(counts("  chase ladders", laddersSeeded));
  console.log(counts("  reminder rungs", remindersSeeded));
  console.log(counts("  held by an amendment", heldJobs));
  console.log(counts("  nobody could be reached", noChannelJobs));
  console.log(
    counts("  WhatsApp unresponsive, carried by email", whatsappUnresponsiveInvitee ? 1 : 0),
  );
  console.log(counts("  escalations to the President", escalationsSeeded));
  // Fixture repair, mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY.
  // The live ladder on approved future events, alongside the historical
  // stories above rather than folded into their counts, so a reviewer can
  // tell the two apart: the crafted six are frozen and can never dispatch
  // again, and this is the ladder the ticker's very next tick actually acts
  // on.
  console.log(counts("  live ladders (future approved events)", liveLaddersSeeded));
  console.log(counts("    invitation jobs", liveInvitationJobsSeeded));
  console.log(counts("    reminder rungs", liveReminderJobsSeeded));
  console.log(counts("    due right now", dueJobsSeeded));
  console.log(counts("  approved events left without messaging", planLessEvents.length));
  console.log(counts("delivery attempts (per-attempt diagnostics)", deliveryAttemptsSeeded));
  console.log(counts("nonresponse flags", flagsSeeded));
  console.log(counts("weekly report snapshots", rows.weekly_reports.length));
  console.log(
    counts(
      "follow-up actions (open)",
      rows.follow_up_actions.filter((f) => f.status === "open").length,
    ),
  );
  console.log(
    counts(
      "legacy staging rows",
      rows["staging.legacy_roster_rows"].length +
        rows["staging.legacy_rsvp_rows"].length +
        rows["staging.legacy_event_rows"].length,
    ),
  );
  // The three attendance states, named. Whoever is about to look at this needs
  // to know which event shows which, and working that out by hand from
  // sixty-seven events and two hundred and forty-eight attendance rows is the
  // kind of chore that gets skipped and then guessed at.
  const unrecorded = attendableSessions.slice(recordedSessions.length);
  const showAs = (label, event) =>
    console.log(
      `  ${label.padEnd(34)} ${event.scheduled_on}  ${event.name}\n${" ".repeat(37)}/operate/events/${event.id}`,
    );

  console.log("\nAttendance states to look at:");
  showAs("register open, nothing saved", unrecorded[unrecorded.length - 1]);
  showAs("occurred, no register (a dash)", unrecorded[unrecorded.length - 2]);
  showAs("register saved (a real pair)", recordedSessions[recordedSessions.length - 1]);

  // Correction round 3: three delivery states a fixture built entirely of
  // completed sends could never show, plus the diagnostics table that reads
  // every attempt behind them. Named by event so the next walk does not have
  // to re-derive them from a database of hundreds of jobs.
  const showDeliveryAs = (label, event, invitation) =>
    console.log(
      `  ${label.padEnd(34)} ${event.name}\n${" ".repeat(37)}/operate/events/${event.id}` +
        (invitation ? `  (invitation ${invitation.id})` : ""),
    );

  console.log("\nDelivery states to look at:");
  if (heldEvent) {
    showDeliveryAs("held (amendment hold, not superseded)", heldEvent, heldInvitee);
  }
  if (noChannelEvent) {
    showDeliveryAs("Not dispatched — no channel", noChannelEvent, noChannelInvitee);
  }
  if (whatsappUnresponsiveEvent) {
    showDeliveryAs("WhatsApp unresponsive", whatsappUnresponsiveEvent, whatsappUnresponsiveInvitee);
  }
  console.log(
    `  ${"per-attempt diagnostics".padEnd(34)} any of the three events above\n${" ".repeat(37)}` +
      `/operate/events/<id>/delivery — "View diagnostics"`,
  );
  // Fixture repair, mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY.
  if (firstDueEvent) {
    showDeliveryAs("genuinely due now (npm run messaging:ticker)", firstDueEvent, undefined);
  }
  if (planLessEvents[0]) {
    showDeliveryAs("no messaging (approved before the feature)", planLessEvents[0], undefined);
  }
  // LAN-181, F-B2.
  if (midChaseEvent) {
    showDeliveryAs("mid-ladder, unanswered, not yet escalated", midChaseEvent, midChaseInvitee);
  }

  console.log("\nNo real person, contact detail or club record is present in this dataset.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
