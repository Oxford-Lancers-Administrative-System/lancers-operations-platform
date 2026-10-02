// @vitest-environment node
/**
 * `/calendar/feed.ics` against the real database — LAN-158, `W2`.
 *
 * `tests/public-calendar-side-effects.test.ts` is the pattern this file
 * follows for the read-creates-nothing and no-person proofs — and, since
 * LAN-284 reversed the never-public rule, for the joining URL's presence.
 * Three things need the real database and cannot be proved with hand-built
 * `FeedEvent` rows (`src/lib/services/calendar-feed.test.ts` covers those):
 *
 *   * **A read creates no row in any of the five participation tables.**
 *     Counted either side of a real transaction against the real schema.
 *   * **An amendment updates the subscriber's existing entry rather than
 *     duplicating it.** LAN-156's amendment service has not merged, so this
 *     suite amends a fixture event directly with SQL — `events.updated_at` is
 *     the one column the feed's revision clock reads, and this proves the
 *     identity rule (`UID` unchanged, `SEQUENCE` increased) holds against a
 *     real row, not just against `deriveSequence`'s arithmetic.
 *   * **A cancelled event stays in the feed, marked cancelled.** Same
 *     reasoning: LAN-156's cancellation flow has not merged, so `status` is
 *     set directly.
 *
 * Every fixture event this suite writes carries `NAME_MARKER` in its name, and
 * `afterEach` deletes exactly those rows and their audit trail — the same
 * discipline `events.test.ts` uses, and for the same reason: this is a shared
 * database and a parallel suite's rows must never be touched.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { withTransaction } from "@/lib/db";
import { addDays } from "@/lib/services/calendar";
import {
  buildCalendarFeed,
  buildEventUid,
  deriveSequence,
  DRAFT_PLACEHOLDER,
  escapeText,
} from "@/lib/services/calendar-feed";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { listAudienceCatalogueIn } from "@/lib/services/event-audience";
import {
  createEventDraft,
  listPublicSeasonEvents,
  listPublicSeasonEventsForFeed,
  readPublicEvent,
  type EventDetail,
} from "@/lib/services/events";
import { openLocalClient } from "./helpers/domain-fixture";
import { openObserver, seededActorPersonId } from "./helpers/service-layer";
import { validateICalendar } from "./helpers/icalendar-validate";

const NAME_MARKER = "LAN158FeedSuite";

const SIDE_EFFECT_TABLES = [
  "event_audience_members",
  "invitations",
  "rsvp_responses",
  "attendance_records",
  "notification_jobs",
] as const;

let client: Client;
let observer: Client;
let actorPersonId: string;
/** Inside the currently open season, so every fixture belongs to it. */
let anchorDay: string;

async function counts(): Promise<Record<string, number>> {
  const selects = SIDE_EFFECT_TABLES.map(
    (table) => `(select count(*) from public.${table}) as ${table}`,
  ).join(", ");
  const result = await client.query(`select ${selects}`);
  return Object.fromEntries(
    Object.entries(result.rows[0] as Record<string, string>).map(([key, value]) => [
      key,
      Number(value),
    ]),
  );
}

/** One fixture event, in the open season, named with the marker. */
async function draftFixtureEvent(
  overrides: Partial<{
    scheduledOn: string | null;
    startsAt: string | null;
    endsAt: string | null;
    deliveryMode: "in_person" | "online";
    venue: string | null;
    description: string | null;
    requiredEquipment: string | null;
    joiningUrl: string | null;
  }> = {},
): Promise<EventDetail> {
  return createEventDraft(actorPersonId, {
    name: `${NAME_MARKER} — ${Math.random().toString(36).slice(2, 10)}`,
    templateId: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
    scheduledOn: anchorDay,
    startsAt: "18:00",
    endsAt: "19:00",
    deliveryMode: "in_person",
    venue: `${NAME_MARKER} ground`,
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    isMandatory: false,
    ...overrides,
  });
}

/**
 * LAN-463: approve a fixture draft through the real path — one seeded invitee,
 * `saveEventAudience` then `approveEvent` — so the feed reads the same row an
 * operator's approval leaves.
 */
