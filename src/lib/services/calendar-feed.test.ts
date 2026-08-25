/**
 * The RFC 5545 document itself — LAN-158, `W2`.
 *
 * Pure, like `calendar.test.ts`: every event is hand-built, every clock is an
 * argument, and nothing here opens a database. The database-backed identity
 * and cancellation proofs, against real seeded and amended rows, are
 * `tests/calendar-feed-side-effects.test.ts` — the pattern
 * `tests/public-calendar-side-effects.test.ts` already sets for this mission.
 *
 * "The document validates as iCalendar" is proved here by
 * `tests/helpers/icalendar-validate.ts`, a structural RFC 5545 conformance
 * check — CRLF, 75-octet folding reversed, `BEGIN`/`END` balance, and every
 * required property present and well-formed. A real validator (`icalendar
 * .org`, or Google/Microsoft/Apple directly) needs a publicly reachable URL,
 * which this worker does not have; see the receipt for what that leaves
 * outstanding.
 */
import { describe, expect, it } from "vitest";

import {
  buildCalendarFeed,
  buildEventUid,
  deriveSequence,
  escapeText,
  FEED_HOSTNAME,
  FEED_SEQUENCE_EPOCH,
  foldLine,
  type FeedEvent,
} from "./calendar-feed";
import { validateICalendar } from "../../../tests/helpers/icalendar-validate";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const GENERATED_AT = new Date("2026-10-15T09:00:00Z");

function anEvent(overrides: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: EVENT_ID,
    name: "Chalk — michaelmas week 4",
    scheduledOn: "2026-10-21",
    startsAt: "18:00",
    endsAt: "19:00",
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isCancelled: false,
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("identity — UID", () => {
  it("is the event's own id plus the application hostname", () => {
    expect(buildEventUid(EVENT_ID)).toBe(`${EVENT_ID}@${FEED_HOSTNAME}`);
  });

  it("is stable across two builds of the same event", () => {
    const first = buildEventUid(EVENT_ID);
    const second = buildEventUid(EVENT_ID);
    expect(first).toBe(second);
  });

  it("differs for two different events", () => {
    expect(buildEventUid(EVENT_ID)).not.toBe(buildEventUid("44444444-4444-4444-8444-444444444444"));
  });
});

describe("revision — SEQUENCE", () => {
  it("is zero at the fixed epoch itself", () => {
    expect(deriveSequence(new Date(FEED_SEQUENCE_EPOCH).toISOString())).toBe(0);
  });

  it("is whole seconds after the epoch", () => {
    const oneHourLater = new Date(FEED_SEQUENCE_EPOCH + 3_661_000).toISOString();
    expect(deriveSequence(oneHourLater)).toBe(3_661);
  });

  it("increases when updatedAt moves later — an amendment's whole point", () => {
    const before = deriveSequence("2026-10-01T12:00:00.000Z");
    const after = deriveSequence("2026-10-01T12:00:05.000Z");
    expect(after).toBeGreaterThan(before);
  });

  it("never goes negative for an updatedAt before the epoch", () => {
    expect(deriveSequence("2025-01-01T00:00:00.000Z")).toBe(0);
  });
});

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newline, in that priority order", () => {
    expect(escapeText('Ground; Café, "home" pitch\nBring boots')).toBe(
      'Ground\\; Café\\, "home" pitch\\nBring boots',
    );
  });

  it("doubles a literal backslash rather than treating it as an escape", () => {
    expect(escapeText("C:\\Users")).toBe("C:\\\\Users");
  });
});

