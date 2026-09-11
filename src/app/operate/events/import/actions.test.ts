// @vitest-environment node
/**
 * The bulk import's server actions — LAN-310.
 *
 * `./screens.test.tsx` mocks this module entirely, because it is testing the
 * screen; `../../../../lib/services/event-import.test.ts` proves the writes
 * against the real database. This file is the join between them: the real
 * action, with the service mocked, so what is under test is what the operator
 * gets back when the season moved under a confirmation they had already read.
 *
 * Clint, tester week: he changed the season in another tab between the preview
 * and the apply, and the screen told him the proposal was stale and nothing
 * more — the only way on was to upload the file again to find out why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/event-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-import")>();
  return { ...actual, applySeasonImport: vi.fn() };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { applySeasonImport } from "@/lib/services/event-import";
import { planImport, type ImportableEvent, type ImportPlan } from "@/lib/services/event-csv";
import { importEventsAction } from "./actions";
import { EMPTY_IMPORT_STATE, type ImportScreenState } from "./import-state";

function operator(): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes: ["secretary"],
    isActive: true,
  };
}

const EXISTING: ImportableEvent = {
  id: "33333333-3333-4333-8333-333333333333",
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

const HEADER = "id,name,type,date,start,end,online,venue,description,required_equipment,mandatory";
const CSV = [HEADER, `${EXISTING.id},,,,,,,University Parks,,,`].join("\r\n");
const FILE_NAME = "michaelmas-2026.csv";

/** A real plan, from the pure planner, against the season in whatever state. */
function planFor(events: readonly ImportableEvent[]): ImportPlan {
  const result = planImport({
    csvText: CSV,
    fileName: FILE_NAME,
    events,
    templates: [{ id: EXISTING.templateId, name: "Practice", eventType: "practice" }],
  });
  if (!result.ok) throw new Error(`Fixture CSV was refused: ${result.reason}`);
  return result.plan;
}

function applyForm(plan: ImportPlan): FormData {
  const formData = new FormData();
  formData.set("intent", "apply");
  formData.set("csvText", CSV);
  formData.set("digest", plan.digest);
  formData.set("fileName", FILE_NAME);
  return formData;
}

function confirmed(plan: ImportPlan): ImportScreenState {
  return { error: null, plan, csvText: CSV, fileName: FILE_NAME, applied: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
});

describe("applying a proposal the season moved under", () => {
  it("returns the fresh proposal, naming the row that moved", async () => {
    const read = planFor([EXISTING]);
    // The same file against an event somebody approved in another tab: the row
    // that was an update is now a refusal.
    const now = planFor([{ ...EXISTING, status: "approved" }]);
    expect(now.digest).not.toBe(read.digest);

    vi.mocked(applySeasonImport).mockResolvedValue({
      ok: false,
      reason: "plan_moved",
      plan: now,
      movements: [{ line: 2, name: EXISTING.name, before: "updated", after: "refused" }],
    });

    const state = await importEventsAction(confirmed(read), applyForm(read));

    // The proposal on screen is the current one, with its own digest, so the
    // next Apply confirms what is being read now.
    expect(state.plan).toBe(now);
    expect(state.applied).toBeNull();
    expect(state.csvText).toBe(CSV);
    expect(state.error).toContain("Line 2 — was Updated, now Refused.");
    expect(state.error).toContain("The proposal below is the current one.");
  });

  it("hands the service the plan the operator confirmed, so it can name what moved", async () => {
    const read = planFor([EXISTING]);
    vi.mocked(applySeasonImport).mockResolvedValue({
      ok: false,
      reason: "plan_moved",
      plan: planFor([{ ...EXISTING, status: "approved" }]),
      movements: [],
    });

    await importEventsAction(confirmed(read), applyForm(read));

    expect(vi.mocked(applySeasonImport).mock.calls[0][0]).toMatchObject({
      digest: read.digest,
      confirmedRows: read.rows,
    });
  });

  it("reports what was written when the season did not move", async () => {
    const read = planFor([EXISTING]);
    vi.mocked(applySeasonImport).mockResolvedValue({
      ok: true,
      applied: { created: 0, updated: 1, unchanged: 0, refused: 0 },
    });

    const state = await importEventsAction(confirmed(read), applyForm(read));

    expect(state.applied).toEqual({ created: 0, updated: 1, unchanged: 0, refused: 0 });
    expect(state.plan).toBeNull();
    expect(state.error).toBeNull();
  });

  it("abandons the proposal on cancel, without asking the service anything", async () => {
    const formData = new FormData();
    formData.set("intent", "cancel");

    expect(await importEventsAction(confirmed(planFor([EXISTING])), formData)).toEqual(
      EMPTY_IMPORT_STATE,
    );
    expect(applySeasonImport).not.toHaveBeenCalled();
  });
});
