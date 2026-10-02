// @vitest-environment node
/**
 * The whole-club message queue — LAN-468.
 *
 * Read-only against the seeded local database, with the auth floor mocked:
 * `requireCapability` is the one dependency that is not a database read. The
 * one test that writes (the chase marker) does so inside a transaction it rolls
 * back, so nothing is left to clean up.
 *
 * What is proved is the query's shape and its bounds — a page never exceeds
 * `PAGE_SIZE`, every row sits inside its window, filters only narrow, pages do
 * not overlap, and a refused reader runs no query — plus the two pure rules the
 * page relies on (window days and the lights-out send time).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));

import { randomUUID } from "node:crypto";
import type { Client } from "pg";

import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { NO_GRANTS } from "@/lib/auth/grants";
import { todayInClubZone } from "@/lib/club-time";
import { closePool, NotPermitted } from "@/lib/db";
import { openObserver } from "../../../tests/helpers/service-layer";
import { buildListQuery, queuedTiming, readMessageQueue } from "./message-queue";
import { KIND_FAMILIES, PAGE_SIZE, windowDays } from "./message-queue-vocabulary";
import { onboardingChaseExhaustedMarkerKey } from "./onboarding-chase/chase-state";
import { WAITING_ALLOWANCE_LABEL } from "./messaging-safety/reasons";

const OPERATOR = {
  personId: "00000000-0000-4000-8000-000000000468",
  roleCodes: ["it_officer"],
  grants: NO_GRANTS,
} as unknown as ResolvedOperator;

let observer: Client;

/** The instant a club day starts, read from the database so the zone rule is PostgreSQL's own. */
async function dayStart(day: string): Promise<Date> {
  const result = await observer.query<{ at: Date }>(
    `select ($1::date)::timestamp at time zone 'Europe/London' as at`,
    [day],
  );
  return result.rows[0]!.at;
}

