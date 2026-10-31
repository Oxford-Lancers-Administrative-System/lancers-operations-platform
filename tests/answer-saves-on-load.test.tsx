/**
 * A WhatsApp Yes saves when the page loads, and an email one waits for a
 * touch — LAN-498 (Brian, 31 October 2026).
 *
 * ## The defect
 *
 * Clint's players tapped Yes in WhatsApp, read "You're attending", and left.
 * Nothing was saved: the GET writes nothing, and the page submitted only after
 * a touch or scroll. `answer-lands-on-the-events-page.test.ts` calls the POST
 * directly, so it could never see that the POST was never sent.
 *
 * ## What this walks instead
 *
 * The message really dispatched through `dispatchJob` with an injected
 * transport, so the token is the one a phone would have received and its
 * channel is whatever the delivery record says. Then the real GET page is
 * rendered in jsdom with its real client components and its real form action,
 * so `SubmitOnLoad` calls `requestSubmit()` and React invokes `submitAnswer`
 * against the local database exactly as it would after hydration. The page is
 * then unmounted — the player closing it — and the answer is read back on a
 * separate connection, the operator's fresh read.
 *
 * Mocked only: `next/headers` (a real phone's User-Agent and the gate cookie
 * `src/proxy.ts` set on the GET) and `next/navigation` (`redirect` records
 * where the committed POST would have sent the browser).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const redirects: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirects.push(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "203.0.113.98",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    }),
  cookies: async () => ({
    get: (name: string) => (name === "lo_pa_gate" ? { value: "1" } : undefined),
  }),
}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { dispatchJob } from "@/lib/services/delivery";
import { readAnswerTokenChannelIn } from "@/lib/services/player-answer-tokens";
import { withTransaction } from "@/lib/db";

import AnswerLinkPage from "@/app/a/[answer]/[token]/page";

import {
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "./helpers/service-layer";

const MARKER = "LAN498SaveOnLoadSuite";
const EVENT_NAME = `${MARKER} practice`;

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

let observer: Client;
let seasonId: string;
let serial = 0;

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  // Archived, so no "current season" read in a parallel suite sees it.
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2019-09-01', '2020-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  cleanup();
  redirects.length = 0;
  await clearRecipientSafetyState(observer);

  // Event-scoped rows, keyed by the event's name ($1).
  const events = "(select id from public.events where name = $1)";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  for (const statement of [
    `delete from public.delivery_callbacks where delivery_attempt_id in
       (select id from public.delivery_attempts where notification_job_id in ${jobs})`,
    `delete from public.delivery_results where notification_job_id in ${jobs}`,
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    `delete from public.audit_events where entity_id in ${jobs} or entity_id in ${invitations}`,
    `delete from public.notification_jobs where event_id in ${events}`,
    `delete from public.rsvp_responses where invitation_id in ${invitations}`,
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
  ]) {
    await observer.query(statement, [EVENT_NAME]);
  }

  // Person-scoped rows, keyed by the marker ($1).
  const people = "(select id from public.people where given_name = $1)";
  for (const statement of [
    `delete from public.person_access_tokens where person_id in ${people}`,
    `delete from public.audit_events where entity_id in ${people} or actor_person_id in ${people}`,
  ]) {
    await observer.query(statement, [MARKER]);
  }
  for (const statement of [
    `delete from public.invitations where event_id in ${events}`,
    `delete from public.event_audience_members where event_id in ${events}`,
    "delete from public.events where name = $1",
  ]) {
    await observer.query(statement, [EVENT_NAME]);
  }
  for (const statement of [
    `delete from public.season_memberships where person_id in ${people}`,
    `delete from public.contact_points where person_id in ${people}`,
    "delete from public.people where given_name = $1",
  ]) {
    await observer.query(statement, [MARKER]);
  }
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/** One approved event two days out, one player with a usable route, one pending invitation job on `channel`. */
async function fixture(channel: "whatsapp" | "email") {
  serial += 1;
  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Invitee', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const personId = person.rows[0].id;
    if (channel === "whatsapp") {
      // Ofcom's drama range: never dialable.
      await observer.query(
        `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
         values ($1, 'phone', $2, true)`,
        [personId, `07700 9004${String(90 + serial).padStart(2, "0")}`],
      );
    } else {
      await observer.query(
        `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
         values ($1, 'email', $2, $2)`,
        [personId, `lan498.${serial}@example.test`],
      );
    }
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );
    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + interval '48 hours') at time zone 'Europe/London' as local)
       insert into public.events
         (season_id, name, event_type, status, scheduled_on, starts_at,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id, template_id)
       select $1, $2, 'practice', 'approved',
              (select local::date from target), (select local::time from target),
              now(), $3, now(), $3,
              (select tpl.id from public.event_templates tpl where tpl.event_type = 'practice' order by lower(tpl.name) limit 1)
       returning id`,
      [seasonId, EVENT_NAME, personId],
    );
    const eventId = event.rows[0].id;
    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, invitee_person_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4, $4) returning id`,
      [eventId, seasonId, membership.rows[0].id, personId],
    );
    const invitation = await observer.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
       values ($1, 'approved', $2, 'player', $3, 'pending', $4) returning id`,
      [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
    );
    const job = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
       values ($1, 'invitation', 'pending', $2, $3, $4, $5::public.notification_channel) returning id`,
      [`${MARKER}:${eventId}`, invitation.rows[0].id, eventId, personId, channel],
    );
    await observer.query("commit");
    return { invitationId: invitation.rows[0].id, jobId: job.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

const ANSWER_TOKEN = /\b([yn]\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43})\b/g;

