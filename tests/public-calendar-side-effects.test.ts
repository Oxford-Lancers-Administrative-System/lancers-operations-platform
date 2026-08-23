/**
 * The public calendar reads, and only reads — LAN-153, `REQ-public-calendar`
 * and `REQ-no-joining-url`.
 *
 * ## Why this is a database suite and not a screen test
 *
 * The two things it has to prove cannot be proved against mocks.
 *
 *   * **"Creates no audience, invitation, RSVP, attendance or notification
 *     record."** LAN-114 required that of the operator calendar and D1 widens it
 *     to traffic carrying no session at all. Asserting it means counting the
 *     rows in those five tables either side of a real render against a real
 *     database, which is what this file does. A mocked service cannot write, so
 *     a mocked test would pass whatever the page did.
 *   * **"No anonymous response carries an online event's joining URL, a person,
 *     an answer or an attendance record — in the page or in any payload behind
 *     it."** The strings that must be absent are the ones the seeded database
 *     actually holds, and a fixture would only prove that the fixture's own
 *     invented URL is absent.
 *
 * ## No session, and none faked
 *
 * Nothing here mocks `resolveOperatorAccess`, sets a cookie or supplies a token.
 * The pages under test never ask: they call `listPublicSeasonEvents` and
 * `readPublicEvent`, which take no actor. That is the point — the tier is
 * carried by which projection is read, not by who is asking.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

// `server-only` throws on import outside a real server component graph. The
// modules under test are genuinely server-only; this is Vitest, not a client.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import {
  listPublicSeasonEvents,
  PARTICIPATION_TABLES,
  PUBLIC_EVENT_COLUMNS,
  readPublicEvent,
} from "@/lib/services/events";
import PublicCalendarPage from "@/app/calendar/page";
import PublicCalendarViewPage from "@/app/calendar/view/page";
import PublicEventPage from "@/app/calendar/[id]/page";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

/**
 * The five kinds of record `REQ-public-calendar` names, and the tables that
 * hold them.
 *
 * `rsvp_responses` rather than the `current_rsvp` view, because the view has
 * nothing of its own to count: an answer is a row in the history table.
 */
const SIDE_EFFECT_TABLES = [
  "event_audience_members",
  "invitations",
  "rsvp_responses",
  "attendance_records",
  "notification_jobs",
] as const;

let client: Client;

/** Row counts for the five tables, in one round trip. */
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

