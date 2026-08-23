/**
 * W5 and W6's screens — LAN-156.
 *
 * ## Why every one of these presses something
 *
 * This mission has now shipped four surfaces that looked right and were inert:
 * a status filter that filtered nothing, a jump control that rewrote the
 * address bar while scrolling nothing — twice, because the first repair covered
 * only desktop — and a browser check that wrote to a hidden input and read back
 * its own keystroke. A test that renders a screen and asserts its words would
 * have passed all four.
 *
 * So each test below **drives the control the operator would drive** and then
 * asserts on the element that must have changed as a result: the review panel
 * appears carrying the value that was typed; the confirmation appears when the
 * tick moves; the hidden field the service reads flips from `false` to `true`
 * and only after the confirmation was passed. Where a control's whole job is to
 * post something, the assertion is on what the form would post.
 *
 * The writes themselves are proved against the real database in
 * `src/lib/services/event-amendment.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return { ...actual, readEvent: vi.fn(), listCurrentSeasonEvents: vi.fn() };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, listTermWindows: vi.fn(async () => []) };
});
vi.mock("@/lib/services/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/attendance")>();
  return { ...actual, readEventAttendanceSummary: vi.fn() };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return { ...actual, readEventAudience: vi.fn(async () => []), readApprovalPreview: vi.fn() };
});
vi.mock("@/lib/services/event-amendment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-amendment")>();
  return {
    ...actual,
    readAmendmentContext: vi.fn(),
    readEventChangeHistory: vi.fn(async () => []),
  };
});
vi.mock("./change-actions", () => ({
  amendEventAction: vi.fn(async () => ({ issues: [], error: null, values: null })),
  cancelEventAction: vi.fn(async () => ({ error: null, reason: "" })),
  renotifyEventAction: vi.fn(async () => ({ error: null })),
}));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readEvent, type EventDetail } from "@/lib/services/events";
import { readEventAttendanceSummary, type AttendanceSummary } from "@/lib/services/attendance";
import {
  readAmendmentContext,
  readEventChangeHistory,
  type AmendmentContext,
  type EventChangeEntry,
} from "@/lib/services/event-amendment";
import EventDetailPage from "./page";
import AmendEventPage from "./amend/page";
import CancelEventPage from "./cancel/page";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: EVENT_ID,
    name: "Practice — michaelmas week 5",
    eventType: "practice",
    status: "approved",
    scheduledOn: "2099-11-11",
    startsAt: "20:00",
    endsAt: "22:00",
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isMandatory: true,
    registerSaved: false,
    audienceCount: 37,
    invitationCount: 37,
    responseCount: 29,
    description: "Full contact.",
    requiredEquipment: "Gumshield, boots",
    joiningUrl: null,
    origin: "club_controlled",
    termId: null,
    termLabel: "michaelmas 2026-27",
    weekNumber: 5,
    createdByName: "Rowan Ashdown",
    decisionReason: null,
    seasonId: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  };
}

function context(overrides: Partial<AmendmentContext> = {}): AmendmentContext {
  return {
    event: detail(),
    audience: { invited: 37, saidYes: 25, saidNo: 4, noAnswer: 8 },
    unsentMessages: 2,
    chaseThresholdDays: 2,
    chaseThresholdOn: "2099-11-09",
    isFuture: true,
    lastAmendment: null,
    ...overrides,
  };
}

function summary(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    invited: 37,
    saidYes: 25,
    showed: 0,
    recorded: 0,
    walkUps: 0,
    registerSaved: false,
    ...overrides,
  };
}

function historyEntry(overrides: Partial<EventChangeEntry> = {}): EventChangeEntry {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    kind: "amended",
    occurredAt: new Date("2026-11-09T19:40:00Z"),
    actorName: "Rowan Ashfield",
    changes: [
      {
        field: "venue",
        label: "Venue",
        previous: "Iffley Road Astro",
        next: "University Parks",
        material: true,
      },
    ],
    notified: false,
    recipients: 37,
    ...overrides,
  };
}

function detailProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/[id]">;
}

function amendProps() {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events/[id]/amend">;
}

function cancelProps() {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events/[id]/cancel">;
}

function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** The form's own submission, which is the only thing the service ever sees. */
function submissionOf(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(readEvent).mockResolvedValue(detail());
  vi.mocked(readEventAttendanceSummary).mockResolvedValue(summary());
  vi.mocked(readAmendmentContext).mockResolvedValue(context());
  vi.mocked(readEventChangeHistory).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// W5-01 — the two ways out
// ---------------------------------------------------------------------------

describe("an approved event's two ways out", () => {
  it("offers Edit event and Cancel event, pointing at the routes that do them", async () => {
    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("edit-event")).toHaveAttribute(
      "href",
      `/operate/events/${EVENT_ID}/amend`,
    );
    expect(screen.getByTestId("cancel-event")).toHaveAttribute(
      "href",
      `/operate/events/${EVENT_ID}/cancel`,
    );
  });

  it("offers neither on a draft", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "draft", invitationCount: 0 }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("approved-event-actions")).toBeNull();
  });

  it("offers neither on a cancelled event, because there is nothing further to do", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "cancelled" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("approved-event-actions")).toBeNull();
  });

  it("offers neither to an operator without the approval capability", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["treasurer"]),
    });

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("approved-event-actions")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W5-02 and W5-03 — the editor, and the review it leads to
// ---------------------------------------------------------------------------

