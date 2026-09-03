// @vitest-environment node
/**
 * Onboarding's chase configuration — LAN-214, `W11`. Against the real local
 * database: what is under test is the singleton row's read/write and that
 * the escalation office resolves through `messaging-scheduler.ts`'s own
 * `currentPresidentIn`, not a second implementation.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { currentPresidentIn } from "./messaging-scheduler";
import {
  currentOnboardingEscalationOfficeIn,
  readOnboardingChaseSettingsIn,
  setOnboardingChaseSettingsIn,
} from "./onboarding-chase";

let observer: Client;
let actorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

afterEach(async () => {
  // Restore the migration's own seeded values, so this suite leaves no trace
  // for the next one — there is exactly one row, shared across the database.
  await observer.query(
    `update public.onboarding_chase_settings
        set first_chase_after_hours = 48, chase_count = 4, chase_interval_days = 3
      where id`,
  );
  await observer.query("delete from public.audit_events where entity_table = $1", [
    "onboarding_chase_settings",
  ]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

describe("readOnboardingChaseSettingsIn", () => {
  it("reads the migration's own seeded singleton", async () => {
    const settings = await withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
    expect(settings).toMatchObject({
      firstChaseAfterHours: 48,
      chaseCount: 4,
      chaseIntervalDays: 3,
    });
  });
});

describe("setOnboardingChaseSettingsIn", () => {
  it("updates the three values in place", async () => {
    const settings = await withTransaction((tx) =>
      setOnboardingChaseSettingsIn(tx, {
        actorPersonId,
        firstChaseAfterHours: 72,
        chaseCount: 6,
        chaseIntervalDays: 2,
      }),
    );
    expect(settings).toMatchObject({
      firstChaseAfterHours: 72,
      chaseCount: 6,
      chaseIntervalDays: 2,
    });

    const reread = await withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
    expect(reread).toMatchObject({ firstChaseAfterHours: 72, chaseCount: 6, chaseIntervalDays: 2 });
  });

  /** `W11`'s own delegated decision, settled: a cap of zero is legal — no automated chase at all. */
  it("accepts a chase count of zero", async () => {
    const settings = await withTransaction((tx) =>
      setOnboardingChaseSettingsIn(tx, {
        actorPersonId,
        firstChaseAfterHours: 48,
        chaseCount: 0,
        chaseIntervalDays: 3,
      }),
    );
    expect(settings.chaseCount).toBe(0);
  });
});

describe("currentOnboardingEscalationOfficeIn", () => {
  it("is messaging-scheduler.ts's own currentPresidentIn, not a second resolver", () => {
    expect(currentOnboardingEscalationOfficeIn).toBe(currentPresidentIn);
  });
});
