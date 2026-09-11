// @vitest-environment node
/**
 * Event-type templates and the per-field inheritance rule — LAN-154, W8.
 *
 * Against the **real** local database, and it has to be: what is under test is a
 * transaction that reads seven template rows, locks a set of drafts, decides
 * field by field which of them may move, and writes all of it or none. A mocked
 * transaction would agree with whatever this file asserted.
 *
 * ## What this suite mutates, and how it puts it back
 *
 * The seven `event_templates` rows are **not** fixtures — they are created by
 * `20260822120000_events_target_state.sql` and nobody may add or delete one. So
 * this suite snapshots all seven, plus their questions and audience groups,
 * before each test and restores them afterwards. Every event row it creates
 * carries `NAME_MARKER` and is deleted with its audit trail.
 *
 * ## The one rule everything here exists to prove
 *
 * D41, as Brian refined it on 2026-08-21: template values flow into a draft
 * **field by field, and only into fields nobody has edited**; approval freezes
 * everything; and **no approved or past event ever changes**. The failure this
 * prevents is the system quietly destroying work somebody did deliberately, so
 * the assertions are written from that direction — what survives a template
 * change matters more than what moves.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { createEventDraft, readEvent, readEventQuestions, type EventDraftInput } from "./events";
import {
  createEventTemplate,
  DEFAULT_CHASE_THRESHOLD_DAYS,
  deleteEventTemplate,
  listEventTemplates,
  planEventTemplateChange,
  readEventFormDefaults,
  readEventTemplate,
  saveEventTemplate,
  type EventTemplateInput,
} from "./event-templates";
import { DEFAULT_MESSAGING_SCHEDULE, readMessagingScheduleIn } from "./messaging-schedule";
import type { EventQuestionInput } from "./event-questions-input";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

/** Unique to this file. Two suites sharing one marker delete each other's rows. */
const NAME_MARKER = "LAN154TemplatesSuite";

/**
 * The seven templates the schema ships with, in the order the list shows them.
 *
 * Alphabetical by name since LAN-265, and not `public.event_type`'s declared
 * order: the class is no longer a template's identity, several templates may
 * share one, and the only ordering an operator can perceive is the one they can
 * read.
 */
const SEVEN_NAMES = [
  "Chalk",
  "Game",
  "Meeting",
  "Practice",
  "Recruitment",
  "Social",
  "Strength and conditioning",
];

let observer: Client;
let actorPersonId: string;

interface TemplateSnapshot {
  templates: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  groups: Record<string, unknown>[];
}

let snapshot: TemplateSnapshot;

beforeAll(async () => {
  observer = await openObserver();
  const person = await observer.query<{ id: string }>(
    `select id from public.people
      where created_at = $1::timestamptz and merged_into_person_id is null
      order by id limit 1`,
    [await seededIdentityCreatedAt(observer)],
  );
  expect(person.rows.length).toBe(1);
  actorPersonId = person.rows[0].id;
});

beforeEach(async () => {
  snapshot = {
    templates: (await observer.query("select * from public.event_templates")).rows,
    questions: (await observer.query("select * from public.event_template_questions")).rows,
    groups: (await observer.query("select * from public.event_template_audience_groups")).rows,
  };
});

