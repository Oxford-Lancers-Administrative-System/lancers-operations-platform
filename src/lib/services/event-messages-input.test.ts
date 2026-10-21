/**
 * Event messages, the pure half — LAN-508: what a valid message is, when it
 * goes (event start less the hours, held to 07:00 by lights-out), and what the
 * event page says about it.
 */
import { describe, expect, it } from "vitest";

import {
  clubEventStart,
  describeEventMessage,
  describeEventMessageStatus,
  eventMessageChanged,
  eventMessageSendAt,
  eventMessageStatus,
  eventMessagesDiffer,
  formatEventMessageMoment,
  formatEventMessageWhen,
  sendAgainBody,
  validateEventMessages,
  type EventMessageInput,
} from "./event-messages-input";

const VALID = {
  id: "",
  hoursBefore: "48",
  channel: "both",
  recipients: "everyone",
  body: "## Itinerary\n- 8:30 AM Bus",
  fromTemplate: "false",
};

/** A London wall-clock instant: `at("2026-11-08", "14:00")`. */
function at(day: string, time: string): Date {
  const instant = clubEventStart(day, time);
  if (instant === null) throw new Error("unreadable");
  return instant;
}

describe("validateEventMessages", () => {
  it("accepts a whole number of hours, a channel, recipients and a brief", () => {
    const result = validateEventMessages([VALID]);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: null,
          hoursBefore: 48,
          channel: "both",
          recipients: "everyone",
          body: "## Itinerary\n- 8:30 AM Bus",
          fromTemplate: false,
        },
      ],
    });
  });

  it("points each correction at its own control", () => {
    const result = validateEventMessages([
      { ...VALID, hoursBefore: "1.5" },
      { ...VALID, hoursBefore: "0" },
      { ...VALID, hoursBefore: "337" },
      { ...VALID, channel: "sms" },
      { ...VALID, recipients: "maybe" },
      { ...VALID, body: "   \n " },
      { ...VALID, body: "x".repeat(4001) },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => [issue.index, issue.field])).toEqual([
      [0, "hoursBefore"],
      [1, "hoursBefore"],
      [2, "hoursBefore"],
      [3, "channel"],
      [4, "recipients"],
      [5, "body"],
      [6, "body"],
    ]);
  });
});

describe("when a message goes", () => {
  it("reads the event start as London wall-clock time, in summer and in winter", () => {
    expect(at("2026-11-08", "14:00").toISOString()).toBe("2026-11-08T14:00:00.000Z");
    expect(at("2026-06-08", "14:00").toISOString()).toBe("2026-06-08T13:00:00.000Z");
    expect(clubEventStart(null, "14:00")).toBeNull();
    expect(clubEventStart("2026-11-08", null)).toBeNull();
  });

  it("is the event start less the hours", () => {
    const start = at("2026-11-08", "14:00");
    const now = at("2026-10-16", "22:30");
    expect(eventMessageSendAt(start, 48, now)).toEqual(at("2026-11-06", "14:00"));
    expect(formatEventMessageWhen(eventMessageSendAt(start, 48, now))).toBe("Fri 6 Nov · 14:00");
  });

  it("waits for 07:00 when the moment falls between 22:00 and 07:00", () => {
    const start = at("2026-11-08", "09:00");
    const now = at("2026-10-16", "12:00");
    // 09:00 less 4 hours is 05:00: held to 07:00 the same morning.
    expect(eventMessageSendAt(start, 4, now)).toEqual(at("2026-11-08", "07:00"));
    // 09:00 less 10 hours is 23:00 the night before: held to 07:00.
    expect(eventMessageSendAt(start, 10, now)).toEqual(at("2026-11-08", "07:00"));
    // 09:00 less 2 hours is 07:00 exactly: not held.
    expect(eventMessageSendAt(start, 2, now)).toEqual(at("2026-11-08", "07:00"));
  });

  it("goes on the next sweep when its moment has already passed", () => {
    const start = at("2026-11-08", "14:00");
    const now = at("2026-11-07", "15:30");
    expect(eventMessageSendAt(start, 48, now)).toEqual(now);
  });

  it("moves with the event, because nothing about it is stored", () => {
    const now = at("2026-10-16", "12:00");
    expect(eventMessageSendAt(at("2026-11-08", "14:00"), 48, now)).toEqual(
      at("2026-11-06", "14:00"),
    );
    expect(eventMessageSendAt(at("2026-11-09", "15:00"), 48, now)).toEqual(
      at("2026-11-07", "15:00"),
    );
  });
});

