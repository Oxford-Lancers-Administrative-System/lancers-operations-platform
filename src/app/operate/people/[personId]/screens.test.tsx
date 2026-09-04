/**
 * `W1-05` … `W1-12` — the person record, the merged-away redirect and the
 * history section. LAN-184.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/person-record", () => ({ readPersonRecord: vi.fn() }));
vi.mock("@/lib/services/person-fact-dispute", () => ({ readLatestPersonFactDisputes: vi.fn() }));
vi.mock("@/lib/services/seasons", () => ({ readCurrentSeason: vi.fn() }));
vi.mock("@/lib/services/people-directory", () => ({
  listMergedPredecessors: vi.fn(),
  listPersonRoleAssignments: vi.fn(),
  listPersonSeasons: vi.fn(),
  readPersonHistory: vi.fn(),
  resolveMergeSurvivor: vi.fn(),
}));

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { readPersonRecord, type PersonRecord } from "@/lib/services/person-record";
import { readCurrentSeason } from "@/lib/services/seasons";
import {
  listMergedPredecessors,
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  resolveMergeSurvivor,
} from "@/lib/services/people-directory";
import {
  readLatestPersonFactDisputes,
  type PersonFactDisputeDisplay,
} from "@/lib/services/person-fact-dispute";
import PersonRecordPage from "./page";

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: "11111111-1111-4111-8111-111111111111",
      displayName: "Morgan Pike",
      roleCodes,
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function pageProps(personId: string, query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ personId }),
    searchParams: Promise.resolve(query),
  } as never;
}

function baseRecord(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    personId: "p1",
    givenName: "Bertram",
    givenNameSource: null,
    familyName: null,
    familyNameSource: null,
    aliases: [],
    displayName: "Bertram",
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
    contacts: [],
    isPastMember: false,
    standingIsOverridden: false,
    isUnder18: null,
    halfBlueCount: 0,
    fullBlueCount: 0,
    mergedIntoPersonId: null,
    missingRequiredFields: ["family_name", "personal_email", "college"],
    ...overrides,
  };
}

function stubReads(
  overrides: {
    roles?: unknown[];
    seasons?: unknown[];
    history?: unknown[];
    predecessors?: unknown[];
    disputes?: PersonFactDisputeDisplay[];
  } = {},
) {
  vi.mocked(listPersonRoleAssignments).mockResolvedValue((overrides.roles as never) ?? []);
  vi.mocked(listPersonSeasons).mockResolvedValue((overrides.seasons as never) ?? []);
  vi.mocked(readPersonHistory).mockResolvedValue((overrides.history as never) ?? []);
  vi.mocked(listMergedPredecessors).mockResolvedValue((overrides.predecessors as never) ?? []);
  vi.mocked(readLatestPersonFactDisputes).mockResolvedValue(overrides.disputes ?? []);
  vi.mocked(readCurrentSeason).mockResolvedValue({
    id: "s1",
    label: "2026-27",
    status: "active",
    startsOn: null,
    endsOn: null,
  });
}

describe("an operator outside the four offices", () => {
  it("is refused, and the record is never read", async () => {
    signedInAs(["treasurer"]);

    render(await PersonRecordPage(pageProps("p1")));

    expect(
      screen.getByRole("heading", { name: "You do not have access to this action" }),
    ).toBeVisible();
    expect(readPersonRecord).not.toHaveBeenCalled();
  });
});

describe("the person record, for an authorized operator", () => {
  it("states every absent field as not recorded, never blank", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads();

    const { container } = render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getAllByText("not recorded").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toContain("undefined");
  });

  it("shows who supplied a contact value, from its own stored source", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        familyName: "Fielding",
        contacts: [
          {
            id: "c1",
            kind: "phone",
            scope: null,
            rawValue: "+447700900233",
            normalisedValue: null,
            isPreferred: true,
            source: "Norbert Mereworth",
            validFrom: new Date(),
            validUntil: null,
          },
        ],
        missingRequiredFields: [],
      }),
    );
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getByText("+447700900233")).toBeVisible();
    expect(screen.getByText("Norbert Mereworth")).toBeVisible();
  });

  // Q-13: college, matriculation year, expected graduation, degree field,
  // given name, family name and date of birth have no `source` column of
  // their own — `readPersonRecord()` derives who supplied them from
  // `audit_events` instead. This is the acceptance test for that derivation.
  it("shows who supplied a field derived from history, and says so plainly where history has none", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        familyName: "Fielding",
        familyNameSource: null, // never edited through the application
        college: "Merton",
        collegeSource: "Norbert Mereworth", // most recent person_college_updated
        matriculationYear: 2023,
        matriculationYearSource: null,
        missingRequiredFields: [],
      }),
    );
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getByText("Merton")).toBeVisible();
    expect(screen.getByText("Norbert Mereworth")).toBeVisible();
    // Matriculation year has a value but no audit row naming who set it —
    // this is the "not recorded" caption `Q-13` chose over inventing one,
    // not the absent-value caption (2023 itself is plainly visible).
    expect(screen.getByText("2023")).toBeVisible();
    expect(screen.getAllByText("not recorded").length).toBeGreaterThan(0);
  });

  it("opens a recruit with their status, and no funnel control", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({ status: "recruit", missingRequiredFields: [] }),
    );
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    // Both the status chip and the "to the club" chip read Recruit — the same
    // pair the approved `W1-08` mockup draws for a recruit's header.
    expect(screen.getAllByText("Recruit").length).toBeGreaterThan(0);
    for (const forbidden of ["Advance", "Convert", "Decline", "Committed", "First contact"]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it("routes Correct and Merge to LAN-185's surfaces without building them", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getByRole("link", { name: "Correct this record" })).toHaveAttribute(
      "href",
      "/operate/people/p1/edit",
    );
    expect(screen.getByRole("link", { name: "Merge…" })).toHaveAttribute(
      "href",
      "/operate/people/p1/merge",
    );
  });

  it("shows the merge notice on the survivor's record", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads({
      predecessors: [
        {
          personId: "old-1",
          displayName: "Holly Jarrowdale",
          mergedAt: new Date("2025-10-03T09:22:00Z"),
          mergedByDisplayName: "Caspian Hallowfield",
        },
      ],
    });

    render(await PersonRecordPage(pageProps("p1")));

    const notice = screen.getByTestId("merge-notice");
    expect(notice.textContent).toContain("Holly Jarrowdale");
    expect(notice.textContent).toContain("Caspian Hallowfield");
  });

  it("redirects a merged-away id to the surviving record", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockRejectedValue(
      new NotFound("This record was merged into another person.", { rule: "person_merged_away" }),
    );
    vi.mocked(resolveMergeSurvivor).mockResolvedValue("survivor-1");

    await expect(PersonRecordPage(pageProps("old-1"))).rejects.toThrow(
      "REDIRECT:/operate/people/survivor-1",
    );
  });

  const ONE_HISTORY_ENTRY = [
    {
      id: "h1",
      occurredAt: new Date("2026-08-24T09:12:00Z"),
      field: "Status",
      summary: "Status changed",
      fromValue: "Onboarding",
      toValue: "Active",
      actorDisplayName: "Caspian Hallowfield",
      reason: null,
    },
  ];

  it("collapses the history section by default", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads({ history: ONE_HISTORY_ENTRY });

    const collapsed = render(await PersonRecordPage(pageProps("p1")));

    expect(collapsed.getByTestId("history-show-all")).toHaveTextContent("Show all 1 →");
  });

  it("expands the history section on request, with its field and actor filters", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads({ history: ONE_HISTORY_ENTRY });

    const expanded = render(await PersonRecordPage(pageProps("p1", { history: "expanded" })));

    expect(expanded.getByTestId("history-filters")).toBeVisible();
    expect(expanded.getByText("Status changed")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// W7 — settling a disputed fact. `WP-operator-record`, LAN-217,
// `REQ-no-silent-overwrite`.
// ---------------------------------------------------------------------------

function openDispute(overrides: Partial<PersonFactDisputeDisplay> = {}): PersonFactDisputeDisplay {
  return {
    id: "dispute-1",
    personId: "p1",
    field: "college",
    clubValue: "Farrowgate",
    playerValue: "Brasenose",
    raisedByPersonId: "player-1",
    raisedAt: new Date("2026-09-02T18:00:00Z"),
    status: "open",
    resolutionNote: null,
    resolvedByPersonId: null,
    resolvedAt: null,
    raisedByName: "Merrick Thornbury",
    resolvedByName: null,
    ...overrides,
  };
}

describe("W7 — settling a disputed fact", () => {
  it("shows both values with both attributions, and a four-role resolve control", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        college: "Farrowgate",
        collegeSource: "Caspian Hallowfield",
        missingRequiredFields: [],
      }),
    );
    stubReads({ disputes: [openDispute()] });

    render(await PersonRecordPage(pageProps("p1")));

    // The club's value, already shipped.
    expect(screen.getByText("Farrowgate")).toBeVisible();
    expect(screen.getByText("Caspian Hallowfield")).toBeVisible();
    // The player's contested answer, and who submitted it.
    const open = screen.getByTestId("dispute-open");
    expect(open.textContent).toContain("Brasenose");
    expect(open.textContent).toContain("Merrick Thornbury");
    // The four-role resolve control, drawing no note field.
    expect(screen.getByTestId("dispute-keep-club")).toBeVisible();
    expect(screen.getByTestId("dispute-take-player")).toBeVisible();
    expect(screen.queryByLabelText(/reason|note/i)).not.toBeInTheDocument();
  });

  it("keeps the losing value visible, dated, once the dispute is resolved", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        college: "Brasenose",
        collegeSource: "Caspian Hallowfield",
        missingRequiredFields: [],
      }),
    );
    stubReads({
      disputes: [
        openDispute({
          status: "resolved_took_player",
          resolvedByPersonId: "op-1",
          resolvedByName: "Caspian Hallowfield",
          resolvedAt: new Date("2026-09-02T19:00:00Z"),
        }),
      ],
    });

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getByText("Brasenose")).toBeVisible();
    const retained = screen.getByTestId("dispute-retained");
    expect(retained.textContent).toContain("Farrowgate");
    expect(retained.textContent).toContain("Superseded");
    // Resolved — no resolve control left to press again.
    expect(screen.queryByTestId("dispute-keep-club")).not.toBeInTheDocument();
  });

  it("attributes a kept-club confirmation to the resolver, not the original recorder", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        college: "Farrowgate",
        collegeSource: "Caspian Hallowfield",
        missingRequiredFields: [],
      }),
    );
    stubReads({
      disputes: [
        openDispute({
          status: "resolved_kept_club",
          resolvedByPersonId: "op-1",
          resolvedByName: "Rowan Ashdown",
          resolvedAt: new Date("2026-09-02T19:00:00Z"),
        }),
      ],
    });

    render(await PersonRecordPage(pageProps("p1")));

    const retained = screen.getByTestId("dispute-retained");
    expect(retained.textContent).toContain("Brasenose");
    expect(retained.textContent).toContain("Rowan Ashdown");
    expect(retained.textContent).toContain("Not accepted");
  });

  it("shows no dispute affordance at all for a field nobody has ever disputed", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.queryByTestId("dispute-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dispute-retained")).not.toBeInTheDocument();
  });
});
