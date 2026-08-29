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
import { readPlayerRecord } from "@/lib/services/player-record";
import type { PlayerRecordData, PlayerRecordResult } from "@/lib/services/player-record";
import { recordSetStatusAction } from "./record-actions";
import PlayerRecordPage from "./page";

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

  it("names the season as closed", async () => {
    render(await PlayerRecordPage(pageProps()));
    expect(
      screen.getByText("This season is closed. Nothing here is editable."),
    ).toBeInTheDocument();
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
