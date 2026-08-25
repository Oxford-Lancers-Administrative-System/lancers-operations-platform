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

import { resolveMessagingPlanIn, readMessagingScheduleIn } from "./messaging-schedule";

afterAll(async () => {
  await closePool();
});

/** A practice: RSVP two days before, invitation five days before, cadence 24h. */
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
    const plan = await planFor(PRACTICE, "2026-10-01T09:00:00Z");

    expect(plan.lateApproval).toBe(false);
    expect(plan.rungs.map((rung) => [rung.rung, rung.channel, rung.at.toISOString()])).toEqual([
      [0, "whatsapp", "2026-10-13T19:00:00.000Z"],
      [1, "whatsapp", "2026-10-14T19:00:00.000Z"],
      [2, "whatsapp", "2026-10-15T19:00:00.000Z"],
      [3, "email", "2026-10-16T19:00:00.000Z"],
    ]);
  });

  it("puts the last reminder on the deadline rather than days before it", async () => {
    // The invitation lead is the deadline plus the reminders times the cadence,
    // which is what makes this true — a game invited twenty-one days out would
    // finish its ladder eleven days before the deadline it is chasing.
    const plan = await planFor(GAME, "2026-10-01T09:00:00Z");
    const last = plan.rungs[plan.rungs.length - 1];
    expect(last.at.toISOString()).toBe(plan.responseDeadlineAt.toISOString());
  });

  it("keeps WhatsApp, WhatsApp, email in that fixed order", async () => {
    // `REQ-ladder-order`. Only the spacing and the counts are configurable.
    const plan = await planFor(GAME, "2026-10-01T09:00:00Z");
    expect(plan.rungs.map((rung) => rung.channel)).toEqual([
      "whatsapp",
      "whatsapp",
      "whatsapp",
      "email",
    ]);
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
    // practice three days out leaves two cadence steps before the deadline, so
    // two WhatsApp reminders fit and the email rung does not send at all.
    const plan = await planFor(PRACTICE, "2026-10-14T19:00:00Z");

    expect(plan.lateApproval).toBe(true);
    expect(plan.dispatchesImmediately).toBe(true);
    expect(plan.escalationAt).toBeNull();

    const reminders = plan.rungs.filter((rung) => rung.kind === "reminder");
    expect(reminders.map((rung) => rung.channel)).toEqual(["whatsapp", "whatsapp"]);
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
      // Counting forward means the invitation is the deadline plus the whole
      // ladder, or the last reminder lands well before the deadline it chases.
      expect(schedule.invitationLeadDays).toBe(schedule.rsvpByDays + 3);
    }
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
    expect(hours).toEqual([7, 7, 7, 7]);
  });
});