async function approve(event: EventDetail): Promise<void> {
  const catalogue = await withTransaction((tx) =>
    listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn, event.eventType),
  );
  const invitee = catalogue.candidates.find((one) => one.capacity === "player");
  if (!invitee) throw new Error("the seeded season offers no player to invite");
  await saveEventAudience(actorPersonId, event.id, [invitee.key]);
  await approveEvent(actorPersonId, event.id);
}

/** The real feed for the whole open season, built the same way the route does. */
async function fetchFeedDocument(): Promise<{ document: string; seasonLabel: string }> {
  const { season, events } = await listPublicSeasonEventsForFeed();
  return {
    document: buildCalendarFeed({ seasonLabel: season.label, events }),
    seasonLabel: season.label,
  };
}

/** An online event with a joining URL, from the *seeded* dataset — not this suite's fixtures. */
async function seededOnlineEventWithJoiningUrl(): Promise<{
  id: string;
  joiningUrl: string;
}> {
  const result = await client.query<{ id: string; joining_url: string }>(
    `select e.id, e.joining_url
       from public.events e
       join public.seasons s on s.id = e.season_id
      where e.delivery_mode = 'online'
        and e.joining_url is not null
        -- LAN-463: a draft's joining URL is withheld, so only an approved event proves it carried.
        and e.status = 'approved'
        and s.status = any(array['open','active','closing']::public.season_status[])
      order by e.scheduled_on desc nulls last
      limit 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("the seeded season has no online event with a joining URL");
  return { id: row.id, joiningUrl: row.joining_url };
}

/** Somebody the seeded dataset has actually invited to something. */
async function seededInvitedPersonSurname(): Promise<string> {
  const result = await client.query<{ family_name: string }>(
    `select p.family_name
       from public.invitations i
       join public.people p on p.id = i.person_id
      where p.family_name is not null and length(p.family_name) > 3
      limit 1`,
  );
  const name = result.rows[0]?.family_name;
  if (!name) throw new Error("the seeded database has nobody invited to anything");
  return name;
}

beforeAll(async () => {
  client = await openLocalClient();
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);

  const { season } = await listPublicSeasonEventsForFeed();
  anchorDay = addDays(season.startsOn ?? "2026-04-26", 21) ?? "2026-04-26";
}, 60_000);

afterEach(async () => {
  // LAN-463: an approved fixture carries an audience, invitations, jobs and a
  // frozen messaging plan, each referencing its event; they go first, in the
  // dependency order `participation.test.ts` keeps.
  const events = "(select id from public.events where name like $1)";
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  for (const statement of [
    `delete from public.delivery_results where notification_job_id in
       (select id from public.notification_jobs where event_id in ${events})`,
    `delete from public.nonresponse_flags where invitation_id in ${invitations}`,
    `delete from public.event_messaging_plans where event_id in ${events}`,
    `delete from public.notification_jobs where event_id in ${events}`,
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    `delete from public.invitations where event_id in ${events}`,
    `delete from public.event_audience_members where event_id in ${events}`,
  ]) {
    await observer.query(statement, [`${NAME_MARKER}%`]);
  }
  // Audit rows first — they name the event, and the delete below removes it.
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events'
        and entity_id in (select id from public.events where name like $1)`,
    [`${NAME_MARKER}%`],
  );
  await observer.query("delete from public.events where name like $1", [`${NAME_MARKER}%`]);
});

afterAll(async () => {
  await client?.end();
  await observer?.end();
});

describe("a read", () => {
  it("creates no row in any of the five participation tables", async () => {
    await draftFixtureEvent();
    const before = await counts();

    await fetchFeedDocument();

    expect(await counts()).toEqual(before);
  }, 60_000);

  it("produces a document that validates as iCalendar, for the whole real season", async () => {
    await draftFixtureEvent();

    const { document } = await fetchFeedDocument();

    expect(validateICalendar(document)).toEqual([]);
  }, 60_000);
});