describe("the event page's status", () => {
  const start = at("2026-11-08", "14:00");

  it("is Scheduled with the moment, then Sent with the moment it went", () => {
    const scheduled = eventMessageStatus({
      lastSentAt: null,
      eventStatus: "approved",
      eventStart: start,
      hoursBefore: 48,
      now: at("2026-10-16", "22:30"),
    });
    expect(describeEventMessageStatus(scheduled)).toBe("Scheduled 6 Nov 14:00");
    const sent = eventMessageStatus({
      lastSentAt: at("2026-11-06", "14:02"),
      eventStatus: "approved",
      eventStart: start,
      hoursBefore: 48,
      now: at("2026-11-07", "10:00"),
    });
    expect(describeEventMessageStatus(sent)).toBe("Sent 6 Nov 14:02");
  });

  it("is Cancelled on a cancelled event, and Not sent once the event has started", () => {
    expect(
      describeEventMessageStatus(
        eventMessageStatus({
          lastSentAt: null,
          eventStatus: "cancelled",
          eventStart: start,
          hoursBefore: 48,
        }),
      ),
    ).toBe("Cancelled");
    expect(
      describeEventMessageStatus(
        eventMessageStatus({
          lastSentAt: null,
          eventStatus: "approved",
          eventStart: start,
          hoursBefore: 48,
          now: at("2026-11-08", "15:00"),
        }),
      ),
    ).toBe("Not sent");
    // 06:30 less one hour falls in lights-out, and 07:00 is after the start.
    expect(
      describeEventMessageStatus(
        eventMessageStatus({
          lastSentAt: null,
          eventStatus: "approved",
          eventStart: at("2026-11-08", "06:30"),
          hoursBefore: 1,
          now: at("2026-11-01", "12:00"),
        }),
      ),
    ).toBe("Not sent");
  });

  it("formats the moment and the Send again? body as the wireframe does", () => {
    expect(formatEventMessageMoment(at("2026-11-06", "14:00"))).toBe("6 Nov 14:00");
    expect(sendAgainBody(at("2026-11-06", "14:00"))).toBe(
      "This event message was sent on 6 November at 14:00. Saving sends it again to everyone it went to.",
    );
  });
});

describe("what changed", () => {
  const stored: EventMessageInput = {
    id: "m1",
    hoursBefore: 48,
    channel: "both",
    recipients: "everyone",
    body: "Brief",
    fromTemplate: false,
  };

  it("counts the hours, the channel, the recipients and the brief, and nothing else", () => {
    expect(eventMessageChanged(stored, { ...stored })).toBe(false);
    expect(eventMessageChanged(stored, { ...stored, body: "Brief\r\n" })).toBe(false);
    const fromTemplate: EventMessageInput = { ...stored, fromTemplate: true };
    expect(eventMessageChanged(stored, fromTemplate)).toBe(false);
    expect(eventMessageChanged(stored, { ...stored, hoursBefore: 24 })).toBe(true);
    expect(eventMessageChanged(stored, { ...stored, channel: "email" })).toBe(true);
    expect(eventMessageChanged(stored, { ...stored, recipients: "yes" })).toBe(true);
    expect(eventMessageChanged(stored, { ...stored, body: "Brief!" })).toBe(true);
  });

  it("treats an added, removed or reordered message as a difference", () => {
    const other = { ...stored, id: "m2" };
    expect(eventMessagesDiffer([stored], [stored])).toBe(false);
    expect(eventMessagesDiffer([stored], [])).toBe(true);
    expect(eventMessagesDiffer([stored], [stored, { ...stored, id: null }])).toBe(true);
    expect(eventMessagesDiffer([stored, other], [other, stored])).toBe(true);
  });

  it("describes a message in the plan's words", () => {
    expect(describeEventMessage(stored)).toBe(
      "48 hours before · WhatsApp and email · Everyone invited",
    );
    expect(describeEventMessage({ hoursBefore: 1, channel: "email", recipients: "yes" })).toBe(
      "1 hour before · Email · Those who said Yes",
    );
  });
});
