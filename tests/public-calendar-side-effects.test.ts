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

import { withTransaction } from "@/lib/db";
import {
  listPublicSeasonEvents,
  PARTICIPATION_TABLES,
  PUBLIC_EVENT_COLUMNS,
  readPublicEvent,
} from "@/lib/services/events";
import { buildClubLinkParticipationIn } from "@/lib/services/participation";
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

/**
 * An event that actually has participation behind it — LAN-157's half of this.
 *
 * The existing assertions below pick whichever online event has a joining URL,
 * and that event may have nobody invited to it. "The public payload carries no
 * person" is trivially true of an event nobody was invited to, which is the
 * shape of false pass this whole file exists to avoid. So the club-link tier's
 * arrival needs its own subject: an event with invitations, answers, a register
 * and question responses, all at once.
 */
async function anEventWithParticipation(): Promise<{
  id: string;
  surname: string;
  presence: string;
  answer: string;
  prompts: string[];
}> {
  const result = await client.query<{
    id: string;
    family_name: string;
    presence: string;
    response: string;
  }>(
    `select e.id,
            p.family_name,
            rec.presence::text as presence,
            r.response::text as response
       from public.events e
       join public.seasons s on s.id = e.season_id
       join public.invitations i on i.event_id = e.id
       join public.people p on p.id = i.person_id
       join public.current_rsvp r on r.invitation_id = i.id
       join public.attendance_records rec on rec.event_id = e.id and rec.person_id = p.id
       join public.question_responses qr on qr.invitation_id = i.id
      where s.status = any(array['open','active','closing']::public.season_status[])
        and p.family_name is not null
        and length(p.family_name) > 3
      limit 1`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "the seeded season has no event carrying an invitation, an answer, an attendance record and a question response at once",
    );
  }

  const questions = await client.query<{ prompt: string }>(
    "select prompt from public.event_questions where event_id = $1",
    [row.id],
  );

  return {
    id: row.id,
    surname: row.family_name,
    presence: row.presence,
    answer: row.response,
    prompts: questions.rows.map((question) => question.prompt),
  };
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

interface Surface {
  name: string;
  markup: string;
}

/**
 * What each surface must have produced for its render to count — R153-B3.
 *
 * Each marker is emitted only by that surface's **success** path. When
 * `listPublicSeasonEvents` refuses, every list and calendar page returns the
 * shell wrapped around one alert and none of these appear, which is what a
 * length threshold over the concatenated markup could not tell apart: four
 * alerts inside the shell comfortably clear five thousand characters, and
 * "no records were created" is trivially true when nothing rendered.
 *
 * The row and week-row counts are the second half. Chrome alone is not a
 * render — the surface has to have laid out real event data.
 */
const SURFACES: {
  name: string;
  page: (eventId: string) => Promise<React.ReactElement>;
  /** Emitted only on this surface's success path. */
  requires: string[];
  /** A repeated element this surface must have produced at least one of. */
  atLeastOne?: string;
}[] = [
  {
    name: "public list (all events)",
    page: async () => PublicCalendarPage(listProps({ period: "all" })),
    requires: ['data-testid="period-switch"', 'data-testid="public-event-filters"'],
    atLeastOne: 'data-testid="public-event-row"',
  },
  {
    name: "public list (this week)",
    page: async () => PublicCalendarPage(listProps({ period: "week" })),
    requires: ['data-testid="period-switch"', 'data-testid="public-event-filters"'],
  },
  {
    name: "Calendar View",
    page: async () => PublicCalendarViewPage(viewProps({ mode: "gregorian" })),
    requires: ['data-testid="public-gregorian-view"', 'data-testid="gregorian-grid"'],
    atLeastOne: 'data-testid="calendar-entry"',
  },
  {
    name: "Oxford View",
    page: async () => PublicCalendarViewPage(viewProps({ mode: "oxford" })),
    requires: ['data-testid="public-oxford-view"', 'data-testid="year-column"'],
    atLeastOne: 'data-testid="year-week-row"',
  },
  {
    name: "public event page",
    page: async (eventId: string) => PublicEventPage(eventProps(eventId)),
    requires: ['data-testid="public-event-name"'],
    atLeastOne: 'data-testid="public-event-fact"',
  },
];

/** The states that mean a surface refused rather than rendered. */
const REFUSAL_MARKERS = [
  'data-testid="public-calendar-unavailable"',
  'data-testid="public-event-missing"',
];

/**
 * Every public surface, rendered once, each proved to have actually rendered.
 *
 * The proof lives here rather than in one test so that **every** caller gets
 * it: "no records were created" and "the payload carries no joining URL" are
 * both trivially true of a page that rendered nothing, and this is what stops
 * either passing that way.
 */
async function renderEverySurface(eventId: string): Promise<Surface[]> {
  const surfaces: Surface[] = [];

  for (const surface of SURFACES) {
    const { container } = render(await surface.page(eventId));
    const markup = container.innerHTML;
    cleanup();

    for (const refusal of REFUSAL_MARKERS) {
      expect(markup, `${surface.name} refused instead of rendering`).not.toContain(refusal);
    }
    for (const required of surface.requires) {
      expect(markup, `${surface.name} did not render (${required} absent)`).toContain(required);
    }
    if (surface.atLeastOne) {
      const count = markup.split(surface.atLeastOne).length - 1;
      expect(count, `${surface.name} produced no ${surface.atLeastOne}`).toBeGreaterThan(0);
    }

    surfaces.push({ name: surface.name, markup });
  }

  expect(surfaces).toHaveLength(SURFACES.length);
  return surfaces;
}

