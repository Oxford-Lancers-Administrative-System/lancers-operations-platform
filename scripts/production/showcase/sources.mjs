/**
 * The club's two workbooks, turned into records the loader can write — LAN-124.
 *
 * Every value this produces carries the cell it came from. That is not
 * bookkeeping: LAN-124 forbids a visible `PILOT-` marker in a player or event
 * name, so provenance lives in the manifest instead, and a row in the hosted
 * database is traceable to a spreadsheet cell or it is not defensible at all.
 *
 * ## What is deliberately not read
 *
 * From `Players Databank`, the loader takes names, kit signal and positions.
 * It does **not** take:
 *
 *   * **Phone numbers** (column B, 31 of 42 populated). Real students' mobile
 *     numbers, and the showcase replaces them with unroutable demonstration
 *     values. Only Brian and Stewart get real endpoints, supplied at execution
 *     time and never through this file.
 *   * **Email** (column C). Empty in the source anyway — the column has a
 *     header and nothing else — which is worth knowing before somebody goes
 *     looking for it.
 *   * **Activity** (column D). Its vocabulary is Active / Inactive / **Injured**,
 *     and `Injured` is a health indicator. The schema deliberately cannot hold
 *     one and `tests/schema-security.test.ts` scans for a column that could.
 *     So the source's own status column is unusable, which is why the
 *     showcase's membership distribution is illustrative rather than derived.
 *   * **Attendance** (column G). A percentage computed by the spreadsheet.
 *   * **Number** (column F). Empty in the source.
 *
 * ## The term card, and the drift that is really there
 *
 * The Michaelmas sheet's Wednesday column reads 20:00–22:30 in week −1 and then
 * 22:31, 22:32, 22:33 … 22:37 down the weeks. That is an Excel fill series:
 * somebody dragged the cell and Excel incremented the last number it found.
 * LAN-124 anticipates exactly this and permits normalising it *when defensible*,
 * with the raw value and a note recorded. Seven consecutive minutes marching
 * down one column of a weekly practice is about as defensible as it gets, and
 * the rule below is narrow enough to say so: a minute value fewer than ten
 * minutes from a round half-hour, with the boundary exclusive so that 22:20 and
 * 22:40 — far likelier to be somebody's decision — are left alone.
 */

import { cellsInReadingOrder, cellText_, columnLetters } from "./workbook.mjs";
import { id, personKey } from "./ids.mjs";

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const ROSTER_SHEET = "Players Databank";

/** Column letters in `Players Databank`, as the club's file lays them out. */
const ROSTER_COLUMNS = Object.freeze({
  name: "A",
  kitted: "E",
  offencePosition: "I",
  defencePosition: "J",
});

/**
 * Splits a full name into given and family parts.
 *
 * Everything before the last space is the given name. That is wrong for some
 * naming conventions and right for this file, whose forty-two entries are all
 * "Given Family" — and being wrong in a *visible*, correctable way beats a
 * cleverer rule that silently mangles one person. A single-token name keeps the
 * whole string as the given name and leaves the family name null, which the
 * schema permits and which the synthetic seed already models.
 */
export function splitName(fullName) {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) return { givenName: parts[0], familyName: null };
  return { givenName: parts.slice(0, -1).join(" "), familyName: parts.at(-1) };
}

/**
 * Reads the roster.
 *
 * Rows are discovered by walking column A rather than assuming a fixed range —
 * the club's file has 42 names in rows 3 to 44 today, and a 43rd added next
 * week should be read rather than ignored. Row 1 is the header and row 2 is
 * blank in the source.
 */
