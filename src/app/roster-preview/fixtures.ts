/**
 * Fake data, standing in for the service layer.
 *
 * **Nothing here touches the database.** The real board will call a service
 * under `src/lib/services/`; this module exists so the mockup can be opened and
 * driven without a Supabase lease, which matters while the mission's own
 * packages hold theirs.
 *
 * Fifty invented players. Not the seeded dataset and not real club data — the
 * names are made up, and LAN-86 keeps real roster data out of every environment
 * anyway. Fifty rather than a dozen because a board is a different thing to
 * look at when it is full: the pinned column has to earn its place, the sort
 * has to be worth using, and a filter has to leave something behind.
 *
 * The values are shaped to make the board's *behaviour* visible rather than to
 * be plausible club data: enough empties to show `not recorded`, enough spread
 * across every value set that a filter returns a real list rather than
 * everything or nothing, and a handful of rows carrying almost nothing at all.
 */

import {
  AVAILABILITY,
  BLUES,
  COACH_GROUPS,
  DEFENCE_POSITIONS,
  ELIGIBILITY,
  OFFENCE_POSITIONS,
  SPECIAL_TEAMS_POSITIONS,
} from "./columns";

/**
 * The onboarding vocabulary, from `onboarding_item_status`:
 * `pending · invited · complete · waived · not_applicable`.
 *
 * The club's own tracked words were Yes / Yes* / No / Invited / Unsure, which
 * is the evidence that these are process states rather than booleans. `Invited`
 * in particular is a real rung, not a synonym for pending.
 */
export const ONBOARDING_STATUSES = Object.freeze([
  "Pending",
  "Invited",
  "Complete",
  "Waived",
  "Not applicable",
]);

/** Resolved means it no longer needs chasing — not that it was done. */
const RESOLVED = new Set(["Complete", "Waived", "Not applicable"]);

/**
 * The seven items LAN-124 names, using the club's own codes.
 *
 * `required` decides whether an outstanding item is *blocking*, which is the
 * distinction the board's summary turns on. An unpaid subscription is very
 * often marked required — the pilot scenario marks it so deliberately.
 */
export const ONBOARDING_ITEM_TYPES: readonly { label: string; required: boolean }[] =
  Object.freeze([
    { label: "Subscription invoiced", required: true },
    { label: "Subscription paid", required: true },
    { label: "Kit sorted", required: true },
    { label: "BUCS Play registration", required: true },
    { label: "Hudl access", required: false },
    { label: "Squad photo", required: false },
    { label: "Comms groups joined", required: false },
  ]);

export interface OnboardingItem {
  readonly label: string;
  readonly required: boolean;
  status: string;
  /** Per-item provenance — W6 requires it shown, not just the state. */
  readonly recordedBy: string;
  readonly recordedOn: string;
}

export interface PastSeason {
  readonly label: string;
  readonly status: string;
  readonly jersey: string | null;
  /** Blues awarded that season. The total the club looks at derives from these. */
  readonly blues: string | null;
}

export interface HistoryEvent {
  readonly field: string;
  readonly summary: string;
  readonly when: string;
  readonly actor: string;
  readonly reason: string | null;
}

