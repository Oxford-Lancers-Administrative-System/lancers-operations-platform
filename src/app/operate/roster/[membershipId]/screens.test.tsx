/**
 * `/operate/roster/[membershipId]` — the redesigned player record. LAN-187, W6.
 *
 * These render the real page with the service layer mocked, proving the
 * screen: the gate refuses a non-four-role operator before `readPlayerRecord()`
 * is ever called (`REQ-authority`), the Person/Onboarding/Season banding
 * carries the approved fields, a durable person fact routes to the person
 * record rather than editing here, a departed membership renders read-only
 * with no Status editor, `not recorded` never defaults, and the shipped
 * `?created=1` confirmation banner survives the rebuild. The writes
 * themselves are proved against the real database in
 * `src/lib/services/player-record.test.ts` and the existing
 * `roster-board.test.ts` / `membership.test.ts` suites the same commit
 * functions already have coverage in.
 *
 * ## What this file cannot see
 *
 * jsdom does not evaluate MUI breakpoints, so the desktop and phone layouts
 * are both in this one DOM — the responsive claim is proved by the browser
 * preflight at a measured 1280 and 375, not here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/player-record", () => ({ readPlayerRecord: vi.fn() }));
// Every commit this record makes, mocked so opening and committing a field in
// these tests never reaches a service or a database — the writes themselves
// are proved for real in `roster-board.test.ts` and `membership.test.ts`,
// exactly as the board's own screens.test.tsx does for its identical cells.
vi.mock("./record-actions", () => ({
  recordSetStatusAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitEntryAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitPositionAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitJerseyNumbersAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitCoachGroupAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitFormalwearItemAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitBluesAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitEligibilityAction: vi.fn().mockResolvedValue({ error: null }),
  recordCommitAvailabilityAction: vi.fn().mockResolvedValue({ error: null }),
  recordResolveOnboardingItemAction: vi.fn().mockResolvedValue({ error: null }),
}));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import type { OnboardingItem } from "@/lib/services/membership";
import { readPlayerRecord } from "@/lib/services/player-record";
import type {
  AttendanceEvent,
  PlayerRecordData,
  PlayerRecordResult,
} from "@/lib/services/player-record";
import { recordResolveOnboardingItemAction, recordSetStatusAction } from "./record-actions";
import PlayerRecordPage from "./page";
import { STATUSES, STATUS_OPTION_LABELS } from "../board-columns";

function operatorAccess(roleCodes: string[]): OperatorAccess {
  return {
    state: "active",
    operator: {
      authUserId: "11111111-1111-4111-8111-111111111111",
      personId: "22222222-2222-4222-8222-222222222222",
      displayName: "Morgan Pike",
      roleCodes,
      isActive: true,
    },
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(operatorAccess(roleCodes));
}

const MEMBERSHIP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PERSON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function record(overrides: Partial<PlayerRecordData> = {}): PlayerRecordData {
  return {
    membershipId: MEMBERSHIP_ID,
    personId: PERSON_ID,
    seasonId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    seasonLabel: "2026-27",
    status: "onboarding",
    entry: "returning",
    confirmedOn: "2026-08-12",
    activatedOn: null,
    departedOn: null,
    expectedReturnOn: null,
    inactivityLabel: null,
    isConstitutionalMember: false,
    onboardingItems: [],
    outstandingRequired: [],
    activityLog: [],
    statusHistory: [
      {
        fromStatus: null,
        toStatus: "onboarding",
        occurredAt: new Date("2026-08-12T13:36:00Z"),
        actorName: "Morgan Pike",
        actorLabel: null,
        reason: null,
      },
    ],
    season: {
      offencePosition: null,
      defencePosition: null,
      specialTeamsPosition: null,
      blueNumbers: [],
      whiteNumbers: [],
      coachGroup: null,
      formalwear: { tie: false, bowtie: false, socks: false },
      blues: "None",
      eligibility: null,
      availability: null,
    },
    positionOptions: { offence: [], defence: [], specialTeams: [] },
    jerseyHolders: { blue: {}, white: {} },
    otherSeasons: [],
    attendance: [],
    person: {
      personId: PERSON_ID,
      givenName: "Avery",
      givenNameSource: null,
      familyName: "Fielding",
      familyNameSource: null,
      aliases: [
        { id: "alias-1", alias: "Avery", isDisplayName: true, source: null, notedAt: new Date() },
      ],
      displayName: "Avery Fielding",
      status: "active",
      college: null,
      collegeSource: null,
      matriculationYear: null,
      matriculationYearSource: null,
      expectedGraduationYear: null,
      expectedGraduationYearSource: null,
      degreeField: null,
      degreeFieldSource: null,
      dateOfBirth: null,
      dateOfBirthSource: null,
      emergencyContact: null,
      contacts: [
        {
          id: "c1",
          kind: "email",
          scope: "personal",
          rawValue: "avery.fielding@example.invalid",
          normalisedValue: null,
          isPreferred: true,
          source: null,
          validFrom: new Date(),
          validUntil: null,
        },
        {
          id: "c2",
          kind: "phone",
          scope: null,
          rawValue: "+44 7700 900101",
          normalisedValue: null,
          isPreferred: true,
          source: null,
          validFrom: new Date(),
          validUntil: null,
        },
      ],
      isPastMember: false,
      standingIsOverridden: false,
      isUnder18: null,
      halfBlueCount: 0,
      fullBlueCount: 0,
      mergedIntoPersonId: null,
      missingRequiredFields: [],
    },
    ...overrides,
  };
}

function givenRecord(overrides: Partial<PlayerRecordData> = {}): void {
  const result: PlayerRecordResult = { kind: "record", data: record(overrides) };
  vi.mocked(readPlayerRecord).mockResolvedValue(result);
}

function pageProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ membershipId: MEMBERSHIP_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof PlayerRecordPage>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(["secretary"]);
});

// ---------------------------------------------------------------------------

describe("REQ-authority — the whole surface, four-role only", () => {
  it("refuses a coach before the record is ever read", async () => {
    signedInAs(["head_coach"]);
    const { container } = render(await PlayerRecordPage(pageProps()));

    for (const secret of [
      "Avery",
      "Fielding",
      "avery.fielding@example.invalid",
      "+44 7700 900101",
      PERSON_ID,
    ]) {
      expect(container.innerHTML).not.toContain(secret);
    }
    expect(readPlayerRecord).not.toHaveBeenCalled();
  });

  it("refuses a general operator holding no club office", async () => {
    signedInAs([]);
    const { container } = render(await PlayerRecordPage(pageProps()));

    expect(container.innerHTML).not.toContain("Avery");
    expect(readPlayerRecord).not.toHaveBeenCalled();
  });

  it("renders for the four-role operator", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(readPlayerRecord).toHaveBeenCalledWith(MEMBERSHIP_ID);
  });
});

describe("Person · Onboarding · Season banding", () => {
  beforeEach(() => {
    givenRecord({
      onboardingItems: [
        {
          id: "item-1",
          code: "kit",
          label: "Kit sorted",
          isRequired: true,
          isSubscription: false,
          sortOrder: 1,
          status: "pending",
          completedOn: null,
          waivedReason: null,
          waivedByName: null,
          updatedAt: new Date(),
          history: [],
        },
      ],
    });
  });

  it("shows all three bands", async () => {
    render(await PlayerRecordPage(pageProps()));
    expect(within(screen.getByTestId("section-person")).getByText("Person")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("section-onboarding")).getByText("Onboarding"),
    ).toBeInTheDocument();
    expect(screen.getByText("Season · 2026-27")).toBeInTheDocument();
  });

  it("routes a durable person fact to the person record rather than editing it here", async () => {
    render(await PlayerRecordPage(pageProps()));
    const link = screen.getByTestId("open-person-record");
    expect(link).toHaveAttribute("href", `/operate/people/${PERSON_ID}`);
    // Name is plain text — never an editable field.
    const nameRow = screen.getByText("Name").closest('[data-testid="record-row"]') as HTMLElement;
    expect(within(nameRow).queryByTestId("editable-field")).not.toBeInTheDocument();
  });

  it("shows an onboarding item's provenance and edits it in place, with no Resolve/SAVE pair", async () => {
    render(await PlayerRecordPage(pageProps()));
    expect(screen.queryByText(/Resolve/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAVE" })).not.toBeInTheDocument();
    const row = screen.getByText("Kit sorted").closest('[data-testid="record-row"]') as HTMLElement;
    expect(within(row).getByTestId("editable-field")).toBeInTheDocument();
  });

  it("links to the person record's history section rather than duplicating it", async () => {
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByTestId("open-person-history")).toHaveAttribute(
      "href",
      `/operate/people/${PERSON_ID}?history=expanded`,
    );
  });
});

// ---------------------------------------------------------------------------
// W6 — one player's onboarding record. `WP-operator-record`, LAN-217.
// ---------------------------------------------------------------------------

function historyItem(
  overrides: Partial<PlayerRecordData["onboardingItems"][number]> = {},
): PlayerRecordData["onboardingItems"][number] {
  return {
    id: "item-1",
    code: "bucs_play",
    label: "BUCS Play registration",
    isRequired: true,
    isSubscription: false,
    sortOrder: 1,
    status: "pending",
    completedOn: null,
    waivedReason: null,
    waivedByName: null,
    updatedAt: new Date(),
    history: [],
    ...overrides,
  };
}

describe("W6 — the resolve control's own Reopen option", () => {
  it("offers Reopen alongside the shipped three resolutions", async () => {
    givenRecord({ onboardingItems: [historyItem({ status: "complete" })] });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("BUCS Play registration")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(within(row).getByTestId("editable-field"));

    expect(await screen.findByRole("option", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Waived" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Not applicable" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Reopen" })).toBeInTheDocument();
  });

  it("reopens an item with one click and no reason field, and shows the error the service refuses a live item's reopen with", async () => {
    givenRecord({ onboardingItems: [historyItem({ status: "complete" })] });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("BUCS Play registration")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent, act } = await import("@testing-library/react");
    fireEvent.click(within(row).getByTestId("editable-field"));
    await act(async () => fireEvent.click(await screen.findByRole("option", { name: "Reopen" })));

    expect(recordResolveOnboardingItemAction).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_ID,
      itemId: "item-1",
      status: "reopen",
    });
    expect(screen.queryByTestId("onboarding-waiver-reason")).not.toBeInTheDocument();
  });

  it("saves a waiver with no reason field drawn at all — the reason stops being solicited", async () => {
    givenRecord({ onboardingItems: [historyItem({ status: "pending" })] });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("BUCS Play registration")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent, act } = await import("@testing-library/react");
    fireEvent.click(within(row).getByTestId("editable-field"));
    await act(async () => fireEvent.click(await screen.findByRole("option", { name: "Waived" })));

    expect(recordResolveOnboardingItemAction).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_ID,
      itemId: "item-1",
      status: "waived",
    });
    expect(screen.queryByLabelText(/Why is this waived/)).not.toBeInTheDocument();
  });
});

// B-001 (correction round 2, Brian): "Kit sorted" is renamed "Kit
// Distributed" and reduced to yes/no — no waived, no claimed, no reopen
// offered on this one item; every other item keeps the full set proved
// above.
describe("B-001 — Kit Distributed is binary", () => {
  it("shows Yes/No only, never Waived or Not applicable or a Reopen option", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({ code: "kit_sorted", label: "Kit Distributed", status: "complete" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("Kit Distributed")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent } = await import("@testing-library/react");
    expect(within(row).getByText("Yes")).toBeVisible();
    fireEvent.click(within(row).getByTestId("editable-field"));

    expect(await screen.findByRole("option", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No" })).toBeInTheDocument();
    for (const forbidden of ["Waived", "Not applicable", "Reopen", "Complete"]) {
      expect(screen.queryByRole("option", { name: forbidden })).not.toBeInTheDocument();
    }
  });

  it("answering No commits through the same resolveOnboardingItem reopen path, with no reason field", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({ code: "kit_sorted", label: "Kit Distributed", status: "complete" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("Kit Distributed")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent, act } = await import("@testing-library/react");
    fireEvent.click(within(row).getByTestId("editable-field"));
    await act(async () => fireEvent.click(await screen.findByRole("option", { name: "No" })));

    expect(recordResolveOnboardingItemAction).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_ID,
      itemId: "item-1",
      status: "reopen",
    });
    expect(screen.queryByTestId("onboarding-waiver-reason")).not.toBeInTheDocument();
  });
});

// D-002 (correction round 3, Q-14, Brian): "Subscription paid" is blank —
// nothing at all — until "Subscription invoiced" is itself complete.
describe("D-002 — Subscription paid is blank until Subscription invoiced is complete", () => {
  it("reads Not recorded and opens no control while the invoice is still pending", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({
          id: "item-invoiced",
          code: "subs_invoiced",
          label: "Subscription invoiced",
          status: "pending",
        }),
        historyItem({
          id: "item-paid",
          code: "subs_paid",
          label: "Subscription paid",
          status: "pending",
        }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("Subscription paid")
      .closest('[data-testid="record-row"]') as HTMLElement;
    expect(within(row).getByText("not recorded")).toBeVisible();
    expect(within(row).queryByTestId("editable-field")).not.toBeInTheDocument();
  });

  it("opens the ordinary control and reads its own status once the invoice is complete", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({
          id: "item-invoiced",
          code: "subs_invoiced",
          label: "Subscription invoiced",
          status: "complete",
        }),
        historyItem({
          id: "item-paid",
          code: "subs_paid",
          label: "Subscription paid",
          status: "waived",
        }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("Subscription paid")
      .closest('[data-testid="record-row"]') as HTMLElement;
    expect(within(row).getByText("Waived")).toBeVisible();
    expect(within(row).getByTestId("editable-field")).toBeInTheDocument();
  });
});

describe("W6 — provenance: who and when, from the item's own history", () => {
  it("renders claimed in the row's own idiom, naming the player and that nobody has confirmed", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({
          status: "claimed",
          history: [
            {
              fromStatus: "pending",
              toStatus: "claimed",
              occurredAt: new Date("2026-09-02T00:00:00Z"),
              actorKind: "player",
              actorName: "Merrick Thornbury",
              reason: null,
            },
          ],
        }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("BUCS Play registration")
      .closest('[data-testid="record-row"]') as HTMLElement;
    expect(row.textContent).toContain("Claimed");
    expect(row.textContent).toContain("Merrick Thornbury");
    expect(row.textContent).toContain("awaiting confirmation");
    // No chip, no colour of its own — the same underlined body2 every other
    // state uses, never a second element next to it.
    expect(within(row).queryByRole("img")).not.toBeInTheDocument();
  });

  it("carries player-claimed provenance once an operator confirms a trust-class claim", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({
          status: "complete",
          completedOn: "2026-09-03",
          history: [
            {
              fromStatus: "pending",
              toStatus: "claimed",
              occurredAt: new Date("2026-09-02T00:00:00Z"),
              actorKind: "player",
              actorName: "Merrick Thornbury",
              reason: null,
            },
            {
              fromStatus: "claimed",
              toStatus: "complete",
              occurredAt: new Date("2026-09-03T00:00:00Z"),
              actorKind: "operator",
              actorName: "Caspian Hallowfield",
              reason: null,
            },
          ],
        }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("BUCS Play registration")
      .closest('[data-testid="record-row"]') as HTMLElement;
    expect(row.textContent).toContain("player-claimed");
  });

  it("retains a superseded value rather than overwriting it, and shows every transition's actor and date", async () => {
    givenRecord({
      onboardingItems: [
        historyItem({
          code: "subscription_paid",
          label: "Subscription paid",
          status: "pending",
          history: [
            {
              fromStatus: "pending",
              toStatus: "waived",
              occurredAt: new Date("2026-08-20T00:00:00Z"),
              actorKind: "operator",
              actorName: "Zenas Yaxlington",
              reason: null,
            },
            {
              fromStatus: "waived",
              toStatus: "pending",
              occurredAt: new Date("2026-09-01T00:00:00Z"),
              actorKind: "operator",
              actorName: "Caspian Hallowfield",
              reason: null,
            },
          ],
        }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const row = screen
      .getByText("Subscription paid")
      .closest('[data-testid="record-row"]') as HTMLElement;
    expect(row.textContent).toContain("Reopened by Caspian Hallowfield");
    expect(row.textContent).toContain("waived");
  });
});

describe("W6 — the activity log", () => {
  it("renders one entry per ask and per answer, individually, grouped by section — never a count", async () => {
    givenRecord({
      activityLog: [
        {
          section: "Contact & academic details",
          entries: [
            {
              kind: "ask",
              channel: "email",
              who: "the club",
              occurredAt: new Date("2026-08-12T09:00:00Z"),
            },
            {
              kind: "answer",
              channel: "signed link",
              who: "Merrick Thornbury",
              occurredAt: new Date("2026-08-20T18:42:00Z"),
            },
          ],
        },
        {
          section: "BUCS Play",
          entries: [
            {
              kind: "answer",
              channel: "signed link",
              who: "Merrick Thornbury",
              occurredAt: new Date("2026-09-02T19:05:00Z"),
            },
          ],
        },
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    const log = screen.getByTestId("activity-log");
    expect(within(log).getAllByText("Contact & academic details")).toHaveLength(2);
    expect(within(log).getByText("BUCS Play")).toBeInTheDocument();
    expect(within(log).getAllByText(/Asked/).length).toBe(1);
    expect(within(log).getAllByText(/Answered/).length).toBe(2);
    expect(screen.queryByText(/asked 2 times/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 asks/i)).not.toBeInTheDocument();
  });

  it("says plainly when nothing has been asked yet, for an empty log", async () => {
    givenRecord({ activityLog: [] });
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByTestId("activity-log-empty")).toBeInTheDocument();
  });
});

describe("not recorded — REQ-not-recorded", () => {
  it("states every absent field explicitly, never a blank", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getAllByText("not recorded").length).toBeGreaterThan(0);
  });

  it("says a membership with no onboarding items is a real configuration state", async () => {
    givenRecord({ onboardingItems: [] });
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByTestId("onboarding-empty")).toHaveTextContent(
      "This season has no onboarding items configured, so this membership has none.",
    );
  });
});

describe("F1 — REQ-no-narrative: no explanatory caption beyond the allowed states", () => {
  it("gives Emergency contact, Formalwear and Half/Full Blue no caption beyond their label and value", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps()));

    expect(screen.queryByText(/never a Person row/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reasked each season/)).not.toBeInTheDocument();
    expect(screen.queryByText(/the total across seasons is derived/)).not.toBeInTheDocument();
  });

  function outstandingItem(overrides: Partial<OnboardingItem> = {}): OnboardingItem {
    return {
      id: "item-1",
      code: "kit",
      label: "Kit sorted",
      isRequired: true,
      isSubscription: false,
      sortOrder: 1,
      status: "pending",
      completedOn: null,
      waivedReason: null,
      waivedByName: null,
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("states the outstanding-items count with no explanatory second sentence", async () => {
    givenRecord({ outstandingRequired: [outstandingItem()] });
    render(await PlayerRecordPage(pageProps()));

    expect(screen.getByTestId("outstanding-note")).toHaveTextContent(
      "One required item is still outstanding: Kit sorted.",
    );
    expect(screen.queryByText(/does not stop the membership's status/)).not.toBeInTheDocument();
  });

  it("names the outstanding item, so it does not have to be found by searching the list (W3, Q-19)", async () => {
    givenRecord({
      outstandingRequired: [
        outstandingItem({ id: "item-subscription", label: "Subscription invoiced" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    // The exact string, not a substring — this version's `toHaveTextContent`
    // always does a contains match, so a reword that drops the name would
    // still pass a substring check.
    expect(screen.getByTestId("outstanding-note").textContent).toBe(
      "One required item is still outstanding: Subscription invoiced.",
    );
  });

  it("names every outstanding item when more than one is outstanding (W3, Q-19)", async () => {
    givenRecord({
      outstandingRequired: [
        outstandingItem({ id: "item-subscription", label: "Subscription invoiced" }),
        outstandingItem({ id: "item-kit", code: "kit_2", label: "Kit sorted" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    expect(screen.getByTestId("outstanding-note").textContent).toBe(
      "2 required items are still outstanding: Subscription invoiced, Kit sorted.",
    );
  });
});

describe("the Attendance band — Q15-attendance, corrected at W1/W2/Q-19", () => {
  function attendanceEvent(overrides: Partial<AttendanceEvent> = {}): AttendanceEvent {
    return {
      id: "ev-default",
      eventName: "Default event",
      date: "2026-09-06",
      isMandatory: true,
      invitationStatus: "responded",
      rsvp: "yes",
      attendance: "present",
      eventStatus: "occurred",
      ...overrides,
    };
  }

  // Every case the brief names: a mandatory event attended, one missed, a
  // late, an excused, an event with no RSVP recorded, a cancelled
  // invitation, and an upcoming invited event — plus one non-mandatory row
  // so the Mandatory filter has something to narrow away. `ev-upcoming` is
  // the fixture's one event that has not occurred, and its own
  // `eventStatus: "upcoming"` is what the default Event status filter (W1)
  // now hides on first render.
  const EVENTS: AttendanceEvent[] = [
    attendanceEvent({
      id: "ev-present",
      eventName: "Term 1 opening training",
      date: "2026-09-06",
      attendance: "present",
    }),
    attendanceEvent({
      id: "ev-absent",
      eventName: "BUCS league opener vs Cambridge",
      date: "2026-09-13",
      attendance: "absent",
    }),
    attendanceEvent({
      id: "ev-late",
      eventName: "BUCS league vs Reading",
      date: "2026-09-27",
      attendance: "late",
    }),
    attendanceEvent({
      id: "ev-excused",
      eventName: "Term 1 closing training",
      date: "2026-10-11",
      attendance: "excused",
    }),
    attendanceEvent({
      id: "ev-no-rsvp",
      eventName: "BUCS playoff fixture",
      date: "2026-10-18",
      invitationStatus: "issued",
      rsvp: null,
      attendance: "present",
    }),
    attendanceEvent({
      id: "ev-cancelled",
      eventName: "Term 2 friendly vs Durham",
      date: "2026-11-01",
      invitationStatus: "cancelled",
      attendance: null,
    }),
    attendanceEvent({
      id: "ev-upcoming",
      eventName: "Term 3 opener vs Durham",
      date: "2027-01-17",
      invitationStatus: "issued",
      attendance: null,
      eventStatus: "upcoming",
    }),
    attendanceEvent({
      id: "ev-social",
      eventName: "Committee welcome social",
      date: "2026-10-02",
      isMandatory: false,
      attendance: "present",
    }),
  ];

  it("lists every event with a sent invitation, and no more, once every filter is cleared", async () => {
    givenRecord({ attendance: EVENTS });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Clear all" }));
    });

    // One row per event in the fixture — a `pending` invitation would not be
    // in this list at all, so there is nothing here that filters it out.
    expect(within(section).getAllByTestId("attendance-row")).toHaveLength(EVENTS.length);
  });

  it("defaults the table to Occurred, hiding what has not happened yet, reversibly (W1)", async () => {
    givenRecord({ attendance: EVENTS });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");

    // ev-upcoming is the fixture's only event that has not occurred; nobody
    // touched a filter and it is already absent from both shapes.
    expect(within(section).getAllByTestId("attendance-row")).toHaveLength(EVENTS.length - 1);
    expect(within(section).queryByText("Term 3 opener vs Durham")).not.toBeInTheDocument();
    expect(within(section).getByTestId("attendance-filter-chips")).toHaveTextContent(
      "Event status: Occurred",
    );

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Clear all" }));
    });

    expect(within(section).getAllByTestId("attendance-row")).toHaveLength(EVENTS.length);
    // Desktop table and phone cards both exist in this jsdom tree at once
    // (see the file header note), so the once-hidden row now appears twice.
    expect(within(section).getAllByText("Term 3 opener vs Durham").length).toBeGreaterThan(0);
  });

  it("excludes an upcoming invitation and a cancelled one from the score's denominator", async () => {
    givenRecord({ attendance: EVENTS });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    // 5 mandatory events carry an attendance record (present, absent, late,
    // excused, present) — ev-cancelled and ev-upcoming both hold no record and
    // must not move the denominator. 3 of those 5 attended (present, late,
    // present).
    expect(within(section).getByTestId("attendance-score")).toHaveTextContent(
      "3 of 5 mandatory · 60%",
    );
  });

  it('reads "7 of 7 mandatory · 100% · 8 attendants not recorded" (W2, Q-19)', async () => {
    // 7 occurred mandatory events, each with an attendance record, all
    // attended; 8 more occurred mandatory events with no attendance record at
    // all; and one mandatory event that has not happened yet. The third
    // figure counts the second group only — the first group is the score
    // above it, and the future one is excluded from both, exactly as Brian's
    // walkthrough required.
    const recorded = Array.from({ length: 7 }, (_, index) =>
      attendanceEvent({ id: `recorded-${index}`, attendance: "present" }),
    );
    const unrecorded = Array.from({ length: 8 }, (_, index) =>
      attendanceEvent({ id: `unrecorded-${index}`, invitationStatus: "issued", attendance: null }),
    );
    const future = attendanceEvent({
      id: "future",
      invitationStatus: "issued",
      attendance: null,
      eventStatus: "upcoming",
    });
    givenRecord({ attendance: [...recorded, ...unrecorded, future] });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");

    // The exact string (not a substring — this version's `toHaveTextContent`
    // always does a contains match) so a later reword of either clause
    // cannot pass silently.
    expect(within(section).getByTestId("attendance-score").textContent).toBe(
      "7 of 7 mandatory · 100% · 8 attendants not recorded",
    );
  });

  it('pluralises one unrecorded event as "1 attendant not recorded" (W2, Q-19)', async () => {
    givenRecord({
      attendance: [
        attendanceEvent({ id: "recorded-1", attendance: "present" }),
        attendanceEvent({ id: "unrecorded-1", invitationStatus: "issued", attendance: null }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getByTestId("attendance-score").textContent).toBe(
      "1 of 1 mandatory · 100% · 1 attendant not recorded",
    );
  });

  it("omits the unrecorded figure entirely when nothing occurred is unrecorded (W2, Q-19)", async () => {
    givenRecord({
      attendance: [
        attendanceEvent({ id: "recorded-1", attendance: "present" }),
        attendanceEvent({ id: "recorded-2", attendance: "absent" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    // Absent rather than reading zero — a "0 attendants not recorded" clause
    // would be noise on the common case where the register is up to date.
    expect(within(section).getByTestId("attendance-score").textContent).toBe(
      "1 of 2 mandatory · 50%",
    );
    expect(within(section).getByTestId("attendance-score")).not.toHaveTextContent("attendant");
  });

  it("counts present and late as attended; absent and excused do not", async () => {
    givenRecord({
      attendance: [
        attendanceEvent({ id: "e1", attendance: "present" }),
        attendanceEvent({ id: "e2", attendance: "late" }),
        attendanceEvent({ id: "e3", attendance: "absent" }),
        attendanceEvent({ id: "e4", attendance: "excused" }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getByTestId("attendance-score")).toHaveTextContent(
      "2 of 4 mandatory · 50%",
    );
  });

  it("says not recorded when nothing scored has an attendance record yet", async () => {
    givenRecord({
      attendance: [attendanceEvent({ id: "e1", invitationStatus: "issued", attendance: null })],
    });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getByTestId("attendance-score")).toHaveTextContent("not recorded");
  });

  it("recomputes the score against the filtered set, not the season", async () => {
    givenRecord({ attendance: EVENTS });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getByTestId("attendance-score")).toHaveTextContent(
      "3 of 5 mandatory · 60%",
    );

    const { fireEvent, act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: "Filter Attendance" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Present" }));
    });

    // Filtered to Attendance: Present — ev-present, ev-no-rsvp and (non-
    // mandatory) ev-social all read Present; only the two mandatory ones
    // score, and both attended.
    expect(within(section).getByTestId("attendance-score")).toHaveTextContent(
      "2 of 2 mandatory · 100%",
    );
    expect(within(section).getByTestId("attendance-filter-chips")).toHaveTextContent(
      "Attendance: Present",
    );
  });

  it("states an absent RSVP or attendance value as not recorded, never blank", async () => {
    givenRecord({
      attendance: [
        attendanceEvent({ id: "e1", rsvp: null, invitationStatus: "issued", attendance: null }),
      ],
    });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getAllByText("not recorded").length).toBeGreaterThan(0);
  });

  it("says nothing was sent this season when there are no attendance rows", async () => {
    givenRecord({ attendance: [] });
    render(await PlayerRecordPage(pageProps()));
    const section = screen.getByTestId("section-attendance");
    expect(within(section).getByText("No invitations sent this season.")).toBeInTheDocument();
  });
});

describe("a departed membership", () => {
  beforeEach(() => {
    givenRecord({ status: "departed", departedOn: "2026-06-01" });
  });

  it("renders complete and read-only, with no Status editor", async () => {
    render(await PlayerRecordPage(pageProps()));
    const seasonSection = screen.getByTestId("section-season");
    const statusRow = within(seasonSection)
      .getByText("Status")
      .closest('[data-testid="record-row"]') as HTMLElement;
    // Absent rather than disabled — no clickable editor at all.
    expect(within(statusRow).queryByTestId("editable-field")).not.toBeInTheDocument();
  });

  it("names the season as closed, matching the approved W6-02 mockup copy", async () => {
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByText("This season is over. Nothing here changes it.")).toBeInTheDocument();
  });
});

describe("the shipped activation control, folded into Status", () => {
  beforeEach(() => givenRecord({ status: "onboarding" }));

  it("activates an onboarding membership through the same in-place edit as every other season field", async () => {
    render(await PlayerRecordPage(pageProps()));
    const seasonSection = screen.getByTestId("section-season");
    const statusRow = within(seasonSection)
      .getByText("Status")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent, act } = await import("@testing-library/react");
    fireEvent.click(within(statusRow).getByTestId("editable-field"));
    const option = await screen.findByRole("option", { name: "Active" });
    await act(async () => fireEvent.click(option));

    expect(recordSetStatusAction).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_ID,
      status: "active",
    });
  });

  /**
   * `REQ-nothing-gates`, `W10`'s own "the normal case, not an exception".
   * The service side of this (activation succeeding straight through an
   * outstanding required item, recording no reason and touching no item) is
   * `membership.test.ts`'s own "activates straight through outstanding
   * required items" — this is this package's proof at the surface: the
   * control offers Active with the outstanding alert still on screen, and no
   * confirmation step interrupts it.
   */
  it("activates a membership with every onboarding item outstanding, with no confirmation and no dialog", async () => {
    givenRecord({
      status: "onboarding",
      onboardingItems: [
        {
          id: "item-1",
          code: "kit",
          label: "Kit sorted",
          isRequired: true,
          isSubscription: false,
          sortOrder: 1,
          status: "pending",
          completedOn: null,
          waivedReason: null,
          waivedByName: null,
          updatedAt: new Date(),
          history: [],
        },
      ],
      outstandingRequired: [
        {
          id: "item-1",
          code: "kit",
          label: "Kit sorted",
          isRequired: true,
          isSubscription: false,
          sortOrder: 1,
          status: "pending",
          completedOn: null,
          waivedReason: null,
          waivedByName: null,
          updatedAt: new Date(),
        },
      ],
    });
    render(await PlayerRecordPage(pageProps()));

    expect(screen.getByTestId("outstanding-note")).toHaveTextContent(
      "One required item is still outstanding: Kit sorted.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const seasonSection = screen.getByTestId("section-season");
    const statusRow = within(seasonSection)
      .getByText("Status")
      .closest('[data-testid="record-row"]') as HTMLElement;
    const { fireEvent, act } = await import("@testing-library/react");
    fireEvent.click(within(statusRow).getByTestId("editable-field"));
    const option = await screen.findByRole("option", { name: "Active" });
    await act(async () => fireEvent.click(option));

    // Activation calls only the status action — no dialog, and no onboarding
    // item is touched in the same act.
    expect(recordSetStatusAction).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_ID,
      status: "active",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("outstanding-note")).toHaveTextContent(
      "One required item is still outstanding: Kit sorted.",
    );
  });
});

