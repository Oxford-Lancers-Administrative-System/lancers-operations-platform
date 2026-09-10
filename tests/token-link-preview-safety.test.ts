// @vitest-environment node
/**
 * A link-preview crawler's `GET` of a token route changes nothing — LAN-269
 * item 5, and its acceptance: "a preview fetch of a token link changes nothing
 * in the database".
 *
 * ## What is actually being modelled
 *
 * Every link this club sends is pasted into WhatsApp or iMessage, and both
 * fetch the URL to build the card shown in the chat. That fetch happens before
 * the recipient has seen the message, and once per participant's client. It is
 * an ordinary anonymous `GET`, it runs no JavaScript, and it never submits
 * anything.
 *
 * So each page's server function is **awaited and not mounted**. Awaiting it
 * runs every server-side read the request performs; not mounting it is what a
 * crawler does, because a crawler parses the `<head>` and stops. Rendering with
 * `@testing-library/react` would run `useEffect`, which is precisely the thing
 * only a real browser does — and the mechanism under test.
 *
 * ## Why the whole token table, and not a row count
 *
 * `use_count` and `last_used_at` are `update`s, not inserts. Counting rows
 * proves nothing about them, and the five-table count that
 * `public-calendar-side-effects.test.ts` uses would pass while a stamp fired on
 * every one of these routes — which is what happened before this ticket. The
 * snapshot below is every mutable column of every token table, plus the
 * participation tables, taken either side of the fetch.
 *
 * ## Brian's rule, recorded once (LAN-269 comment, and LAN-280)
 *
 * "No single-use or stamped link consumes itself on GET; consumption happens on
 * the first real interaction." The last block proves the other half: the
 * counters still move when a person actually opens the link.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { hashClubLinkToken, issueClubLinkIn } from "@/lib/services/club-link";
import { issueAnswerTokenIn, issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  mintRecruitmentSignupCodeIn,
  readLiveRecruitmentSignupCodeIn,
} from "@/lib/services/recruitment-signup-codes";
import { hashToken, issueTokenIn } from "@/lib/services/rsvp-tokens";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";

import RsvpPage from "@/app/rsvp/[token]/page";
import PlayerHomePage from "@/app/me/[token]/page";
import AnswerPage from "@/app/a/[token]/page";
import ClubLinkPage from "@/app/e/[token]/page";
import JoinPage from "@/app/join/[code]/page";
import { noteRsvpLinkOpened } from "@/app/rsvp/[token]/actions";
import { noteClubLinkOpened } from "@/app/e/[token]/actions";

import { openObserver } from "./helpers/service-layer";

let observer: Client;

/** The three token tables, every column a read could plausibly move. */
const TOKEN_SNAPSHOT = `
  select 'rsvp' as kind, id::text, use_count::text as a, last_used_at::text as b,
         revoked_at::text as c, null as d
    from public.rsvp_access_tokens
  union all
  select 'club', id::text, use_count::text, last_used_at::text,
         revoked_at::text, null
    from public.club_link_tokens
  union all
  select 'person', id::text, null, null,
         revoked_at::text, single_use_at::text
    from public.person_access_tokens
  union all
  select 'signup', id::text, sign_in_count::text, null,
         deactivated_at::text, null
    from public.recruitment_signup_codes
   order by 1, 2`;

/**
 * The five kinds of record a public read must not create, from
 * `REQ-public-calendar`, plus the two a token route could.
 */
const COUNTED_TABLES = [
  "event_audience_members",
  "invitations",
  "rsvp_responses",
  "attendance_records",
  "notification_jobs",
  "recruitment_prospects",
  "people",
] as const;

interface Snapshot {
  readonly tokens: string;
  readonly counts: string;
}

async function snapshot(): Promise<Snapshot> {
  const tokens = await observer.query(TOKEN_SNAPSHOT);
  const selects = COUNTED_TABLES.map(
    (table) => `(select count(*) from public.${table}) as ${table}`,
  ).join(", ");
  const counts = await observer.query(`select ${selects}`);
  return {
    tokens: JSON.stringify(tokens.rows),
    counts: JSON.stringify(counts.rows[0]),
  };
}

interface Subjects {
  readonly rsvpToken: string;
  readonly clubToken: string;
  readonly personToken: string;
  readonly answerToken: string;
  readonly signupCode: string;
}

let subjects: Subjects;

