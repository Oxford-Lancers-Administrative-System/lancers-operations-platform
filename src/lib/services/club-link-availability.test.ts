// @vitest-environment node
/**
 * What `/e/<token>` does when a whole squad opens the **same** link at once —
 * W157-R1, LAN-157. And, at the end, the stored mismatch vocabulary asserted
 * against the live view rather than against a filename (R157C-A2).
 *
 * ## Why this file exists rather than another case in `./club-link.test.ts`
 *
 * The defect it guards is not reachable from a single call. It was a property
 * of *concurrency*: resolution stamped `use_count` inside the caller's
 * transaction, so every reader of one link took that link's single row lock and
 * held it, along with a pooled connection, until the participation read
 * committed. Readers of one link therefore queued behind each other; readers of
 * four links did not. Past roughly thirty simultaneous readers the pool filled
 * with waiters, later arrivals exceeded `connectionTimeoutMillis`, and Next
 * served its own error page instead of this package's unavailable panel — so
 * the squad was told the club's system was broken at the exact moment the
 * operator had just pasted the link into the group.
 *
 * Every unit test in this package passes against that code, and would have gone
 * on passing: one request at a time never meets the lock. That is the second
 * time this package's `react-dom/server` tests have missed a real-runtime
 * failure — the first was MUI v9's `<Stack divider>` throwing during server
 * rendering — and it is recorded as a limitation in the pull request rather
 * than papered over here.
 *
 * ## The instrument
 *
 * Not a load generator. Load reproduces the defect but reproduces it
 * *statistically*, and a threshold test is a flaky test. What the fix actually
 * establishes is an invariant — **reading a club link must not wait on that
 * link's row** — and an invariant can be asserted directly: hold the row from
 * another connection, then read the link from more callers than the pool has
 * connections. Against the defect every one of them queues on the tuple and the
 * pool is exhausted; against the fix none of them touches it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, getPool, withTransaction } from "@/lib/db";
import { issueClubLinkIn, recordClubLinkUse, resolveClubLinkIn } from "./club-link";
import { readClubLinkParticipation } from "./participation";
import { STORED_MISMATCH_CLASSES } from "./discrepancy-vocabulary";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN157AvailabilitySuite";
const SECRET = { CLUB_LINK_SECRET: "availability-suite-signing-key-0123456789" };

/**
 * More simultaneous readers than the pool has connections, which is the
 * condition the defect needed. Asserted against the live pool below rather than
 * assumed, so that raising `DATABASE_POOL_MAX` past it fails loudly instead of
 * quietly turning this file into a test of nothing.
 */
const READERS = 24;

let observer: Client;
let actorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [await seededIdentityCreatedAt(observer)],
  );
  expect(people.rows.length).toBeGreaterThan(0);
  actorPersonId = people.rows[0].id;
});