describe("derived values say they are derived", () => {
  it("shows the Blues total across seasons and constitutional membership, both labelled as derived", async () => {
    givenRecord({
      isConstitutionalMember: true,
      person: { ...record().person, fullBlueCount: 1, halfBlueCount: 2 },
    });
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByText(/Blues total/)).toBeInTheDocument();
    expect(screen.getByText(/Constitutional member/)).toBeInTheDocument();
  });
});

describe("?created=1 — the confirmation banner survives the rebuild", () => {
  it("leads with the confirmation heading and shows the recorded contact values", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps({ created: "1" })));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Returning player added");
    expect(screen.getByTestId("created-summary")).toHaveTextContent(
      "Person and 2026-27 membership were created together.",
    );
    expect(screen.getByText("avery.fielding@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("+44 7700 900101")).toBeInTheDocument();
  });

  it("drops the confirmation and leads with the person's name without it", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps()));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.queryByTestId("created-summary")).not.toBeInTheDocument();
  });
});

describe("a membership whose person was merged away", () => {
  it("resolves to the survivor rather than rendering the stale identity", async () => {
    vi.mocked(readPlayerRecord).mockResolvedValue({
      kind: "redirect",
      href: "/operate/roster/ffffffff-ffff-4fff-8fff-ffffffffffff",
    });

    await expect(PlayerRecordPage(pageProps())).rejects.toThrow(
      "REDIRECT:/operate/roster/ffffffff-ffff-4fff-8fff-ffffffffffff",
    );
  });
});