beforeAll(async () => {
  observer = await openObserver();
  // Issuing and resolving must agree on the key, and the route reads
  // `process.env`. A local slot already has one; an environment without one
  // gets a value that signs nothing outside this file.
  process.env.CLUB_LINK_SECRET ??= "token-preview-safety-suite-signing-key-0001";

  // An approved, future event in the active season that somebody is invited to.
  // Every token below hangs off it, so one row settles all four routes and the
  // suite adds no events of its own.
  const invitation = await observer.query<{
    invitation_id: string;
    event_id: string;
    person_id: string;
    season_id: string;
  }>(
    `select i.id as invitation_id, e.id as event_id,
            coalesce(i.person_id, m.person_id) as person_id, e.season_id
       from public.invitations i
       join public.events e on e.id = i.event_id
       join public.seasons s on s.id = e.season_id
       left join public.season_memberships m on m.id = i.season_membership_id
      where e.status = 'approved'
        and s.status = any(array['open','active','closing']::public.season_status[])
        and (e.scheduled_on + coalesce(e.starts_at, '23:59')) > now()
        and coalesce(i.person_id, m.person_id) is not null
      order by e.scheduled_on
      limit 1`,
  );
  const row = invitation.rows[0];
  if (!row) throw new Error("the seeded season has no future approved event with an invitation");

  subjects = await withTransaction(async (tx) => {
    const rsvp = await issueTokenIn(tx, row.invitation_id);
    const club = await issueClubLinkIn(tx, row.event_id);
    const person = await issuePersonTokenIn(tx, row.person_id, row.season_id);
    const answer = await issueAnswerTokenIn(tx, row.invitation_id, "yes");
    // The seed does not mint one, and `/join/[code]` needs a live code to get
    // past its own `notFound()` — a route that 404s proves nothing about what a
    // reachable route writes.
    const code =
      (await readLiveRecruitmentSignupCodeIn(tx, row.season_id)) ??
      (await mintRecruitmentSignupCodeIn(tx, row.season_id));
    return {
      rsvpToken: rsvp.token,
      clubToken: club.token,
      personToken: person.token,
      answerToken: answer.token,
      signupCode: code.code,
    };
  });
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/** What a crawler does: run the server function, read the head, go away. */
async function crawl(fetchPage: () => Promise<unknown>): Promise<void> {
  resetRsvpRateLimit();
  try {
    await fetchPage();
  } catch (error) {
    // A terminal token renders `not-found.tsx`. That is still a `GET` that
    // reached the server and still must not have written anything, so the
    // navigation throw is swallowed and the snapshot is compared regardless.
    if (!(error instanceof Error) || !/NEXT_NOT_FOUND|REDIRECT:/.test(error.message)) throw error;
  }
}

const noQuery = Promise.resolve({});

describe("a preview crawler's GET of a token link", () => {
  it.each([
    [
      "/rsvp/[token]",
      () =>
        RsvpPage({ params: Promise.resolve({ token: subjects.rsvpToken }), searchParams: noQuery }),
    ],
    [
      "/me/[token]",
      () =>
        PlayerHomePage({
          params: Promise.resolve({ token: subjects.personToken }),
          searchParams: noQuery,
        }),
    ],
    [
      "/a/[token]",
      () =>
        AnswerPage({
          params: Promise.resolve({ token: subjects.answerToken }),
          searchParams: noQuery,
        }),
    ],
    [
      "/e/[token]",
      () =>
        ClubLinkPage({
          params: Promise.resolve({ token: subjects.clubToken }),
          searchParams: noQuery,
        }),
    ],
    ["/join/[code]", () => JoinPage({ params: Promise.resolve({ code: subjects.signupCode }) })],
  ])("changes no row on %s", async (_route, fetchPage) => {
    const before = await snapshot();
    await crawl(fetchPage as () => Promise<unknown>);
    const after = await snapshot();

    expect(after.tokens).toEqual(before.tokens);
    expect(after.counts).toEqual(before.counts);
  });

  it("changes no row when the token is a guess", async () => {
    const before = await snapshot();
    const invented = "x".repeat(43);
    await crawl(() =>
      RsvpPage({ params: Promise.resolve({ token: invented }), searchParams: noQuery }),
    );
    await crawl(() =>
      ClubLinkPage({ params: Promise.resolve({ token: invented }), searchParams: noQuery }),
    );
    const after = await snapshot();

    expect(after.tokens).toEqual(before.tokens);
    expect(after.counts).toEqual(before.counts);
  });
});

/**
 * The other half of the rule. If a `GET` counts nothing, something has to, or
 * Q2 — whether club links need expiry — loses the number it is settled from.
 */
describe("a real browser opening the link", () => {
  // A delta rather than an absolute count. `issueClubLinkIn` is idempotent per
  // event — it hands back the live row instead of minting a second one — so
  // this token's counter survives between runs of the suite against one
  // database, and `toBe(1)` would pass once and then never again.
  it("counts the RSVP link once the page has actually run", async () => {
    resetRsvpRateLimit();
    const before = await useCount("rsvp", subjects.rsvpToken);

    await noteRsvpLinkOpened(subjects.rsvpToken);

    expect(await useCount("rsvp", subjects.rsvpToken)).toBe(before + 1);
  });

  it("counts the club link once the page has actually run", async () => {
    resetRsvpRateLimit();
    const before = await useCount("club", subjects.clubToken);

    await noteClubLinkOpened(subjects.clubToken);

    expect(await useCount("club", subjects.clubToken)).toBe(before + 1);
  });

  it("counts nothing for a token nobody was ever issued", async () => {
    resetRsvpRateLimit();
    const before = await snapshot();

    await noteRsvpLinkOpened("y".repeat(43));
    await noteClubLinkOpened("y".repeat(43));

    expect((await snapshot()).tokens).toEqual(before.tokens);
  });
});

/**
 * `use_count` for one issued token, read through its digest.
 *
 * Each digest comes from the module that stores it, rather than from a second
 * `sha256` written here: the two happen to agree today, and a test that
 * re-implements what it is checking stops checking it the day they stop.
 */
async function useCount(kind: "rsvp" | "club", token: string): Promise<number> {
  const table = kind === "rsvp" ? "rsvp_access_tokens" : "club_link_tokens";
  const digest = kind === "rsvp" ? hashToken(token) : hashClubLinkToken(token);
  const result = await observer.query<{ use_count: number }>(
    `select use_count from public.${table} where token_hash = $1`,
    [digest],
  );
  if (!result.rows[0]) throw new Error(`no ${table} row for the issued token`);
  return Number(result.rows[0].use_count);
}