describe("a draft, then its approval — LAN-463", () => {
  const DETAIL = {
    venue: `${NAME_MARKER} pitch three`,
    description: `${NAME_MARKER} install review`,
    requiredEquipment: `${NAME_MARKER} gumshield`,
  };

  it("carries a draft as title and time with the placeholder, and fills the same entry in on approval", async () => {
    const event = await draftFixtureEvent(DETAIL);
    const uid = buildEventUid(event.id);
    // The draft is moved back a few seconds, as any real gap between drafting
    // and approving does: SEQUENCE counts whole seconds, and a test is faster
    // than an operator.
    await observer.query(
      "update public.events set updated_at = updated_at - interval '5 seconds' where id = $1",
      [event.id],
    );

    const before = unfold((await fetchFeedDocument()).document);
    const draft = vEventBlock(before, uid);
    expect(draft).toContain(`SUMMARY:${escapeText(event.name)}`);
    expect(draft).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(draft).toContain(`DESCRIPTION:${escapeText(DRAFT_PLACEHOLDER)}`);
    expect(draft).toContain("STATUS:TENTATIVE");
    expect(draft).not.toContain("LOCATION:");
    expect(draft).not.toContain("URL:");
    for (const withheld of Object.values(DETAIL)) expect(draft).not.toContain(withheld);
    const draftSequence = Number(draft.match(/SEQUENCE:(\d+)/)![1]);

    await approve(event);

    const after = unfold((await fetchFeedDocument()).document);
    expect(occurrencesOf(after, `UID:${uid}`), "approval created a second entry").toBe(1);
    const approved = vEventBlock(after, uid);
    expect(Number(approved.match(/SEQUENCE:(\d+)/)![1])).toBeGreaterThan(draftSequence);
    expect(approved).toContain(`LOCATION:${escapeText(DETAIL.venue)}`);
    expect(approved).toContain(DETAIL.description);
    expect(approved).toContain(DETAIL.requiredEquipment);
    expect(approved).toContain("STATUS:CONFIRMED");
    expect(approved).not.toContain(escapeText(DRAFT_PLACEHOLDER));
  }, 60_000);

  it("withholds a draft's detail from the public list and event page as the feed does", async () => {
    const event = await draftFixtureEvent({
      ...DETAIL,
      deliveryMode: "online",
      joiningUrl: "https://teams.example.invalid/l/meetup-join/lan463",
    });

    const detail = await readPublicEvent(event.id);
    expect(detail).toMatchObject({
      name: event.name,
      scheduledOn: event.scheduledOn,
      startsAt: "18:00",
      isDraft: true,
      venue: null,
      description: null,
      requiredEquipment: null,
      joiningUrl: null,
    });

    const list = await listPublicSeasonEvents();
    const entry = list.events.find((one) => one.id === event.id);
    expect(entry).toMatchObject({ isDraft: true, venue: null });
    // Nor can a search find it by the venue it is not showing.
    const searched = await listPublicSeasonEvents({ search: DETAIL.venue });
    expect(searched.events.some((one) => one.id === event.id)).toBe(false);
  }, 60_000);
});

describe("identity and revision", () => {
  it("an amendment updates the existing entry rather than duplicating it", async () => {
    // LAN-463: an approved event, whose entry carries its full detail.
    const event = await draftFixtureEvent();
    await approve(event);

    const before = await fetchFeedDocument();
    const uid = buildEventUid(event.id);
    expect(before.document).toContain(`UID:${uid}`);
    const beforeOccurrences = occurrencesOf(before.document, `UID:${uid}`);
    expect(beforeOccurrences).toBe(1);
    const beforeSequenceMatch = vEventBlock(before.document, uid).match(/SEQUENCE:(\d+)/);
    expect(beforeSequenceMatch).not.toBeNull();
    const beforeSequence = Number(beforeSequenceMatch![1]);

    // LAN-156's amendment service has not merged; simulate the edit directly.
    // `+ interval '2 seconds'` guarantees a strictly later second even if this
    // test runs faster than the clock's own resolution.
    await observer.query(
      `update public.events
          set name = name || ' (amended)', updated_at = updated_at + interval '2 seconds'
        where id = $1`,
      [event.id],
    );

    const after = await fetchFeedDocument();
    const afterOccurrences = occurrencesOf(after.document, `UID:${uid}`);
    expect(afterOccurrences, "the amendment duplicated the entry instead of updating it").toBe(1);
    const afterSequenceMatch = vEventBlock(after.document, uid).match(/SEQUENCE:(\d+)/);
    expect(afterSequenceMatch).not.toBeNull();
    const afterSequence = Number(afterSequenceMatch![1]);

    expect(afterSequence).toBeGreaterThan(beforeSequence);
    expect(after.document).toContain("(amended)");
  }, 60_000);

  it("SEQUENCE in the feed matches deriveSequence(updated_at) exactly", async () => {
    const event = await draftFixtureEvent();
    const row = await observer.query<{ updated_at: Date }>(
      "select updated_at from public.events where id = $1",
      [event.id],
    );
    const updatedAt = row.rows[0]!.updated_at;

    const { document } = await fetchFeedDocument();
    const block = vEventBlock(document, buildEventUid(event.id));
    const match = block.match(/SEQUENCE:(\d+)/);
    expect(match).not.toBeNull();

    expect(Number(match![1])).toBe(deriveSequence(updatedAt.toISOString()));
  }, 60_000);
});