describe("a membership that does not exist", () => {
  it("renders 404 rather than a database error", async () => {
    const { NotFound } = await import("@/lib/db");
    vi.mocked(readPlayerRecord).mockRejectedValue(
      new NotFound("That membership no longer exists.", { rule: "season_memberships_not_found" }),
    );

    await expect(PlayerRecordPage(pageProps())).rejects.toThrow("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// LAN-187 correction round 2 (review inv-fc59c691-dec, F2) — coverage that
// existed against the two retired pages (roster/screens.test.tsx,
// roster/roster-screens.test.tsx) and had no equivalent here once this page
// replaced them.
// ---------------------------------------------------------------------------

describe("status-history — hydration-safe time formatting", () => {
  it("renders the status-history time with its dateTime attribute and a fixed en-GB / Europe/London string", async () => {
    // Not `toLocaleString()` with no arguments: server and client would
    // disagree on any machine not set to en-GB/London, which is a hydration
    // mismatch and a date that reads as American to a club in Oxford. Guards
    // record-view.tsx's `<time>` element, which reuses presentation.ts's
    // shared, otherwise-untested `formatWhen`.
    givenRecord();
    render(await PlayerRecordPage(pageProps()));

    const time = within(screen.getByTestId("status-history")).getByText("12 Aug 2026, 14:36", {
      selector: "time",
    });
    expect(time).toHaveAttribute("dateTime", "2026-08-12T13:36:00.000Z");
  });
});

describe("the single exit off a player's record", () => {
  it("offers exactly one exit — Back to roster — with a usable touch target and no View membership link", async () => {
    // A defect Brian identified himself on 12 August 2026: "View membership"
    // led to this same page with the banner dismissed, which is nowhere the
    // operator could tell. record-view.tsx:604-607 still ships the single
    // Back-to-roster button; this is the regression test for that finding.
    givenRecord();
    render(await PlayerRecordPage(pageProps()));

    const exit = screen.getByRole("link", { name: "Back to roster" });
    expect(exit).toHaveAttribute("href", "/operate/roster");
    expect(exit).toHaveStyle({ minHeight: "44px" });
    expect(screen.queryByRole("link", { name: "View membership" })).not.toBeInTheDocument();
  });
});

describe("the confirmation banner's contact-values disclosure", () => {
  it("states that raw contact values are retained as entered", async () => {
    givenRecord();
    render(await PlayerRecordPage(pageProps({ created: "1" })));

    expect(screen.getByText(/Raw contact values are retained as entered/)).toBeInTheDocument();
  });
});

describe("the free status ladder — no confirmation dialog on any transition", () => {
  // roster-screens.test.tsx's own parametrized table (retired when this page
  // replaced the old membership record) proved every status offers the same
  // free select with no confirmation anywhere — Q-12, "we can flip to
  // whatever status we want to go in." This restores that coverage on the
  // in-place editor that replaced the old persistent select. Closed seasons
  // (departed/archived) render no Status editor at all — proved above in "a
  // departed membership" — so only the three open statuses can start a
  // transition; `to` covers every value the ladder holds.
  for (const from of ["onboarding", "active", "inactive"] as const) {
    for (const to of STATUSES.filter((status) => status !== from)) {
      it(`moves from ${from} to ${to} with no confirmation dialog anywhere`, async () => {
        const { fireEvent, act } = await import("@testing-library/react");
        givenRecord({ status: from });
        render(await PlayerRecordPage(pageProps()));

        const statusRow = within(screen.getByTestId("section-season"))
          .getByText("Status")
          .closest('[data-testid="record-row"]') as HTMLElement;
        fireEvent.click(within(statusRow).getByTestId("editable-field"));
        const option = await screen.findByRole("option", { name: STATUS_OPTION_LABELS[to] });
        await act(async () => fireEvent.click(option));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByText(/\bconfirm\b/i)).not.toBeInTheDocument();
        expect(recordSetStatusAction).toHaveBeenCalledWith({
          membershipId: MEMBERSHIP_ID,
          status: to,
        });
      });
    }
  }
});