export function readRoster(workbook) {
  const sheet = workbook.sheets.get(ROSTER_SHEET);
  if (!sheet) {
    throw new Error(
      `The roster workbook has no "${ROSTER_SHEET}" sheet. Sheets found: ` +
        `${[...workbook.sheets.keys()].join(", ")}.`,
    );
  }

  const header = cellText_(sheet, `${ROSTER_COLUMNS.name}1`);
  if (header !== "Name") {
    throw new Error(
      `Refusing to read the roster: cell A1 says ${JSON.stringify(header)}, not "Name". ` +
        "The columns may have moved, and reading the wrong one would import the wrong data.",
    );
  }

  const players = [];
  const seen = new Map();

  for (const cell of cellsInReadingOrder(sheet)) {
    if (cell.column !== 1 || cell.row < 3) continue;

    const fullName = cell.text.trim().replace(/\s+/g, " ");
    if (fullName === "") continue;

    const key = personKey(fullName);
    if (seen.has(key)) {
      // Two rows for one person would otherwise become one row silently,
      // because the identifier is derived from the name.
      throw new Error(
        `The roster names ${JSON.stringify(fullName)} twice, at ${seen.get(key)} and ` +
          `${cell.address}. Resolve it in the workbook — the loader will not guess.`,
      );
    }
    seen.set(key, cell.address);

    const kitted = cellText_(sheet, `${ROSTER_COLUMNS.kitted}${cell.row}`);
    const offence = cellText_(sheet, `${ROSTER_COLUMNS.offencePosition}${cell.row}`);
    const defence = cellText_(sheet, `${ROSTER_COLUMNS.defencePosition}${cell.row}`);

    players.push({
      ...splitName(fullName),
      fullName,
      key,
      personId: id("people", key),
      // "Yes" / "No" in the source. Anything else — a blank, a stray note — is
      // read as "not recorded" rather than as "no", because those differ.
      kitIssued: kitted === null ? null : /^yes$/i.test(kitted),
      offencePosition: normalisePosition(offence),
      defencePosition: normalisePosition(defence),
      source: {
        sheet: ROSTER_SHEET,
        nameCell: cell.address,
        kittedCell: `${ROSTER_COLUMNS.kitted}${cell.row}`,
        offenceCell: `${ROSTER_COLUMNS.offencePosition}${cell.row}`,
        defenceCell: `${ROSTER_COLUMNS.defencePosition}${cell.row}`,
        rawKitted: kitted,
        rawOffence: offence,
        rawDefence: defence,
      },
    });
  }

  return players;
}

/**
 * Cleans a position code.
 *
 * The club's dropdown vocabulary is short — QB, RB, WR, T, G, C, TE, FB, WB for
 * offence; E, N/T, S, LB, CB for defence — plus the literal "None". Anything
 * unrecognised is kept verbatim rather than dropped, because the loader records
 * the raw value in the manifest and a position it does not know about is
 * information, not noise.
 */
