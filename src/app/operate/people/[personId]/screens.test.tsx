/**
 * `W1-05` … `W1-12` — the person record, the merged-away redirect and the
 * history section. LAN-184.
 */
import { describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/person-record", () => ({ readPersonRecord: vi.fn() }));
vi.mock("@/lib/services/seasons", () => ({ readCurrentSeason: vi.fn() }));
// LAN-361 — the record reads the erasure panel's own state for an operator who
// holds the capability. Mocked with the ordinary answer: an eligible person,
// nobody having confirmed yet.
vi.mock("@/lib/services/person-erasure", () => ({ readErasureState: vi.fn() }));
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
import { readErasureState } from "@/lib/services/person-erasure";
import {
  listMergedPredecessors,
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  resolveMergeSurvivor,
} from "@/lib/services/people-directory";
import PersonRecordPage from "./page";
import { seededGrantsFor } from "@/lib/auth/capabilities";

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: "11111111-1111-4111-8111-111111111111",
      displayName: "Morgan Pike",
      roleCodes,
      grants: seededGrantsFor(roleCodes),
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
    middleName: null,
    middleNameSource: null,
    familyName: null,
    familyNameSource: null,
    aliases: [],
    displayName: "Bertram",
    knownAs: null,
    status: "active",
    college: null,
    collegeSource: null,
    matriculationYear: null,
    matriculationYearSource: null,
    expectedGraduationYear: null,
    expectedGraduationYearSource: null,
    degreeField: null,
    degreeFieldSource: null,
    studentNumber: null,
    studentNumberSource: null,
    bafaRegistrationNumber: null,
    bafaRegistrationNumberSource: null,
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
    erasure?: unknown;
  } = {},
) {
  vi.mocked(listPersonRoleAssignments).mockResolvedValue((overrides.roles as never) ?? []);
  vi.mocked(listPersonSeasons).mockResolvedValue((overrides.seasons as never) ?? []);
  vi.mocked(readPersonHistory).mockResolvedValue((overrides.history as never) ?? []);
  vi.mocked(listMergedPredecessors).mockResolvedValue((overrides.predecessors as never) ?? []);
  vi.mocked(readErasureState).mockResolvedValue(
    (overrides.erasure as never) ??
      ({
        personId: "person-1",
        eligibility: { eligible: true, blockers: [], alreadyErased: false },
        signOffs: [],
        stillNeeded: ["president", "general_manager"],
        viewerMayConfirm: true,
      } as never),
  );
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

  /**
   * LAN-365, Brian 2026-09-16: "no academic section." The two identifiers
   * moved into the personal group first; the correction round folded college,
   * matriculation year, expected graduation and degree field in beside them
   * too — after the contact details, before the two identifiers, and BAFA
   * last because the club fills it in.
   */
  it("shows the academic facts and both identifiers in the personal group, none under a separate Academic heading", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({
        college: "Wadham",
        matriculationYear: 2024,
        expectedGraduationYear: 2028,
        degreeField: "Engineering Science",
        studentNumber: "1234567",
        bafaRegistrationNumber: "BAFA-99",
      }),
    );
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.queryByRole("heading", { name: "Academic" })).toBeNull();

    const personal = screen.getByRole("heading", { name: "Who they are" }).closest("section");
    expect(personal).not.toBeNull();
    expect(within(personal as HTMLElement).getByText("Wadham")).toBeTruthy();
    expect(within(personal as HTMLElement).getByText("2024")).toBeTruthy();
    expect(within(personal as HTMLElement).getByText("2028")).toBeTruthy();
    expect(within(personal as HTMLElement).getByText("Engineering Science")).toBeTruthy();
    expect(within(personal as HTMLElement).getByText("1234567")).toBeTruthy();
    expect(within(personal as HTMLElement).getByText("BAFA-99")).toBeTruthy();

    // "Who they are" itself renders after the contact details.
    const contact = screen.getByRole("heading", { name: "How to reach them" }).closest("section");
    expect(contact).not.toBeNull();
    expect(
      (personal!.compareDocumentPosition(contact!) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    ).toBe(true);

    // Ordered: the academic facts, then the identifiers, BAFA last.
    const labels = within(personal as HTMLElement)
      .getAllByText(
        /^(First name|Last name|Known as|Aliases|College|Matriculation year|Expected graduation|Degree field|Student number|BAFA registration number)$/,
      )
      .map((node) => node.textContent);
    expect(labels.at(-1)).toBe("BAFA registration number");
    expect(labels.at(-2)).toBe("Student number");
    expect(labels.indexOf("College")).toBeGreaterThan(labels.indexOf("Aliases"));
    expect(labels.indexOf("Student number")).toBeGreaterThan(labels.indexOf("Degree field"));
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
  it("shows known field provenance and omits the caption where history has none", async () => {
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
    // LAN-233 only displays provenance when it is known; the value stays visible.
    expect(screen.getByText("2023")).toBeVisible();
    expect(
      screen
        .getByText("2023")
        .closest('[data-testid="record-row"]')
        ?.querySelector('[data-testid="fact-provenance"]'),
    ).toBeNull();
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

// LAN-257. "This is them" on `/operate/people/new` writes nothing onto the
// chosen person — that is right, and it is now what `/operate/roster/new` does
// too — but it used to land here in silence, on a record showing a different
// number from the one the operator had typed a second earlier.
describe("the landing after This is them", () => {
  it("names the typed contact that was not recorded, and where to record it", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads();

    render(await PersonRecordPage(pageProps("p1", { linked: "1", unsaved: "phone,email" })));

    const notice = screen.getByTestId("linked-contact-not-recorded");
    expect(notice).toHaveTextContent("Not recorded: Mobile · Personal email.");
    expect(within(notice).getByTestId("linked-contact-correct-link")).toHaveAttribute(
      "href",
      "/operate/people/p1/edit",
    );
  });

  it("says nothing on an ordinary visit, or when nothing was discarded", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));
    expect(screen.queryByTestId("linked-contact-not-recorded")).not.toBeInTheDocument();
  });
});

