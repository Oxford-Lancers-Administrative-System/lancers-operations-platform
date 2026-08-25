/**
 * The bulk import surface in its four states — LAN-155, screens `W3-01`
 * through `W3-05`.
 *
 * The service layer and the action are both mocked; what is under test is the
 * screen: what an empty season says, what a season with events already in it
 * says, what the proposal shows before anything is written, and what the
 * operator reads once an apply has committed. The rules a row obeys —
 * upsert-only, blank means no change, an approved event is refused — are
 * `./event-csv.test.ts`'s; the writes themselves are proved against the real
 * database in `../../../../lib/services/event-import.test.ts`. This file
 * reuses `planImport`, the pure planner, to build a real `ImportPlan` rather
 * than hand-authoring one field at a time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events/import",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/event-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-import")>();
  return { ...actual, readSeasonImportContext: vi.fn() };
});
vi.mock("./actions", () => ({ importEventsAction: vi.fn() }));

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readSeasonImportContext, type SeasonImportContext } from "@/lib/services/event-import";
import { planImport, type ImportableEvent, type ImportPlanResult } from "@/lib/services/event-csv";
import { importEventsAction } from "./actions";
import { EMPTY_IMPORT_STATE, type ImportScreenState } from "./import-state";
import BulkImportPage from "./page";
import ImportScreen, { type ImportScreenProps } from "./import-screen";

function operator(): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000010",
    personId: "00000000-0000-4000-8000-000000000011",
    displayName: "Rowan Ashdown",
    roleCodes: ["secretary"],
    isActive: true,
  };
}

function signedIn(): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
}

function context(overrides: Partial<SeasonImportContext> = {}): SeasonImportContext {
  return {
    season: {
      id: "season-1",
      label: "2026-27",
      status: "active",
      startsOn: "2026-04-26",
      endsOn: null,
    },
    total: 0,
    drafts: 0,
    approved: 0,
    cancelled: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// W3-01 and W3-02 — the season starts, or the season carries on
// ---------------------------------------------------------------------------

describe("the page before anything is imported", () => {
  it("W3-01: states there is nothing in the season yet, and offers the template", async () => {
    signedIn();
    vi.mocked(readSeasonImportContext).mockResolvedValue(context({ total: 0 }));

    render(await BulkImportPage());

    expect(screen.getByText("No events in this season yet")).toBeInTheDocument();
    expect(screen.queryByTestId("season-counts")).not.toBeInTheDocument();
    expect(screen.getByTestId("export-link")).toHaveTextContent("Download the template");
    expect(screen.getByTestId("import-file")).toBeInTheDocument();
    expect(screen.getByTestId("import-prompt")).toHaveTextContent("Convert our club calendar");
  });

  it("W3-02: states the season's counts by status, and offers the current export", async () => {
    signedIn();
    vi.mocked(readSeasonImportContext).mockResolvedValue(
      context({ total: 11, drafts: 7, approved: 3, cancelled: 1 }),
    );

    render(await BulkImportPage());

    expect(screen.getByText("This season has 11 events")).toBeInTheDocument();
    const counts = screen.getByTestId("season-counts");
    expect(within(counts).getByText("7")).toBeInTheDocument();
    expect(within(counts).getByText("3")).toBeInTheDocument();
    expect(within(counts).getByText("1")).toBeInTheDocument();
    expect(screen.getByTestId("export-link")).toHaveTextContent(
      "Download the current season’s events",
    );
  });

  it("renders the service's own refusal rather than a page nobody wrote", async () => {
    signedIn();
    vi.mocked(readSeasonImportContext).mockRejectedValue(new NotFound("No current season."));

    render(await BulkImportPage());

    expect(screen.getByTestId("import-unavailable")).toHaveTextContent("No current season.");
  });
});

// ---------------------------------------------------------------------------
// W3-03 — the proposal, and W3-05 — what happened
// ---------------------------------------------------------------------------

const EXISTING: ImportableEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Practice — before",
  eventType: "practice",
  status: "draft",
  scheduledOn: "2026-11-04",
  startsAt: "20:00",
  endsAt: "22:00",
  deliveryMode: "in_person",
  venue: "Iffley Road Astro",
  description: null,
  requiredEquipment: null,
  joiningUrl: null,
  isMandatory: true,
};

const APPROVED: ImportableEvent = {
  ...EXISTING,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Fixture — already approved",
  status: "approved",
};

/** A real plan, from the pure planner — never hand-authored. */
function proposalFor(csvText: string): ImportPlanResult {
  return planImport({ csvText, fileName: "michaelmas-2026.csv", events: [EXISTING, APPROVED] });
}

const HEADER = "id,name,type,date,start,end,online,venue,description,required_equipment,mandatory";

/** One new row, one update to `EXISTING`, and a refused change to `APPROVED`. */
const MIXED_CSV = [
  HEADER,
  ",Chalk — new,Chalk,2026-11-05,18:00,19:00,yes,Microsoft Teams,,,no",
  `${EXISTING.id},,,,,,,University Parks,,,`,
  `${APPROVED.id},,,,,,,A different venue,,,`,
].join("\r\n");

const BASE_PROPS: ImportScreenProps = {
  seasonLabel: "2026-27",
  total: 2,
  drafts: 1,
  approved: 1,
  cancelled: 0,
  prompt: "PROMPT TEXT",
  promptVersion: 1,
  exportHref: "/operate/events/import/export",
};