/** Dispatches the job for real and returns the Yes and No tokens the message carried. */
async function dispatched(jobId: string): Promise<{ yes: string; no: string }> {
  const bodies: string[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const id = `${MARKER}.${crypto.randomUUID()}`;
    return new Response(JSON.stringify(url.endsWith("/emails") ? { id } : { messages: [{ id }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  expect(await dispatchJob(jobId, { source: CONFIGURED, transport })).toBe("accepted");
  const tokens = [...new Set([...bodies.join("\n").matchAll(ANSWER_TOKEN)].map((m) => m[1]))];
  const yes = tokens.find((token) => token.startsWith("y."));
  const no = tokens.find((token) => token.startsWith("n."));
  expect(yes, "the message carried a Yes token").toBeDefined();
  expect(no, "the message carried a No token").toBeDefined();
  return { yes: yes!, no: no! };
}

async function standing(invitationId: string) {
  const result = await observer.query<{ response: string; reason: string | null }>(
    "select response::text as response, reason from public.current_rsvp where invitation_id = $1",
    [invitationId],
  );
  return result.rows[0] ?? null;
}

async function responseRows(invitationId: string): Promise<number> {
  const result = await observer.query<{ n: number }>(
    "select count(*)::int as n from public.rsvp_responses where invitation_id = $1",
    [invitationId],
  );
  return result.rows[0].n;
}

/** The GET, rendered with its real client components, as a browser hydrates it. */
async function openPage(answer: "yes" | "no", token: string) {
  const element = await AnswerLinkPage({
    params: Promise.resolve({ answer, token }),
    searchParams: Promise.resolve({}),
  });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(element);
  });
  return view;
}

/** Lets an in-flight form action finish: it runs a real transaction, so this polls rather than guesses. */
async function settle(until: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!until() && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

describe("a WhatsApp Yes, page opened then closed with no interaction", () => {
  it("is committed, and visible on a fresh operator read", async () => {
    resetRsvpRateLimit();
    const { invitationId, jobId } = await fixture("whatsapp");
    const { yes } = await dispatched(jobId);

    expect(await withTransaction((tx) => readAnswerTokenChannelIn(tx, yes))).toBe("whatsapp");

    const view = await openPage("yes", yes);
    // Truthful before the commit: the save is in flight, nothing claims it.
    expect(view.container.textContent).not.toMatch(/you're attending/i);

    await settle(() => redirects.length > 0);
    view.unmount();

    expect(redirects).toHaveLength(1);
    expect(redirects[0]).toMatch(/^\/events\/[^?]+\?open=/);
    expect(await standing(invitationId)).toMatchObject({ response: "yes" });
    expect(await responseRows(invitationId)).toBe(1);
  });
});

describe("an email Yes", () => {
  it("is read as email, saves nothing on load, and saves on the first touch as before", async () => {
    resetRsvpRateLimit();
    const { invitationId, jobId } = await fixture("email");
    const { yes } = await dispatched(jobId);

    expect(await withTransaction((tx) => readAnswerTokenChannelIn(tx, yes))).toBe("email");

    await openPage("yes", yes);
    await settle(() => redirects.length > 0, 500);
    expect(redirects).toHaveLength(0);
    expect(await standing(invitationId)).toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    });
    await settle(() => redirects.length > 0);

    expect(await standing(invitationId)).toMatchObject({ response: "yes" });
  });
});

describe("the GET itself", () => {
  it("writes no rsvp row on either channel", async () => {
    resetRsvpRateLimit();
    const whatsapp = await fixture("whatsapp");
    const whatsappTokens = await dispatched(whatsapp.jobId);
    const email = await fixture("email");
    const emailTokens = await dispatched(email.jobId);

    // The server render alone — what a preview fetcher receives — never
    // reaches the form action.
    for (const [answer, token] of [
      ["yes", whatsappTokens.yes],
      ["no", whatsappTokens.no],
      ["yes", emailTokens.yes],
      ["no", emailTokens.no],
    ] as const) {
      await AnswerLinkPage({
        params: Promise.resolve({ answer, token }),
        searchParams: Promise.resolve({}),
      });
    }

    expect(await responseRows(whatsapp.invitationId)).toBe(0);
    expect(await responseRows(email.invitationId)).toBe(0);
  });
});

describe("a No still records its reason exactly as today", () => {
  it("a WhatsApp No saved on load records the default reason, for the events page to replace", async () => {
    resetRsvpRateLimit();
    const { invitationId, jobId } = await fixture("whatsapp");
    const { no } = await dispatched(jobId);

    const view = await openPage("no", no);
    await settle(() => redirects.length > 0);
    view.unmount();

    expect(await standing(invitationId)).toEqual({ response: "no", reason: "No reason given" });
  });

  it("an email No keeps the reason the player typed", async () => {
    resetRsvpRateLimit();
    const { invitationId, jobId } = await fixture("email");
    const { no } = await dispatched(jobId);

    const view = await openPage("no", no);
    const reason = view.container.querySelector<HTMLInputElement>('input[name="reason"]');
    expect(reason).not.toBeNull();
    reason!.value = "Exam the next morning";
    const button = [...view.container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Give a reason and continue",
    );
    await act(async () => {
      button!.click();
    });
    await settle(() => redirects.length > 0);

    expect(await standing(invitationId)).toEqual({
      response: "no",
      reason: "Exam the next morning",
    });
  });
});
