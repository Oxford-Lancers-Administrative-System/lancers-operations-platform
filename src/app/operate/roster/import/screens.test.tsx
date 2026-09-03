/**
 * The roster's bulk import surface in its three states — LAN-215,
 * `WP-arrival-doors`, screens `W1-01` through `W1-04`.
 *
 * The service layer and the action are both mocked; what is under test is
 * the screen: what an empty roster says, what the proposal shows before
 * anything is written — including the possible-duplicates section the event
 * import has no need of — and what the operator reads once an apply has
 * committed. The writes themselves are proved against the real database in
 * `../../../../lib/services/roster-import.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/roster/import",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/roster-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/roster-import")>();
  return { ...actual, readRosterImportContext: vi.fn() };
});
vi.mock("./actions", () => ({ importRosterAction: vi.fn() }));

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readRosterImportContext, type RosterImportContext } from "@/lib/services/roster-import";
import type { RosterImportPlan } from "@/lib/services/roster-csv";
import { importRosterAction } from "./actions";
import type { ImportScreenState } from "./import-state";
import RosterImportPage from "./page";
import ImportScreen, { type ImportScreenProps } from "./import-screen";

function operator(): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000020",
    personId: "00000000-0000-4000-8000-000000000021",
    displayName: "Rowan Ashdown",
    roleCodes: ["secretary"],
    isActive: true,
  };
}

function signedIn(): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
}

function context(overrides: Partial<RosterImportContext> = {}): RosterImportContext {
  return { seasonLabel: "2026-27", onRoster: 0, onboarding: 0, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// W1-01 / W1-02 — before a file is chosen
// ---------------------------------------------------------------------------

describe("the page before anything is imported", () => {
  it("states the season this writes into, and offers the template", async () => {
    signedIn();
    vi.mocked(readRosterImportContext).mockResolvedValue(context());

    render(await RosterImportPage());

    expect(screen.getByText("This season's roster has 0 players")).toBeInTheDocument();
    expect(screen.getByTestId("export-link")).toHaveTextContent("Download the template");
    expect(screen.getByTestId("import-file")).toBeInTheDocument();
    expect(screen.getByTestId("import-columns")).toHaveTextContent("first_name,last_name,mobile");
  });

  it("shows the season's own counts", async () => {
    signedIn();
    vi.mocked(readRosterImportContext).mockResolvedValue(context({ onRoster: 42, onboarding: 6 }));

    render(await RosterImportPage());

    const counts = screen.getByTestId("season-counts");
    expect(within(counts).getByText("42")).toBeInTheDocument();
    expect(within(counts).getByText("6")).toBeInTheDocument();
  });

  it("renders the service's own refusal rather than a page nobody wrote", async () => {
    signedIn();
    vi.mocked(readRosterImportContext).mockRejectedValue(new NotFound("No current season."));

    render(await RosterImportPage());

    expect(screen.getByTestId("import-unavailable")).toHaveTextContent("No current season.");
  });
});

// ---------------------------------------------------------------------------
// W1-03 — the proposal, and the duplicates underneath it
// ---------------------------------------------------------------------------

const BASE_PROPS: ImportScreenProps = {
  seasonLabel: "2026-27",
  onRoster: 42,
  onboarding: 0,
  exportHref: "/operate/roster/import/export",
};

function plan(overrides: Partial<RosterImportPlan> = {}): RosterImportPlan {
  return {
    fileName: "squad-2026-27.csv",
    seasonId: "season-1",
    seasonLabel: "2026-27",
    rowCount: 3,
    totals: { new: 1, carried_forward: 0, unchanged: 0, refused: 2 },
    applicableCount: 1,
    unansweredLines: [3],
    digest: "abc123",
    rows: [
      {
        line: 2,
        outcome: "new",
        name: "Rosalind Penhaligon",
        cells: {
          first_name: "Rosalind",
          last_name: "Penhaligon",
          mobile: "07700 900312",
          personal_email: "",
          college: "",
          matriculation_year: "",
        },
        reasons: [],
        duplicate: null,
        matchedPersonId: null,
      },
      {
        line: 3,
        outcome: "refused",
        name: "Beatrix Ashgrove",
        cells: {
          first_name: "Beatrix",
          last_name: "Ashgrove",
          mobile: "07700 900450",
          personal_email: "ba@example.ac.uk",
          college: "St Anne's",
          matriculation_year: "2025",
        },
        reasons: ["Refused until the possible duplicate below is answered."],
        duplicate: {
          candidates: [
            {
              personId: "person-1",
              displayName: "Beatrix Ashgrove",
              email: null,
              phone: "07700 900450",
              matchedOn: ["given name", "family name"],
              currentMembershipSeasonLabel: null,
            },
          ],
        },
        matchedPersonId: null,
      },
      {
        line: 4,
        outcome: "refused",
        name: "Wrenfield",
        cells: {
          first_name: "",
          last_name: "Wrenfield",
          mobile: "07700 900184",
          personal_email: "",
          college: "",
          matriculation_year: "",
        },
        reasons: ['"first_name" is empty.'],
        duplicate: null,
        matchedPersonId: null,
      },
    ],
    ...overrides,
  };
}

/** Chooses a CSV file, which the real screen turns into a `propose` submit. */
async function chooseFile(csvText: string, fileName = "squad-2026-27.csv"): Promise<void> {
  const input = screen.getByTestId("import-file") as HTMLInputElement;
  const file = new File([csvText], fileName, { type: "text/csv" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

const SOME_CSV = "first_name,last_name,mobile\r\nRosalind,Penhaligon,07700 900312\r\n";

describe("the proposal", () => {
  it("shows counts, a New row and two Refused rows, before anything is written", async () => {
    const built = plan();
    vi.mocked(importRosterAction).mockResolvedValue({
      error: null,
      plan: built,
      csvText: SOME_CSV,
      fileName: "squad-2026-27.csv",
      duplicateAnswers: {},
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(SOME_CSV);

    expect(await screen.findByTestId("import-table")).toBeInTheDocument();
    expect(screen.getByText("Import — squad-2026-27.csv")).toBeInTheDocument();
    expect(screen.getByTestId("import-subheading")).toHaveTextContent(
      "nothing is written until you confirm",
    );

    expect(screen.getAllByText("New")).not.toHaveLength(0);
    expect(screen.getAllByText("Refused")).not.toHaveLength(0);

    expect(screen.getByTestId("apply-import")).toHaveTextContent("Confirm — add 1 player");
    expect(screen.getByTestId("apply-import")).not.toBeDisabled();
    expect(screen.getByTestId("import-boundaries")).toBeInTheDocument();
  });

  it("shows the possible-duplicates section for the unanswered row, with Same person and Different person", async () => {
    const built = plan();
    vi.mocked(importRosterAction).mockResolvedValue({
      error: null,
      plan: built,
      csvText: SOME_CSV,
      fileName: "squad-2026-27.csv",
      duplicateAnswers: {},
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(SOME_CSV);

    const duplicates = await screen.findByTestId("import-duplicates");
    expect(within(duplicates).getByText("Possible duplicates — 1 to answer")).toBeInTheDocument();
    expect(screen.getByTestId("same-person-3-person-1")).toHaveTextContent("Same person");
    expect(screen.getByTestId("different-person-3")).toHaveTextContent("Different person");

    // The malformed row (missing first_name) is refused for a reason no
    // answer could fix, and never appears in the duplicates section.
    expect(screen.queryByTestId("duplicate-4")).not.toBeInTheDocument();
  });

  it("answering 'same person' resubmits with intent propose and the merged answer", async () => {
    const built = plan();
    vi.mocked(importRosterAction).mockResolvedValue({
      error: null,
      plan: built,
      csvText: SOME_CSV,
      fileName: "squad-2026-27.csv",
      duplicateAnswers: {},
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(SOME_CSV);
    await screen.findByTestId("import-duplicates");

    vi.mocked(importRosterAction).mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId("same-person-3-person-1"));
    });

    const call = vi.mocked(importRosterAction).mock.calls[0];
    const formData = call[1] as FormData;
    expect(formData.get("intent")).toBe("propose");
    expect(formData.get("answerLine")).toBe("3");
    expect(formData.get("answerValue")).toBe("person-1");
  });
});

// ---------------------------------------------------------------------------
// W1-04 — what happened, after confirming
// ---------------------------------------------------------------------------

describe("what happened, after confirming", () => {
  it("replaces the confirmation with who arrived and what was refused", async () => {
    const built = plan();
    vi.mocked(importRosterAction).mockResolvedValue({
      error: null,
      plan: built,
      csvText: SOME_CSV,
      fileName: "squad-2026-27.csv",
      duplicateAnswers: {},
      applied: { created: 1, carriedForward: 0, unchanged: 0, refused: 2, welcomesQueued: 1 },
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(SOME_CSV);

    expect(await screen.findByTestId("import-applied")).toHaveTextContent("1 welcome is queued");
    expect(screen.queryByTestId("import-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("import-duplicates")).not.toBeInTheDocument();

    const arrived = screen.getByTestId("applied-arrived");
    expect(within(arrived).getByText("Rosalind Penhaligon")).toBeInTheDocument();

    const refused = screen.getByTestId("applied-refused");
    expect(within(refused).getByText(/Line 3 — Beatrix Ashgrove/)).toBeInTheDocument();
    expect(within(refused).getByText(/Line 4 — Wrenfield/)).toBeInTheDocument();

    expect(screen.getByTestId("import-boundaries")).toBeInTheDocument();
  });
});