export interface Row {
  readonly id: string;
  readonly displayName: string;
  /** Dedupe evidence, and searchable. Never roster display — W1 owns showing it. */
  readonly aliases: readonly string[];
  /** Person facts. `null` is `not recorded`, and is never defaulted to anything. */
  college: string | null;
  matriculation: string | null;
  graduation: string | null;
  degree: string | null;
  /**
   * The contact values themselves.
   *
   * These render on **player detail and the person record only**. The board
   * carries `hasMobile` / `hasEmail` indicators derived from them and never the
   * values — Task 08 §5, a deliberate narrowing of what a routine screen
   * discloses.
   */
  mobile: string | null;
  email: string | null;
  readonly hasMobile: boolean;
  readonly hasEmail: boolean;
  /**
   * Date of birth and emergency contact render **here and on no list** — Task
   * 08 §6 keeps both off the board and they cannot be added to it. Emergency
   * contact is locked down structurally: never a Person row, never a contact
   * point, never reachable by messaging machinery, out of leadership exports
   * by default.
   */
  dateOfBirth: string | null;
  emergencyContact: string | null;
  /** Required facts with nothing recorded against them. */
  readonly missing: number;
  /**
   * The seven onboarding items LAN-124 names, each with its own state.
   *
   * Mission 7 owns what they mean and when they block activation. The board
   * summarises them into one cell; player detail shows them individually and
   * each edits like any other value — the per-item `Resolve … ▾` / `SAVE` pair
   * was retired 2026-08-27.
   */
  onboardingItems: OnboardingItem[];
  /** The board's one-cell summary, derived from the items so the two agree. */
  readonly onboarding: string;
  /** Milestone dates on the ladder. */
  confirmedOn: string | null;
  activatedOn: string | null;
  /** Prior seasons. A person with four seasons has one record and four of these. */
  readonly otherSeasons: readonly PastSeason[];
  /** This membership's status history: from, to, when, who, why. */
  readonly history: readonly HistoryEvent[];
  /** Season facts. Every one of these edits in the cell. */
  status: string;
  entry: string;
  /** One list per side, each multi-tick. Codes from the season's vocabulary. */
  offencePositions: string[];
  defencePositions: string[];
  specialTeams: string[];
  /**
   * Numbers held in each kit. Several in one kit is legal and about 8% of
   * records do it; the same number twice in one kit across two players is not,
   * and the board is what stops it.
   */
  blueNumbers: string[];
  whiteNumbers: string[];
  coachGroup: string | null;
  formalwear: string[];
  blues: string | null;
  eligibility: string | null;
  availability: string | null;
}

/**
 * Fifty invented players, sorted by surname where there is one.
 *
 * Seven carry a first name only. That is not padding: a first-name-only legacy
 * record is a real case in this club's data, it is what the missing-data queue
 * exists to work, and a board built only against tidy rows hides the fact that
 * the Player column has to stay readable when the name is one word. The
 * working agreement forbids tidy fixtures for exactly this reason.
 *
 * The second element is the college, or `null` for `not recorded` — which is
 * explicit, visible and never defaulted.
 */
const NAMES: readonly (readonly [string, string | null])[] = Object.freeze([
  ["Aurelian Ashdown-Pike", "Rushbourne"],
  ["Barnaby Ashgrove", null],
  ["Cassius Beltingham", "Eastgate"],
  ["Rowan Blackwater", "Hallamshire"],
  ["Tobias Brackenmoor", "Fernhurst"],
  ["Alaric Bramblewick", null],
  ["Ignatius Carrowvale", "Kestrelhall"],
  ["Dorian", null],
  ["Ellery Coldstream", "Inglewood"],
  ["Fitzwilliam Cranleigh", "Quarrendon"],
  ["Hugo Darnwood", null],
  ["Wendell Dunmoor", "Lowmoor"],
  ["Marcus Elderfield", "Yelverton"],
  ["Fenwick", null],
  ["Oscar Fallowmere", "Harewell"],
  ["Xavien Frostwick", "Marlbrook"],
  ["Peregrine Garrowby", "Ivybridge"],
  ["Hadrian", null],
  ["Caspian Hallowfield", "Wardleigh"],
  ["Isambard Harrowgate", null],
  ["Kestrel Havenbrook", "Pyrford"],
  ["Jarrah", null],
  ["Yorick Ingelow", "Uppingham"],
  ["Jorvik Kestrelmoor", "Netherfield"],
  ["Osgood Langmere", "Oldstead"],
  ["Lucian", "Vauxhold"],
  ["Emrys Larkspur", "Rushbourne"],
  ["Kenelm Mallowfield", "Eastgate"],
  ["Rafferty Marchmont", "Hallamshire"],
  ["Norbert", null],
  ["Ambrose Netherby", "Fernhurst"],
  ["Julian Oakhanger", "Kestrelhall"],
  ["Percival", "Inglewood"],
  ["Quillon Pennycross", "Quarrendon"],
  ["Rufus", null],
  ["Sebastian Quillfeather", "Lowmoor"],
  ["Barnaby Ravenscroft", "Yelverton"],
  ["Gideon Rookwood", null],
  ["Merrick Sallowby", "Harewell"],
  ["Theodore Sedgemoor", "Marlbrook"],
  ["Vaughn", "Ivybridge"],
  ["Corwin Stannerly", "Wardleigh"],
  ["Hollis Thornbury", "Pyrford"],
  ["Nicodemus Underhill", null],
  ["Ulric Vellacott-Quy", "Uppingham"],
  ["Wilfred Wandsmere", "Netherfield"],
  ["Silas Winterbourne", "Oldstead"],
  ["Edmund Wrayburn", "Vauxhold"],
  ["Casimir Yaxlington", "Rushbourne"],
  ["Zephyr", "Eastgate"],
]);

