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
import { describePlanMoved } from "./presentation";
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

  it("LAN-317: states both date shapes where the file is chosen", async () => {
    // Excel rewrites the template's date column on a UK machine, so the shapes
    // the importer reads are on the screen that hands out the template.
    signedIn();
    vi.mocked(readSeasonImportContext).mockResolvedValue(context({ total: 0 }));

    render(await BulkImportPage());

    expect(screen.getByTestId("import-date-shapes")).toHaveTextContent(
      "Dates · DD/MM/YYYY or YYYY-MM-DD",
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
  templateId: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  templateName: "Practice",
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

/** Two of the seven templates the migration seeds, by their fixed identifiers. */
const PRACTICE_TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";
const CHALK_TEMPLATE_ID = "b547e0b3-f48c-5601-9dc6-e8725fc434f9";

/** A real plan, from the pure planner — never hand-authored. */
function proposalFor(
  csvText: string,
  events: readonly ImportableEvent[] = [EXISTING, APPROVED],
): ImportPlanResult {
  return planImport({
    csvText,
    fileName: "michaelmas-2026.csv",
    events,
    // LAN-265. The `type` column names a template, so the planner is handed the
    // ones this fixture's events belong to.
    templates: [
      { id: PRACTICE_TEMPLATE_ID, name: "Practice", eventType: "practice" },
      { id: CHALK_TEMPLATE_ID, name: "Chalk", eventType: "chalk" },
    ],
  });
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

  it("LAN-316: says why there is nothing to apply, with the refused rows below it", async () => {
    // "Nothing to apply" on a disabled button, beside a screen of rows, read to
    // the tester as a fault in the importer rather than as the file's refusals.
    const refusedOnly = [
      HEADER,
      `${APPROVED.id},,,,,,,A different venue,,,`,
      ",Whatever this is,Training,2026-11-05,,,,,,,",
    ].join("\r\n");
    const planned = proposalFor(refusedOnly);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);
    expect(planned.plan.totals).toMatchObject({ new: 0, updated: 0, refused: 2 });

    vi.mocked(importEventsAction).mockResolvedValue({
      error: null,
      plan: planned.plan,
      csvText: refusedOnly,
      fileName: "refused.csv",
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(refusedOnly, "refused.csv");

    expect(await screen.findByTestId("import-nothing-to-apply")).toHaveTextContent(
      "Nothing to apply — 2 rows refused, with the reason on each.",
    );

    // The rows are on screen, in their own section, and none of them is in a
    // section that reads as something about to be written.
    const refused = screen.getByTestId("import-refused-table");
    expect(screen.getByTestId("section-import-refused")).toHaveTextContent(
      "Refused · 2 rows · nothing will be written for them",
    );
    expect(screen.queryByTestId("import-table")).not.toBeInTheDocument();
    for (const row of planned.plan.rows) {
      expect(within(refused).getByTestId(`import-row-${row.line}`)).toHaveTextContent("Refused");
    }
    expect(screen.getByTestId("apply-import")).toBeDisabled();
  });

  it("LAN-316: keeps the refused row out of the rows that would be written", async () => {
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

    const writable = await screen.findByTestId("import-table");
    const refused = screen.getByTestId("import-refused-table");
    const refusedLine = planned.plan.rows.find((row) => row.outcome === "refused")!.line;

    expect(within(refused).getByTestId(`import-row-${refusedLine}`)).toBeInTheDocument();
    expect(within(writable).queryByTestId(`import-row-${refusedLine}`)).not.toBeInTheDocument();
    // The reason stays on its own row rather than moving to a banner.
    expect(within(refused).getByText(/amend it on its own page/)).toBeInTheDocument();
    // And nothing is said about having nothing to apply, because there is.
    expect(screen.queryByTestId("import-nothing-to-apply")).not.toBeInTheDocument();
  });

  it("LAN-317: reads each date back in words beside the row", async () => {
    const dayFirst = [HEADER, ",Chalk — new,Chalk,05/11/2026,18:00,19:00,yes,Teams,,,no"].join(
      "\r\n",
    );
    const planned = proposalFor(dayFirst);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);

    vi.mocked(importEventsAction).mockResolvedValue({
      error: null,
      plan: planned.plan,
      csvText: dayFirst,
      fileName: "day-first.csv",
      applied: null,
    } satisfies ImportScreenState);

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(dayFirst, "day-first.csv");

    expect(await screen.findByTestId("import-date-echo-2")).toHaveTextContent("5 November 2026");
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

  it("LAN-310: replaces the stale proposal with the current one, naming what moved", async () => {
    const planned = proposalFor(MIXED_CSV);
    if (!planned.ok) throw new Error(`Fixture CSV was refused: ${planned.reason}`);
    // Somebody approved the draft this file updates while the proposal was on
    // screen, so the row that was an update is now a refusal.
    const fresh = proposalFor(MIXED_CSV, [{ ...EXISTING, status: "approved" }, APPROVED]);
    if (!fresh.ok) throw new Error(`Fixture CSV was refused: ${fresh.reason}`);
    const movedLine = planned.plan.rows.find((row) => row.eventId === EXISTING.id)!.line;

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
        plan: fresh.plan,
        error: describePlanMoved([
          { line: movedLine, name: EXISTING.name, before: "updated", after: "refused" },
        ]),
      });

    render(<ImportScreen {...BASE_PROPS} />);
    await chooseFile(MIXED_CSV);
    await screen.findByTestId("import-table");

    await act(async () => {
      fireEvent.click(screen.getByTestId("apply-import"));
    });

    const error = await screen.findByTestId("import-error");
    expect(error).toHaveTextContent("Nothing was changed.");
    expect(error).toHaveTextContent(`Line ${movedLine} — was Updated, now Refused.`);

    // Not emptied and not stale: the rows on screen are the current plan's, and
    // the row that moved is now among the refusals.
    expect(
      within(screen.getByTestId("import-refused-table")).getByTestId(`import-row-${movedLine}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("apply-import")).toHaveTextContent(
      `Apply ${fresh.plan.applicableCount} change`,
    );
  });
});
