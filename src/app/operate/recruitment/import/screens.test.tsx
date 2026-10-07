/**
 * The recruit import's surface in its three states, and its door — LAN-487.
 *
 * The service and the action are mocked: what is under test is the page's
 * gate, the screen before a file, the proposal with its duplicate question
 * and a refused row, and what the operator reads after an apply. The writes
 * are proved against the real database in
 * `../../../../lib/services/recruit-import.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/recruitment/import",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/recruit-import", () => ({ readRecruitImportContext: vi.fn() }));
vi.mock("./actions", () => ({ importRecruitsAction: vi.fn() }));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { NO_GRANTS } from "@/lib/auth/grants";
import { readRecruitImportContext } from "@/lib/services/recruit-import";
import type { RecruitImportPlan, RecruitImportColumn } from "@/lib/services/recruit-csv";
import AddRecruitsMenu from "../add-recruits-menu";
import { importRecruitsAction } from "./actions";
import type { RecruitImportScreenState } from "./import-state";
import RecruitImportScreen from "./import-screen";
import RecruitImportPage from "./page";

function operator(grants = seededGrantsFor(["secretary"])): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000487",
    personId: "00000000-0000-4000-8000-000000000488",
    displayName: "Rowan Ashdown",
    roleCodes: ["secretary"],
    grants,
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function cells(overrides: Partial<Record<RecruitImportColumn, string>>) {
  const empty = {
    first_name: "",
    last_name: "",
    mobile: "",
    college_email: "",
    personal_email: "",
    known_as: "",
    college: "",
    matriculation_year: "",
    expected_graduation_year: "",
    degree_field: "",
    date_of_birth: "",
    emergency_first_name: "",
    emergency_last_name: "",
    emergency_relationship: "",
    emergency_phone: "",
    emergency_email: "",
    opt_in: "",
    opt_in_note: "",
  } satisfies Record<RecruitImportColumn, string>;
  return { ...empty, ...overrides };
}

function plan(overrides: Partial<RecruitImportPlan> = {}): RecruitImportPlan {
  return {
    fileName: "fair-sheet.csv",
    seasonId: "season-1",
    seasonLabel: "2026-27",
    rowCount: 3,
    totals: { new: 1, existing: 0, already_recruit: 0, refused: 2 },
    applicableCount: 1,
    unansweredLines: [3],
    audienceAdds: 1,
    digest: "abc123",
    rows: [
      {
        line: 2,
        outcome: "new",
        name: "Rosalind Penhaligon",
        cells: cells({
          first_name: "Rosalind",
          last_name: "Penhaligon",
          mobile: "07700 900312",
          opt_in: "gave_it",
        }),
        reasons: [],
        duplicate: null,
        matchedPersonId: null,
        resolvedOn: null,
        overridesExactMatch: false,
      },
      {
        line: 3,
        outcome: "refused",
        name: "Beatrix Ashgrove",
        cells: cells({
          first_name: "Beatrix",
          last_name: "Ashgrove",
          mobile: "07700 900450",
          college_email: "beatrix.ashgrove@college.ox.ac.uk",
        }),
        reasons: ["Refused until the possible duplicate below is answered."],
        duplicate: {
          candidates: [
            {
              personId: "person-1",
              displayName: "Beatrix Ashgrove",
              email: "beatrix.ashgrove@college.ox.ac.uk",
              phone: null,
              matchedOn: ["first name", "college email"],
              identity: { kind: "recruit", prospectStatus: "engaged", seasonLabel: "2026-27" },
            },
          ],
        },
        matchedPersonId: null,
        resolvedOn: null,
        overridesExactMatch: false,
      },
      {
        line: 4,
        outcome: "refused",
        name: "Wrenfield Testcase",
        cells: cells({ first_name: "Wrenfield", last_name: "Testcase" }),
        reasons: ['"mobile" is empty. A mobile number is required.'],
        duplicate: null,
        matchedPersonId: null,
        resolvedOn: null,
        overridesExactMatch: false,
      },
    ],
    ...overrides,
  };
}

const SOME_CSV = "first_name,last_name,mobile\r\nRosalind,Penhaligon,07700 900312\r\n";

async function chooseFile(): Promise<void> {
  const input = screen.getByTestId("import-file") as HTMLInputElement;
  const file = new File([SOME_CSV], "fair-sheet.csv", { type: "text/csv" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

function proposed(built = plan()): RecruitImportScreenState {
  return {
    error: null,
    plan: built,
    csvText: SOME_CSV,
    fileName: "fair-sheet.csv",
    duplicateAnswers: {},
    applied: null,
  };
}

const PROPS = {
  seasonLabel: "2026-27",
  recruits: 12,
  templateHref: "/operate/recruitment/import/template",
};

describe("the page", () => {
  it("refuses a seat without May add recruits, and reads nothing", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(NO_GRANTS),
    });

    render(await RecruitImportPage());

    expect(screen.getByTestId("operator-not-permitted")).toBeInTheDocument();
    expect(readRecruitImportContext).not.toHaveBeenCalled();
  });

  it("states the season and its recruits, and offers the template", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
    vi.mocked(readRecruitImportContext).mockResolvedValue({ seasonLabel: "2026-27", recruits: 12 });

    render(await RecruitImportPage());

    expect(screen.getByText("This season has 12 recruits")).toBeInTheDocument();
    expect(screen.getByTestId("export-link")).toHaveAttribute(
      "href",
      "/operate/recruitment/import/template",
    );
    expect(screen.getByTestId("import-columns")).toHaveTextContent(
      "first_name,last_name,mobile,college_email,personal_email",
    );
    expect(screen.getByTestId("import-columns")).toHaveTextContent("gave_it");
  });
});

describe("the proposal", () => {
  it("shows the totals, how many join event audiences, and the refused rows with their lines", async () => {
    vi.mocked(importRecruitsAction).mockResolvedValue(proposed());
    render(<RecruitImportScreen {...PROPS} />);
    await chooseFile();

    expect(await screen.findByTestId("import-table")).toBeInTheDocument();
    const totals = screen.getByTestId("import-totals");
    expect(within(totals).getByText("Added to event audiences")).toBeInTheDocument();
    expect(screen.getByTestId("import-row-4")).toHaveTextContent(
      'Line 4: "mobile" is empty. A mobile number is required.',
    );
    expect(screen.getByTestId("import-row-2")).toHaveTextContent("They gave it to us themselves");
    expect(screen.getByTestId("apply-import")).toHaveTextContent("Confirm — add 1 recruit");
  });

  it("asks the roster's duplicate question, naming what matched and who the candidate is", async () => {
    vi.mocked(importRecruitsAction).mockResolvedValue(proposed());
    render(<RecruitImportScreen {...PROPS} />);
    await chooseFile();

    const question = await screen.findByTestId("duplicate-3");
    expect(question).toHaveTextContent("In the file, line 3");
    expect(question).toHaveTextContent("Matched on: first name, college email");
    expect(screen.getByTestId("duplicate-standing-3-person-1")).toHaveTextContent(
      "Recruit · Engaged · 2026-27",
    );
    expect(screen.getByTestId("same-person-3-person-1")).toHaveTextContent("Same person");
    expect(screen.getByTestId("different-person-3")).toHaveTextContent("Different person");
  });

  it("answers with one click, carrying the file and the line back to the action", async () => {
    vi.mocked(importRecruitsAction).mockResolvedValue(proposed());
    render(<RecruitImportScreen {...PROPS} />);
    await chooseFile();

    await act(async () => {
      fireEvent.click(await screen.findByTestId("different-person-3"));
    });

    const formData = vi.mocked(importRecruitsAction).mock.calls.at(-1)?.[1] as FormData;
    expect(formData.get("intent")).toBe("propose");
    expect(formData.get("answerLine")).toBe("3");
    expect(formData.get("answerValue")).toBe("different");
    expect(formData.get("csvText")).toBe(SOME_CSV);
  });
});

describe("after applying", () => {
  it("says what arrived, what was refused and why", async () => {
    vi.mocked(importRecruitsAction).mockResolvedValue({
      ...proposed(),
      applied: {
        created: 1,
        existing: 0,
        alreadyRecruits: 0,
        refused: 2,
        welcomesQueued: 1,
        addedToAudiences: 1,
      },
    });
    render(<RecruitImportScreen {...PROPS} />);
    await chooseFile();

    expect(await screen.findByTestId("import-applied")).toHaveTextContent(
      "1 recruit was added. 1 welcome is queued. 1 added to event audiences. 2 rows were refused.",
    );
    expect(screen.getByTestId("applied-arrived")).toHaveTextContent("Rosalind Penhaligon");
    expect(screen.getByTestId("applied-refused")).toHaveTextContent("Line 4 — Wrenfield Testcase");
  });
});

describe("the board's Add recruits menu", () => {
  it("offers Add recruit and Import recruits", async () => {
    render(<AddRecruitsMenu testId="recruitment-add-button" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("recruitment-add-button"));
    });
    expect(screen.getByTestId("add-recruits-new")).toHaveAttribute(
      "href",
      "/operate/recruitment/new",
    );
    expect(screen.getByTestId("add-recruits-import")).toHaveAttribute(
      "href",
      "/operate/recruitment/import",
    );
    expect(screen.getByTestId("add-recruits-import")).toHaveTextContent("Import recruits");
  });
});
