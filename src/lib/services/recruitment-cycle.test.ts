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

  // Brian, 2026-09-01: "the toggles were completely invented… Remove the
  // toggles." REQ-recruitment-cycle's per-step `enabled` is superseded — the
  // column stays in the database (no migration) but `RecruitmentCycleStep`
  // carries no `enabled` field any more, so there is nothing here to read.
  it("carries no enabled field — the per-step toggle is superseded (Brian, 2026-09-01)", async () => {
    const steps = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
    for (const step of steps) {
      expect(step).not.toHaveProperty("enabled");
    }
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
            offsetHours: 96,
          }),
        );
        expect(updated.offsetHours).toBe(96);
        expect(updated).not.toHaveProperty("enabled");

        const reread = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
        const rereadInterestAsk = reread.find((step) => step.step === "interest_ask");
        expect(rereadInterestAsk?.offsetHours).toBe(96);

        const auditRow = await withTransaction(async (tx) => {
          const result = await tx.query<{
            actor_person_id: string;
            action: string;
            entity_table: string;
            entity_id: string;
            context: {
              before: { offsetHours: number };
              after: { offsetHours: number };
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
        expect(auditRow.context.before.offsetHours).toBe(beforeInterestAsk.offsetHours);
        expect(auditRow.context.after.offsetHours).toBe(96);
      } finally {
        // Leave the club's configuration exactly as this suite found it.
        await withTransaction((tx) =>
          updateRecruitmentCycleStepIn(tx, actorPersonId, "interest_ask", {
            offsetHours: beforeInterestAsk.offsetHours,
          }),
        );
      }
    });
  });

  // Brian, 2026-09-01: the `enabled` column itself is left exactly as the
  // migration seeded it — this update never writes it — proving the
  // supersession is presentation-only, not a schema change.
  it("never writes the enabled column — it stays exactly as seeded", async () => {
    await withAuditActor(async (actorPersonId) => {
      const before = await withTransaction(async (tx) => {
        const result = await tx.query<{ enabled: boolean }>(
          `select enabled from public.recruitment_cycle_steps where step = 'interest_reminder'`,
        );
        return result.rows[0].enabled;
      });
      expect(before).toBe(false); // LAN-199's own seeded default, unchanged.

      await withTransaction((tx) =>
        updateRecruitmentCycleStepIn(tx, actorPersonId, "interest_reminder", {
          offsetHours: 150,
        }),
      );

      const after = await withTransaction(async (tx) => {
        const result = await tx.query<{ enabled: boolean }>(
          `select enabled from public.recruitment_cycle_steps where step = 'interest_reminder'`,
        );
        return result.rows[0].enabled;
      });
      expect(after).toBe(false); // Still false — this update never touched it.

      // Leave the club's configuration exactly as this suite found it.
      await withTransaction((tx) =>
        updateRecruitmentCycleStepIn(tx, actorPersonId, "interest_reminder", {
          offsetHours: 144,
        }),
      );
    });
  });

  it("never creates or deletes a row — exactly four before and after", async () => {
    await withAuditActor(async (actorPersonId) => {
      const before = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
      await withTransaction((tx) =>
        updateRecruitmentCycleStepIn(tx, actorPersonId, "welcome", {
          offsetHours: 0,
        }),
      );
      const after = await withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
      expect(after).toHaveLength(before.length);
      expect(after).toHaveLength(4);
    });
  });
});
