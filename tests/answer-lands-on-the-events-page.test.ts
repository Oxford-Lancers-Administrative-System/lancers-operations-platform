/**
 * Answering an invitation really does land on a rendered events page — LAN-343.
 *
 * ## What was missing
 *
 * `src/app/a/[answer]/[token]/actions.test.ts` proves the redirect *string*,
 * with `redirect` mocked and the service layer mocked under it. That is the
 * right test for the action's own logic and it proves nothing about the journey:
 * every mistake this ticket was raised for lived in the gap between the string
 * and the page. A message pointed at a page that did not exist; a page resolved
 * a credential nobody had minted for it; a durable token was revoked by the next
 * message before its own link was opened. Each of those leaves the redirect
 * string exactly as it is here and gives the player a 404.
 *
 * So this test walks it: a real invitation, a real answer token, the real POST,
 * the real credential it mints, and the real events page rendered from the
 * plaintext that POST put in the URL — through `withTransaction` and the local
 * database throughout. Only the four framework seams are mocked, and each is
 * mocked because it cannot run outside a request:
 *
 *   * `next/navigation`'s `redirect` and `notFound`, which throw control-flow
 *     signals the framework catches. `redirect` is what carries the URL under
 *     test out of the action, so it is captured rather than stubbed away.
 *   * `next/headers`' `cookies` and `headers`. The gate cookie is what a real
 *     browser sends back on the POST after `src/proxy.ts` set it on the GET.
 *
 * The page is rendered with `renderToStaticMarkup` rather than
 * `@testing-library/react`: a crawler and a player both receive the server's
 * HTML, and asserting on that keeps this test about the journey rather than
 * about hydration.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
  cookies: async () => ({
    get: (name: string) => (name === "lo_pa_gate" ? { value: "1" } : undefined),
  }),
}));

import type { Client } from "pg";
import { renderToStaticMarkup } from "react-dom/server";

import { closePool, withTransaction } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { issueAnswerTokenIn } from "@/lib/services/player-answer-tokens";

import { submitAnswer } from "@/app/a/[answer]/[token]/actions";
import EventsPage from "@/app/events/[token]/page";

import { openObserver, seededIdentityCreatedAt } from "./helpers/service-layer";

const MARKER = "LAN343AnswerJourneySuite";
const EVENT_NAME = `${MARKER} practice`;

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();

  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  const invitations = `(select id from public.invitations
     where season_membership_id in (select id from public.season_memberships where person_id in ${people}))`;
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_id in ${invitations} or entity_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.invitations where id in ${invitations}`, [MARKER]);
  await observer.query(
    "delete from public.event_audience_members where event_id in (select id from public.events where name = $1)",
    [EVENT_NAME],
  );
  await observer.query("delete from public.events where name = $1", [EVENT_NAME]);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/** One approved, future event with one player invitation — `player-answer-tokens.test.ts`'s own fixture shape. */
async function invitation(): Promise<{ personId: string; invitationId: string }> {
  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Invitee', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const personId = person.rows[0].id;

    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );
    const membershipId = membership.rows[0].id;

    // Inside the 21-day horizon the events page's main sections use, so the
    // invitation really is on the page this journey lands on rather than folded
    // into its further-out section.
    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + interval '48 hours') at time zone 'Europe/London' as local)
       insert into public.events
         (season_id, name, event_type, status, scheduled_on, starts_at,
          audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id, template_id)
       select $1, $2, 'practice', 'approved',
              (select local::date from target), (select local::time from target),
              now(), $3::uuid, now(), $3::uuid,
              (select tpl.id from public.event_templates tpl
                where tpl.event_type = 'practice' order by lower(tpl.name) limit 1)
       returning id`,
      [seasonId, EVENT_NAME, personId],
    );
    const eventId = event.rows[0].id;

    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, invitee_person_id, added_by_person_id)
       values ($1, $2, 'player', $3,
               (select m.person_id from public.season_memberships m where m.id = $3), $4)
       returning id`,
      [eventId, seasonId, membershipId, personId],
    );

    const created = await observer.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
       values ($1, 'approved'::public.event_status, $2, 'player', $3, 'pending', $4)
       returning id`,
      [eventId, seasonId, membershipId, audience.rows[0].id],
    );

    await observer.query("commit");
    return { personId, invitationId: created.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

/** The URL the action redirected to, taken from the signal `redirect` throws. */
async function redirectFrom(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("Expected the action to redirect, and it did not.");
}

describe("tapping Yes in a WhatsApp message", () => {
  it("records the answer and lands on the player's own events page, rendered", async () => {
    resetRsvpRateLimit();
    const { invitationId } = await invitation();

    // The token the dispatch puts behind the Yes button, minted the way
    // `delivery.ts` mints it.
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    const form = new FormData();
    form.set("token", yes.token);
    const destination = await redirectFrom(() => submitAnswer(form));

    // `/events/<t>?open=<invitation>` — the route this ticket created, carrying a
    // plaintext that exists nowhere else and cannot be read back out of the
    // database.
    const match = /^\/events\/([A-Za-z0-9_%-]+)\?open=(.+)$/.exec(destination);
    expect(match, `unexpected destination ${destination}`).not.toBeNull();
    const durableToken = decodeURIComponent(match![1]);
    expect(decodeURIComponent(match![2])).toBe(invitationId);

    // The answer really was recorded, not merely redirected about.
    const recorded = await observer.query<{ response: string }>(
      "select response::text as response from public.current_rsvp where invitation_id = $1",
      [invitationId],
    );
    expect(recorded.rows[0]?.response).toBe("yes");

    // And the page that plaintext opens renders, from the real credential, with
    // this player's own event on it. A credential minted for another journey, or
    // revoked by the next message before the player opened it, would `notFound`
    // here instead — which is exactly what happened before this ticket.
    const html = renderToStaticMarkup(
      await EventsPage({
        params: Promise.resolve({ token: durableToken }),
        searchParams: Promise.resolve({ open: invitationId }),
      }),
    );
    expect(html).toContain(EVENT_NAME);
  });

  it("lands on a page that still resolves after the next message mints its own link", async () => {
    resetRsvpRateLimit();
    const { invitationId } = await invitation();

    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    const form = new FormData();
    form.set("token", yes.token);
    const first = await redirectFrom(() => submitAnswer(form));
    const firstToken = decodeURIComponent(/^\/events\/([^?]+)/.exec(first)![1]);

    // A second dispatch to the same person — the case Brian decided on
    // 2026-09-11. Until LAN-343 this revoked the credential the player had just
    // been handed, so the link in their pocket was dead by the following month.
    const second = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));
    resetRsvpRateLimit();
    const secondForm = new FormData();
    secondForm.set("token", second.token);
    await redirectFrom(() => submitAnswer(secondForm));

    const html = renderToStaticMarkup(
      await EventsPage({
        params: Promise.resolve({ token: firstToken }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain(EVENT_NAME);
  });
});