function normalisePosition(value) {
  if (value === null) return null;
  const cleaned = value.trim();
  if (cleaned === "" || /^none$/i.test(cleaned)) return null;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Term card
// ---------------------------------------------------------------------------

/**
 * Which spreadsheet columns are which weekday.
 *
 * Read from row 4 of the club's sheet — `C4` "Sun", `E4` "Mon", `F4` "Tues" and
 * so on — and widened to the columns that follow each header, because a day
 * with two entries uses two columns. Sunday is C and D, Tuesday F and G, and so
 * on; Monday has only one. That asymmetry is the club's layout, not a mistake
 * here.
 */
const DAY_COLUMNS = Object.freeze({
  C: 0,
  D: 0, // Sunday
  E: 1, // Monday
  F: 2,
  G: 2, // Tuesday
  H: 3,
  I: 3, // Wednesday
  J: 4,
  K: 4, // Thursday
  L: 5,
  M: 5, // Friday
  N: 6,
  O: 6, // Saturday
});

const MONTHS = Object.freeze({
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
});

/**
 * Parses a week label such as `1st (11th-17th Oct)` into its Sunday.
 *
 * Three real awkwardnesses in the club's file are handled rather than
 * worked around:
 *
 *   * week −1's label is wrapped in literal double quotes;
 *   * `2nd (18th-24st Oct)` has a typo in the ordinal suffix, so any suffix is
 *     accepted;
 *   * `8th (29th-5th Dec)` omits the start's month, which has to be inferred as
 *     the month before the end's — the only reading in which 29 precedes 5.
 */
export function parseWeekLabel(label, year) {
  const cleaned = label.replace(/["""]/g, "").trim();

  const week = /^(-?\d+)\s*(?:st|nd|rd|th)?\s*\(/i.exec(cleaned);
  const range =
    /\(\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*([A-Za-z]*)\s*[-–—]\s*(\d{1,2})\s*(?:st|nd|rd|th)?\s*([A-Za-z]*)\s*\)/.exec(
      cleaned,
    );

  if (!week || !range) {
    throw new Error(`Cannot read the week label ${JSON.stringify(label)}.`);
  }

  const [, startDay, startMonthText, endDay, endMonthText] = range;

  const endMonth = MONTHS[endMonthText.slice(0, 3).toLowerCase()];
  if (endMonth === undefined) {
    throw new Error(`Cannot read the month in week label ${JSON.stringify(label)}.`);
  }

  let startMonth = MONTHS[startMonthText.slice(0, 3).toLowerCase()];
  if (startMonth === undefined) {
    // No month on the start. It is the end's month, unless the start's day
    // number is larger — in which case the week crosses a month boundary.
    startMonth = Number(startDay) > Number(endDay) ? (endMonth + 11) % 12 : endMonth;
  }

  // A week starting in December and ending in January belongs to the earlier
  // year. Michaelmas never does, but the arithmetic should not depend on that.
  const startYear = startMonth > endMonth ? year - 1 : year;
  const starts = new Date(Date.UTC(startYear, startMonth, Number(startDay)));

  if (starts.getUTCDay() !== 0) {
    throw new Error(
      `Week label ${JSON.stringify(label)} starts on ` +
        `${starts.toISOString().slice(0, 10)}, which is not a Sunday. The term card's ` +
        "weeks run Sunday to Saturday, so either the label or the year is wrong.",
    );
  }

  return { week: Number(week[1]), starts };
}

/** Extracts a time range or a single start time, and the text without it. */
export function extractTimes(text) {
  const range = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/.exec(text);
  if (range) {
    return {
      startsAt: `${range[1].padStart(2, "0")}:${range[2]}`,
      endsAt: `${range[3].padStart(2, "0")}:${range[4]}`,
      remainder: text.replace(range[0], " "),
    };
  }

  const single = /(\d{1,2}):(\d{2})/.exec(text);
  if (single) {
    return {
      startsAt: `${single[1].padStart(2, "0")}:${single[2]}`,
      endsAt: null,
      remainder: text.replace(single[0], " "),
    };
  }

  return { startsAt: null, endsAt: null, remainder: text };
}

/**
 * The ordered rules that turn an entry's wording into an `event_type`.
 *
 * Ordered because several entries match more than one: "Rookie Taster + Team
 * Practice" is both recruitment and a practice, and "Flag Football + Taster
 * session" is a taster before it is anything else. The first match wins and the
 * rule that matched is recorded in the manifest, so a classification anybody
 * disagrees with can be found and argued about rather than guessed at.
 */
const EVENT_TYPE_RULES = Object.freeze([
  ["chalk", /\bchalk\b/i],
  ["strength_and_conditioning", /\bS&C\b|strength|conditioning/i],
  // LAN-151's seven types (D12). `camp` folded into `practice` — a camp is a
  // practice that runs for longer — and `fixture` and `varsity` both folded
  // into `game`, which is what each of them was.
  ["game", /\bvs\b|\bversus\b|\bvarsity\b/i],
  ["recruitment", /taster|freshers|rookie taster|flag football/i],
  ["social", /curry|dinner|night|social/i],
  ["meeting", /\bmeeting\b|committee/i],
  ["practice", /\bpractice\b|\btraining\b|\bcamp\b/i],
]);

/** Classifies one entry, returning the type and the rule that decided it. */
export function classifyEvent(name) {
  for (const [type, pattern] of EVENT_TYPE_RULES) {
    if (pattern.test(name)) return { eventType: type, matchedRule: String(pattern) };
  }
  // `other` left the enum with LAN-151. An unclassified entry lands on
  // `meeting`, which is the same destination the migration gave every existing
  // `other`-typed row, and the manifest records that no rule matched so a human
  // can put it somewhere better.
  return { eventType: "meeting", matchedRule: "no rule matched" };
}

/**
 * Is this entry too uncertain to be anything but a tentative draft?
 *
 * LAN-124: "TBD," "Potential," tentative and alternative-slot entries stay
 * draft and are never approved or invited by the loader. Four of the club's
 * fixtures read "Lancers vs TBD, TBD, TBD" — no opponent, no venue, no time —
 * and every S&C session names a venue of "Blues Gym, TBD".
 */
export function isTentative(rawText, startsAt) {
  if (/\bTBD\b|\bTBC\b|potential|provisional/i.test(rawText)) return true;
  return startsAt === null;
}

/**
 * Normalises the fill-series minute drift described at the top of this file.
 *
 * Narrow on purpose. It moves a time to the nearest half hour only when it is
 * **fewer than ten minutes** from one, and it reports what it did so the caller
 * can record the raw value.
 *
 * The boundary is exclusive, and that matters: the drift actually in the club's
 * file runs +1 to +7 minutes, while 22:20 and 22:40 are exactly ten minutes out
 * and are far more likely to be somebody's decision than Excel's arithmetic.
 * An inclusive comparison silently moved 22:20 to 22:30, which is precisely the
 * over-reach that would make this rule indefensible.
 */
export function normaliseDriftedTime(time) {
  if (time === null) return { time: null, note: null };

  const [hours, minutes] = time.split(":").map(Number);
  const nearestHalf = Math.round(minutes / 30) * 30;
  const drift = minutes - nearestHalf;

  if (drift === 0 || Math.abs(drift) >= 10) return { time, note: null };

  const carried = nearestHalf === 60;
  const normalised = `${String((hours + (carried ? 1 : 0)) % 24).padStart(2, "0")}:${String(
    carried ? 0 : nearestHalf,
  ).padStart(2, "0")}`;

  return {
    time: normalised,
    note:
      `Read ${time} in the source and loaded ${normalised}. The Michaelmas sheet's ` +
      "Wednesday practice reads 22:30 in week -1 and then 22:31 through 22:37 down the " +
      "weeks, which is an Excel fill series rather than seven different finishing times.",
  };
}

/**
 * Reads the Michaelmas term card.
 *
 * `year` is passed in rather than inferred from the file name: the sheet says
 * "MT2026" in a merged title cell and the loader should not depend on parsing
 * a title. The week labels are validated against it — a wrong year produces
 * weeks that do not start on Sundays, and `parseWeekLabel` refuses.
 */
export function readTermCard(workbook, { year, sheetName } = {}) {
  const name = sheetName ?? [...workbook.sheets.keys()][0];
  const sheet = workbook.sheets.get(name);
  if (!sheet) throw new Error(`The term-card workbook has no "${name}" sheet.`);

  const entries = [];

  for (const cell of cellsInReadingOrder(sheet)) {
    const letters = columnLetters(cell.column);

    // Column B holds the week label; the day columns hold entries. Rows above
    // the header row are the sheet's title.
    if (letters !== "B" || cell.row < 5) continue;

    const { week, starts } = parseWeekLabel(cell.text, year);

    for (const [dayLetters, offset] of Object.entries(DAY_COLUMNS)) {
      const raw = cellText_(sheet, `${dayLetters}${cell.row}`);
      if (raw === null) continue;

      entries.push(
        readEntry({ raw, week, starts, offset, address: `${dayLetters}${cell.row}`, sheet: name }),
      );
    }
  }

  return entries;
}

function readEntry({ raw, week, starts, offset, address, sheet }) {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const { startsAt, endsAt, remainder } = extractTimes(collapsed);

  const parts = remainder
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  const eventName = parts[0] ?? collapsed;
  const venueParts = parts.slice(1).filter((part) => !/^TBD$|^TBC$/i.test(part));
  const venue = venueParts.length === 0 ? null : venueParts.join(", ");

  const scheduled = new Date(starts.getTime() + offset * 86400000);
  const scheduledOn = scheduled.toISOString().slice(0, 10);

  const start = normaliseDriftedTime(startsAt);
  const end = normaliseDriftedTime(endsAt);

  const { eventType, matchedRule } = classifyEvent(eventName);
  const tentative = isTentative(collapsed, startsAt);

  return {
    eventId: id("events", "MT", sheet, address),
    name: eventName,
    eventType,
    venue,
    scheduledOn,
    startsAt: start.time,
    endsAt: end.time,
    week,
    tentative,
    source: {
      sheet,
      cell: address,
      raw: collapsed,
      matchedRule,
      normalisation: [start.note, end.note].filter(Boolean),
    },
  };
}
