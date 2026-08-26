// @vitest-environment node
/**
 * The messaging plan's arithmetic — LAN-169.
 *
 * Against the **real** local database, and it has to be. Every instant here is
 * resolved by PostgreSQL against the IANA timezone database, because "two days
 * before this event's start" is a wall-clock rule and Britain changes offset
 * twice inside a season. A mocked transaction would prove the JavaScript around
 * the arithmetic and nothing about the arithmetic.
 *
 * Fixed clock values throughout, never `new Date()`, because W1's acceptance
 * asks for exactly that: "asserted by test against fixed clock values rather
 * than by inspection".
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closePool, withTransaction } from "@/lib/db";
import { deriveEntityIdFromNaturalKey } from "./audit";

import {
  buildLadder,
  listMessagingSchedulesIn,
  listMessagingSchedulesWithPreview,
  resolveMessagingPlanIn,
  readMessagingScheduleIn,
  updateMessagingScheduleIn,
  type MessagingScheduleChange,
} from "./messaging-schedule";

afterAll(async () => {
  await closePool();
});

/**
 * A practice: RSVP two days before, invitation five days before, cadence 24h.
 * `invitationLeadDays` is the seeded `rsvpByDays + 3` (LAN-169's original
 * default). Round 3, OWNER-LAN171-06: a migration that would have moved this
 * to `+ 2`, matching the invitation now counting as WhatsApp #1 (round 2,
 * Q-19, OWNER-LAN171-05), was ruled out — this package exists to make the
 * value editable in the application, not by migration. The unedited default
 * therefore leaves a one-day gap ahead of the deadline until the club edits
 * it by hand.
 */
const PRACTICE = { eventType: "practice", scheduledOn: "2026-10-18", startsAt: "20:00" };

/** A game: RSVP seven days before, invitation ten days before. */
const GAME = { eventType: "game", scheduledOn: "2026-10-18", startsAt: "14:00" };

function planFor(event: typeof PRACTICE, asOf: string) {
  return withTransaction((tx) => resolveMessagingPlanIn(tx, event, new Date(asOf)));
}