describe("the amendment editor", () => {
  it("states what is already sent and that none of it is discarded", async () => {
    render(await AmendEventPage(amendProps()));

    const panel = screen.getByTestId("already-sent");
    expect(flatten(within(panel).getByTestId("kept-invited").textContent)).toBe(
      "37 invited — kept",
    );
    expect(flatten(within(panel).getByTestId("kept-said-yes").textContent)).toBe(
      "25 said yes — kept",
    );
    expect(flatten(within(panel).getByTestId("kept-said-no").textContent)).toBe("4 said no — kept");
  });

  it("says the event stays approved while it is being edited", async () => {
    render(await AmendEventPage(amendProps()));

    expect(flatten(screen.getByTestId("amend-subtitle").textContent)).toContain("Approved");
    expect(flatten(screen.getByTestId("stays-approved-note").textContent)).toContain(
      "stays approved while you edit",
    );
  });

  it("shows what was typed, not what was loaded, when Save changes… is pressed", async () => {
    render(await AmendEventPage(amendProps()));

    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "University Parks" } });
    fireEvent.click(screen.getByTestId("continue-to-review"));

    const review = await screen.findByTestId("amend-review-step");
    expect(flatten(within(review).getByTestId("change-venue").textContent)).toBe(
      "Venue: Iffley Road Astro → University Parks",
    );
  });

  it("says so rather than moving on when nothing was typed", async () => {
    render(await AmendEventPage(amendProps()));

    fireEvent.click(screen.getByTestId("continue-to-review"));

    expect(screen.getByTestId("nothing-changed")).toBeTruthy();
    expect(screen.queryByTestId("amend-review-step")).toBeNull();
  });

  it("keeps the typed values in the submission while the review is showing", async () => {
    render(await AmendEventPage(amendProps()));

    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "University Parks" } });
    fireEvent.click(screen.getByTestId("continue-to-review"));
    await screen.findByTestId("amend-review-step");

    const form = screen.getByTestId("amend-form") as HTMLFormElement;
    expect(submissionOf(form).venue).toBe("University Parks");
    expect(submissionOf(form).name).toBe("Practice — michaelmas week 5");
  });

  it("offers a Discard that leads back to the event and posts nothing", async () => {
    render(await AmendEventPage(amendProps()));

    expect(screen.getByTestId("discard-changes")).toHaveAttribute(
      "href",
      `/operate/events/${EVENT_ID}`,
    );
  });

  it("refuses to open on a cancelled event, as a sentence rather than a form", async () => {
    vi.mocked(readAmendmentContext).mockResolvedValue(
      context({ event: detail({ status: "cancelled" }) }),
    );

    render(await AmendEventPage(amendProps()));

    expect(screen.getByTestId("amend-refusal")).toBeTruthy();
    expect(screen.queryByTestId("amend-form")).toBeNull();
  });
});