/**
 * Aliases exist on a handful of rows only, which is what makes alias search
 * worth demonstrating: search `Chumley` and one player comes back, on a board
 * where the word appears in no visible cell. Aliases are dedupe evidence and
 * never roster display — `W1` owns showing them.
 */
const ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "Aurelian Ashdown-Pike": ["Relly"],
  "Ignatius Carrowvale": ["Iggy", "Nate"],
  "Fitzwilliam Cranleigh": ["Chumley", "Fitz"],
  "Peregrine Garrowby": ["Perry"],
  "Ulric Vellacott-Quy": ["Rick"],
  "Sebastian Quillfeather": ["Baz"],
  Zephyr: ["Zeph"],
});

const DEGREES: readonly string[] = Object.freeze([
  "Engineering",
  "History",
  "Law",
  "Medicine",
  "PPE",
  "Physics",
  "Classics",
  "Economics",
]);

/**
 * A tiny deterministic pseudo-random source.
 *
 * Deterministic on purpose: the board must look the same every time it is
 * opened, so that two people discussing it are discussing the same screen, and
 * so a screenshot taken today still matches the page tomorrow. `Math.random()`
 * would also differ between the server render and the client hydration.
 */
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pick<T>(random: () => number, from: readonly T[]): T {
  return from[Math.floor(random() * from.length)] as T;
}

/** `null` at the given rate, so `not recorded` appears often enough to matter. */
function maybe<T>(random: () => number, value: T, blankRate: number): T | null {
  return random() < blankRate ? null : value;
}

/**
 * Zero, one, or occasionally several values from a list.
 *
 * `holdRate` is the chance of holding any at all; `extraRate` is the chance,
 * each time round, of adding another. Kept in the vocabulary's own order rather
 * than the order they were drawn, so a cell reads the same way as the dropdown
 * it was picked from.
 */
function some(
  random: () => number,
  from: readonly string[],
  holdRate: number,
  extraRate: number,
): string[] {
  if (random() >= holdRate) return [];
  const held = new Set<string>([pick(random, from)]);
  while (random() < extraRate && held.size < from.length) held.add(pick(random, from));
  return from.filter((code) => held.has(code));
}

/**
 * Hand out jersey numbers so that no two players share one within a kit.
 *
 * Done as a second pass over the finished roster rather than per row, because
 * uniqueness is a property of the whole season and cannot be decided one player
 * at a time — which is exactly why the real constraint is an exclusion over
 * `(season, kit, number)` and not a check on the row being written.
 *
 * Roughly seven in ten hold a Blue number and half hold a White one, so the
 * board opens with plenty of numbers still free to hand out and plenty already
 * gone. About one in twelve holds a second number in a kit, which is the
 * measured rate and the case a single-value cell could never have shown.
 */
function allocateJerseys(rows: Row[], random: () => number): void {
  for (const kit of ["blueNumbers", "whiteNumbers"] as const) {
    const taken = new Set<string>();
    const holdRate = kit === "blueNumbers" ? 0.7 : 0.5;

    const free = (): string | null => {
      // Bounded rather than a `while (true)`: with 99 numbers and 50 players it
      // never runs out, but a fixture that could spin forever is a bad example
      // to leave for somebody to copy.
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const candidate = String(1 + Math.floor(random() * 99));
        if (!taken.has(candidate)) return candidate;
      }
      return null;
    };

    for (const row of rows) {
      if (random() >= holdRate) continue;
      const first = free();
      if (first === null) continue;
      taken.add(first);
      row[kit] = [first];

      if (random() < 0.08) {
        const second = free();
        if (second !== null) {
          taken.add(second);
          row[kit] = [first, second].sort((a, b) => Number(a) - Number(b));
        }
      }
    }
  }
}

/**
 * The board's onboarding cell, derived from the items rather than stored.
 *
 * Four distinct things an operator must tell apart, each with its own words:
 * no items at all is a real configuration state and not a failure; everything
 * resolved; required items outstanding, which is what activation will ask
 * about; and only optional ones left, which will not stand in anybody's way.
 *
 * "none blocking" rather than "optional", deliberately: calling a required-but-
 * unpaid subscription optional would be false about the item while trying to be
 * true about the gate.
 */