describe("the deadline", () => {
  it("counts back from the event's own start, not from a fixed clock", async () => {
    // `REQ-deadline-from-event-start`. A 20:00 practice answers by 20:00 two
    // days before; a 14:00 game by 14:00 seven days before. ADR 0021's day
    // counts are unchanged and its 18:00 anchor is retired.
    const practice = await planFor(PRACTICE, "2026-10-01T09:00:00Z");
    expect(practice.responseDeadlineAt.toISOString()).toBe("2026-10-16T19:00:00.000Z");

    const game = await planFor(GAME, "2026-10-01T09:00:00Z");
    expect(game.responseDeadlineAt.toISOString()).toBe("2026-10-11T13:00:00.000Z");
  });

  it("subtracts days on the calendar, not 48 hours, across a clock change", async () => {
    // British Summer Time ends on 25 October 2026. A practice on the 27th at
    // 20:00 GMT is answered by 20:00 GMT on the 25th — after the change — and
    // "two days" therefore spans 49 real hours, not 48. Subtracting a fixed
    // duration would land an hour out, twice a year, for a whole season.
    const plan = await withTransaction((tx) =>
      resolveMessagingPlanIn(
        tx,
        { eventType: "practice", scheduledOn: "2026-10-27", startsAt: "20:00" },
        new Date("2026-10-01T09:00:00Z"),
      ),
    );

    expect(plan.eventStartsAt.toISOString()).toBe("2026-10-27T20:00:00.000Z");
    expect(plan.responseDeadlineAt.toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(
      (plan.eventStartsAt.getTime() - plan.responseDeadlineAt.getTime()) / (60 * 60 * 1000),
    ).toBe(48);
  });

  it("clamps a deadline that has already passed, and never refuses the approval", async () => {
    // ADR 0021's second rule, which survives its own supersession. Responses are
    // due immediately, the approver is shown that before committing, and
    // approval is never refused for being late.
    const asOf = "2026-10-17T09:00:00Z";
    const plan = await planFor(PRACTICE, asOf);

    expect(plan.deadlineClamped).toBe(true);
    expect(plan.responseDeadlineAt.toISOString()).toBe(asOf.replace("Z", ".000Z"));
    expect(plan.configuredDeadlineAt.getTime()).toBeLessThan(plan.responseDeadlineAt.getTime());
  });
});

describe("the dispatch anchor", () => {
  it("holds an event further out than its own invitation lead", async () => {
    // `REQ-dispatch-anchor`. Approve a practice seventeen days out with a
    // five-day lead and nothing is sent for twelve days.
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");

    expect(plan.dispatchesImmediately).toBe(false);
    expect(plan.invitationAt.toISOString()).toBe("2026-10-13T19:00:00.000Z");
  });

  it("sends immediately when the event is closer than its lead, and says so", async () => {
    // Brian, 2026-08-22: "if practice happens in 2 days and we're approving and
    // we're sending it out, that needs to go out now, right? It should say
    // that." The guarantee is `dispatchesImmediately`, stated rather than left
    // to be derived from two instants by whoever renders the panel.
    const asOf = "2026-10-16T09:00:00Z";
    const plan = await planFor(PRACTICE, asOf);

    expect(plan.dispatchesImmediately).toBe(true);
    expect(plan.invitationAt.toISOString()).toBe(asOf.replace("Z", ".000Z"));
  });

  it("never sends into the past", async () => {
    const asOf = new Date("2026-10-17T09:00:00Z");
    const plan = await planFor(PRACTICE, asOf.toISOString());
    expect(plan.invitationAt.getTime()).toBeGreaterThanOrEqual(asOf.getTime());
  });
});

describe("the ladder", () => {
  it("counts forward from the invitation, on the cadence", async () => {
    // `REQ-count-forward`, and Brian's words on 2026-08-25: "Count forward from
    // the invitations." Anchoring backwards from the deadline was the earlier
    // model and produced the gap W7's preview exposed.
    //
    // Three rungs, not four (Q-19, OWNER-LAN171-05): the default policy's
    // `whatsappReminderCount` of 2 counts the invitation as WhatsApp #1, so
    // only one further WhatsApp reminder follows it, then the email reminder.
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");

    expect(plan.lateApproval).toBe(false);
    expect(plan.rungs.map((rung) => [rung.rung, rung.channel, rung.at.toISOString()])).toEqual([
      [0, "whatsapp", "2026-10-13T19:00:00.000Z"],
      [1, "whatsapp", "2026-10-14T19:00:00.000Z"],
      [2, "email", "2026-10-15T19:00:00.000Z"],
    ]);
  });

  it("lands the last reminder one cadence step before the deadline under the unedited default", async () => {
    // The invitation lead is the deadline plus the reminders *after the
    // invitation* times the cadence — that arithmetic still holds, it is
    // just that the seeded `invitation_lead_days` (LAN-169's original
    // `rsvp_by_days + 3`, left alone by OWNER-LAN171-06 in round 3) no
    // longer matches it now that the invitation itself counts as WhatsApp #1
    // (round 2, Q-19, OWNER-LAN171-05). One cadence step of slack is exactly
    // the gap the settings page's warning exists to surface until the club
    // edits the value by hand — see "the schedule page's worked example"
    // below.
    const plan = await planFor(GAME, "2026-10-01T09:00:00Z");
    const last = plan.rungs[plan.rungs.length - 1];
    expect(plan.responseDeadlineAt.getTime() - last.at.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("keeps WhatsApp, WhatsApp, email in that fixed order", async () => {
    // `REQ-ladder-order`. Only the spacing and the counts are configurable.
    // Invitation (WhatsApp #1) + one further WhatsApp reminder + one email
    // reminder (Q-19, OWNER-LAN171-05).
    const plan = await planFor(GAME, "2026-10-01T09:00:00Z");
    expect(plan.rungs.map((rung) => rung.channel)).toEqual(["whatsapp", "whatsapp", "email"]);
  });

  it("schedules no rung after the deadline it is chasing", async () => {
    const plan = await planFor(GAME, "2026-10-01T09:00:00Z");
    for (const rung of plan.rungs) {
      expect(rung.at.getTime()).toBeLessThanOrEqual(plan.responseDeadlineAt.getTime());
    }
  });
});

describe("a late approval", () => {
  it("still chases, WhatsApp only, and never escalates", async () => {
    // Brian, 2026-08-25, replacing compression entirely: "start now, fill the
    // time you have, guarantee one message, do not escalate." Approving the
    // practice with one day of runway left leaves one cadence step before the
    // deadline: under the corrected count (Q-19, OWNER-LAN171-05 — the
    // invitation counts as WhatsApp #1, so the policy wants one further
    // WhatsApp reminder plus one email after it) that one step is not enough
    // to carry both, so the WhatsApp reminder fits and the email rung does
    // not send at all.
    const plan = await planFor(PRACTICE, "2026-10-15T19:00:00Z");

    expect(plan.lateApproval).toBe(true);
    expect(plan.dispatchesImmediately).toBe(true);
    expect(plan.escalationAt).toBeNull();

    const reminders = plan.rungs.filter((rung) => rung.kind === "reminder");
    expect(reminders.map((rung) => rung.channel)).toEqual(["whatsapp"]);
    expect(reminders.some((rung) => rung.channel === "email")).toBe(false);
  });

  it("sends at least one WhatsApp however short the runway", async () => {
    // "At least one WhatsApp always goes out, however short the runway. No
    // approved event is ever silent." The message that guarantees it is the
    // invitation — rung 0, unconditional, always WhatsApp — which is why a
    // zero-length runway still produces a plan rather than a refusal.
    const plan = await planFor(PRACTICE, "2026-10-17T09:00:00Z");

    expect(plan.lateApproval).toBe(true);
    expect(plan.rungs).toHaveLength(1);
    expect(plan.rungs[0]).toMatchObject({ rung: 0, kind: "invitation", channel: "whatsapp" });
    expect(plan.escalationAt).toBeNull();
  });

  it("is not the same thing as dispatching immediately", async () => {
    // An event approved on its lead day exactly dispatches now and still has the
    // whole runway, so it runs the ordinary ladder and does escalate. Collapsing
    // the two would drop the email rung from every normally-timed event that
    // happened to be approved on the day.
    const plan = await planFor(PRACTICE, "2026-10-13T19:00:00Z");

    expect(plan.dispatchesImmediately).toBe(true);
    expect(plan.lateApproval).toBe(false);
    expect(plan.escalationAt).not.toBeNull();
  });
});

describe("escalation", () => {
  it("fires the configured hours after the deadline", async () => {
    // `REQ-escalation-threshold` and `REQ-schedule-defaults`: twelve hours after
    // the RSVP deadline, for every type.
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");
    expect(plan.escalationAt?.toISOString()).toBe("2026-10-17T07:00:00.000Z");
    expect(
      (plan.escalationAt!.getTime() - plan.responseDeadlineAt.getTime()) / (60 * 60 * 1000),
    ).toBe(12);
  });

  it("fires as the deadline passes when the club configures zero hours", async () => {
    // N = 0 is permitted, and a schedule change is honoured for events approved
    // afterwards.
    await withTransaction(async (tx) => {
      await tx.query(
        "update public.messaging_schedules set escalation_hours = 0 where event_type = 'chalk'",
      );
      const plan = await resolveMessagingPlanIn(
        tx,
        { eventType: "chalk", scheduledOn: "2026-10-18", startsAt: "20:00" },
        new Date("2026-10-01T09:00:00Z"),
      );
      expect(plan.escalationAt?.toISOString()).toBe(plan.responseDeadlineAt.toISOString());
      // Rolled back by the test harness? No — `withTransaction` commits. Put it
      // back explicitly, in the same transaction, so this suite leaves the
      // club's configuration exactly as it found it.
      await tx.query(
        "update public.messaging_schedules set escalation_hours = 12 where event_type = 'chalk'",
      );
    });

    const restored = await withTransaction((tx) => readMessagingScheduleIn(tx, "chalk"));
    expect(restored.escalationHours).toBe(12);
  });
});

describe("saving a schedule change, and the audit row that must accompany it", () => {
  // OWNER-LAN171-01: `updateMessagingScheduleIn` calls `recordAudit` with
  // `entityId: eventType` — a plain text label like `"practice"` — against a
  // column declared `uuid not null`. Postgres rejected every such insert, the
  // whole transaction rolled back, and the schedule UPDATE was discarded with
  // it: the save had never worked, for any row, since it shipped. This suite
  // is database-backed on purpose — the bug shipped because the package's
  // other tests mock at the service boundary, so nothing ever exercised
  // `recordAudit` against a real `audit_events` table.

  async function withAuditActor<T>(fn: (actorPersonId: string) => Promise<T>): Promise<T> {
    const actorPersonId = await withTransaction(async (tx) => {
      const result = await tx.query<{ id: string }>(
        "insert into public.people (given_name, family_name) values ($1, $2) returning id",
        ["LAN171Fixture", "AuditActor"],
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

  it("writes the schedule row and an audit row naming the actor, even though the row's own key is not a uuid", async () => {
    await withAuditActor(async (actorPersonId) => {
      const before = await withTransaction((tx) => readMessagingScheduleIn(tx, "recruitment"));
      const restore: MessagingScheduleChange = {
        rsvpByDays: before.rsvpByDays,
        invitationLeadDays: before.invitationLeadDays,
        reminderCadenceHours: before.reminderCadenceHours,
        whatsappReminderCount: before.whatsappReminderCount,
        emailReminderCount: before.emailReminderCount,
        escalationHours: before.escalationHours,
      };
      const changed: MessagingScheduleChange = { ...restore, escalationHours: 9 };

      try {
        // The real write, through the real service, against the real
        // database — not mocked. This is exactly the call that used to roll
        // back silently.
        const updated = await withTransaction((tx) =>
          updateMessagingScheduleIn(tx, actorPersonId, "recruitment", changed),
        );
        expect(updated.escalationHours).toBe(9);

        // The schedule row actually changed…
        const reread = await withTransaction((tx) => readMessagingScheduleIn(tx, "recruitment"));
        expect(reread.escalationHours).toBe(9);

        // …and the audit row actually exists, naming the actor and carrying
        // before/after — W7's attribution requirement.
        const auditRow = await withTransaction(async (tx) => {
          const result = await tx.query<{
            actor_person_id: string;
            action: string;
            entity_table: string;
            entity_id: string;
            context: { before: { escalationHours: number }; after: { escalationHours: number } };
          }>(
            `select actor_person_id, action, entity_table, entity_id, context
               from public.audit_events
              where entity_table = 'messaging_schedules' and actor_person_id = $1
              order by occurred_at desc
              limit 1`,
            [actorPersonId],
          );
          return result.rows[0];
        });

        expect(auditRow).toBeDefined();
        expect(auditRow.actor_person_id).toBe(actorPersonId);
        expect(auditRow.action).toBe("messaging_schedule.changed");
        expect(auditRow.entity_table).toBe("messaging_schedules");
        // Derived, deterministic, and a real uuid — not the literal
        // "recruitment" that used to reach this uuid-typed column and be
        // rejected by Postgres.
        expect(auditRow.entity_id).toBe(
          deriveEntityIdFromNaturalKey("messaging_schedules", "recruitment"),
        );
        expect(auditRow.context.before.escalationHours).toBe(before.escalationHours);
        expect(auditRow.context.after.escalationHours).toBe(9);
      } finally {
        // Leave the club's configuration exactly as this suite found it —
        // `withTransaction` commits, so the restore has to be explicit.
        await withTransaction((tx) =>
          updateMessagingScheduleIn(tx, actorPersonId, "recruitment", restore),
        );
      }
    });
  });

  it("derives the same entity id for the same natural key every time, and different ids for different ones", () => {
    expect(deriveEntityIdFromNaturalKey("messaging_schedules", "practice")).toBe(
      deriveEntityIdFromNaturalKey("messaging_schedules", "practice"),
    );
    expect(deriveEntityIdFromNaturalKey("messaging_schedules", "practice")).not.toBe(
      deriveEntityIdFromNaturalKey("messaging_schedules", "game"),
    );
    expect(deriveEntityIdFromNaturalKey("messaging_schedules", "practice")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("the configuration itself", () => {
  it("is complete over every event type, with no default arm", async () => {
    const rows = await withTransaction(async (tx) =>
      tx.query<{ event_type: string }>(
        `select unnest(enum_range(null::public.event_type))::text as event_type`,
      ),
    );

    for (const { event_type: eventType } of rows.rows) {
      const schedule = await withTransaction((tx) => readMessagingScheduleIn(tx, eventType));
      expect(schedule.eventType).toBe(eventType);
      // `REQ-schedule-defaults`: cadence 24 hours, 2 WhatsApp and 1 email,
      // escalation 12 hours after the deadline, for every type.
      expect(schedule.reminderCadenceHours).toBe(24);
      expect(schedule.whatsappReminderCount).toBe(2);
      expect(schedule.emailReminderCount).toBe(1);
      expect(schedule.escalationHours).toBe(12);
      // The seeded default is LAN-169's original `rsvp_by_days + 3`, left
      // alone (round 3, OWNER-LAN171-06 ruled out a migration that would
      // have moved it to `+ 2` to match the ladder-count correction below).
      // Counting forward, the invitation exactly matching its deadline would
      // need `+ 2` now that the invitation itself counts as WhatsApp #1
      // (round 2, Q-19, OWNER-LAN171-05: `whatsappReminderCount` includes
      // the invitation, so only one further WhatsApp reminder follows it,
      // not two) — so the seeded `+ 3` leaves the last reminder a day before
      // the deadline it chases. That is the gap the settings page's row
      // preview warns about until the club edits a value by hand; it is not
      // a defect this test papers over.
      expect(schedule.invitationLeadDays).toBe(schedule.rsvpByDays + 3);
    }
  });

  it("lists every schedule in the enum's own declared order, not alphabetically", async () => {
    // A regression on its own right: the column list casts `event_type` to
    // text for its output alias, and an unqualified `order by event_type`
    // resolves against that same-named output alias rather than the
    // underlying enum column — sorting "chalk, game, meeting, practice…"
    // instead of the declared "practice, strength_and_conditioning, chalk,
    // game…". LAN-171's settings page groups its rows in this order.
    const rows = await withTransaction((tx) => listMessagingSchedulesIn(tx));

    expect(rows.map((row) => row.eventType)).toEqual([
      "practice",
      "strength_and_conditioning",
      "chalk",
      "game",
      "social",
      "recruitment",
      "meeting",
    ]);
  });

  it("refuses an event type nobody has agreed a schedule for", async () => {
    await expect(
      withTransaction((tx) => readMessagingScheduleIn(tx, "kit_collection")),
    ).rejects.toThrowError(/No messaging schedule has been agreed/);
  });

  it("refuses an event with no date, naming the fact that is missing", async () => {
    await expect(
      withTransaction((tx) =>
        resolveMessagingPlanIn(tx, { eventType: "practice", scheduledOn: null, startsAt: "20:00" }),
      ),
    ).rejects.toThrowError(/needs a date/);
  });

  it("anchors an event with no start time to the beginning of its day", async () => {
    // `events.starts_at` is nullable and the club relies on it. The earliest
    // instant the event could begin is the safe reading: a time added later
    // moves the deadline forward rather than backward.
    const plan = await withTransaction((tx) =>
      resolveMessagingPlanIn(
        tx,
        { eventType: "practice", scheduledOn: "2026-10-18", startsAt: null },
        new Date("2026-10-01T09:00:00Z"),
      ),
    );
    expect(plan.responseDeadlineAt.toISOString()).toBe("2026-10-15T23:00:00.000Z");
  });
});

describe("no quiet hours", () => {
  it("puts an early-morning event's rungs at early-morning times, unmoved", async () => {
    // `REQ-no-quiet-hours` is absolute, and this is where it would be violated
    // by accident. An 07:00 session produces an 07:00 deadline and 07:00
    // reminders, and nothing here delays or drops a message on that basis.
    const plan = await withTransaction((tx) =>
      resolveMessagingPlanIn(
        tx,
        { eventType: "practice", scheduledOn: "2026-10-18", startsAt: "07:00" },
        new Date("2026-10-01T09:00:00Z"),
      ),
    );

    const hours = plan.rungs.map((rung) =>
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          hour: "2-digit",
          hour12: false,
        }).format(rung.at),
      ),
    );
    // Invitation (WhatsApp #1) + one further WhatsApp reminder + one email
    // reminder — three rungs, not four (Q-19, OWNER-LAN171-05: the invitation
    // counts against `whatsappReminderCount`, so a policy of 2 WhatsApp + 1
    // email produces one WhatsApp reminder after the invitation, not two).
    expect(hours).toEqual([7, 7, 7]);
  });
});

// ---------------------------------------------------------------------------
// LAN-171 — replaying the ladder, and the settings page's own worked example
// ---------------------------------------------------------------------------

describe("buildLadder, exported for replay against a frozen plan", () => {
  it("reproduces the same rungs resolveMessagingPlanIn would compute", async () => {
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");

    // Practice's default policy is 2 WhatsApp (the invitation counts as the
    // first, Q-19) and 1 email — one WhatsApp *reminder* after the
    // invitation, which is what `buildLadder` takes here, plus the email
    // reminder. All of it fits the runway this far out — `available` is not
    // the constraint here.
    const replayed = buildLadder(plan.invitationAt, 24, 1, 1, 2);

    expect(replayed).toEqual(plan.rungs);
  });

  it("guarantees the invitation even when no reminder fits", () => {
    const invitationAt = new Date("2026-10-01T09:00:00Z");
    const rungs = buildLadder(invitationAt, 24, 2, 1, 0);

    expect(rungs).toHaveLength(1);
    expect(rungs[0]).toMatchObject({ rung: 0, kind: "invitation", channel: "whatsapp" });
  });
});

describe("the ladder counts the invitation as WhatsApp #1 (Q-19, OWNER-LAN171-05)", () => {
  it("sends four messages total for the default policy: invitation, one WhatsApp reminder, one email reminder, then the President", async () => {
    // `REQ-ladder-order` governs over W7's looser "reminders" wording: the
    // default policy is 2 WhatsApp *including the invitation* and 1 email, so
    // a player who never answers gets the invitation (WhatsApp), one further
    // WhatsApp reminder, one email reminder — three messages — and the
    // President is the fourth. Before this fix the invitation was not
    // counted, so the same policy produced two WhatsApp reminders on top of
    // the invitation: four player messages instead of three.
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");

    expect(plan.lateApproval).toBe(false);
    expect(plan.rungs).toHaveLength(3);
    expect(plan.rungs.map((rung) => [rung.kind, rung.channel])).toEqual([
      ["invitation", "whatsapp"],
      ["reminder", "whatsapp"],
      ["reminder", "email"],
    ]);
    expect(plan.escalationAt).not.toBeNull();
  });
});

describe("the schedule page's worked example", () => {
  it("previews every configured type against one comparable synthetic event", async () => {
    const withPreview = await listMessagingSchedulesWithPreview();

    // Complete over the type, same as the table itself.
    expect(withPreview).toHaveLength(7);

    const practice = withPreview.find((row) => row.schedule.eventType === "practice");
    expect(practice).toBeDefined();
    // `resolveMessagingPlanIn`'s own arithmetic, not a second copy of it: the
    // preview's deadline is the schedule's day count before its own event start.
    expect(practice!.preview.eventStartsAt.getUTCHours()).toBe(
      practice!.preview.responseDeadlineAt.getUTCHours(),
    );
    expect(practice!.preview.lateApproval).toBe(false);
    expect(practice!.preview.rungs.length).toBeGreaterThan(0);

    // Every row is resolved against the same date and the same 20:00 start, so
    // the seven previews are directly comparable — W7's own requirement for a
    // page that shows one example per row.
    const starts = withPreview.map((row) => row.preview.eventStartsAt.toISOString());
    expect(new Set(starts).size).toBe(1);
  });

  it("still shows a gap when a schedule genuinely carries slack — the warning is not just suppressed", async () => {
    // Round 3, OWNER-LAN171-06, Brian: a migration to nudge a configurable
    // value by one day is exactly what this settings page makes
    // unnecessary — "we should be able to change the numbers as needed... in
    // the app, not [by migration]." The unedited seeded default already
    // carries its own one-day gap for this reason (see "the configuration
    // itself" above), which is correct behaviour, not a defect, and W7
    // already has Brian confirming these values himself before the first
    // real dispatch. Five *additional* spare days proves the warning still
    // fires for a value that is genuinely wrong, on top of that baseline gap,
    // rather than always reporting clean.
    await withTransaction((tx) =>
      tx.query(
        "update public.messaging_schedules set invitation_lead_days = invitation_lead_days + 5 where event_type = 'practice'",
      ),
    );

    try {
      const withPreview = await listMessagingSchedulesWithPreview();
      const practice = withPreview.find((row) => row.schedule.eventType === "practice")!;
      const lastRung = practice.preview.rungs[practice.preview.rungs.length - 1];
      const gapMs = practice.preview.responseDeadlineAt.getTime() - lastRung.at.getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      expect(practice.preview.lateApproval).toBe(false);
      expect(lastRung.at.getTime()).toBeLessThan(practice.preview.responseDeadlineAt.getTime());
      // R3-B1: `toBeLessThan` alone is satisfied by the seeded default's own
      // one-day gap (OWNER-LAN171-06 — the invitation now counts as WhatsApp
      // #1 without a matching migration) whether or not the +5 edit above is
      // honoured at all, which is exactly how a defect that ignores
      // `invitation_lead_days` entirely shipped with this test green. The
      // magnitude is what distinguishes them: the baseline gap is one day
      // (deadline two days out, invitation five days out, two 24h rungs after
      // it lands three days out); five *further* days of lead widens that to
      // six. Bounding well clear of both the one-day baseline and any
      // reasonable rounding is enough to fail red the moment the edit stops
      // being read.
      expect(gapMs).toBeGreaterThan(5 * ONE_DAY_MS);
      expect(gapMs).toBeLessThan(7 * ONE_DAY_MS);
    } finally {
      await withTransaction((tx) =>
        tx.query(
          "update public.messaging_schedules set invitation_lead_days = invitation_lead_days - 5 where event_type = 'practice'",
        ),
      );
    }

    const restored = await withTransaction((tx) => readMessagingScheduleIn(tx, "practice"));
    expect(restored.invitationLeadDays).toBe(5);
  });
});