/** An online event in the open season, with a joining URL somebody could leak. */
async function anOnlineEvent(): Promise<{ id: string; joiningUrl: string; name: string }> {
  const result = await client.query<{ id: string; joining_url: string; name: string }>(
    `select e.id, e.joining_url, e.name
       from public.events e
       join public.seasons s on s.id = e.season_id
      where e.delivery_mode = 'online'
        and e.joining_url is not null
        and s.status = any(array['open','active','closing']::public.season_status[])
      order by e.scheduled_on desc nulls last
      limit 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("the seeded season has no online event with a joining URL");
  return { id: row.id, joiningUrl: row.joining_url, name: row.name };
}

/** Somebody the club has actually invited to something in the open season. */
async function anInvitedPerson(): Promise<string> {
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

function listProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof PublicCalendarPage>[0];
}

function viewProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof PublicCalendarViewPage>[0];
}

function eventProps(id: string) {
  return {
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  } as unknown as Parameters<typeof PublicEventPage>[0];
}

/** Every public surface, rendered once, with the markup each produced. */
async function renderEverySurface(eventId: string): Promise<string> {
  const markup: string[] = [];
  for (const page of [
    () => PublicCalendarPage(listProps({ period: "all" })),
    () => PublicCalendarPage(listProps({ period: "week" })),
    () => PublicCalendarViewPage(viewProps({ mode: "gregorian" })),
    () => PublicCalendarViewPage(viewProps({ mode: "oxford" })),
    () => PublicEventPage(eventProps(eventId)),
  ]) {
    const { container } = render(await page());
    markup.push(container.innerHTML);
    cleanup();
  }
  return markup.join("\n");
}

beforeAll(async () => {
  client = await openLocalClient();
}, 60_000);

afterAll(async () => {
  await client?.end();
});

describe("a request carrying no cookie, session or token", () => {
  it("renders the public list, both calendars and an event page", async () => {
    const online = await anOnlineEvent();
    const markup = await renderEverySurfaceSafely(online.id);

    // Each surface actually produced something: an empty string would make
    // every "does not contain" assertion below pass for the wrong reason.
    expect(markup.length).toBeGreaterThan(5_000);
    expect(markup).toContain("Oxford Lancers");
    expect(markup).toContain(online.name);
  }, 120_000);

  it("creates no audience, invitation, RSVP, attendance or notification record", async () => {
    // D1, widening LAN-114's rule to traffic with no session at all. Counted
    // rather than inspected: the module importing no write path is the reason
    // this passes, and this is what would notice if that stopped being true.
    const online = await anOnlineEvent();
    const before = await counts();

    await renderEverySurfaceSafely(online.id);

    expect(await counts()).toEqual(before);
  }, 120_000);
});

describe("what an anonymous response carries", () => {
  it("never carries an online event's joining URL, in the page or the payload", async () => {
    // `REQ-no-joining-url`. Asserted on the payload as well as the markup,
    // because a value can reach the browser inside serialised props without
    // ever being rendered.
    const online = await anOnlineEvent();

    const markup = await renderEverySurfaceSafely(online.id);
    expect(markup).not.toContain(online.joiningUrl);

    const list = await listPublicSeasonEvents();
    const detail = await readPublicEvent(online.id);
    const payload = JSON.stringify({ list, detail });

    expect(payload).not.toContain(online.joiningUrl);
    expect(payload.toLowerCase()).not.toContain("joiningurl");
    expect(payload.toLowerCase()).not.toContain("joining_url");

    // The event is still there, and still says it is online — the tier narrows
    // what is said about an event, never which events are shown (D5).
    expect(detail.deliveryMode).toBe("online");
    expect(list.events.some((event) => event.id === online.id)).toBe(true);
  }, 120_000);

  it("never carries a person, an answer or an attendance record", async () => {
    const online = await anOnlineEvent();
    const surname = await anInvitedPerson();

    const markup = await renderEverySurfaceSafely(online.id);
    expect(markup).not.toContain(surname);

    const payload = JSON.stringify({
      list: await listPublicSeasonEvents(),
      detail: await readPublicEvent(online.id),
    }).toLowerCase();

    for (const forbidden of [
      "invited",
      "invitation",
      "audience",
      "rsvp",
      "saidyes",
      "attend",
      "showed",
      "register",
      surname.toLowerCase(),
    ]) {
      expect(payload, `the public payload carries "${forbidden}"`).not.toContain(forbidden);
    }
  }, 120_000);

  it("carries no status either — that column is the operator's", async () => {
    const online = await anOnlineEvent();
    const payload = JSON.stringify(await readPublicEvent(online.id));

    // `isCancelled` is a bit, not the status column: a public reader learns that
    // an event is off (D57, correction C1) and never that it is a draft.
    expect(payload).not.toMatch(/"status"/);
    expect(payload).not.toContain('"draft"');
    expect(payload).not.toContain('"approved"');
    expect(JSON.parse(payload)).toHaveProperty("isCancelled");
  }, 120_000);
});

describe("the public projection reads no participation table", () => {
  it("selects none of the five, so there is nothing to withhold", () => {
    // The structural half of `REQ-public-calendar`: "a public event page renders
    // without touching participation data at all, not merely hides it after
    // loading". A test that only inspected a returned object would pass on a
    // season whose events happen to have no invitations yet.
    for (const table of PARTICIPATION_TABLES) {
      expect(PUBLIC_EVENT_COLUMNS, `public columns mention ${table}`).not.toContain(table);
    }
    expect(PUBLIC_EVENT_COLUMNS).not.toContain("joining_url");
  });

  it("names every table the operator's own counts read", () => {
    // So that a sixth count added to `COUNT_COLUMNS` is covered by the check
    // above on the day it is written rather than on the day somebody remembers.
    expect([...PARTICIPATION_TABLES].sort()).toEqual([
      "attendance_records",
      "current_rsvp",
      "event_audience_members",
      "invitations",
      "rsvp_responses",
    ]);
  });
});

/**
 * Renders every surface, and fails loudly rather than silently on the first one
 * that throws.
 *
 * A page that threw would otherwise leave the markup short and every
 * "does not contain" assertion trivially true — which is exactly the shape of
 * false pass this suite exists to avoid.
 */
async function renderEverySurfaceSafely(eventId: string): Promise<string> {
  try {
    return await renderEverySurface(eventId);
  } catch (error) {
    throw new Error(`a public surface failed to render: ${(error as Error).message}`);
  }
}