function summariseOnboarding(items: readonly OnboardingItem[]): string {
  if (items.length === 0) return "No items configured";
  const outstanding = items.filter((item) => !RESOLVED.has(item.status));
  if (outstanding.length === 0) return "Complete";
  const blocking = outstanding.filter((item) => item.required).length;
  if (blocking > 0) return `${blocking} outstanding`;
  return `${outstanding.length} outstanding, none blocking`;
}

const RECORDERS = Object.freeze([
  "Caspian Hallowfield",
  "Marcus Elderfield",
  "Rowan Blackwater",
]);

const EXIT_REASONS = Object.freeze([
  "Year abroad",
  "Injury — expected back next season",
  "Graduated",
  "Stopped responding after week four",
  "Moved to another club",
]);

function buildOnboarding(random: () => number, status: string): OnboardingItem[] {
  // A membership with no items at all is a real configuration state, and the
  // record has to say so in its own words rather than reading as incomplete.
  if (random() < 0.08) return [];

  return ONBOARDING_ITEM_TYPES.map((type) => ({
    label: type.label,
    required: type.required,
    // An active membership has mostly worked through its list; one still
    // onboarding has not. The checklist never gates activation — that is the
    // point of showing both.
    status:
      status === "Active" || status === "Departed" || status === "Archived"
        ? pick(random, ["Complete", "Complete", "Complete", "Invited", "Waived", "Not applicable"])
        : pick(random, ["Pending", "Invited", "Complete", "Pending"]),
    recordedBy: pick(random, RECORDERS),
    recordedOn: `${1 + Math.floor(random() * 28)} Sep 2026`,
  }));
}

function buildHistory(
  random: () => number,
  status: string,
  displayName: string,
): HistoryEvent[] {
  const events: HistoryEvent[] = [
    {
      field: "Status",
      summary: "Created as Onboarding",
      when: "19 Apr 2026",
      actor: "Import — 2026-27 season bootstrap",
      reason: null,
    },
  ];

  if (status !== "Onboarding") {
    events.push({
      field: "Status",
      summary: "Onboarding → Active",
      when: "3 May 2026",
      actor: pick(random, RECORDERS),
      reason: null,
    });
  }

  if (status === "Inactive" || status === "Departed") {
    events.push({
      field: "Status",
      summary: `Active → ${status}`,
      when: `${1 + Math.floor(random() * 28)} Oct 2026`,
      actor: pick(random, RECORDERS),
      // An exit records its reason as data. `inactive` means still on the team
      // and possibly returning; `departed` means gone, with an offboarding to
      // run. The two stopped being one state on 2026-08-26.
      reason: pick(random, EXIT_REASONS),
    });
  }

  if (status === "Archived") {
    events.push({
      field: "Status",
      summary: "Active → Archived",
      when: "30 Jun 2026",
      actor: "Season close",
      reason: "Season closed",
    });
  }

  if (random() < 0.4) {
    events.push({
      field: "Jersey — Blue",
      summary: "not recorded → issued",
      when: `${1 + Math.floor(random() * 28)} Oct 2026`,
      actor: pick(random, RECORDERS),
      reason: null,
    });
  }

  if (random() < 0.3) {
    events.push({
      field: "Personal email",
      summary: "superseded",
      when: `${1 + Math.floor(random() * 28)} Sep 2026`,
      actor: pick(random, RECORDERS),
      // A durable person fact being replaced is the one edit that asks for a
      // reason — W2's rule. Nothing on the season side does.
      reason: `${displayName.split(" ")[0]} gave a new address at the AGM`,
    });
  }

  return events;
}

function buildPastSeasons(random: () => number, entry: string): PastSeason[] {
  if (entry === "New") return [];
  const count = 1 + Math.floor(random() * 3);
  const labels = ["2025-26", "2024-25", "2023-24"];
  return labels.slice(0, count).map((label) => ({
    label,
    status: "Archived",
    jersey: random() < 0.75 ? `Blue ${1 + Math.floor(random() * 99)}` : null,
    blues: random() < 0.3 ? pick(random, ["Half", "Full"]) : null,
  }));
}

