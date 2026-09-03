// @vitest-environment node
/**
 * The sectioned activity log — LAN-214, `REQ-activity-log`. Against the real
 * local database: what is under test is the append-only grant and the
 * grouping-by-section read, neither of which a mocked transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  readOnboardingActivityLogBySectionIn,
  readOnboardingActivityLogIn,
  recordOnboardingActivityIn,
} from "./onboarding-activity-log";

const MARKER = "LAN214ActivityLog";

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let membershipId: string;

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);

  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, actorPersonId],
  );
  seasonId = season.rows[0].id;

  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Fixture') returning id",
    [MARKER],
  );
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date) returning id`,
    [person.rows[0].id, seasonId],
  );
  membershipId = membership.rows[0].id;
});

afterEach(async () => {
  await observer.query(
    "delete from public.onboarding_activity_log where season_membership_id = $1",
    [membershipId],
  );
});

afterAll(async () => {
  await observer.query("delete from public.season_memberships where id = $1::uuid", [membershipId]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("recordOnboardingActivityIn", () => {
  it("writes one ask entry with when, how and who", async () => {
    const entry = await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "welcome",
        kind: "ask",
        channel: "whatsapp",
        actorLabel: "the club",
      }),
    );
    expect(entry.kind).toBe("ask");
    expect(entry.section).toBe("welcome");
    expect(entry.channel).toBe("whatsapp");
    expect(entry.occurredAt).toBeInstanceOf(Date);

    const rows = await withTransaction((tx) => readOnboardingActivityLogIn(tx, membershipId));
    expect(rows).toHaveLength(1);
  });

  it("refuses an answer that names nobody", async () => {
    const failure = await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "code_of_conduct",
        kind: "answer",
        channel: "link",
      }),
    ).catch((error: unknown) => error);
    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_activity_log_answer_names_someone",
    );
  });

  it("carries one entry per ask AND per answer — never a count", async () => {
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "code_of_conduct",
        kind: "ask",
        channel: "whatsapp",
        actorLabel: "the club",
      }),
    );
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "code_of_conduct",
        kind: "answer",
        channel: "link",
        actorPersonId,
      }),
    );

    const rows = await withTransaction((tx) => readOnboardingActivityLogIn(tx, membershipId));
    expect(rows.map((r) => r.kind).sort()).toEqual(["answer", "ask"]);
  });

  it("groups the log by section — OD7-log-by-section", async () => {
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "welcome",
        kind: "ask",
        channel: "whatsapp",
        actorLabel: "the club",
      }),
    );
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "photo_release",
        kind: "ask",
        channel: "whatsapp",
        actorLabel: "the club",
      }),
    );
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "photo_release",
        kind: "answer",
        channel: "link",
        actorPersonId,
      }),
    );

    const grouped = await withTransaction((tx) =>
      readOnboardingActivityLogBySectionIn(tx, membershipId),
    );
    const bySection = new Map(grouped.map((g) => [g.section, g.entries.length]));
    expect(bySection.get("welcome")).toBe(1);
    expect(bySection.get("photo_release")).toBe(2);
  });
});