/** Chooses a CSV file, which the real screen turns into a `propose` submit. */
async function chooseFile(csvText: string, fileName = "michaelmas-2026.csv"): Promise<void> {
  const input = screen.getByTestId("import-file") as HTMLInputElement;
  const file = new File([csvText], fileName, { type: "text/csv" });
  // The change triggers `requestSubmit()`, which calls the mocked async
  // action; `act` here is what lets React attribute the state update that
  // resolution produces to this render rather than to nothing in particular.
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe("W3-03 — the proposal", () => {
  it("shows counts, a new row, an update and a refusal, before anything is written", async () => {
    const planned = proposalFor(MIXED_CSV);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);
    vi.mocked(importEventsAction).mockResolvedValue({
      error: null,
      plan: planned.plan,
      csvText: MIXED_CSV,
      fileName: "michaelmas-2026.csv",
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(MIXED_CSV);

    expect(await screen.findByTestId("import-table")).toBeInTheDocument();
    expect(screen.getByText("Import — michaelmas-2026.csv")).toBeInTheDocument();
    expect(screen.getByTestId("import-subheading")).toHaveTextContent(
      "nothing has been changed yet",
    );

    // One of each outcome this file produces.
    expect(screen.getAllByText("New")).not.toHaveLength(0);
    expect(screen.getAllByText("Updated")).not.toHaveLength(0);
    expect(screen.getAllByText("Refused")).not.toHaveLength(0);

    const refusedRow = screen.getByTestId(
      `import-row-${planned.plan.rows.find((row) => row.outcome === "refused")!.line}`,
    );
    expect(within(refusedRow).getByText(/amend it on its own page/)).toBeInTheDocument();

    // Apply counts only the rows it would actually write.
    expect(screen.getByTestId("apply-import")).toHaveTextContent(
      `Apply ${planned.plan.applicableCount} changes`,
    );
    expect(screen.getByTestId("apply-import")).not.toBeDisabled();

    // Still on screen in every state, per Brian's "before they choose one".
    expect(screen.getByTestId("import-boundaries")).toBeInTheDocument();
  });

  it("disables Apply, and says so, when every row is a no-op or a refusal", async () => {
    const nothingToApply = [HEADER, `${APPROVED.id},,,,,,,A different venue,,,`].join("\r\n");
    const planned = proposalFor(nothingToApply);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);
    expect(planned.plan.applicableCount).toBe(0);

    vi.mocked(importEventsAction).mockResolvedValue({
      error: null,
      plan: planned.plan,
      csvText: nothingToApply,
      fileName: "nothing.csv",
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(nothingToApply, "nothing.csv");

    const applyButton = await screen.findByTestId("apply-import");
    expect(applyButton).toHaveTextContent("Nothing to apply");
    expect(applyButton).toBeDisabled();
  });

  it("shows a file-level refusal without ever reaching a proposal", async () => {
    vi.mocked(importEventsAction).mockResolvedValue({
      ...EMPTY_IMPORT_STATE,
      error: "That file has a header row and no events under it. There is nothing to import.",
    });

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(HEADER, "header-only.csv");

    expect(await screen.findByTestId("import-error")).toHaveTextContent(
      "There is nothing to import.",
    );
    expect(screen.queryByTestId("import-table")).not.toBeInTheDocument();
  });
});

describe("W3-05 — what happened", () => {
  it("reports what was written, and what was refused alongside it", async () => {
    vi.mocked(importEventsAction).mockResolvedValue({
      ...EMPTY_IMPORT_STATE,
      applied: { created: 1, updated: 2, unchanged: 0, refused: 1 },
    });

    render(<ImportScreen {...BASE_PROPS} />);
    // Any submit reaches the mocked action; choosing a file is the one
    // control the start-here view offers to drive it with.
    await chooseFile(HEADER, "any-file.csv");

    const notice = await screen.findByTestId("import-applied");
    expect(notice).toHaveTextContent("1 draft created and 2 drafts updated");
    expect(notice).toHaveTextContent("1 row was refused and nothing was written for it");

    // The applied state is the empty state again underneath the banner — the
    // operator is looking at "Bulk import", not a stale proposal.
    expect(screen.getByText("Bulk import")).toBeInTheDocument();
  });

  it("keeps the proposal on screen when the apply itself is refused", async () => {
    const planned = proposalFor(MIXED_CSV);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);
    const proposedState: ImportScreenState = {
      error: null,
      plan: planned.plan,
      csvText: MIXED_CSV,
      fileName: "michaelmas-2026.csv",
      applied: null,
    };
    vi.mocked(importEventsAction)
      .mockResolvedValueOnce(proposedState)
      .mockResolvedValueOnce({
        ...proposedState,
        error:
          "The season changed while you were reading this, so what would be written is no longer what you were shown. Nothing has been changed — import the file again to see the current proposal.",
      });

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(MIXED_CSV);
    await screen.findByTestId("import-table");

    await act(async () => {
      fireEvent.click(screen.getByTestId("apply-import"));
    });

    expect(await screen.findByTestId("import-error")).toHaveTextContent("Nothing has been changed");
    // Refused, not emptied: the operator can still read the rows they saw.
    expect(screen.getByTestId("import-table")).toBeInTheDocument();
  });
});
