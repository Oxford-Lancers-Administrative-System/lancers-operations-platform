// @vitest-environment node
/**
 * The half of the bulk import that touches the database — LAN-155, work
 * package `WP-csv-import`, workflow `W3`.
 *
 * `./event-csv.test.ts` already proves what a row *means*, entirely without a
 * server: an `id` updates, a blank `id` creates, an unmatched `id` refuses,
 * a change to an approved or cancelled event is refused, and a digest
 * fingerprints a plan. None of that is repeated here. What only exists against
 * the **real** local database is everything `./event-import.ts` adds on top of
 * that pure module: that `requireCapability` runs before any read or write,
 * that the season it reads is the one `createEventDraft` and `updateEventDraft`
 * also write to, that a plan writes nothing until it is applied, that a
 * confirmed digest is checked against a freshly recomputed plan rather than
 * trusted, and that applying is genuinely one transaction — a later failure
 * rolls back an earlier write in the same apply, not just its own.
 *
 * Every row this suite writes carries `NAME_MARKER` in `events.name`, and
 * `afterEach` deletes exactly those and their audit trail. The one row that
 * cannot be named that way — `event.imported`, which is about the season, not
 * an event — is instead scoped by a `fileName` every test in this file gives
 * the marker prefix, and cleaned the same way.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));

import type { Client } from "pg";

import {
  closePool,
  ConstraintViolated,
  isServiceError,
  NotPermitted,
  type ServiceError,
} from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import {
  applySeasonImport,
  exportSeasonEvents,
  IMPORT_NOTHING_TO_APPLY_MESSAGE,
  IMPORT_PLAN_MOVED_MESSAGE,
  IMPORT_TOO_LARGE_MESSAGE,
  planSeasonImport,
  readSeasonImportContext,
  type ApplyRequest,
} from "./event-import";
import { IMPORT_COLUMNS, MAX_IMPORT_BYTES, type ImportColumn, type ImportPlan } from "./event-csv";
import { formatCsv } from "./csv";
import { createEventDraft, updateEventDraft, type EventDraftInput } from "./events";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";

/** Unique to this file. Two suites sharing one marker delete each other's rows. */
const NAME_MARKER = "LAN155ImportSuite";

/** Scopes the one audit row this suite writes that names no event. */
const FILE_NAME = `${NAME_MARKER}.csv`;

let observer: Client;
let actorPersonId: string;

const capability = vi.mocked(requireCapability);