afterEach(async () => {
  // The events this suite made, and their audit trail, before the templates go
  // back — an event references nothing here, but the order reads the same way
  // the cleanup in every other service suite does.
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events'
        and entity_id in (select id from public.events where name like $1)`,
    [`${NAME_MARKER}%`],
  );
  await observer.query("delete from public.events where name like $1", [`${NAME_MARKER}%`]);
  await observer.query("delete from public.audit_events where entity_table = 'event_templates'");

  // LAN-265. The templates this suite creates, taking their questions, their
  // default audience, their messaging cadence and their settings row with them
  // through the cascades. Named after the marker, so the seven the migration
  // seeds are untouched by this — they belong to the migration, not to a suite.
  await observer.query("delete from public.event_templates where name like $1", [
    `${NAME_MARKER}%`,
  ]);

  // The seven rows put back exactly as they were. They belong to the migration,
  // not to this suite.
  await observer.query("delete from public.event_template_questions");
  await observer.query("delete from public.event_template_audience_groups");
  for (const row of snapshot.templates) {
    await observer.query(
      `update public.event_templates
          set default_venue = $2, default_delivery_mode = $3::public.event_delivery_mode,
              default_duration_minutes = $4, default_description = $5,
              default_required_equipment = $6, default_is_mandatory = $7,
              name = $8, colour_key = $9
        where id = $1::uuid`,
      [
        row.id,
        row.default_venue,
        row.default_delivery_mode,
        row.default_duration_minutes,
        row.default_description,
        row.default_required_equipment,
        row.default_is_mandatory,
        row.name,
        row.colour_key,
      ],
    );
  }
  for (const row of snapshot.groups) {
    await observer.query(
      `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
       values ($1::uuid, $2::public.event_type, $3::public.audience_group)`,
      [row.template_id, row.event_type, row.audience_group],
    );
  }
  for (const row of snapshot.questions) {
    await observer.query(
      `insert into public.event_template_questions
         (id, template_id, event_type, prompt, answer_type, choices, applies_to_capacities,
          is_required, sort_order, created_at)
       values ($1, $2::uuid, $3::public.event_type, $4, $5::public.question_answer_type,
               $6::text[], $7::public.invitation_capacity[], $8, $9, $10)`,
      [
        row.id,
        row.template_id,
        row.event_type,
        row.prompt,
        row.answer_type,
        row.choices,
        row.applies_to_capacities,
        row.is_required,
        row.sort_order,
        row.created_at,
      ],
    );
  }
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The seven templates the migration seeds, by behavioural class — LAN-265.
 *
 * These are the fixed literals `20260916090000_event_templates.sql` writes, so
 * every call below names a template that really exists rather than the class
 * string that used to be a template's identity.
 */
const TEMPLATE: Readonly<Record<string, string>> = {
  practice: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  strength_and_conditioning: "8fb4acfc-1d41-53b0-bda8-202f454a8629",
  chalk: "b547e0b3-f48c-5601-9dc6-e8725fc434f9",
  game: "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae",
  social: "8de00424-52a8-52ad-9c9f-a29823f9c4bf",
  recruitment: "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
  meeting: "660cdcb7-51e3-5a19-aaa2-08c5256af288",
};

const TEMPLATE_NAME: Readonly<Record<string, string>> = {
  practice: "Practice",
  strength_and_conditioning: "Strength and conditioning",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
};

function templateInput(overrides: Partial<EventTemplateInput> = {}): EventTemplateInput {
  return {
    // LAN-265's one required field. Defaulted to the name the migration gives
    // the Practice template, because most of these cases save that template and
    // a save that renamed it by accident would be a different test.
    name: TEMPLATE_NAME.practice,
    // LAN-276 correction round 1's other required field. Practice's own
    // seeded colour, for the same reason: most of these cases save Practice
    // and a save that changed its colour by accident would be a different
    // test.
    colourKey: "blue",
    defaultVenue: null,
    defaultDeliveryMode: null,
    defaultDurationMinutes: null,
    defaultDescription: null,
    defaultRequiredEquipment: null,
    defaultIsMandatory: null,
    audienceGroups: [],
    ...overrides,
  };
}

function question(overrides: Partial<EventQuestionInput> = {}): EventQuestionInput {
  return {
    id: null,
    prompt: "Can you get yourself to the ground?",
    answerType: "boolean",
    isRequired: false,
    choices: null,
    fromTemplate: false,
    ...overrides,
  };
}

function draftInput(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} draft`,
    templateId: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
    scheduledOn: futureDate(21),
    startsAt: null,
    endsAt: null,
    venue: null,
    isMandatory: false,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

/** A date `days` from today in the club's zone, as `YYYY-MM-DD`. */
function futureDate(days: number): string {
  const day = new Date(`${todayInClubZone()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

async function eventRow(eventId: string) {
  const result = await observer.query<{
    venue: string | null;
    description: string | null;
    required_equipment: string | null;
    is_mandatory: boolean;
    delivery_mode: string;
    ends_at: string | null;
    status: string;
  }>(
    `select venue, description, required_equipment, is_mandatory,
            delivery_mode::text as delivery_mode, ends_at::text as ends_at, status::text as status
       from public.events where id = $1`,
    [eventId],
  );
  return result.rows[0];
}

async function forceStatus(eventId: string, status: string): Promise<void> {
  await observer.query(
    `update public.events
        set status = $2::public.event_status,
            approved_at = now(), approved_by_person_id = $3::uuid,
            audience_confirmed_at = now(), audience_confirmed_by_person_id = $3::uuid,
            decision_reason = case when $2 = 'cancelled' then 'Arranged by a test' end
      where id = $1`,
    [eventId, status, actorPersonId],
  );
}

/** Puts a draft's date in the past, which nothing in the service layer may do. */
async function backdate(eventId: string, days: number): Promise<void> {
  await observer.query(
    "update public.events set scheduled_on = current_date - $2::int, term_id = null, week_number = null where id = $1",
    [eventId, days],
  );
}

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
// The seven the schema seeds — and, since LAN-265, the ones operators create
// ---------------------------------------------------------------------------

describe("the templates the schema ships with (D12, D40, as LAN-265 reopened them)", () => {
  it("lists the seven it seeds, by name", async () => {
    const templates = await listEventTemplates();

    // The seven the migration seeds. A template this suite created is filtered
    // out by its marker rather than asserted away, so a leak shows up as a
    // failure in the case that made it rather than here.
    expect(
      templates.map((template) => template.name).filter((name) => !name.startsWith(NAME_MARKER)),
    ).toEqual(SEVEN_NAMES);
  });

  it("refuses a template that does not exist, rather than inventing one", async () => {
    // Two shapes of miss, one sentence: a well-formed identifier for a template
    // somebody deleted, and a value that is not an identifier at all — which
    // would otherwise reach the `uuid` column as an invalid-input error.
    for (const missing of ["00000000-0000-4000-8000-000000000000", "tournament"]) {
      const error = await refusalFrom(() => readEventTemplate(missing));
      expect(error.kind).toBe("not_found");
      expect(error.message).toContain("no longer exists");
    }
  });

  it("creates a template with its messaging cadence and its settings row", async () => {
    // LAN-265's whole point, and the reversal of this suite's own "offers no
    // way to create or delete one anywhere in the module". Brian, 2026-09-09:
    // "Creating a template also creates its messaging cadence, which starts
    // from a default cadence and can then be edited on the Messaging schedule
    // screen like the seven existing ones."
    const created = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Kicking Clinic`, defaultVenue: "Horspath" }),
      [],
    );

    expect(created.name).toBe(`${NAME_MARKER} Kicking Clinic`);
    // Never shown, never chosen, and `practice` on anything an operator makes.
    expect(created.eventType).toBe("practice");

    const cadence = await withTransaction((tx) => readMessagingScheduleIn(tx, created.id));
    expect(cadence.templateName).toBe(created.name);
    expect(cadence.rsvpByDays).toBe(DEFAULT_MESSAGING_SCHEDULE.rsvpByDays);
    expect(cadence.escalationHours).toBe(DEFAULT_MESSAGING_SCHEDULE.escalationHours);

    const settings = await observer.query<{ days: number }>(
      "select chase_threshold_days as days from public.event_type_settings where template_id = $1",
      [created.id],
    );
    expect(settings.rows[0].days).toBe(DEFAULT_CHASE_THRESHOLD_DAYS);
  });

  it("refuses a second template with a name the club is already using", async () => {
    // Case-insensitively, because the name is the only thing an operator ever
    // sees of a template and two spellings of one word are indistinguishable.
    await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Film Review` }),
      [],
    );

    const error = await refusalFrom(() =>
      createEventTemplate(actorPersonId, templateInput({ name: `${NAME_MARKER} film review` }), []),
    );

    expect(error.kind).toBe("conflict");
    expect(error.message).toContain("already a template with that name");
  });

  it("deletes a template nothing was created from, and refuses one in use", async () => {
    const spare = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Spare` }),
      [],
    );

    await deleteEventTemplate(actorPersonId, spare.id);
    const gone = await refusalFrom(() => readEventTemplate(spare.id));
    expect(gone.kind).toBe("not_found");

    // Its cadence went with it — the cascade, not a second delete.
    const cadence = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.messaging_schedules where template_id = $1",
      [spare.id],
    );
    expect(cadence.rows[0].count).toBe("0");

    const used = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Used` }),
      [],
    );
    await createEventDraft(actorPersonId, draftInput({ templateId: used.id }));

    const refusal = await refusalFrom(() => deleteEventTemplate(actorPersonId, used.id));
    expect(refusal.kind).toBe("constraint_violated");
    expect(refusal.message).toContain("cannot be deleted");
  });

  it("renames a template, and every event of that kind reads the new name", async () => {
    // Brian, 2026-09-09: "rename 'Chalk' to 'Film Review' and every past chalk
    // event reads 'Film Review', the same way a venue rename would". Nothing in
    // `events` is rewritten — the label is read from the template.
    const event = await createEventDraft(actorPersonId, draftInput({ templateId: TEMPLATE.chalk }));
    expect(event.templateName).toBe(TEMPLATE_NAME.chalk);

    const renamed = `${NAME_MARKER} Chalk Renamed`;
    try {
      const plan = await saveEventTemplate(
        actorPersonId,
        TEMPLATE.chalk,
        templateInput({ name: renamed }),
        [],
      );
      expect(plan.renamedFrom).toBe(TEMPLATE_NAME.chalk);

      const reread = await readEvent(event.id);
      expect(reread.templateName).toBe(renamed);
      expect(reread.eventType).toBe("chalk");
    } finally {
      await saveEventTemplate(
        actorPersonId,
        TEMPLATE.chalk,
        templateInput({ name: TEMPLATE_NAME.chalk }),
        [],
      );
    }
  });

  it("starts every template with everything undecided", async () => {
    // A field the club has not decided arrives empty on a new event and
    // overwrites nothing — Brian, 2026-08-21: "You can have some details not
    // decided."
    const template = await readEventTemplate(TEMPLATE.meeting);

    expect(template.defaultVenue).toBeNull();
    expect(template.defaultDeliveryMode).toBeNull();
    expect(template.defaultDurationMinutes).toBeNull();
    expect(template.defaultIsMandatory).toBeNull();
  });
});

/**
 * LAN-276 correction round 1. Brian, walking the review environment,
 * 2026-09-10: "In the template, swatch color should be something that gets
 * chosen, so it gets added as part of the template." The check constraint
 * itself is proved against the real column in
 * `tests/schema-events-target-state.test.ts`; what belongs here is that the
 * service round-trips a chosen colour, and that a template an operator
 * creates carries the colour it was given rather than one derived from its
 * class.
 */
describe("colour is a template's own fact, not a guess from its class (Brian, 2026-09-10)", () => {
  it("stores the colour a new template is created with, and lists and reads it back", async () => {
    const created = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Film Review`, colourKey: "indigo" }),
      [],
    );
    expect(created.colourKey).toBe("indigo");

    const reread = await readEventTemplate(created.id);
    expect(reread.colourKey).toBe("indigo");

    const listed = await listEventTemplates();
    expect(listed.find((template) => template.id === created.id)?.colourKey).toBe("indigo");
  });

  it("does not colour a new template by its class — two templates that both get `practice` may differ", async () => {
    const first = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Kicking Clinic`, colourKey: "cyan" }),
      [],
    );
    const second = await createEventTemplate(
      actorPersonId,
      templateInput({ name: `${NAME_MARKER} Full Pads Practice`, colourKey: "brown" }),
      [],
    );

    expect(first.eventType).toBe("practice");
    expect(second.eventType).toBe("practice");
    expect(first.colourKey).not.toBe(second.colourKey);
  });

  it("changes a template's colour on save, independently of its name and fields", async () => {
    try {
      const plan = await saveEventTemplate(
        actorPersonId,
        TEMPLATE.practice,
        templateInput({ colourKey: "pink" }),
        [],
      );
      expect(plan.templateId).toBe(TEMPLATE.practice);

      const reread = await readEventTemplate(TEMPLATE.practice);
      expect(reread.colourKey).toBe("pink");
      // The name was not touched by this save, and colour is not an inherited
      // default — it does not appear among the fields a draft could take.
      expect(reread.name).toBe(TEMPLATE_NAME.practice);
      expect(plan.fieldChanges.some((change) => change.field === "colourKey")).toBe(false);
    } finally {
      await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);
    }
  });
});

// ---------------------------------------------------------------------------
// What a new event of a type arrives as
// ---------------------------------------------------------------------------

describe("a new event arrives carrying its type's template (D40-D42, D47)", () => {
  it("brings the template's questions, marked as having come from it", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?", isRequired: true }),
      question({ prompt: "Which shirt size?", answerType: "choice", choices: ["S", "M", "L"] }),
    ]);

    const event = await createEventDraft(actorPersonId, draftInput());
    const questions = await readEventQuestions(event.id);

    expect(questions.map((entry) => entry.prompt)).toEqual([
      "Bringing a gumshield?",
      "Which shirt size?",
    ]);
    expect(questions.every((entry) => entry.fromTemplate)).toBe(true);
    expect(questions[0].isRequired).toBe(true);
    expect(questions[1].choices).toEqual(["S", "M", "L"]);
  });

  it("keeps the order the template set, because it is the order a player is asked", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "First" }),
      question({ prompt: "Second" }),
      question({ prompt: "Third" }),
    ]);

    const event = await createEventDraft(actorPersonId, draftInput());

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("brings the template's default audience, already resolved to people (D47)", async () => {
    // This is the reversal of LAN-77's shipped "the audience begins empty". The
    // approver checks a list rather than rebuilding the same thirty-two names.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );

    const event = await createEventDraft(actorPersonId, draftInput());

    expect(event.audienceCount).toBeGreaterThan(0);
  });

  it("stores that audience as an explicit list of people, never as a query", async () => {
    // A group is a way of selecting people, not a live query that changes
    // underneath an approved event.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );

    const event = await createEventDraft(actorPersonId, draftInput());
    const rows = await observer.query<{ capacity: string }>(
      "select capacity::text as capacity from public.event_audience_members where event_id = $1",
      [event.id],
    );

    expect(rows.rows.length).toBe(event.audienceCount);
    expect(rows.rows.every((row) => row.capacity === "player")).toBe(true);
  });

  it("arrives with no audience at all when the template names no groups", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);

    const event = await createEventDraft(actorPersonId, draftInput());

    expect(event.audienceCount).toBe(0);
  });

  it("records in the audit that the audience came from the template", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );

    const event = await createEventDraft(actorPersonId, draftInput());
    const audit = await observer.query<{ context: Record<string, unknown> }>(
      `select context from public.audit_events
        where entity_table = 'events' and entity_id = $1 and action = 'event.drafted'`,
      [event.id],
    );

    expect(audit.rows[0].context.templateAudienceGroups).toEqual(["active_players"]);
    expect(audit.rows[0].context.templateAudienceSize).toBe(event.audienceCount);
  });

  it("brings the fields the form filled in from the template", async () => {
    // The form prefills from the template and posts what the operator saw, so
    // what is stored is what was on screen — never a value the service added
    // behind them.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({
        defaultVenue: "Iffley Road Astro",
        defaultRequiredEquipment: "Gumshield, boots",
        defaultIsMandatory: true,
      }),
      [],
    );

    const defaults = await readEventFormDefaults();

    // Keyed by template id since LAN-265, and each entry carries the name the
    // form's Type control prints.
    expect(defaults[TEMPLATE.practice].name).toBe(TEMPLATE_NAME.practice);
    expect(defaults[TEMPLATE.practice].venue).toBe("Iffley Road Astro");
    expect(defaults[TEMPLATE.practice].requiredEquipment).toBe("Gumshield, boots");
    expect(defaults[TEMPLATE.practice].attendance).toBe("mandatory");
  });

  it("gives the form no event name, no date and no start time to prefill", async () => {
    const defaults = await readEventFormDefaults();

    // `id`, `name` and `eventType` are the template's own identity, added by
    // LAN-265 so the Type control can print a word and post an identifier. The
    // **event's** name is still absent, which is what this case is about.
    expect(Object.keys(defaults[TEMPLATE.practice]).sort()).toEqual([
      "attendance",
      "deliveryMode",
      "description",
      "durationMinutes",
      "eventType",
      "id",
      "name",
      "questions",
      "requiredEquipment",
      "venue",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Per-field inheritance — the rule that makes templates safe
// ---------------------------------------------------------------------------

describe("a template change reaches only the fields nobody has edited (D41)", () => {
  it("updates a draft field that still holds what the template gave it", async () => {
    // Brian, 2026-08-21: "if I didn't change the kit — it's just the default and
    // it's the same — then it updates that."
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ requiredEquipment: "Gumshield" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield, boots");
  });

  it("leaves a field somebody wrote by hand exactly as they wrote it", async () => {
    // "If I create an event and write a custom description, and then I update
    // the template, it would not update the description."
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDescription: "Full contact." }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ description: "Walkthrough only — the pitch is frozen." }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDescription: "Full contact. Bring water." }),
      [],
    );

    expect((await eventRow(event.id)).description).toBe("Walkthrough only — the pitch is frozen.");
  });

  it("leaves it alone permanently, not just once", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDescription: "A" }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput({ description: "Mine" }));

    for (const description of ["B", "C", "D"]) {
      await saveEventTemplate(
        actorPersonId,
        TEMPLATE.practice,
        templateInput({ defaultDescription: description }),
        [],
      );
    }

    expect((await eventRow(event.id)).description).toBe("Mine");
  });

  it("moves one field and holds another on the same draft", async () => {
    // The rule is per field, so a draft is not all-or-nothing.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro", defaultDescription: "Full contact." }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ venue: "Iffley Road Astro", description: "Mine" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath", defaultDescription: "Changed." }),
      [],
    );

    const row = await eventRow(event.id);
    expect(row.venue).toBe("Horspath");
    expect(row.description).toBe("Mine");
  });

  it("fills a draft field the template had left undecided", async () => {
    // "A template field left undecided arrives empty on a new event and
    // overwrites nothing" — and when the club later decides, the drafts that
    // are still empty take it.
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);
    const event = await createEventDraft(actorPersonId, draftInput({ venue: null }));

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );

    expect((await eventRow(event.id)).venue).toBe("Iffley Road Astro");
  });

  it("recomputes the end time from a changed default length, where nobody set one", async () => {
    // D78: a template holds a duration, not an end, so the end it implies
    // depends on the start the operator entered.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDurationMinutes: 120 }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ startsAt: "20:00", endsAt: "22:00" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDurationMinutes: 90 }),
      [],
    );

    expect((await eventRow(event.id)).ends_at).toBe("21:30:00");
  });

  it("leaves an end time somebody set themselves", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDurationMinutes: 120 }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ startsAt: "20:00", endsAt: "21:00" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDurationMinutes: 90 }),
      [],
    );

    expect((await eventRow(event.id)).ends_at).toBe("21:00:00");
  });

  it("moves the in-person-or-online property, which is an enum column", async () => {
    // The one inherited column whose value has to coerce from a JS string into
    // a PostgreSQL enum on the way in. Every other field is text or boolean, so
    // this is the one that would fail at runtime rather than in a type check.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.chalk,
      templateInput({ name: TEMPLATE_NAME.chalk, defaultDeliveryMode: "in_person" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ templateId: "b547e0b3-f48c-5601-9dc6-e8725fc434f9", deliveryMode: "in_person" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.chalk,
      templateInput({ name: TEMPLATE_NAME.chalk, defaultDeliveryMode: "online" }),
      [],
    );

    expect((await eventRow(event.id)).delivery_mode).toBe("online");
  });

  it("touches no draft of another type", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const social = await createEventDraft(
      actorPersonId,
      draftInput({ templateId: "8de00424-52a8-52ad-9c9f-a29823f9c4bf", venue: null }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect((await eventRow(social.id)).venue).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The absolute exclusions — approved, and past
// ---------------------------------------------------------------------------

describe("no approved event and no past event ever changes (W8)", () => {
  it("changes no approved event, however untouched its fields are", async () => {
    // People have been told what it is. This is asserted rather than inspected,
    // which is what W8's acceptance evidence asks for in as many words.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ requiredEquipment: "Gumshield" }),
    );
    await forceStatus(event.id, "approved");

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("changes no cancelled event either", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ requiredEquipment: "Gumshield" }),
    );
    await forceStatus(event.id, "cancelled");

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("changes no past draft, because a past event is history", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ requiredEquipment: "Gumshield" }),
    );
    await backdate(event.id, 30);

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("still reaches a draft with no date at all, which has not happened", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ scheduledOn: null, requiredEquipment: "Gumshield" }),
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield, boots");
  });
});

// ---------------------------------------------------------------------------
// Questions, which are part of the event and follow the event's rules
// ---------------------------------------------------------------------------

describe("a template's questions reach unapproved drafts and spare approved events", () => {
  it("adds a newly added question to an existing draft", async () => {
    // W8's own trigger: "practices now need a gumshield question".
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);

    const questions = await readEventQuestions(event.id);
    expect(questions.map((entry) => entry.prompt)).toEqual(["Bringing a gumshield?"]);
    expect(questions[0].fromTemplate).toBe(true);
  });

  it("removes a removed question from an existing draft", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);

    expect(await readEventQuestions(event.id)).toEqual([]);
  });

  it("leaves an approved event's questions where they are", async () => {
    // People were already asked. W8: "Existing drafts lose it; approved events
    // keep it."
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());
    await forceStatus(event.id, "approved");

    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Bringing a gumshield?",
    ]);
  });

  it("never puts back a template question the operator removed from one event (D42)", async () => {
    // D42 says a template question "may be removed per event". A later template
    // save that re-added it would be the system undoing a deliberate edit.
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
      question({ prompt: "Which shirt size?", answerType: "choice", choices: ["S", "M"] }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());

    // The operator drops one of them on this event alone.
    await observer.query("delete from public.event_questions where event_id = $1 and prompt = $2", [
      event.id,
      "Bringing a gumshield?",
    ]);

    // A later template save that still carries it, plus something new.
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
      question({ prompt: "Which shirt size?", answerType: "choice", choices: ["S", "M"] }),
      question({ prompt: "Need a lift?" }),
    ]);

    const prompts = (await readEventQuestions(event.id)).map((entry) => entry.prompt);
    expect(prompts).not.toContain("Bringing a gumshield?");
    expect(prompts).toContain("Need a lift?");
  });

  it("never touches a question the operator wrote on the event themselves", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "From the template" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());
    await observer.query(
      `insert into public.event_questions (event_id, prompt, answer_type, sort_order, from_template)
       values ($1, 'Mine alone', 'text', 5, false)`,
      [event.id],
    );

    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), []);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Mine alone",
    ]);
  });

  it("updates a template question the draft still carries unchanged", async () => {
    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?", isRequired: false }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, TEMPLATE.practice, templateInput(), [
      question({ prompt: "Bringing a gumshield?", isRequired: true }),
    ]);

    expect((await readEventQuestions(event.id))[0].isRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The blast radius, stated before the act
// ---------------------------------------------------------------------------

describe("the operator is told what a change will and will not touch (W8-03)", () => {
  it("writes nothing while it is only a plan", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput({ venue: "Iffley Road Astro" }));

    await planEventTemplateChange(
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect((await eventRow(event.id)).venue).toBe("Iffley Road Astro");
    expect((await readEventTemplate(TEMPLATE.practice)).defaultVenue).toBe("Iffley Road Astro");
  });

  it("names the drafts that will take the change", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} taking`, venue: "Iffley Road Astro" }),
    );

    const plan = await planEventTemplateChange(
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect(plan.taking.map((draft) => draft.id)).toContain(event.id);
    expect(plan.taking.find((draft) => draft.id === event.id)?.fields).toContain("Venue");
  });

  it("names the drafts that will not, and why (W8's whole point)", async () => {
    // "3 drafts will take this; 1 will not, because its description was edited."
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultDescription: "Full contact." }),
      [],
    );
    const held = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} holding`, description: "Mine" }),
    );

    const plan = await planEventTemplateChange(
      TEMPLATE.practice,
      templateInput({ defaultDescription: "Changed." }),
      [],
    );

    const entry = plan.holding.find((draft) => draft.id === held.id);
    expect(entry).toBeDefined();
    expect(entry?.reasons.join(" ")).toContain("description");
    expect(entry?.reasons.join(" ")).toContain("edited by hand");
  });

  it("counts what will not move at all, so the promise is visible", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const approved = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} approved`, venue: "Iffley Road Astro" }),
    );
    await forceStatus(approved.id, "approved");

    const plan = await planEventTemplateChange(
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect(plan.untouched.approved).toBeGreaterThan(0);
  });

  it("says plainly when a change touches nothing", async () => {
    // W8: "A template change would touch nothing → said plainly, so the operator
    // is not left wondering what happened."
    const plan = await planEventTemplateChange(
      TEMPLATE.meeting,
      templateInput({ defaultVenue: `${NAME_MARKER} nowhere` }),
      [],
    );

    expect(plan.taking).toEqual([]);
  });

  it("agrees with what the save actually does", async () => {
    // The plan and the write come from one computation run twice. A preview that
    // could disagree with the write would be a promise rather than a preview.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    await createEventDraft(actorPersonId, draftInput({ venue: "Iffley Road Astro" }));

    const planned = await planEventTemplateChange(
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );
    const applied = await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect(applied.taking.map((draft) => draft.id).sort()).toEqual(
      planned.taking.map((draft) => draft.id).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// The audit trail
// ---------------------------------------------------------------------------

describe("who changed a template is in the audit ledger", () => {
  it("records the actor, the type and what moved", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    const rows = await observer.query<{
      actor_person_id: string;
      context: Record<string, unknown>;
    }>(
      `select actor_person_id, context from public.audit_events
        where entity_table = 'event_templates' and entity_id = $1
        order by occurred_at desc limit 1`,
      [TEMPLATE.practice],
    );

    expect(rows.rows[0].actor_person_id).toBe(actorPersonId);
    expect(rows.rows[0].context.eventType).toBe("practice");
    expect(rows.rows[0].context.fieldsChanged).toContain("venue");
  });

  it("names the template's own row in the audit ledger", async () => {
    // LAN-265 retired `templateEntityId`. `audit_events.entity_id` is a `uuid`
    // and `event_templates` had no surrogate key, so an audit row about the
    // Practice template used to carry a UUIDv5 hashed from the type name. The
    // table has a real uuid key now, so the audit row names the row it is about.
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.social,
      templateInput({ name: TEMPLATE_NAME.social, defaultVenue: "The Bear" }),
      [],
    );

    const rows = await observer.query<{ entity_id: string }>(
      `select entity_id from public.audit_events
        where entity_table = 'event_templates'
        order by occurred_at desc limit 1`,
    );

    expect(rows.rows[0].entity_id).toBe(TEMPLATE.social);
    expect(rows.rows[0].entity_id).not.toBe(TEMPLATE.practice);
  });

  it("refuses a template change that does not name who made it", async () => {
    const error = await refusalFrom(() =>
      saveEventTemplate("", TEMPLATE.practice, templateInput(), []),
    );

    expect(error.kind).toBe("constraint_violated");
  });
});

// ---------------------------------------------------------------------------
// The default audience, when the template's own groups change
// ---------------------------------------------------------------------------

describe("a changed default audience follows the same rule", () => {
  it("replaces the audience on a draft that still holds the template's own", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput());
    const before = event.audienceCount;

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["everyone_active"] }),
      [],
    );

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.event_audience_members where event_id = $1",
      [event.id],
    );
    expect(Number(after.rows[0].count)).toBeGreaterThan(before);
  });

  it("leaves an audience somebody built by hand", async () => {
    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput());
    // The operator drops somebody, which makes it theirs rather than the
    // template's.
    await observer.query(
      `delete from public.event_audience_members
        where id = (select id from public.event_audience_members where event_id = $1 limit 1)`,
      [event.id],
    );
    const mine = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.event_audience_members where event_id = $1",
      [event.id],
    );

    await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["everyone_active"] }),
      [],
    );

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.event_audience_members where event_id = $1",
      [event.id],
    );
    expect(after.rows[0].count).toBe(mine.rows[0].count);
  });

  it("refuses a group the type is not offered (D46)", async () => {
    // `event_template_audience_groups_recruits_are_recruitment_only` says the
    // same thing in the database; this is the sentence in front of it.
    const error = await refusalFrom(() =>
      saveEventTemplate(
        actorPersonId,
        TEMPLATE.practice,
        templateInput({ audienceGroups: ["recruits"] }),
        [],
      ),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(error.message).toContain("not offered for this kind of event");
  });

  it("accepts the recruits group on a recruitment template", async () => {
    const plan = await saveEventTemplate(
      actorPersonId,
      TEMPLATE.recruitment,
      templateInput({ name: TEMPLATE_NAME.recruitment, audienceGroups: ["recruits"] }),
      [],
    );

    expect(plan.audienceAfter).toEqual(["Recruits"]);
  });

  // D-003 (correction round 3, Q-14, WP-operator-record, LAN-217): BPS was
  // refused here — `public.audience_group` had no `bps` value — until this
  // round's migration
  // (`supabase/migrations/20260904120000_bps_event_template_audience.sql`)
  // added one. Unlike Recruits, BPS carries no per-type restriction, so it
  // is accepted on an ordinary Practice template, not only Recruitment.
  it("accepts the BPS group on an ordinary template, pre-choosable exactly as the event's own picker already offers it (D-003)", async () => {
    const plan = await saveEventTemplate(
      actorPersonId,
      TEMPLATE.practice,
      templateInput({ audienceGroups: ["bps"] }),
      [],
    );

    expect(plan.audienceAfter).toEqual(["All Active BPS"]);

    const stored = await readEventTemplate(TEMPLATE.practice);
    expect(stored.audienceGroups).toEqual(["bps"]);
  });
});
