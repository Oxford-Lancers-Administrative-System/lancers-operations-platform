// @vitest-environment node
/**
 * The recruitment cycle's own four rows — LAN-203, `REQ-recruitment-cycle`.
 *
 * Against the **real** local database, on the same reasoning
 * `messaging-schedule.test.ts` gives for its own audit-write test: the
 * `entity_id` this module derives has to actually satisfy a `uuid not null`
 * column, and a mocked transaction would prove nothing about that.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closePool, withTransaction } from "@/lib/db";
import { deriveEntityIdFromNaturalKey } from "./audit";
import {
  listRecruitmentCycleStepsIn,
  updateRecruitmentCycleStepIn,
  type RecruitmentCycleStep,
} from "./recruitment-cycle";

afterAll(async () => {
  await closePool();
});

async function withAuditActor<T>(fn: (actorPersonId: string) => Promise<T>): Promise<T> {
  const actorPersonId = await withTransaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      ["LAN203Fixture", "AuditActor"],
    );
    return result.rows[0].id;
  });
  try {
    return await fn(actorPersonId);
  } finally {
    await withTransaction((tx) =>
      tx.query("delete from public.audit_events where actor_person_id = $1", [actorPersonId]),
    );
    await withTransaction((tx) =>
      tx.query("delete from public.people where id = $1", [actorPersonId]),
    );
  }
}

describe("listRecruitmentCycleStepsIn", () => {
  it("reads exactly the four seeded steps, in the cycle's own order", async () => {
    const steps = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
    expect(steps.map((step) => step.step)).toEqual([
      "welcome",
      "details_reminder",
      "interest_ask",
      "interest_reminder",
    ]);
  });

  it("seeds welcome, details_reminder and interest_ask on, and interest_reminder off — LAN-199", async () => {
    const steps = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
    const byStep = Object.fromEntries(steps.map((step) => [step.step, step]));
    expect(byStep.welcome.enabled).toBe(true);
    expect(byStep.details_reminder.enabled).toBe(true);
    expect(byStep.interest_ask.enabled).toBe(true);
    expect(byStep.interest_reminder.enabled).toBe(false);
  });

  it("fires welcome immediately on capture — offset zero", async () => {
    const steps = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
    expect(steps.find((step) => step.step === "welcome")?.offsetHours).toBe(0);
  });
});

describe("updateRecruitmentCycleStepIn", () => {
  it("writes the row and an audit row naming the actor, with a real uuid entity id", async () => {
    await withAuditActor(async (actorPersonId) => {
      const before = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
      const beforeInterestAsk = before.find(
        (step) => step.step === "interest_ask",
      ) as RecruitmentCycleStep;

      try {
        const updated = await withTransaction((tx) =>
          updateRecruitmentCycleStepIn(tx, actorPersonId, "interest_ask", {
            enabled: false,
            offsetHours: 96,
          }),
        );
        expect(updated.enabled).toBe(false);
        expect(updated.offsetHours).toBe(96);

        const reread = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
        const rereadInterestAsk = reread.find((step) => step.step === "interest_ask");
        expect(rereadInterestAsk?.enabled).toBe(false);
        expect(rereadInterestAsk?.offsetHours).toBe(96);

        const auditRow = await withTransaction(async (tx) => {
          const result = await tx.query<{
            actor_person_id: string;
            action: string;
            entity_table: string;
            entity_id: string;
            context: {
              before: { enabled: boolean; offsetHours: number };
              after: { enabled: boolean; offsetHours: number };
            };
          }>(
            `select actor_person_id, action, entity_table, entity_id, context
               from public.audit_events
              where entity_table = 'recruitment_cycle_steps' and actor_person_id = $1
              order by occurred_at desc
              limit 1`,
            [actorPersonId],
          );
          return result.rows[0];
        });

        expect(auditRow).toBeDefined();
        expect(auditRow.action).toBe("recruitment_cycle_step.changed");
        expect(auditRow.entity_id).toBe(
          deriveEntityIdFromNaturalKey("recruitment_cycle_steps", "interest_ask"),
        );
        expect(auditRow.context.before.enabled).toBe(beforeInterestAsk.enabled);
        expect(auditRow.context.after.enabled).toBe(false);
        expect(auditRow.context.after.offsetHours).toBe(96);
      } finally {
        // Leave the club's configuration exactly as this suite found it.
        await withTransaction((tx) =>
          updateRecruitmentCycleStepIn(tx, actorPersonId, "interest_ask", {
            enabled: beforeInterestAsk.enabled,
            offsetHours: beforeInterestAsk.offsetHours,
          }),
        );
      }
    });
  });

  it("never creates or deletes a row — exactly four before and after", async () => {
    await withAuditActor(async (actorPersonId) => {
      const before = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
      await withTransaction((tx) =>
        updateRecruitmentCycleStepIn(tx, actorPersonId, "welcome", {
          enabled: true,
          offsetHours: 0,
        }),
      );
      const after = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
      expect(after).toHaveLength(before.length);
      expect(after).toHaveLength(4);
    });
  });
});