beforeAll(async () => {
  observer = await openObserver();
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

beforeEach(() => {
  vi.mocked(requireCapability).mockReset();
  vi.mocked(requireCapability).mockResolvedValue(OPERATOR);
});

describe("buildListQuery — the bounds, without a database", () => {
  const base = {
    fromDay: "2026-10-01",
    toDay: "2026-10-02",
    states: null,
    channel: null,
    kinds: null,
    forward: false,
    limit: PAGE_SIZE,
    offset: 0,
  };

  it("always carries a window and a limit no larger than a page", () => {
    const query = buildListQuery(base);
    expect(query.text.replace(/\s+/g, " ")).toMatch(/m\.at >= .*\$2.* and m\.at < .*\$3/);
    expect(query.text).toMatch(/limit \$7 offset \$8/);
    expect(query.values[1]).toBe("2026-10-01");
    expect(query.values[2]).toBe("2026-10-02");
    expect(query.values[6]).toBe(PAGE_SIZE);
  });

  it("refuses a page larger than PAGE_SIZE, an empty page and a negative offset", () => {
    expect(() => buildListQuery({ ...base, limit: PAGE_SIZE + 1 })).toThrow(RangeError);
    expect(() => buildListQuery({ ...base, limit: 0 })).toThrow(RangeError);
    expect(() => buildListQuery({ ...base, offset: -1 })).toThrow(RangeError);
  });

  it("orders soonest-first only when asked to read forward", () => {
    expect(buildListQuery(base).text).toMatch(/order by m\.at desc, m\.id desc/);
    expect(buildListQuery({ ...base, forward: true }).text).toMatch(
      /order by m\.at asc, m\.id asc/,
    );
  });
});

describe("windowDays", () => {
  it("is whole club days, half-open", () => {
    expect(windowDays("today", "2026-10-02")).toEqual({
      fromDay: "2026-10-02",
      toDay: "2026-10-03",
    });
    expect(windowDays("yesterday", "2026-10-02")).toEqual({
      fromDay: "2026-10-01",
      toDay: "2026-10-02",
    });
    expect(windowDays("last7", "2026-10-02")).toEqual({
      fromDay: "2026-09-26",
      toDay: "2026-10-03",
    });
    expect(windowDays("next7", "2026-12-28")).toEqual({
      fromDay: "2026-12-28",
      toDay: "2027-01-05",
    });
  });
});

describe("queuedTiming", () => {
  // 2026-10-02 is BST: 22:30 club time is 21:30Z, 07:00 is 06:00Z.
  const evening = new Date("2026-10-02T21:30:00Z");
  const noon = new Date("2026-10-02T11:00:00Z");
  const row = (over: Partial<Parameters<typeof queuedTiming>[0]>) => ({
    state: "queued",
    jobType: "reminder",
    at: evening,
    safetyReasonCode: null,
    safetyRetryAt: null,
    ...over,
  });

  it("moves an overnight moment to 07:00, and leaves a daytime one alone", () => {
    expect(queuedTiming(row({}), noon).sendsAt).toEqual(new Date("2026-10-03T06:00:00Z"));
    expect(queuedTiming(row({ at: noon }), new Date("2026-10-02T09:00:00Z")).sendsAt).toEqual(noon);
  });

  it("lets the three exempt notices go at any hour", () => {
    expect(queuedTiming(row({ jobType: "cancellation_notice" }), noon).sendsAt).toEqual(evening);
  });

  it("says what the safety guard is holding, in the existing words", () => {
    const timing = queuedTiming(row({ safetyReasonCode: "shared_pacing" }), noon);
    expect(timing.waiting).toBe(WAITING_ALLOWANCE_LABEL);
  });

  it("says nothing about a row that is not queued", () => {
    expect(queuedTiming(row({ state: "delivered" }), noon)).toEqual({
      sendsAt: null,
      waiting: null,
    });
  });
});

describe("readMessageQueue — against the seeded database", () => {
  it("refuses a reader without delivery_administration before reading anything", async () => {
    vi.mocked(requireCapability).mockRejectedValue(
      new NotPermitted("not permitted", { rule: "capability:delivery_administration" }),
    );
    await expect(readMessageQueue()).rejects.toBeInstanceOf(NotPermitted);
    expect(requireCapability).toHaveBeenCalledWith("delivery_administration");
  });

  it("returns at most one page, every row inside its window, newest first", async () => {
    const queue = await readMessageQueue({ window: "last7" });
    expect(queue.rows.length).toBeLessThanOrEqual(PAGE_SIZE);
    expect(queue.total).toBeGreaterThanOrEqual(queue.rows.length);

    const from = await dayStart(queue.fromDay);
    const to = await dayStart(queue.toDay);
    for (const row of queue.rows) {
      expect(row.at.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(row.at.getTime()).toBeLessThan(to.getTime());
    }
    const times = queue.rows.map((row) => row.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("reads the upcoming window soonest first, and its pages do not overlap", async () => {
    const first = await readMessageQueue({ window: "next7", page: 1 });
    expect(first.total).toBeGreaterThan(PAGE_SIZE); // the seed queues hundreds this week
    expect(first.rows).toHaveLength(PAGE_SIZE);
    const times = first.rows.map((row) => row.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const second = await readMessageQueue({ window: "next7", page: 2 });
    expect(second.total).toBe(first.total);
    const firstIds = new Set(first.rows.map((row) => row.id));
    expect(second.rows.some((row) => firstIds.has(row.id))).toBe(false);
    expect(second.rows[0]!.at.getTime()).toBeGreaterThanOrEqual(times.at(-1)!);
  });

  it("narrows by status, channel and kind, and never widens", async () => {
    const all = await readMessageQueue({ window: "next7" });

    const queued = await readMessageQueue({ window: "next7", status: "queued" });
    expect(queued.total).toBeLessThanOrEqual(all.total);
    expect(queued.rows.every((row) => row.state === "queued")).toBe(true);

    const email = await readMessageQueue({ window: "next7", channel: "email" });
    expect(email.total).toBeLessThanOrEqual(all.total);
    expect(email.rows.every((row) => row.channel === "email")).toBe(true);

    const reminders = await readMessageQueue({ window: "next7", kind: "reminder" });
    expect(reminders.rows.length).toBeGreaterThan(0);
    const reminderKinds: readonly string[] = KIND_FAMILIES.reminder;
    expect(reminders.rows.every((row) => reminderKinds.includes(row.kind))).toBe(true);
  });

  it("counts queued as exactly the jobs that will still send", async () => {
    const { summary } = await readMessageQueue();
    const direct = await observer.query<{ n: number }>(
      `select count(*)::int as n
         from public.notification_jobs j
        where j.held_at is null
          and j.status in ('pending', 'ready')
          and j.idempotency_key not like 'onboarding-chase-exhausted:%'
          and not (j.event_id is not null
                   and j.job_type not in ('escalation', 'cancellation_notice')
                   and not exists (
                     select 1 from public.events e
                      where e.id = j.event_id and e.status = 'approved'
                        and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                              at time zone 'Europe/London' > now()))`,
    );
    expect(summary.queued).toBe(direct.rows[0]!.n);
    expect(summary.dueNow).toBeLessThanOrEqual(summary.queued);
  });

  it("never lists the onboarding chase's ledger marker as a message", async () => {
    // Stages its own marker rather than relying on a scenario seed CI does not
    // run: the same insert the exhaustion sweep makes (`messaging-scheduler.ts`),
    // for a synthetic person, inside a transaction that is always rolled back.
    await observer.query("begin");
    try {
      const person = await observer.query<{ id: string }>(
        `insert into public.people (given_name, family_name)
         values ('LAN468Fixture', 'chase-marker') returning id`,
      );
      const marker = await observer.query<{ id: string }>(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, person_id, template_variables)
         values ($1, 'other', 'completed', $2::uuid, '{}'::jsonb)
         returning id::text as id`,
        [onboardingChaseExhaustedMarkerKey(randomUUID()), person.rows[0]!.id],
      );
      const markerId = marker.rows[0]!.id;

      // Newest first from the end of the upcoming window: the just-written
      // marker is the newest `other` row, so without the exclusion it is listed.
      const query = buildListQuery({
        fromDay: "2000-01-01",
        toDay: windowDays("next7", todayInClubZone()).toDay,
        states: null,
        channel: null,
        kinds: ["other"],
        forward: false,
        limit: PAGE_SIZE,
        offset: 0,
      });
      const listed = await observer.query<{ id: string }>(query.text, query.values);
      expect(listed.rows.some((row) => row.id === markerId)).toBe(false);
    } finally {
      await observer.query("rollback");
    }
  });
});