export function buildRoster(): Row[] {
  const random = seeded(20260827);

  const rows = NAMES.map(([displayName, college], index) => {
    // Weighted so the board is mostly a working squad rather than an even
    // spread across five statuses — a roster where a fifth of everybody is
    // Departed would misrepresent what this screen is usually looking at.
    const status =
      index % 17 === 3
        ? "Departed"
        : index % 13 === 5
          ? "Inactive"
          : index % 11 === 7
            ? "Onboarding"
            : index % 23 === 19
              ? "Archived"
              : "Active";

    // About 83% of the club's records carry both an offence and a defence
    // position (SDA §11.1), so two-way is the normal case here rather than the
    // exception. A few carry several on a side, and a few carry none.
    const offencePositions = some(random, OFFENCE_POSITIONS, 0.83, 0.25);
    const defencePositions = some(random, DEFENCE_POSITIONS, 0.83, 0.2);
    // Measured at 0% populated in the 2023 workbook. Sparse here for the same
    // reason: the column has to look right when almost nobody is in it.
    const specialTeams = some(random, SPECIAL_TEAMS_POSITIONS, 0.18, 0.3);

    const formalwear: string[] = [];
    // Measured ownership from the field inventory: tie 79%, bowtie 31%,
    // socks 93%.
    if (random() < 0.79) formalwear.push("Tie");
    if (random() < 0.31) formalwear.push("Bowtie");
    if (random() < 0.93) formalwear.push("Socks");

    const slug = displayName.toLowerCase().replace(/[^a-z]+/g, ".");
    const mobile = maybe(random, `07700 900${String(100 + index).padStart(3, "0")}`, 0.28);
    const email = maybe(
      random,
      college === null ? `${slug}@mail.example` : `${slug}@${college.toLowerCase()}.ox.ac.example`,
      0.14,
    );
    const hasMobile = mobile !== null;
    const hasEmail = email !== null;
    const entry = random() < 0.62 ? "Returning" : "New";
    const onboardingItems = buildOnboarding(random, status);

    return {
      id: `m-${String(index + 1).padStart(3, "0")}`,
      displayName,
      aliases: ALIASES[displayName] ?? [],
      college,
      matriculation: maybe(random, String(2022 + Math.floor(random() * 4)), 0.45),
      graduation: maybe(random, String(2026 + Math.floor(random() * 3)), 0.55),
      degree: maybe(random, pick(random, DEGREES), 0.5),
      mobile,
      email,
      hasMobile,
      hasEmail,
      // Neither reaches the board, and neither can be added to it.
      dateOfBirth: maybe(
        random,
        `${1 + Math.floor(random() * 28)} ${pick(random, ["Feb", "Apr", "Jun", "Sep", "Nov"])} ${2003 + Math.floor(random() * 5)}`,
        0.55,
      ),
      emergencyContact: maybe(
        random,
        `${pick(random, ["Mother", "Father", "Partner", "Sibling"])} · 07700 900${String(500 + index).padStart(3, "0")}`,
        0.62,
      ),
      // The count understates, and says so in the mission's own words: the
      // academic fields, date of birth and emergency contact have no substrate
      // on `main` to count yet.
      missing: (hasMobile ? 0 : 1) + (hasEmail ? 0 : 1) + (college === null ? 1 : 0),
      onboardingItems,
      onboarding: summariseOnboarding(onboardingItems),
      confirmedOn: "19 Apr 2026",
      activatedOn: status === "Onboarding" ? null : "3 May 2026",
      otherSeasons: buildPastSeasons(random, entry),
      history: buildHistory(random, status, displayName),
      status,
      entry,
      offencePositions,
      defencePositions,
      specialTeams,
      blueNumbers: [],
      whiteNumbers: [],
      // Offense is deliberately the commonest group. The board opens with
      // `Coach group: Offense` set from a column far off to the right, and that
      // demonstration is only worth anything if what survives the filter still
      // looks like a squad.
      coachGroup: maybe(
        random,
        random() < 0.5 ? "Offense" : pick(random, COACH_GROUPS),
        0.12,
      ),
      formalwear,
      blues: maybe(random, pick(random, BLUES), 0.4),
      eligibility: maybe(random, pick(random, ELIGIBILITY), 0.25),
      availability: maybe(random, pick(random, AVAILABILITY), 0.2),
    } satisfies Row;
  });

  allocateJerseys(rows, random);
  return rows;
}

export const SEASON_LABEL = "2026-27";

/** Who the audit events are attributed to. Every commit names an actor. */
export const SIGNED_IN_OPERATOR = "Caspian Hallowfield";
