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
  /** Indicators, not values. The raw email and phone are off this surface. */
  readonly hasMobile: boolean;
  readonly hasEmail: boolean;
  /** Required facts with nothing recorded against them. */
  readonly missing: number;
  /** Mission 7 owns the behaviour; the board shows completeness and filters it. */
  readonly onboarding: string;
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

const ONBOARDING_STATES: readonly string[] = Object.freeze([
  "Complete",
  "1 outstanding",
  "2 outstanding",
  "1 outstanding, none blocking",
  "3 outstanding",
  "No items configured",
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

    const hasMobile = random() < 0.72;
    const hasEmail = random() < 0.86;

    return {
      id: `m-${String(index + 1).padStart(3, "0")}`,
      displayName,
      aliases: ALIASES[displayName] ?? [],
      college,
      matriculation: maybe(random, String(2022 + Math.floor(random() * 4)), 0.45),
      graduation: maybe(random, String(2026 + Math.floor(random() * 3)), 0.55),
      degree: maybe(random, pick(random, DEGREES), 0.5),
      hasMobile,
      hasEmail,
      // The count understates, and says so in the mission's own words: date of
      // birth, emergency contact and the academic fields have no substrate to
      // count yet.
      missing: (hasMobile ? 0 : 1) + (hasEmail ? 0 : 1) + (college === null ? 1 : 0),
      onboarding: pick(random, ONBOARDING_STATES),
      status,
      entry: random() < 0.62 ? "Returning" : "New",
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