describe("cancellation — D57", () => {
  it("a cancelled event remains in the feed, marked STATUS:CANCELLED", async () => {
    const event = await draftFixtureEvent();
    const uid = buildEventUid(event.id);

    // LAN-156's cancellation flow has not merged; simulate it directly.
    // Invariant E1 (`events_approval_requires_date_and_audience`) requires a
    // cancelled event to carry the same approval facts an approved one does —
    // a cancelled event is one that was approved and then called off — so
    // those are set alongside `status` rather than `status` alone.
    await observer.query(
      `update public.events
          set status = 'cancelled',
              approved_at = now(),
              approved_by_person_id = $2,
              audience_confirmed_at = now(),
              audience_confirmed_by_person_id = $2,
              decision_reason = 'LAN-158 fixture cancellation'
        where id = $1`,
      [event.id, actorPersonId],
    );

    const { document } = await fetchFeedDocument();
    expect(
      occurrencesOf(document, `UID:${uid}`),
      "the cancelled event vanished from the feed",
    ).toBe(1);
    const block = vEventBlock(document, uid);
    expect(block).toContain("STATUS:CANCELLED");
    expect(block).not.toContain("STATUS:CONFIRMED");
  }, 60_000);
});

describe("what the feed carries", () => {
  it("carries no person, asserted on the payload", async () => {
    await draftFixtureEvent();
    const surname = await seededInvitedPersonSurname();

    const { document } = await fetchFeedDocument();

    expect(document).not.toContain(surname);
    for (const forbidden of ["rsvp", "invit", "attend"]) {
      expect(document.toLowerCase(), `feed payload carries "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  }, 60_000);

  it("carries an online event's joining URL in the URL property — LAN-284", async () => {
    // The inverse of the assertion this replaces. Brian reversed the
    // never-public rule on 2026-09-09: the feed publishes the link, and it
    // publishes it as `URL` rather than inside `DESCRIPTION`, because that is
    // what a subscribed Google or Apple calendar renders as a tappable link.
    // Asserted against the seeded row rather than a fixture, for the reason
    // the whole file exists: the value proved is the one the database holds.
    const online = await seededOnlineEventWithJoiningUrl();

    const { document } = await fetchFeedDocument();
    const block = unfold(vEventBlock(document, buildEventUid(online.id)));

    expect(block).toContain(`URL:${online.joiningUrl}`);
    const description = block.split("\r\n").find((line) => line.startsWith("DESCRIPTION:")) ?? "";
    expect(description).not.toContain(online.joiningUrl);
  }, 60_000);
});

/** RFC 5545 §3.1 line folding, undone, so a long property reads as one line. */
function unfold(document: string): string {
  return document.replace(/\r\n /g, "");
}

/** How many times a substring occurs — used to prove "exactly one entry", not just "at least one". */
function occurrencesOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The single BEGIN:VEVENT…END:VEVENT block carrying this UID. */
function vEventBlock(document: string, uid: string): string {
  const events = document
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((chunk) => `BEGIN:VEVENT${chunk}`);
  const match = events.find((chunk) => chunk.includes(`UID:${uid}`));
  if (!match) throw new Error(`no VEVENT found for UID:${uid}`);
  return match;
}