function operator(): ResolvedOperator {
  return {
    authUserId: "44444444-4444-4444-8444-444444444444",
    personId: actorPersonId,
    displayName: "Import Suite Operator",
    roleCodes: ["secretary"],
    isActive: true,
  };
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

beforeEach(() => {
  capability.mockReset();
  capability.mockResolvedValue(operator());
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events' and entity_id in
        (select id from public.events where name like $1)`,
    [scope],
  );
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'seasons' and context ->> 'fileName' = $1`,
    [FILE_NAME],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Wednesday practice`,
    eventType: "practice",
    scheduledOn: "2026-11-04",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

async function seedDraft(overrides: Partial<EventDraftInput> = {}) {
  return createEventDraft(actorPersonId, draft(overrides));
}

/** Matches `events.test.ts`'s helper of the same name. */
async function forceStatus(eventId: string, status: string): Promise<void> {
  await observer.query(
    `update public.events
        set status = $2::public.event_status,
            approved_at = case when $2 <> 'draft' then now() end,
            approved_by_person_id = case when $2 <> 'draft' then $3::uuid end,
            audience_confirmed_at = case when $2 <> 'draft' then now() end,
            audience_confirmed_by_person_id = case when $2 <> 'draft' then $3::uuid end,
            decision_reason = case when $2 = 'cancelled'
                                   then 'Arranged by a test' else decision_reason end
      where id = $1`,
    [eventId, status, actorPersonId],
  );
}

interface EventRow {
  name: string;
  status: string;
  venue: string | null;
  description: string | null;
}

async function eventRow(eventId: string): Promise<EventRow> {
  const result = await observer.query<EventRow>(
    `select name, status::text as status, venue, description
       from public.events where id = $1`,
    [eventId],
  );
  if (result.rows.length === 0) throw new Error(`No event ${eventId} — did the write not happen?`);
  return result.rows[0];
}

async function countByName(name: string): Promise<number> {
  const result = await observer.query<{ count: string }>(
    "select count(*)::text as count from public.events where name = $1",
    [name],
  );
  return Number(result.rows[0].count);
}

/** One CSV row, in `IMPORT_COLUMNS` order, blank cells filled in from `{}`. */
function csvOf(rows: readonly Partial<Record<ImportColumn, string>>[]): string {
  return formatCsv([
    [...IMPORT_COLUMNS],
    ...rows.map((row) => IMPORT_COLUMNS.map((column) => row[column] ?? "")),
  ]);
}

async function plan(csvText: string): Promise<ImportPlan> {
  const result = await planSeasonImport({ csvText, fileName: FILE_NAME });
  if (!result.ok)
    throw new Error(`Expected the plan to succeed, but it was refused: ${result.reason}`);
  return result.plan;
}

function apply(csvText: string, digest: string): ReturnType<typeof applySeasonImport> {
  const request: ApplyRequest = { csvText, digest, fileName: FILE_NAME };
  return applySeasonImport(request);
}

/** Runs `attempt`, and returns the `ServiceError` it was supposed to throw. */
async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await attempt();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the service to refuse this, but it succeeded.");
}

// ---------------------------------------------------------------------------
// requireCapability is checked before anything is read or written
// ---------------------------------------------------------------------------

describe("every entry point asks for event_calendar_management first", () => {
  const REFUSAL = new NotPermitted("You do not have access to this action.", {
    rule: "capability:event_calendar_management",
  });

  it("refuses to read the season's import context", async () => {
    capability.mockRejectedValueOnce(REFUSAL);
    await expect(readSeasonImportContext()).rejects.toBe(REFUSAL);
    expect(capability).toHaveBeenCalledWith("event_calendar_management");
  });

  it("refuses to export", async () => {
    capability.mockRejectedValueOnce(REFUSAL);
    await expect(exportSeasonEvents()).rejects.toBe(REFUSAL);
  });

  it("refuses to plan an import, before the file is even read", async () => {
    capability.mockRejectedValueOnce(REFUSAL);
    await expect(planSeasonImport({ csvText: csvOf([]) })).rejects.toBe(REFUSAL);
  });

  it("refuses to apply, and never opens a transaction to do it in", async () => {
    capability.mockRejectedValueOnce(REFUSAL);
    await expect(apply(csvOf([]), "irrelevant")).rejects.toBe(REFUSAL);
  });
});

// ---------------------------------------------------------------------------
// The season this module reads is the one events.ts writes to
// ---------------------------------------------------------------------------

describe("readSeasonImportContext", () => {
  it("counts this suite's fixtures by status, as a delta over what was already there", async () => {
    const before = await readSeasonImportContext();

    const draftEvent = await seedDraft({ name: `${NAME_MARKER} Context draft` });
    const approvedEvent = await seedDraft({ name: `${NAME_MARKER} Context approved` });
    await forceStatus(approvedEvent.id, "approved");
    const cancelledEvent = await seedDraft({ name: `${NAME_MARKER} Context cancelled` });
    await forceStatus(cancelledEvent.id, "cancelled");
    expect(draftEvent.status).toBe("draft");

    const after = await readSeasonImportContext();

    expect(after.season.id).toBe(before.season.id);
    expect(after.total - before.total).toBe(3);
    expect(after.drafts - before.drafts).toBe(1);
    expect(after.approved - before.approved).toBe(1);
    expect(after.cancelled - before.cancelled).toBe(1);
  });
});

describe("exportSeasonEvents", () => {
  it("includes a cancelled event, labelled as such, alongside a draft", async () => {
    const draftEvent = await seedDraft({ name: `${NAME_MARKER} Export draft` });
    const cancelledEvent = await seedDraft({ name: `${NAME_MARKER} Export cancelled` });
    await forceStatus(cancelledEvent.id, "cancelled");

    const exported = await exportSeasonEvents();

    expect(exported.fileName.endsWith(".csv")).toBe(true);
    expect(exported.csv).toContain(draftEvent.id);
    expect(exported.csv).toContain(cancelledEvent.id);

    const cancelledLine = exported.csv
      .split("\r\n")
      .find((line) => line.includes(cancelledEvent.id));
    expect(cancelledLine).toBeDefined();
    expect(cancelledLine).toContain("Cancelled");
  });
});

// ---------------------------------------------------------------------------
// REQ-upsert-only, end to end against real rows
// ---------------------------------------------------------------------------

describe("applying a confirmed import", () => {
  it("updates the event an id matches, and leaves blank cells alone", async () => {
    const event = await seedDraft({
      venue: "Iffley Road Astro",
      description: "Original description.",
    });

    const csvText = csvOf([{ id: event.id, venue: "University Parks" }]);
    const proposed = await plan(csvText);
    expect(proposed.totals.updated).toBe(1);
    expect(proposed.totals.new).toBe(0);

    const applied = await apply(csvText, proposed.digest);
    expect(applied).toEqual({ created: 0, updated: 1, unchanged: 0, refused: 0 });

    const row = await eventRow(event.id);
    expect(row.venue).toBe("University Parks");
    // Blank in the file. REQ: a blank cell changes nothing.
    expect(row.description).toBe("Original description.");
    expect(row.name).toBe(event.name);
  });

  it("creates a new draft when the id is blank", async () => {
    const name = `${NAME_MARKER} Blank id creates`;
    const csvText = csvOf([
      {
        name,
        type: "Practice",
        date: "2026-11-11",
        start: "18:00",
        end: "19:30",
        venue: "Iffley Road Astro",
        mandatory: "yes",
      },
    ]);
    const proposed = await plan(csvText);
    expect(proposed.totals.new).toBe(1);

    const applied = await apply(csvText, proposed.digest);
    expect(applied).toEqual({ created: 1, updated: 0, unchanged: 0, refused: 0 });

    expect(await countByName(name)).toBe(1);
    const created = await observer.query<{ id: string; status: string }>(
      "select id, status::text as status from public.events where name = $1",
      [name],
    );
    expect(created.rows[0].status).toBe("draft");
  });

  it("refuses a row whose id matches nothing, and still applies the rest of the file", async () => {
    const event = await seedDraft({ description: "Before." });
    const newName = `${NAME_MARKER} Alongside the refusal`;

    const csvText = csvOf([
      { id: event.id, description: "Updated via import." },
      { id: "no-such-event-id", name: newName, type: "Practice", date: "2026-11-12" },
    ]);
    const proposed = await plan(csvText);
    expect(proposed.totals.refused).toBe(1);
    expect(proposed.totals.updated).toBe(1);

    const applied = await apply(csvText, proposed.digest);
    // REQ: never a silent partial success — the good row still applies.
    expect(applied).toEqual({ created: 0, updated: 1, unchanged: 0, refused: 1 });

    const row = await eventRow(event.id);
    expect(row.description).toBe("Updated via import.");
    expect(await countByName(newName)).toBe(0);
  });

  it("refuses to change an approved event, alongside a draft that does apply", async () => {
    const approved = await seedDraft({ name: `${NAME_MARKER} Approved event`, venue: "Before" });
    await forceStatus(approved.id, "approved");
    const draftEvent = await seedDraft({
      name: `${NAME_MARKER} Untouched draft`,
      description: "Before.",
    });

    const csvText = csvOf([
      { id: approved.id, venue: "After" },
      { id: draftEvent.id, description: "After." },
    ]);
    const proposed = await plan(csvText);
    expect(proposed.totals.refused).toBe(1);
    expect(proposed.totals.updated).toBe(1);
    const refusedRow = proposed.rows.find((row) => row.eventId === approved.id);
    expect(refusedRow?.reasons.join(" ")).toContain("approved");

    const applied = await apply(csvText, proposed.digest);
    expect(applied).toEqual({ created: 0, updated: 1, unchanged: 0, refused: 1 });

    expect((await eventRow(approved.id)).venue).toBe("Before");
    expect((await eventRow(draftEvent.id)).description).toBe("After.");
  });

  it("refuses to change a cancelled event, which leaves nothing to apply", async () => {
    const cancelled = await seedDraft({ name: `${NAME_MARKER} Cancelled event`, venue: "Before" });
    await forceStatus(cancelled.id, "cancelled");

    const csvText = csvOf([{ id: cancelled.id, venue: "After" }]);
    const proposed = await plan(csvText);
    expect(proposed.totals.refused).toBe(1);
    expect(proposed.applicableCount).toBe(0);
    expect(proposed.rows[0].reasons.join(" ")).toContain("cancelled");

    const error = await refusalFrom(() => apply(csvText, proposed.digest));
    expect(error).toBeInstanceOf(ConstraintViolated);
    expect(error.message).toBe(IMPORT_NOTHING_TO_APPLY_MESSAGE);

    expect((await eventRow(cancelled.id)).venue).toBe("Before");
  });

  it("has nothing to apply when every row already matches the season", async () => {
    const event = await seedDraft({
      name: `${NAME_MARKER} Already current`,
      venue: "Iffley Road Astro",
    });

    const csvText = csvOf([
      {
        id: event.id,
        name: event.name,
        type: "Practice",
        date: event.scheduledOn ?? "",
        start: event.startsAt ?? "",
        end: event.endsAt ?? "",
        venue: event.venue ?? "",
        mandatory: event.isMandatory ? "yes" : "no",
      },
    ]);
    const proposed = await plan(csvText);
    expect(proposed.totals.unchanged).toBe(1);
    expect(proposed.applicableCount).toBe(0);

    const error = await refusalFrom(() => apply(csvText, proposed.digest));
    expect(error.message).toBe(IMPORT_NOTHING_TO_APPLY_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// REQ-import-confirmation: nothing is written before the operator confirms
// ---------------------------------------------------------------------------

describe("REQ-import-confirmation", () => {
  it("writes nothing while only a plan is requested", async () => {
    const name = `${NAME_MARKER} Never written`;
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.events where name like $1",
      [`${NAME_MARKER}%`],
    );

    const csvText = csvOf([{ name, type: "Practice", date: "2026-11-13" }]);
    const proposed = await plan(csvText);
    expect(proposed.totals.new).toBe(1);

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.events where name like $1",
      [`${NAME_MARKER}%`],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(await countByName(name)).toBe(0);
  });

  it("recomputes the plan inside the transaction and refuses a stale confirmation", async () => {
    const event = await seedDraft({ venue: "Original venue", description: "Before." });
    // The file only says something about `venue` — `description` is blank, so
    // the plan inherits whatever the event currently holds for it. That is the
    // field to move underneath the plan: touching `venue` instead would prove
    // nothing, since the file's own value would dominate either read.
    const csvText = csvOf([{ id: event.id, venue: "Proposed venue" }]);
    const proposed = await plan(csvText);

    // Somebody else edits the event after the operator read this plan, but
    // before they confirmed it — the exact race `IMPORT_PLAN_MOVED_MESSAGE`
    // exists for.
    await updateEventDraft(
      actorPersonId,
      event.id,
      draft({ venue: "Original venue", description: "Somebody else's edit" }),
    );

    const error = await refusalFrom(() => apply(csvText, proposed.digest));
    expect(error.message).toBe(IMPORT_PLAN_MOVED_MESSAGE);

    // Refused, not merged and not overwritten — the intervening edit stands.
    const row = await eventRow(event.id);
    expect(row.description).toBe("Somebody else's edit");
    expect(row.venue).toBe("Original venue");
  });

  it("refuses a file over the size limit, whole, before any row is read", async () => {
    const oversized = "x".repeat(MAX_IMPORT_BYTES + 1000);
    const csvText = csvOf([
      {
        name: `${NAME_MARKER} Too big`,
        type: "Practice",
        date: "2026-11-14",
        description: oversized,
      },
    ]);

    const planned = await planSeasonImport({ csvText, fileName: FILE_NAME });
    expect(planned).toEqual({ ok: false, reason: IMPORT_TOO_LARGE_MESSAGE });

    const error = await refusalFrom(() => apply(csvText, "irrelevant"));
    expect(error.message).toBe(IMPORT_TOO_LARGE_MESSAGE);
    expect(await countByName(`${NAME_MARKER} Too big`)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Applying is one transaction
// ---------------------------------------------------------------------------

describe("applying is one transaction", () => {
  it("rolls back a write already made in this apply when a later step fails", async () => {
    const name = `${NAME_MARKER} Rolled back`;
    const csvText = csvOf([{ name, type: "Practice", date: "2026-11-15" }]);
    const proposed = await plan(csvText);
    expect(proposed.totals.new).toBe(1);

    // `applySeasonImport` calls `recordAudit` twice inside one apply of a
    // single-row file: once from inside `createEventDraft` for the event
    // itself, and once at the end for the import as a whole. Letting the
    // first succeed for real and only failing the second is what proves this
    // is one transaction rather than one write each: if the created row and
    // its own audit row survived the later failure, they would still be here
    // after the read below.
    const audit = await import("./audit");
    const real = audit.recordAudit;
    let calls = 0;
    const spy = vi.spyOn(audit, "recordAudit").mockImplementation(async (tx, record) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("Simulated failure after the event write, inside the same transaction.");
      }
      return real(tx, record);
    });

    try {
      await expect(apply(csvText, proposed.digest)).rejects.toThrow(
        "Simulated failure after the event write",
      );
    } finally {
      spy.mockRestore();
    }

    expect(calls).toBe(2);
    expect(await countByName(name)).toBe(0);
  });
});