describe("where the one tick starts", () => {
  async function reviewAfterChanging(field: string, value: string) {
    render(await AmendEventPage(amendProps()));
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    fireEvent.click(screen.getByTestId("continue-to-review"));
    return screen.findByTestId("amend-review-step");
  }

  it("is on for a venue change, and the button says who it notifies", async () => {
    const review = await reviewAfterChanging("Venue", "University Parks");

    expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).toBeChecked();
    expect(flatten(within(review).getByTestId("save-amendment").textContent)).toBe(
      "Save and notify 37",
    );
  });

  it("is off for a description change, and the button says so", async () => {
    const review = await reviewAfterChanging("Description", "Light session.");

    expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).not.toBeChecked();
    expect(flatten(within(review).getByTestId("save-amendment").textContent)).toBe(
      "Save without notifying",
    );
  });

  it("is off on a past event even when the venue moved", async () => {
    vi.mocked(readAmendmentContext).mockResolvedValue(context({ isFuture: false }));

    await reviewAfterChanging("Venue", "University Parks");

    expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).not.toBeChecked();
    expect(flatten(screen.getByTestId("notify-default").textContent)).toContain(
      "because the event has passed",
    );
  });

  it("names the decliners when it notifies, because they are told too", async () => {
    await reviewAfterChanging("Venue", "University Parks");

    expect(flatten(screen.getByTestId("who-hears").textContent)).toBe(
      "One message to all 37 invited people — including the 4 who said no, " +
        "because a venue or date change might change their answer.",
    );
  });

  it("says the messages already queued will be held", async () => {
    await reviewAfterChanging("Venue", "University Parks");

    expect(flatten(screen.getByTestId("queued-messages").textContent)).toContain(
      "2 messages have not gone out yet",
    );
  });
});

// ---------------------------------------------------------------------------
// W5-03b — silence is chosen, not defaulted into
// ---------------------------------------------------------------------------

describe("turning notification off", () => {
  async function reviewAfterVenueChange() {
    render(await AmendEventPage(amendProps()));
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "University Parks" } });
    fireEvent.click(screen.getByTestId("continue-to-review"));
    return screen.findByTestId("amend-review-step");
  }

  it("opens the confirmation, naming the headcount and what they were told", async () => {
    await reviewAfterVenueChange();

    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));

    const confirmation = await screen.findByTestId("amend-silence-step");
    expect(flatten(within(confirmation).getByTestId("silence-headline").textContent)).toBe(
      "Change the venue without telling anyone?",
    );
    expect(flatten(within(confirmation).getByTestId("silence-consequence").textContent)).toContain(
      "37 people were told this is at Iffley Road Astro.",
    );
    expect(flatten(within(confirmation).getByTestId("silence-consequence").textContent)).toContain(
      "nobody will be told it has changed to University Parks",
    );
  });

  it("does not mark the confirmation passed merely by opening it", async () => {
    await reviewAfterVenueChange();
    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));
    await screen.findByTestId("amend-silence-step");

    expect(screen.getByTestId("silence-confirmed")).toHaveValue("false");
  });

  it("marks it passed only after the operator chooses to save silently", async () => {
    await reviewAfterVenueChange();
    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));
    await screen.findByTestId("amend-silence-step");

    fireEvent.click(screen.getByTestId("silence-accept"));

    await waitFor(() => expect(screen.getByTestId("silence-confirmed")).toHaveValue("true"));
    const form = screen.getByTestId("amend-form") as HTMLFormElement;
    expect(submissionOf(form).silenceConfirmed).toBe("true");
    // Silent: the tick is off, so `notify` is not in the submission at all.
    expect(submissionOf(form).notify).toBeUndefined();
  });

  it("takes the operator back to notifying, unconfirmed, if they change their mind", async () => {
    await reviewAfterVenueChange();
    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));
    await screen.findByTestId("amend-silence-step");

    fireEvent.click(screen.getByTestId("silence-notify-instead"));

    await waitFor(() =>
      expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).toBeChecked(),
    );
    expect(screen.getByTestId("silence-confirmed")).toHaveValue("false");
    expect(screen.queryByTestId("amend-silence-step")).toBeNull();
  });

  it("asks nothing when only the description moved", async () => {
    render(await AmendEventPage(amendProps()));
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Light session." },
    });
    fireEvent.click(screen.getByTestId("continue-to-review"));
    await screen.findByTestId("amend-review-step");

    // It starts off; turning it on and off again asks nothing either way.
    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));
    await waitFor(() =>
      expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).toBeChecked(),
    );
    fireEvent.click(within(screen.getByTestId("notify-tick")).getByRole("switch"));

    await waitFor(() =>
      expect(within(screen.getByTestId("notify-tick")).getByRole("switch")).not.toBeChecked(),
    );
    expect(screen.queryByTestId("amend-silence-step")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W5-04 — re-notify
// ---------------------------------------------------------------------------

describe("re-notify", () => {
  it("appears when the last change went out to nobody, and names it", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([historyEntry()]);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("silent-change-notice").textContent)).toBe(
      "The venue changed on 9 Nov 2026 and nobody was told.",
    );
    expect(flatten(screen.getByTestId("renotify-button").textContent)).toBe("Re-notify 37 people");
  });

  it("does not appear when the last change notified", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([historyEntry({ notified: true })]);

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("renotify-panel")).toBeNull();
  });

  it("does not appear when nothing has been changed", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([]);

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("renotify-panel")).toBeNull();
  });

  it("says it changes neither the event nor the answers", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([historyEntry()]);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("renotify-detail").textContent)).toBe(
      "Sends the change to all 37 invited people. " +
        "Changes nothing about the event or the answers already given.",
    );
  });
});