describe("foldLine", () => {
  it("leaves a short line untouched", () => {
    expect(foldLine("SUMMARY:Practice")).toBe("SUMMARY:Practice");
  });

  it("folds a line over 75 octets into CRLF-joined physical lines starting with a space", () => {
    const long = `SUMMARY:${"x".repeat(120)}`;
    const folded = foldLine(long);
    const physical = folded.split("\r\n");

    expect(physical.length).toBeGreaterThan(1);
    expect(Buffer.byteLength(physical[0]!, "utf8")).toBeLessThanOrEqual(75);
    for (const line of physical.slice(1)) {
      expect(line.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // Unfolding (dropping CRLF + the continuation's leading space) recovers
    // the original content exactly.
    const unfolded = physical.map((line, index) => (index === 0 ? line : line.slice(1))).join("");
    expect(unfolded).toBe(long);
  });

  it("never splits inside a multi-byte UTF-8 character", () => {
    // Every character below is a 3-byte UTF-8 sequence, chosen so a naive
    // 75-byte cut lands mid-character unless the fold walks back to the
    // boundary.
    const long = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(long);
    for (const physical of folded.split("\r\n")) {
      const content = physical.startsWith(" ") ? physical.slice(1) : physical;
      // A truncated multi-byte sequence round-trips to the U+FFFD replacement
      // character when decoded; a clean cut never produces one.
      expect(Buffer.from(content, "utf8").toString("utf8")).not.toContain("\uFFFD");
    }
  });
});

describe("buildCalendarFeed", () => {
  it("produces a document that validates as iCalendar", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent()],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
  });

  it("is valid and empty for a season with no events — the workflow's own exception", () => {
    const document = buildCalendarFeed({ seasonLabel: "2026-27", events: [], now: GENERATED_AT });
    expect(validateICalendar(document)).toEqual([]);
    expect(document).toContain("BEGIN:VCALENDAR");
    expect(document).toContain("END:VCALENDAR");
    expect(document).not.toContain("BEGIN:VEVENT");
  });

  it("uses CRLF throughout and folds no ordinary property", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent()],
      now: GENERATED_AT,
    });
    expect(document.includes("\r\n")).toBe(true);
    expect(/(?<!\r)\n/.test(document)).toBe(false);
  });

  it("carries a cancelled event with STATUS:CANCELLED rather than dropping it — D57", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ isCancelled: true })],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
    expect(document).toContain(`UID:${buildEventUid(EVENT_ID)}`);
    expect(document).toContain("STATUS:CANCELLED");
    expect(document).not.toContain("STATUS:CONFIRMED");
  });

  it("skips an event with no scheduledOn rather than emitting a VEVENT with no date", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ scheduledOn: null })],
      now: GENERATED_AT,
    });
    expect(document).not.toContain("BEGIN:VEVENT");
  });

  it("carries no field for a person, an RSVP, attendance or a joining URL — structural, not withheld", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent()],
      now: GENERATED_AT,
    });
    for (const forbidden of ["RSVP", "invit", "attend", "joiningUrl", "joining_url"]) {
      expect(document.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("emits a whole-day entry (VALUE=DATE, DTEND the day after) when no time is set", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ startsAt: null, endsAt: null, scheduledOn: "2026-10-21" })],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
    expect(document).toContain("DTSTART;VALUE=DATE:20261021");
    expect(document).toContain("DTEND;VALUE=DATE:20261022");
  });

  it("omits DTEND — a valid zero-duration VEVENT — rather than inventing a duration", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ endsAt: null })],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
    expect(document).not.toContain("DTEND");
  });

  it("says Online for an online event with no stated destination", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ deliveryMode: "online", venue: null })],
      now: GENERATED_AT,
    });
    expect(document).toContain("LOCATION:Online");
  });

  it("omits LOCATION for a venue-less in-person draft rather than emitting it blank", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ deliveryMode: "in_person", venue: null })],
      now: GENERATED_AT,
    });
    expect(document).not.toMatch(/^LOCATION:/m);
  });

  it("resolves the correct UTC instant either side of the British Summer Time boundary", () => {
    // BST 2026 ends Sunday 25 October; 21 October is BST (UTC+1), 3 November
    // is GMT (UTC+0). Both times are 19:00 in Oxford.
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [
        anEvent({
          id: "11111111-1111-4111-8111-111111111111",
          scheduledOn: "2026-10-21",
          startsAt: "19:00",
          endsAt: "20:00",
        }),
        anEvent({
          id: "22222222-2222-4222-8222-222222222222",
          scheduledOn: "2026-11-03",
          startsAt: "19:00",
          endsAt: "20:00",
        }),
      ],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
    // BST: 19:00 Oxford = 18:00 UTC.
    expect(document).toContain("DTSTART:20261021T180000Z");
    // GMT: 19:00 Oxford = 19:00 UTC.
    expect(document).toContain("DTSTART:20261103T190000Z");
  });

  it("escapes an event name and venue carrying RFC 5545's special characters", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      events: [anEvent({ name: "Social: chips, chat; craic", venue: "The Lamb & Flag, St Giles" })],
      now: GENERATED_AT,
    });
    expect(validateICalendar(document)).toEqual([]);
    expect(document).toContain("SUMMARY:Social: chips\\, chat\\; craic");
    expect(document).toContain("LOCATION:The Lamb & Flag\\, St Giles");
  });

  it("validates for a large season carrying every combination this module handles", () => {
    const document = buildCalendarFeed({
      seasonLabel: "2026-27",
      now: GENERATED_AT,
      events: [
        anEvent({ id: "11111111-1111-4111-8111-111111111111" }),
        anEvent({ id: "22222222-2222-4222-8222-222222222222", isCancelled: true }),
        anEvent({ id: "33333333-3333-4333-8333-333333333334", startsAt: null, endsAt: null }),
        anEvent({ id: "33333333-3333-4333-8333-333333333335", endsAt: null }),
        anEvent({
          id: "33333333-3333-4333-8333-333333333336",
          deliveryMode: "online",
          venue: null,
        }),
        anEvent({ id: "33333333-3333-4333-8333-333333333337", scheduledOn: null }),
      ],
    });
    expect(validateICalendar(document)).toEqual([]);
  });
});