afterEach(async () => {
  const events = "(select id from public.events where name like $1)";
  await observer.query(`delete from public.club_link_tokens where event_id in ${events}`, [
    `${NAME_MARKER}%`,
  ]);
  await observer.query("delete from public.events where name like $1", [`${NAME_MARKER}%`]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/** An approved event, which is all a club link needs to open. */
async function anEvent(): Promise<string> {
  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
  );
  const inserted = await observer.query<{ id: string }>(
    `insert into public.events
       (season_id, name, event_type, origin, status, scheduled_on, starts_at,
        is_mandatory, owner_person_id,
        approved_at, approved_by_person_id,
        audience_confirmed_at, audience_confirmed_by_person_id)
     values ($1, $2, 'practice', 'club_controlled', 'approved',
             current_date, '19:00', true, $3, now(), $3, now(), $3)
     returning id`,
    [season.rows[0].id, `${NAME_MARKER} approved`, actorPersonId],
  );
  return inserted.rows[0].id;
}

async function aLink(): Promise<{ eventId: string; linkId: string; token: string }> {
  const eventId = await anEvent();
  const issued = await withTransaction((tx) =>
    issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
  );
  return { eventId, linkId: issued.linkId, token: issued.token };
}

async function useCountOf(linkId: string): Promise<number> {
  const row = await observer.query<{ use_count: number }>(
    "select use_count from public.club_link_tokens where id = $1",
    [linkId],
  );
  return row.rows[0].use_count;
}

// ---------------------------------------------------------------------------
// W157-R1 — one link, many readers
// ---------------------------------------------------------------------------

describe("a club link under simultaneous readers", () => {
  it("is opened by more readers at once than the pool has connections", async () => {
    const { token } = await aLink();
    // The control on the control: fewer readers than connections would prove
    // nothing about queueing, because nobody would ever have to wait.
    expect(READERS, "raise READERS above DATABASE_POOL_MAX").toBeGreaterThan(
      getPool().options.max ?? 10,
    );

    const pages = await Promise.all(
      Array.from({ length: READERS }, () => readClubLinkParticipation(token, { env: SECRET })),
    );

    // Every one of them got the squad list. Not "most of them", and not the
    // unavailable panel either: a request that fell back to `unavailable`
    // because the database refused it would be the same lie to the reader.
    expect(pages.map((page) => page.state)).toEqual(Array(READERS).fill("live"));
  });

  it("does not wait on the link's own row, even while somebody holds it", async () => {
    // The defect, stated as an invariant. `resolveClubLinkIn` used to stamp
    // `use_count` in the read transaction, so this held lock would have parked
    // every reader on the tuple with a pooled connection each — the first ten
    // on `Lock/tuple`, the rest timing out waiting for a connection that was
    // never coming back. Reading takes no lock on this row now, and the stamp
    // that does is `skip locked`, so neither half can queue here.
    const { linkId, token } = await aLink();

    const holder = await openObserver();
    try {
      await holder.query("begin");
      await holder.query("select id from public.club_link_tokens where id = $1 for update", [
        linkId,
      ]);

      const pages = await Promise.all(
        Array.from({ length: READERS }, () => readClubLinkParticipation(token, { env: SECRET })),
      );
      expect(pages.map((page) => page.state)).toEqual(Array(READERS).fill("live"));
    } finally {
      await holder.query("rollback");
      await holder.end();
    }
  });

  it("gives up the stamp rather than the page when the row is held", async () => {
    // The other half of the same invariant, asserted on the counter instead of
    // on the reader: a held row means the view goes uncounted, and it must not
    // mean the view fails. This is the loss `use_count` now carries.
    const { linkId, token } = await aLink();

    const holder = await openObserver();
    try {
      await holder.query("begin");
      await holder.query("select id from public.club_link_tokens where id = $1 for update", [
        linkId,
      ]);

      expect((await readClubLinkParticipation(token, { env: SECRET })).state).toBe("live");
      expect(await recordClubLinkUse(linkId)).toBe(false);
    } finally {
      await holder.query("rollback");
      await holder.end();
    }

    expect(await useCountOf(linkId)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// What the counter means now
// ---------------------------------------------------------------------------

describe("recording a club link's use", () => {
  it("is no longer done by resolving, which is a pure read", async () => {
    const { eventId, linkId, token } = await aLink();

    const resolved = await withTransaction((tx) => resolveClubLinkIn(tx, token, { env: SECRET }));
    expect(resolved).toEqual({ state: "live", linkId, eventId });
    expect(await useCountOf(linkId)).toBe(0);

    expect(await recordClubLinkUse(linkId)).toBe(true);
    expect(await useCountOf(linkId)).toBe(1);
  });

  it("counts an ordinary, uncontended view exactly once", async () => {
    const { linkId, token } = await aLink();
    expect((await readClubLinkParticipation(token, { env: SECRET })).state).toBe("live");
    expect(await useCountOf(linkId)).toBe(1);
  });

  it("is a floor on simultaneous views, not a count of them", async () => {
    // Stated as a test because Q2 — whether club links need expiry — will be
    // decided from this number, and whoever reads it should meet the
    // undercounting here rather than in the data. `skip locked` means two
    // requests landing in the same instant record one view between them.
    const { linkId, token } = await aLink();

    const pages = await Promise.all(
      Array.from({ length: READERS }, () => readClubLinkParticipation(token, { env: SECRET })),
    );
    expect(pages.map((page) => page.state)).toEqual(Array(READERS).fill("live"));

    const counted = await useCountOf(linkId);
    // At least one — "was this link opened at all", which is the question Q2
    // actually asks, survives the loss. Never more than the views themselves.
    expect(counted).toBeGreaterThanOrEqual(1);
    expect(counted).toBeLessThanOrEqual(READERS);
  });
});

// ---------------------------------------------------------------------------
// R157C-A2 — the stored vocabulary, against the view that actually shipped
// ---------------------------------------------------------------------------

describe("the stored mismatch vocabulary", () => {
  it("names every class the live view can emit, with no filename involved", async () => {
    // `./discrepancy-vocabulary.ts` claims it is pinned to the shipped view "so
    // a fifth class added to the view without a look at this file fails a test
    // rather than drifting quietly". The test that carried that claim read one
    // hardcoded migration filename — and migrations are forward-only, so a
    // change to this view arrives as a *new* file and left the assertion
    // reading a stale snapshot and passing.
    //
    // `pg_get_viewdef` has no such failure mode: it is the definition the
    // database is actually running, after every migration, whatever they were
    // called. `./participation-view.test.ts` resolves the latest defining
    // migration for the same guarantee without a database.
    const definition = await observer.query<{ body: string }>(
      "select pg_get_viewdef('public.rsvp_attendance_mismatches'::regclass, true) as body",
    );
    const body = definition.rows[0].body;

    // Case-insensitive, because this is not the migration's text: Postgres
    // re-prints the definition it parsed, so the arms come back as
    // `THEN 'said_no_but_attended'::text` however the migration spelled them.
    // That normalisation is the point — it is why this assertion cannot be
    // defeated by a later migration's formatting.
    const emitted = [...body.matchAll(/\bthen\s+'([a-z_]+)'/gi)].map((match) => match[1]);
    // The positive control. An empty scan would make every assertion below
    // vacuous, which is how the old spelling filter hid a class from itself.
    expect(emitted.length, "the view emits no literal classes").toBeGreaterThan(0);

    for (const value of emitted) {
      expect(STORED_MISMATCH_CLASSES as readonly string[], `the view emits ${value}`).toContain(
        value,
      );
    }
    for (const declared of STORED_MISMATCH_CLASSES) {
      expect(emitted, `${declared} is not in the live view`).toContain(declared);
    }
  });
});
