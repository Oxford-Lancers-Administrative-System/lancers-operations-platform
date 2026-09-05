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

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { createEventDraft, readEventQuestions, type EventDraftInput } from "./events";
import {
  listEventTemplates,
  planEventTemplateChange,
  readEventFormDefaults,
  readEventTemplate,
  saveEventTemplate,
  templateEntityId,
  type EventTemplateInput,
} from "./event-templates";
import type { EventQuestionInput } from "./event-questions-input";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

/** Unique to this file. Two suites sharing one marker delete each other's rows. */
const NAME_MARKER = "LAN154TemplatesSuite";

/** The seven types D12 fixes, in the order the club lists them. */
const SEVEN_TYPES = [
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
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

  // The seven rows put back exactly as they were. They belong to the migration,
  // not to this suite.
  await observer.query("delete from public.event_template_questions");
  await observer.query("delete from public.event_template_audience_groups");
  for (const row of snapshot.templates) {
    await observer.query(
      `update public.event_templates
          set default_venue = $2, default_delivery_mode = $3::public.event_delivery_mode,
              default_duration_minutes = $4, default_description = $5,
              default_required_equipment = $6, default_is_mandatory = $7
        where event_type = $1::public.event_type`,
      [
        row.event_type,
        row.default_venue,
        row.default_delivery_mode,
        row.default_duration_minutes,
        row.default_description,
        row.default_required_equipment,
        row.default_is_mandatory,
      ],
    );
  }
  for (const row of snapshot.groups) {
    await observer.query(
      `insert into public.event_template_audience_groups (event_type, audience_group)
       values ($1::public.event_type, $2::public.audience_group)`,
      [row.event_type, row.audience_group],
    );
  }
  for (const row of snapshot.questions) {
    await observer.query(
      `insert into public.event_template_questions
         (id, event_type, prompt, answer_type, choices, applies_to_capacities, is_required,
          sort_order, created_at)
       values ($1, $2::public.event_type, $3, $4::public.question_answer_type, $5::text[],
               $6::public.invitation_capacity[], $7, $8, $9)`,
      [
        row.id,
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

function templateInput(overrides: Partial<EventTemplateInput> = {}): EventTemplateInput {
  return {
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
    eventType: "practice",
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
// Seven templates, and nobody creates or deletes one
// ---------------------------------------------------------------------------

describe("one template per type, seven types, none created or deleted (D12, D40)", () => {
  it("lists exactly the seven, in the club's own order", async () => {
    const templates = await listEventTemplates();

    expect(templates.map((template) => template.eventType)).toEqual(SEVEN_TYPES);
  });

  it("refuses a type that is not one of the seven, rather than inventing a template", async () => {
    // Adding an eighth is a change to the approved domain model and Brian's
    // decision, not an administrative act.
    const error = await refusalFrom(() => readEventTemplate("tournament"));

    expect(error.kind).toBe("not_found");
    expect(error.message).toContain("seven kinds of event");
  });

  it("offers no way to create or delete one anywhere in the module", async () => {
    // The grant is the real guarantee — `event_templates` is granted
    // `select, update` and nothing else — and this pins the service to it.
    const exports = await import("./event-templates");

    const names = Object.keys(exports).join(" ").toLowerCase();
    expect(names).not.toContain("createeventtemplate");
    expect(names).not.toContain("deleteeventtemplate");
  });

  it("starts every template with everything undecided", async () => {
    // A field the club has not decided arrives empty on a new event and
    // overwrites nothing — Brian, 2026-08-21: "You can have some details not
    // decided."
    const template = await readEventTemplate("meeting");

    expect(template.defaultVenue).toBeNull();
    expect(template.defaultDeliveryMode).toBeNull();
    expect(template.defaultDurationMinutes).toBeNull();
    expect(template.defaultIsMandatory).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// What a new event of a type arrives as
// ---------------------------------------------------------------------------

describe("a new event arrives carrying its type's template (D40-D42, D47)", () => {
  it("brings the template's questions, marked as having come from it", async () => {
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
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
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
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
      "practice",
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
      "practice",
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
    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);

    const event = await createEventDraft(actorPersonId, draftInput());

    expect(event.audienceCount).toBe(0);
  });

  it("records in the audit that the audience came from the template", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
      templateInput({
        defaultVenue: "Iffley Road Astro",
        defaultRequiredEquipment: "Gumshield, boots",
        defaultIsMandatory: true,
      }),
      [],
    );

    const defaults = await readEventFormDefaults();

    expect(defaults.practice.venue).toBe("Iffley Road Astro");
    expect(defaults.practice.requiredEquipment).toBe("Gumshield, boots");
    expect(defaults.practice.attendance).toBe("mandatory");
  });

  it("gives the form no name, no date and no start time to prefill", async () => {
    const defaults = await readEventFormDefaults();

    expect(Object.keys(defaults.practice).sort()).toEqual([
      "attendance",
      "deliveryMode",
      "description",
      "durationMinutes",
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
      "practice",
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ requiredEquipment: "Gumshield" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
      templateInput({ defaultDescription: "Full contact." }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ description: "Walkthrough only — the pitch is frozen." }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultDescription: "Full contact. Bring water." }),
      [],
    );

    expect((await eventRow(event.id)).description).toBe("Walkthrough only — the pitch is frozen.");
  });

  it("leaves it alone permanently, not just once", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultDescription: "A" }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput({ description: "Mine" }));

    for (const description of ["B", "C", "D"]) {
      await saveEventTemplate(
        actorPersonId,
        "practice",
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
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro", defaultDescription: "Full contact." }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ venue: "Iffley Road Astro", description: "Mine" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);
    const event = await createEventDraft(actorPersonId, draftInput({ venue: null }));

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
      templateInput({ defaultDurationMinutes: 120 }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ startsAt: "20:00", endsAt: "22:00" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultDurationMinutes: 90 }),
      [],
    );

    expect((await eventRow(event.id)).ends_at).toBe("21:30:00");
  });

  it("leaves an end time somebody set themselves", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultDurationMinutes: 120 }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ startsAt: "20:00", endsAt: "21:00" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "chalk",
      templateInput({ defaultDeliveryMode: "in_person" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ eventType: "chalk", deliveryMode: "in_person" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "chalk",
      templateInput({ defaultDeliveryMode: "online" }),
      [],
    );

    expect((await eventRow(event.id)).delivery_mode).toBe("online");
  });

  it("touches no draft of another type", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const social = await createEventDraft(
      actorPersonId,
      draftInput({ eventType: "social", venue: null }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
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
      "practice",
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("changes no cancelled event either", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("changes no past draft, because a past event is history", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
      templateInput({ defaultRequiredEquipment: "Gumshield, boots" }),
      [],
    );

    expect((await eventRow(event.id)).required_equipment).toBe("Gumshield");
  });

  it("still reaches a draft with no date at all, which has not happened", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultRequiredEquipment: "Gumshield" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ scheduledOn: null, requiredEquipment: "Gumshield" }),
    );

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);

    const questions = await readEventQuestions(event.id);
    expect(questions.map((entry) => entry.prompt)).toEqual(["Bringing a gumshield?"]);
    expect(questions[0].fromTemplate).toBe(true);
  });

  it("removes a removed question from an existing draft", async () => {
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);

    expect(await readEventQuestions(event.id)).toEqual([]);
  });

  it("leaves an approved event's questions where they are", async () => {
    // People were already asked. W8: "Existing drafts lose it; approved events
    // keep it."
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());
    await forceStatus(event.id, "approved");

    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Bringing a gumshield?",
    ]);
  });

  it("never puts back a template question the operator removed from one event (D42)", async () => {
    // D42 says a template question "may be removed per event". A later template
    // save that re-added it would be the system undoing a deliberate edit.
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
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
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "Bringing a gumshield?" }),
      question({ prompt: "Which shirt size?", answerType: "choice", choices: ["S", "M"] }),
      question({ prompt: "Need a lift?" }),
    ]);

    const prompts = (await readEventQuestions(event.id)).map((entry) => entry.prompt);
    expect(prompts).not.toContain("Bringing a gumshield?");
    expect(prompts).toContain("Need a lift?");
  });

  it("never touches a question the operator wrote on the event themselves", async () => {
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "From the template" }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());
    await observer.query(
      `insert into public.event_questions (event_id, prompt, answer_type, sort_order, from_template)
       values ($1, 'Mine alone', 'text', 5, false)`,
      [event.id],
    );

    await saveEventTemplate(actorPersonId, "practice", templateInput(), []);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Mine alone",
    ]);
  });

  it("updates a template question the draft still carries unchanged", async () => {
    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
      question({ prompt: "Bringing a gumshield?", isRequired: false }),
    ]);
    const event = await createEventDraft(actorPersonId, draftInput());

    await saveEventTemplate(actorPersonId, "practice", templateInput(), [
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
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput({ venue: "Iffley Road Astro" }));

    await planEventTemplateChange("practice", templateInput({ defaultVenue: "Horspath" }), []);

    expect((await eventRow(event.id)).venue).toBe("Iffley Road Astro");
    expect((await readEventTemplate("practice")).defaultVenue).toBe("Iffley Road Astro");
  });

  it("names the drafts that will take the change", async () => {
    await saveEventTemplate(
      actorPersonId,
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} taking`, venue: "Iffley Road Astro" }),
    );

    const plan = await planEventTemplateChange(
      "practice",
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
      "practice",
      templateInput({ defaultDescription: "Full contact." }),
      [],
    );
    const held = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} holding`, description: "Mine" }),
    );

    const plan = await planEventTemplateChange(
      "practice",
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
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    const approved = await createEventDraft(
      actorPersonId,
      draftInput({ name: `${NAME_MARKER} approved`, venue: "Iffley Road Astro" }),
    );
    await forceStatus(approved.id, "approved");

    const plan = await planEventTemplateChange(
      "practice",
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );

    expect(plan.untouched.approved).toBeGreaterThan(0);
  });

  it("says plainly when a change touches nothing", async () => {
    // W8: "A template change would touch nothing → said plainly, so the operator
    // is not left wondering what happened."
    const plan = await planEventTemplateChange(
      "meeting",
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
      "practice",
      templateInput({ defaultVenue: "Iffley Road Astro" }),
      [],
    );
    await createEventDraft(actorPersonId, draftInput({ venue: "Iffley Road Astro" }));

    const planned = await planEventTemplateChange(
      "practice",
      templateInput({ defaultVenue: "Horspath" }),
      [],
    );
    const applied = await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
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
      [templateEntityId("practice")],
    );

    expect(rows.rows[0].actor_person_id).toBe(actorPersonId);
    expect(rows.rows[0].context.eventType).toBe("practice");
    expect(rows.rows[0].context.fieldsChanged).toContain("venue");
  });

  it("gives each type a stable identifier of its own", async () => {
    expect(templateEntityId("practice")).toBe(templateEntityId("practice"));
    expect(templateEntityId("practice")).not.toBe(templateEntityId("social"));
    expect(templateEntityId("practice")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("refuses a template change that does not name who made it", async () => {
    const error = await refusalFrom(() => saveEventTemplate("", "practice", templateInput(), []));

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
      "practice",
      templateInput({ audienceGroups: ["active_players"] }),
      [],
    );
    const event = await createEventDraft(actorPersonId, draftInput());
    const before = event.audienceCount;

    await saveEventTemplate(
      actorPersonId,
      "practice",
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
      "practice",
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
      "practice",
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
        "practice",
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
      "recruitment",
      templateInput({ audienceGroups: ["recruits"] }),
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
      "practice",
      templateInput({ audienceGroups: ["bps"] }),
      [],
    );

    expect(plan.audienceAfter).toEqual(["All Active BPS"]);

    const stored = await readEventTemplate("practice");
    expect(stored.audienceGroups).toEqual(["bps"]);
  });
});