// ---------------------------------------------------------------------------
// W5-05 — the record
// ---------------------------------------------------------------------------

describe("the change history", () => {
  it("names who, what and whether people were told", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([
      historyEntry(),
      historyEntry({
        id: "66666666-6666-4666-8666-666666666666",
        kind: "approved",
        changes: [],
        notified: null,
        recipients: 37,
        actorName: "Fen Marchbanks",
      }),
    ]);

    render(await EventDetailPage(detailProps()));

    const row = screen.getByTestId("history-amended");
    expect(flatten(row.textContent)).toContain("Rowan Ashfield");
    expect(flatten(row.textContent)).toContain("Venue: Iffley Road Astro → University Parks");
    expect(flatten(screen.getByTestId("history-told-amended").textContent)).toBe("Silent");
    expect(flatten(screen.getByTestId("history-told-approved").textContent)).toBe("—");
  });

  it("says the notified count when a change went out", async () => {
    vi.mocked(readEventChangeHistory).mockResolvedValue([historyEntry({ notified: true })]);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("history-told-amended").textContent)).toBe("Notified 37");
  });

  it("says so plainly when nothing has changed", async () => {
    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("history-empty").textContent)).toBe(
      "Nothing has changed since this event was approved.",
    );
  });

  it("is not shown on a draft, which has no history worth a panel", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "draft", invitationCount: 0 }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("change-history")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W6 — cancelling
// ---------------------------------------------------------------------------