// LAN-257 — `contact_points.scope` is null for an email nobody has classified
// yet, which is exactly what `/operate/roster/new` writes for a person it
// mints. Until this row existed the address the club held appeared on no
// screen: an invisible write of the same shape LAN-257 is about.
describe("an email nobody has classified yet", () => {
  const unclassified = {
    id: "c9",
    kind: "email" as const,
    scope: null,
    rawValue: "bertram@example.invalid",
    normalisedValue: null,
    isPreferred: true,
    source: "operator intake",
    validFrom: new Date(),
    validUntil: null,
  };

  it("is shown on the record, said to be unclassified rather than guessed at", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(
      baseRecord({ contacts: [unclassified], missingRequiredFields: [] }),
    );
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));

    expect(screen.getByText("bertram@example.invalid")).toBeVisible();
    expect(screen.getByText("Email · not classified")).toBeVisible();
    // Not promoted to either kind: the scope is genuinely unknown, and
    // guessing it from the domain would be inventing data about a person.
    const personal = screen.getByText("Personal email").closest('[data-testid="record-row"]');
    expect(personal).toHaveTextContent("not recorded");
  });

  it("adds no row at all to a record that has none", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord({ missingRequiredFields: [] }));
    stubReads();

    render(await PersonRecordPage(pageProps("p1")));
    expect(screen.queryByText("Email · not classified")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LAN-361 — the erasure panel, at the bottom of the record
// ---------------------------------------------------------------------------

describe("the data-protection panel", () => {
  it("offers the export and the action when the person is eligible", async () => {
    signedInAs(["president"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads();

    render(await PersonRecordPage(pageProps("person-1")));

    const panel = screen.getByTestId("section-data-protection");
    expect(within(panel).getByTestId("export-person")).toBeInTheDocument();
    expect(within(panel).getByTestId("open-erasure-dialog")).toBeInTheDocument();
    expect(within(panel).queryByTestId("erasure-blocked")).toBeNull();
  });

  it("states why it refuses, rather than offering a control that would fail", async () => {
    signedInAs(["president"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads({
      erasure: {
        personId: "person-1",
        eligibility: {
          eligible: false,
          alreadyErased: false,
          blockers: [
            {
              rule: "erasure_operator_account_live",
              reason: "This person still holds an operator account.",
            },
          ],
        },
        signOffs: [],
        stillNeeded: ["president", "general_manager"],
        viewerMayConfirm: true,
      },
    });

    render(await PersonRecordPage(pageProps("person-1")));

    const panel = screen.getByTestId("section-data-protection");
    expect(within(panel).getByTestId("erasure-blocked").textContent).toContain(
      "still holds an operator account",
    );
    expect(within(panel).queryByTestId("open-erasure-dialog")).toBeNull();
  });

  it("names who has confirmed and who is still needed", async () => {
    signedInAs(["president"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads({
      erasure: {
        personId: "person-1",
        eligibility: { eligible: true, blockers: [], alreadyErased: false },
        signOffs: [
          {
            signedByPersonId: "signer-1",
            signedByName: "Wren Ashcombe",
            roleCodes: ["president"],
            roleLabel: "President",
            signedAt: new Date("2026-09-15T10:00:00Z"),
            requestedOn: "2026-09-10",
          },
        ],
        stillNeeded: ["general_manager"],
        viewerMayConfirm: false,
      },
    });

    render(await PersonRecordPage(pageProps("person-1")));

    const signoffs = screen.getByTestId("erasure-signoffs").textContent ?? "";
    expect(signoffs).toContain("Wren Ashcombe");
    expect(signoffs).toContain("President");
    expect(signoffs).toContain("General Manager");
  });

  it("is absent entirely for an operator who does not hold the capability", async () => {
    signedInAs(["treasurer"]);
    vi.mocked(readPersonRecord).mockResolvedValue(baseRecord());
    stubReads();

    render(await PersonRecordPage(pageProps("person-1")));

    expect(screen.queryByTestId("section-data-protection")).toBeNull();
  });
});