/** Every surface's markup at once, for the "carries nothing" assertions. */
function allMarkup(surfaces: readonly Surface[]): string {
  return surfaces.map((surface) => surface.markup).join("\n");
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
    const surfaces = await renderEverySurfaceSafely(online.id);

    // R153-B3. Each surface is proved to have rendered *its own* content by
    // `renderEverySurface` — its success-path markers, and at least one real
    // row, entry or week. A length threshold over the concatenation could not:
    // when the service was made to refuse, four alerts inside the shell cleared
    // it and this test passed while nothing had rendered at all.
    for (const surface of surfaces) {
      expect(surface.markup, `${surface.name} is missing the club's own shell`).toContain(
        "Oxford Lancers",
      );
    }
    expect(surfaces.map((surface) => surface.name)).toEqual([
      "public list (all events)",
      "public list (this week)",
      "Calendar View",
      "Oxford View",
      "public event page",
    ]);
    // The event this walk is about reached the surfaces that show it by name.
    expect(allMarkup(surfaces)).toContain(online.name);
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

    const markup = allMarkup(await renderEverySurfaceSafely(online.id));
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

    const markup = allMarkup(await renderEverySurfaceSafely(online.id));
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

/**
 * The check that could not be run until the club link and the public calendar
 * were in one tree — LAN-157's W7 criterion, "an anonymous request for the
 * event returns no person, no answer, no attendance and no question response".
 *
 * It was unrunnable on the club-link branch alone because `/calendar/<id>` did
 * not exist there — the route 404s before LAN-153 merges — and it is worth more
 * than the assertion above it because it has a **positive control from the tier
 * next door**. `buildClubLinkParticipationIn` reads the same event and does
 * carry all four, so "the public payload contains no answer" is proved to be a
 * statement about the public projection rather than about an event nobody was
 * invited to.
 */
describe("the public tier, against an event that really has participation", () => {
  it("carries no participant, answer, attendance or question response", async () => {
    const staged = await anEventWithParticipation();

    // The positive control first. Everything asserted absent below is present
    // one tier up, for this same event, at this same moment.
    const club = await withTransaction((tx) => buildClubLinkParticipationIn(tx, staged.id));
    const clubPayload = JSON.stringify(club);
    expect(club.people.length, "the staged event has nobody in its table").toBeGreaterThan(0);
    expect(clubPayload).toContain(staged.surname);
    expect(clubPayload).toContain(`"${staged.answer}"`);
    expect(clubPayload).toContain(`"${staged.presence}"`);
    expect(club.questions.length, "the staged event has no questions").toBeGreaterThan(0);
    for (const prompt of staged.prompts) {
      expect(clubPayload, `the club tier is missing "${prompt}"`).toContain(prompt);
    }

    // And now the public tier's own answer, on the payload rather than on the
    // rendered DOM — a value reaches the browser inside serialised props
    // without ever being rendered.
    const publicPayload = JSON.stringify(await readPublicEvent(staged.id));

    expect(publicPayload, "the public payload names a participant").not.toContain(staged.surname);
    for (const answer of ["yes", "no"]) {
      expect(publicPayload, `the public payload carries the answer "${answer}"`).not.toContain(
        `"${answer}"`,
      );
    }
    for (const presence of ["present", "late", "absent", "excused"]) {
      expect(
        publicPayload,
        `the public payload carries the attendance "${presence}"`,
      ).not.toContain(`"${presence}"`);
    }
    for (const prompt of staged.prompts) {
      expect(publicPayload, `the public payload carries the question "${prompt}"`).not.toContain(
        prompt,
      );
    }
    // No key for any of them either, so a future null-valued field is caught
    // as well as a populated one.
    for (const key of ["people", "questions", "answers", "answer", "presence", "attendance"]) {
      expect(publicPayload, `the public payload has a "${key}" key`).not.toContain(`"${key}"`);
    }
  }, 120_000);

  it("says the same on the rendered page, which is the response body", async () => {
    const staged = await anEventWithParticipation();
    const { container } = render(await PublicEventPage(eventProps(staged.id)));
    const markup = container.innerHTML;
    cleanup();

    // Proved to have rendered, so that every "not contain" below means
    // something. A refused page passes all of them trivially.
    expect(markup, "the public event page refused instead of rendering").not.toContain(
      'data-testid="public-event-missing"',
    );
    expect(markup).toContain('data-testid="public-event-name"');

    expect(markup).not.toContain(staged.surname);
    for (const prompt of staged.prompts) {
      expect(markup, `the public page renders the question "${prompt}"`).not.toContain(prompt);
    }
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
async function renderEverySurfaceSafely(eventId: string): Promise<Surface[]> {
  try {
    return await renderEverySurface(eventId);
  } catch (error) {
    throw new Error(`a public surface failed to render: ${(error as Error).message}`);
  }
}