describe("the cancellation screen", () => {
  it("leads with the number of people expecting to be there", async () => {
    render(await CancelEventPage(cancelProps()));

    expect(flatten(screen.getByTestId("expecting").textContent)).toBe(
      "25 people are expecting to be there.",
    );
    expect(flatten(screen.getByTestId("cancel-headline").textContent)).toBe(
      "Cancel this practice?",
    );
  });

  it("says the reason is for the record and reaches nobody", async () => {
    render(await CancelEventPage(cancelProps()));

    expect(flatten(screen.getByTestId("cancel-reason").textContent)).toContain(
      "For the club's record. Recipients never see this.",
    );
    expect(flatten(screen.getByTestId("who-is-told").textContent)).toBe(
      "All 37 invited will be told it is off. They will not be told why.",
    );
  });

  it("says plainly that it cannot be undone", async () => {
    render(await CancelEventPage(cancelProps()));

    expect(flatten(screen.getByTestId("cancel-irreversible").textContent)).toContain(
      "This cannot be undone.",
    );
  });

  it("starts on for a future event and off for a past one", async () => {
    const { unmount } = render(await CancelEventPage(cancelProps()));
    expect(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch")).toBeChecked();
    unmount();

    vi.mocked(readAmendmentContext).mockResolvedValue(context({ isFuture: false }));
    render(await CancelEventPage(cancelProps()));
    expect(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch")).not.toBeChecked();
  });

  it("asks before a future cancellation goes out to nobody, naming the people", async () => {
    render(await CancelEventPage(cancelProps()));

    fireEvent.click(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"));

    const confirmation = await screen.findByTestId("cancel-silence-step");
    expect(
      flatten(within(confirmation).getByTestId("cancel-silence-consequence").textContent),
    ).toBe(
      "25 people are expecting to be there at Iffley Road Astro. " +
        "If you cancel without telling them, nobody will be told it is off.",
    );
    expect(screen.getByTestId("cancel-silence-confirmed")).toHaveValue("false");
  });

  it("disables the cancel button while the confirmation is open", async () => {
    render(await CancelEventPage(cancelProps()));

    expect(screen.getByTestId("confirm-cancel")).not.toBeDisabled();
    fireEvent.click(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"));

    await waitFor(() => expect(screen.getByTestId("confirm-cancel")).toBeDisabled());
  });

  it("marks the confirmation passed only when the operator accepts it", async () => {
    render(await CancelEventPage(cancelProps()));
    fireEvent.click(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"));
    await screen.findByTestId("cancel-silence-step");

    fireEvent.click(screen.getByTestId("cancel-silence-accept"));

    await waitFor(() => expect(screen.getByTestId("cancel-silence-confirmed")).toHaveValue("true"));
    const form = screen.getByTestId("cancel-form") as HTMLFormElement;
    expect(submissionOf(form).silenceConfirmed).toBe("true");
    expect(submissionOf(form).notify).toBeUndefined();
    expect(screen.getByTestId("confirm-cancel")).not.toBeDisabled();
  });

  it("asks nothing about a past event, and does not open the confirmation", async () => {
    vi.mocked(readAmendmentContext).mockResolvedValue(context({ isFuture: false }));

    render(await CancelEventPage(cancelProps()));
    // Already off; turning it on and back off asks nothing.
    fireEvent.click(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"));
    await waitFor(() =>
      expect(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch")).toBeChecked(),
    );
    fireEvent.click(within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"));

    await waitFor(() =>
      expect(
        within(screen.getByTestId("cancel-notify-tick")).getByRole("switch"),
      ).not.toBeChecked(),
    );
    expect(screen.queryByTestId("cancel-silence-step")).toBeNull();
  });

  it("refuses to open on an event that is already cancelled", async () => {
    vi.mocked(readAmendmentContext).mockResolvedValue(
      context({ event: detail({ status: "cancelled" }) }),
    );

    render(await CancelEventPage(cancelProps()));

    expect(screen.getByTestId("cancel-refusal")).toBeTruthy();
    expect(screen.queryByTestId("cancel-form")).toBeNull();
  });
});

describe("a cancelled event's page", () => {
  const CANCELLED = detail({
    status: "cancelled",
    decisionReason: "Pitch waterlogged after overnight rain.",
  });

  it("says who cancelled it, when, and whether people were told", async () => {
    vi.mocked(readEvent).mockResolvedValue(CANCELLED);
    vi.mocked(readEventChangeHistory).mockResolvedValue([
      historyEntry({ kind: "cancelled", changes: [], notified: true, recipients: 37 }),
    ]);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("cancelled-summary").textContent)).toBe(
      "Cancelled on 9 Nov 2026, 19:40 by Rowan Ashfield. All 37 invited people were told.",
    );
  });

  it("shows the reason once, marked internal", async () => {
    vi.mocked(readEvent).mockResolvedValue(CANCELLED);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("cancelled-reason").textContent)).toBe(
      "Pitch waterlogged after overnight rain.",
    );
    // Not twice: the generic Reason fact stands down so that one surface
    // answers "why is this off?" — `docs/ux/standards.md` rule 7.
    expect(screen.queryByTestId("decision-reason")).toBeNull();
  });

  it("keeps the answers people gave, and says they are a record", async () => {
    vi.mocked(readEvent).mockResolvedValue(CANCELLED);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("cancelled-answers").textContent)).toContain(
      "Kept as they were.",
    );
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "37 invitations · 29 responses",
    );
  });
});
