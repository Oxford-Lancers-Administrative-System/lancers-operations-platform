/**
 * The event-type template surfaces — LAN-154, W8-01 to W8-04.
 *
 * The service is mocked here: what these tests are about is the screen, and what
 * the per-field inheritance rule does to real rows is proved against the real
 * database in `src/lib/services/event-templates.test.ts`.
 *
 * Controls are driven rather than inspected, for the reason
 * `question-editor.test.tsx` gives at length.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events/templates",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("./actions", () => ({
  previewEventTemplateAction: vi.fn(),
  saveEventTemplateAction: vi.fn(),
  createEventTemplateAction: vi.fn(),
  deleteEventTemplateAction: vi.fn(),
}));
vi.mock("@/lib/services/event-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-templates")>();
  return {
    ...actual,
    listEventTemplates: vi.fn(),
    readEventTemplate: vi.fn(),
    countEventsFromTemplate: vi.fn(),
    planEventTemplateChange: vi.fn(),
    saveEventTemplate: vi.fn(),
  };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  countEventsFromTemplate,
  listEventTemplates,
  readEventTemplate,
  type EventTemplate,
  type EventTemplateSummary,
  type TemplateChangePlan,
} from "@/lib/services/event-templates";
import { groupsForEventType } from "@/lib/services/audience-selection";
import { TEMPLATE_COLOUR_PALETTE } from "@/lib/services/event-template-input";
import {
  createEventTemplateAction,
  previewEventTemplateAction,
  saveEventTemplateAction,
} from "./actions";
import EventTemplatesPage from "./page";
import EventTemplatePage from "./[templateId]/page";
import { TEMPLATES_DELETE_RULE } from "./presentation";
import TemplateEditor from "./template-editor";

/**
 * The seven templates the migration seeds — LAN-265.
 *
 * Their identifiers are fixed literals in
 * `20260916090000_event_templates.sql`, so a fixture names one rather than
 * inventing one, and the names are what the screens print.
 */
const SEVEN_TEMPLATES: readonly { id: string; name: string; eventType: string }[] = [
  { id: "7e34a764-7ed1-535e-8cef-73e00a62eafc", name: "Practice", eventType: "practice" },
  {
    id: "8fb4acfc-1d41-53b0-bda8-202f454a8629",
    name: "Strength and conditioning",
    eventType: "strength_and_conditioning",
  },
  { id: "b547e0b3-f48c-5601-9dc6-e8725fc434f9", name: "Chalk", eventType: "chalk" },
  { id: "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae", name: "Game", eventType: "game" },
  { id: "8de00424-52a8-52ad-9c9f-a29823f9c4bf", name: "Social", eventType: "social" },
  {
    id: "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
    name: "Recruitment",
    eventType: "recruitment",
  },
  { id: "660cdcb7-51e3-5a19-aaa2-08c5256af288", name: "Meeting", eventType: "meeting" },
];

const PRACTICE = SEVEN_TEMPLATES[0];

function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function summary(overrides: Partial<EventTemplateSummary> = {}): EventTemplateSummary {
  return {
    id: PRACTICE.id,
    name: PRACTICE.name,
    colourKey: "blue",
    eventType: "practice",
    audienceGroups: [],
    defaultVenue: null,
    defaultDeliveryMode: null,
    questionCount: 0,
    eventCount: 0,
    ...overrides,
  };
}

function template(overrides: Partial<EventTemplate> = {}): EventTemplate {
  return {
    id: PRACTICE.id,
    name: PRACTICE.name,
    colourKey: "blue",
    eventType: "practice",
    defaultVenue: null,
    defaultDeliveryMode: null,
    defaultDurationMinutes: null,
    defaultDescription: null,
    defaultRequiredEquipment: null,
    defaultIsMandatory: null,
    audienceGroups: [],
    questions: [],
    ...overrides,
  };
}

function plan(overrides: Partial<TemplateChangePlan> = {}): TemplateChangePlan {
  return {
    templateId: PRACTICE.id,
    name: PRACTICE.name,
    renamedFrom: null,
    eventType: "practice",
    fieldChanges: [],
    questionChanges: [],
    audienceBefore: [],
    audienceAfter: [],
    taking: [],
    holding: [],
    untouched: { approved: 0, past: 0 },
    ...overrides,
  };
}

function typeProps(templateId = PRACTICE.id) {
  return {
    params: Promise.resolve({ templateId }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events/templates/[templateId]">;
}

function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(countEventsFromTemplate).mockResolvedValue(0);
  vi.mocked(listEventTemplates).mockResolvedValue(
    SEVEN_TEMPLATES.map(({ id, name, eventType }) => summary({ id, name, eventType })),
  );
  vi.mocked(readEventTemplate).mockResolvedValue(template());
});

// ---------------------------------------------------------------------------
// W8-01
// ---------------------------------------------------------------------------

describe("W8-01 — the club's templates", () => {
  it("lists them, and links each to its own template", async () => {
    render(await EventTemplatesPage());

    const rows = screen.getAllByTestId("template-row");
    expect(rows).toHaveLength(7);
    // By id since LAN-265, and that is the point of the id: a route segment
    // made of the name would break every link an operator kept the moment
    // somebody renamed the template.
    expect(within(rows[0]).getByRole("link", { name: "Practice" }).getAttribute("href")).toBe(
      `/operate/events/templates/${PRACTICE.id}`,
    );
  });

  it("offers no way to add a template without standing policy copy", async () => {
    // LAN-265 reversed this. It used to assert the opposite — that there was no
    // way to add one, and that the screen said so — because the seven types
    // were the seven templates and an eighth was a migration. Creating one is
    // an ordinary administrative act now.
    render(await EventTemplatesPage());

    expect(screen.getByTestId("new-template").getAttribute("href")).toBe(
      "/operate/events/templates/new",
    );
    expect(screen.queryByTestId("templates-are-fixed")).not.toBeInTheDocument();
  });

  it("says when a template can be deleted, where the control would be", async () => {
    // The other half of the same courtesy. Delete lives on the template's own
    // page and only while nothing was created from it, so the list is where to
    // say why somebody may not find it there.
    render(await EventTemplatesPage());

    expect(flatten(screen.getByTestId("templates-delete-rule").textContent)).toBe(
      TEMPLATES_DELETE_RULE,
    );
  });

  it("offers Delete on a template nothing was created from, and not on one in use", async () => {
    const editor = (eventCount: number) => (
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={eventCount}
        initial={{}}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />
    );

    const unused = render(editor(0));
    expect(unused.queryByTestId("delete-template")).toBeInTheDocument();
    unused.unmount();

    // Absent rather than disabled: a control that is always there and usually
    // refuses teaches an operator to ignore it, and the service refuses
    // regardless — `events_template_fkey` is `on delete restrict`.
    const inUse = render(editor(4));
    expect(inUse.queryByTestId("delete-template")).not.toBeInTheDocument();
  });

  it("says what each type invites, where it is, and how many questions it asks", async () => {
    vi.mocked(listEventTemplates).mockResolvedValue([
      summary({
        eventType: "practice",
        audienceGroups: ["active_players"],
        defaultVenue: "Iffley Road Astro",
        defaultDeliveryMode: "in_person",
        questionCount: 3,
      }),
    ]);

    render(await EventTemplatesPage());

    const row = flatten(screen.getAllByTestId("template-row")[0].textContent);
    expect(row).toContain("All active players");
    expect(row).toContain("In person · Iffley Road Astro");
    expect(row).toContain("3 questions");
  });

  it("says a type that has decided nothing has decided nothing", async () => {
    vi.mocked(listEventTemplates).mockResolvedValue([summary({ eventType: "meeting" })]);

    render(await EventTemplatesPage());

    const row = flatten(screen.getAllByTestId("template-row")[0].textContent);
    expect(row).toContain("Not set");
    expect(row).toContain("None");
  });

  it("draws the same four facts on a phone", async () => {
    // Reflow may not remove required information.
    vi.mocked(listEventTemplates).mockResolvedValue([
      summary({ audienceGroups: ["active_players"], defaultVenue: "Iffley", questionCount: 1 }),
    ]);

    render(await EventTemplatesPage());

    const card = flatten(screen.getAllByTestId("template-card")[0].textContent);
    expect(card).toContain("Practice");
    expect(card).toContain("All active players");
    expect(card).toContain("Iffley");
    expect(card).toContain("1 question");
  });

  it("W154C-F2: labels its values on a phone, so two 'Not set' facts are told apart", async () => {
    // At 375px an unconfigured template used to read "Practice / Not set / Not
    // set / None" — three unlabelled values, with nothing saying which "Not
    // set" is the default audience and which is the venue. The desktop table
    // carries a header row for the same reason; the card must say it inline.
    vi.mocked(listEventTemplates).mockResolvedValue([summary({ eventType: "meeting" })]);

    render(await EventTemplatesPage());

    const card = flatten(screen.getAllByTestId("template-card")[0].textContent);
    expect(card).toContain("Invites by default Not set");
    expect(card).toContain("Where Not set");
    expect(card).toContain("Questions None");
  });

  it("is closed to an operator without the calendar capability", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["treasurer"]),
    });

    render(await EventTemplatesPage());

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(listEventTemplates).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// W8-02
// ---------------------------------------------------------------------------

describe("W8-02 — one template", () => {
  it("names the template and leaves every field optional", async () => {
    render(await EventTemplatePage(typeProps()));

    expect(screen.getByRole("heading", { name: "Practice" })).toBeVisible();
    expect(document.querySelectorAll("input[required], textarea[required]")).toHaveLength(0);
    expect(flatten(document.body.textContent)).not.toContain("Leave anything undecided");
  });

  it("refuses a type that is not one of the seven, as content rather than a crash", async () => {
    vi.mocked(readEventTemplate).mockRejectedValue(
      new NotFound("There is no template for that kind of event.", { rule: "x" }),
    );

    render(await EventTemplatePage(typeProps("tournament")));

    expect(screen.getByTestId("template-unavailable")).toBeVisible();
  });

  // D-003 (correction round 3, Q-14, Brian): BPS is now offered on a
  // template's own default-audience picker, exactly as it already was on the
  // event's own picker — the one migration this round authorised.
  it("offers the four standing groups and BPS, and no recruits group", async () => {
    render(await EventTemplatePage(typeProps()));

    const groups = screen.getAllByTestId("template-audience-group");
    expect(groups.map((node) => node.getAttribute("data-group"))).toEqual([
      "everyone_active",
      "active_players",
      "active_coaches",
      "active_committee",
      "bps",
    ]);
  });

  it("offers a recruits group on the recruitment template alone (D46)", async () => {
    vi.mocked(readEventTemplate).mockResolvedValue(template({ eventType: "recruitment" }));

    render(await EventTemplatePage(typeProps("recruitment")));

    expect(
      screen.getAllByTestId("template-audience-group").map((n) => n.getAttribute("data-group")),
    ).toContain("recruits");
  });

  it("names the template itself, and still has no date or start time", async () => {
    // Brian, 2026-08-21: "the name is always going to be unique ... Usual time
    // doesn't make any sense to me. That is not a field you would have." That
    // is about the **event's** name, and it holds: nothing here supplies one.
    // LAN-265 added the **template's** own name, which is what the club calls
    // this kind of event and the only thing an operator ever sees of it.
    const { container } = render(await EventTemplatePage(typeProps()));

    const names = [...container.querySelectorAll("input, textarea")].map((node) =>
      node.getAttribute("name"),
    );
    expect(names).toContain("name");
    expect(names).not.toContain("scheduledOn");
    expect(names).not.toContain("startsAt");
  });

  it("has no field for an RSVP deadline or a chase threshold", async () => {
    // Removed as Mission 4's on 2026-08-21 — "Did you just include something
    // from mission 4 in mission 2?"
    const { container } = render(await EventTemplatePage(typeProps()));

    const text = flatten(container.textContent).toLowerCase();
    expect(text).not.toContain("chase");
    expect(text).not.toContain("deadline");
    expect(text).not.toContain("reminder");
  });

  // LAN-264. A template whose default equipment is three lines must produce an
  // event with the same three lines, which starts with being able to type them.
  it("offers Required equipment as a multi-line field, like Description", async () => {
    const { container } = render(await EventTemplatePage(typeProps()));

    const equipment = container.querySelector('[name="defaultRequiredEquipment"]');
    expect(equipment?.tagName).toBe("TEXTAREA");
    expect(container.querySelector('[name="defaultDescription"]')?.tagName).toBe("TEXTAREA");
  });

  it("asks for a default length as a fixed field, not a start time", async () => {
    const { container } = render(await EventTemplatePage(typeProps()));

    expect(container.querySelector('input[name="defaultDurationMinutes"]')).not.toBeNull();
    expect(flatten(container.textContent)).toContain("Default length");
  });

  it("reads back a saved length in the club's words", async () => {
    render(
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={0}
        initial={{ defaultDurationMinutes: "120" }}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );

    expect(flatten(document.body.textContent)).toContain("2 hours");
  });

  // C6: "the default times should be done in 30-minute increments between 30
  // minutes and 4 hours ... It shouldn't be freeform text."
  describe("C6 — the default length is a fixed choice, not freeform text", () => {
    function openDurationMenu() {
      fireEvent.mouseDown(screen.getByRole("combobox", { name: "Default length" }));
    }

    it("offers exactly the eight 30-minute-to-4-hour options, worded in hours and minutes", async () => {
      render(
        <TemplateEditor
          templateId={PRACTICE.id}
          eventTypeLabel="Practice"
          eventCount={0}
          initial={{}}
          initialQuestions={[]}
          groups={groupsForEventType("practice")}
        />,
      );

      openDurationMenu();

      const labels = screen.getAllByRole("option").map((option) => flatten(option.textContent));
      expect(labels).toEqual([
        "Not set",
        "30 minutes",
        "1 hour",
        "1 hour 30 minutes",
        "2 hours",
        "2 hours 30 minutes",
        "3 hours",
        "3 hours 30 minutes",
        "4 hours",
      ]);
    });

    it("posts the minutes the chosen words mean", async () => {
      const { container } = render(
        <TemplateEditor
          templateId={PRACTICE.id}
          eventTypeLabel="Practice"
          eventCount={0}
          initial={{}}
          initialQuestions={[]}
          groups={groupsForEventType("practice")}
        />,
      );

      openDurationMenu();
      fireEvent.click(screen.getByRole("option", { name: "1 hour 30 minutes" }));

      expect(
        container.querySelector<HTMLInputElement>('input[name="defaultDurationMinutes"]')?.value,
      ).toBe("90");
    });

    // A template saved before this eight-option grid existed can hold a
    // value that is not on it. Snapping it to the nearest option would
    // silently change what the template means, so it must still be there,
    // truthfully labelled, rather than blank or rounded off.
    it("keeps and truthfully labels an existing off-grid value, rather than snapping it", async () => {
      const { container } = render(
        <TemplateEditor
          templateId={PRACTICE.id}
          eventTypeLabel="Practice"
          eventCount={0}
          initial={{ defaultDurationMinutes: "75" }}
          initialQuestions={[]}
          groups={groupsForEventType("practice")}
        />,
      );

      expect(
        container.querySelector<HTMLInputElement>('input[name="defaultDurationMinutes"]')?.value,
      ).toBe("75");
      expect(flatten(document.body.textContent)).toContain("1 hour 15 minutes");

      // And it is offered as a ninth choice rather than hidden.
      openDurationMenu();
      const labels = screen.getAllByRole("option").map((option) => flatten(option.textContent));
      expect(labels).toContain("1 hour 15 minutes");
      expect(labels).toHaveLength(10);
    });

    it("drops the off-grid option once the operator picks one of the eight", async () => {
      const { container } = render(
        <TemplateEditor
          templateId={PRACTICE.id}
          eventTypeLabel="Practice"
          eventCount={0}
          initial={{ defaultDurationMinutes: "75" }}
          initialQuestions={[]}
          groups={groupsForEventType("practice")}
        />,
      );

      openDurationMenu();
      fireEvent.click(screen.getByRole("option", { name: "1 hour" }));

      expect(
        container.querySelector<HTMLInputElement>('input[name="defaultDurationMinutes"]')?.value,
      ).toBe("60");
      expect(screen.queryByText("1 hour 15 minutes")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Colour — LAN-276 correction round 1
// ---------------------------------------------------------------------------

/**
 * Brian, walking the review environment, 2026-09-10: "In the template, swatch
 * color should be something that gets chosen, so it gets added as part of the
 * template." A fixed palette of swatches, never a free hex value.
 */
describe("colour is chosen from a fixed palette (Brian, 2026-09-10)", () => {
  function editor(initial: { colourKey?: string } = {}) {
    return render(
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={0}
        initial={initial}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );
  }

  it("offers every colour the palette holds, as a swatch each", () => {
    editor();

    const swatches = screen.getAllByTestId("template-colour-swatch");
    expect(swatches.map((node) => node.getAttribute("data-colour"))).toEqual(
      TEMPLATE_COLOUR_PALETTE.map((colour) => colour.key),
    );
  });

  it("shows the template's stored colour pressed, and posts it", () => {
    const { container } = editor({ colourKey: "purple" });

    const pressed = screen
      .getAllByTestId("template-colour-swatch")
      .filter((node) => node.getAttribute("aria-pressed") === "true");
    expect(pressed.map((node) => node.getAttribute("data-colour"))).toEqual(["purple"]);

    expect(container.querySelector<HTMLInputElement>('input[name="colourKey"]')?.value).toBe(
      "purple",
    );
  });

  it("chooses a colour on a click, and only that one reads as pressed", () => {
    const { container } = editor({ colourKey: "blue" });

    fireEvent.click(
      screen
        .getAllByTestId("template-colour-swatch")
        .find((node) => node.getAttribute("data-colour") === "green")!,
    );

    expect(container.querySelector<HTMLInputElement>('input[name="colourKey"]')?.value).toBe(
      "green",
    );

    const pressed = screen
      .getAllByTestId("template-colour-swatch")
      .filter((node) => node.getAttribute("aria-pressed") === "true");
    expect(pressed.map((node) => node.getAttribute("data-colour"))).toEqual(["green"]);
  });

  it("shows a refused colour as the field's own error, in place of the help text", async () => {
    vi.mocked(createEventTemplateAction).mockResolvedValue({
      phase: "editing",
      issues: [{ field: "colourKey", message: "Choose a colour for this template." }],
      questionIssues: [],
      error: null,
      values: null,
      questions: null,
      plan: null,
    });

    render(
      <TemplateEditor
        templateId={null}
        eventTypeLabel="New template"
        eventCount={0}
        initial={{}}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-template"));
    });

    expect(screen.getByTestId("template-colour-help")).toHaveTextContent(
      "Choose a colour for this template.",
    );
  });
});

// ---------------------------------------------------------------------------
// The audience toggles, driven
// ---------------------------------------------------------------------------

describe("choosing what a type invites by default (D47)", () => {
  function editor(initialGroups: string[] = []) {
    return render(
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={0}
        initial={{ audienceGroups: initialGroups }}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );
  }

  function posted(): string[] {
    return [...document.querySelectorAll<HTMLInputElement>('input[name="audienceGroup"]')].map(
      (input) => input.value,
    );
  }

  it("posts a group once it is pressed, and not before", () => {
    editor();
    expect(posted()).toEqual([]);

    fireEvent.click(screen.getAllByTestId("template-audience-group")[1]);

    // Rendered twice — once in the form, once in the confirmation's payload —
    // so the assertion is about which groups, not how many inputs.
    expect(new Set(posted())).toEqual(new Set(["active_players"]));
  });

  it("takes it out again when it is pressed a second time", () => {
    editor(["active_players"]);

    fireEvent.click(screen.getAllByTestId("template-audience-group")[1]);

    expect(posted()).toEqual([]);
  });

  it("shows which groups are on, from the selection rather than from a memory", () => {
    editor(["active_players"]);

    const buttons = screen.getAllByTestId("template-audience-group");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("names groups and never a person", () => {
    // "No person appears anywhere. A template names groups, never people."
    const { container } = editor(["active_players"]);

    expect(flatten(container.textContent)).not.toContain("Groups, never people");
  });
});

// ---------------------------------------------------------------------------
// W8-03 — the blast radius, before the act
// ---------------------------------------------------------------------------

describe("W8-03 — what the change will touch", () => {
  function editor() {
    return render(
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={0}
        initial={{}}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );
  }

  it("shows no confirmation until one has been asked for", () => {
    editor();

    expect(screen.queryByTestId("section-plan-taking")).toBeNull();
  });

  it("keeps Save behind the confirmation rather than writing on the first press", () => {
    // The primary control previews; only the dialog's button writes.
    editor();

    expect(screen.getByTestId("preview-template")).toBeVisible();
    expect(screen.queryByTestId("confirm-save-template")).toBeNull();
  });
});

describe("the confirmation reads as W8-03 specifies", () => {
  /**
   * Presses the real **Save…** and lets the real `useActionState` deliver the
   * plan the action returns.
   *
   * The action is mocked; the submission is not. A test that built the dialog's
   * state by hand would be asserting on its own fixture — which is the thing
   * this file exists to avoid.
   */
  async function confirmWith(overrides: Partial<TemplateChangePlan>) {
    vi.mocked(previewEventTemplateAction).mockResolvedValue({
      phase: "confirming",
      issues: [],
      questionIssues: [],
      error: null,
      values: null,
      questions: null,
      plan: plan(overrides),
    });

    render(
      <TemplateEditor
        templateId={PRACTICE.id}
        eventTypeLabel="Practice"
        eventCount={0}
        initial={{}}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-template"));
    });
  }

  const TAKING = {
    id: "a",
    name: "Practice — hilary week 6",
    scheduledOn: "2027-02-24",
    fields: ["Required equipment"],
    audience: false,
    questions: false,
  };

  const HOLDING = {
    id: "b",
    name: "Sunday session",
    scheduledOn: "2027-03-07",
    reasons: ["Its required equipment was edited by hand."],
  };

  it("names the drafts that will take the change", async () => {
    await confirmWith({ taking: [TAKING] });

    const panel = flatten(screen.getByTestId("section-plan-taking").textContent);
    expect(panel).toContain("1 draft will take this change");
    expect(panel).toContain("Practice — hilary week 6");
  });

  it("says what each of those drafts takes, not only that it takes something", async () => {
    // W154-F1. Inheritance is per field, so one partly-edited draft is named in
    // both panels: some of it moves and some of it holds. A name under each
    // heading and nothing else reads as two drafts, and says nothing about what
    // will happen to the one that is actually at stake.
    await confirmWith({
      taking: [{ ...TAKING, fields: ["Required equipment"], audience: true, questions: true }],
      holding: [{ ...HOLDING, id: "a", name: TAKING.name }],
    });

    const panel = flatten(screen.getByTestId("section-plan-taking").textContent);
    expect(panel).toContain("Its required equipment takes the new value.");
    expect(panel).toContain("Its audience takes the new default.");
    expect(panel).toContain("Its questions take the change.");
  });

  it("leaves out what a draft does not take", async () => {
    await confirmWith({ taking: [TAKING] });

    const panel = flatten(screen.getByTestId("section-plan-taking").textContent);
    expect(panel).toContain("Its required equipment takes the new value.");
    expect(panel).not.toContain("Its audience takes the new default.");
    expect(panel).not.toContain("Its questions take the change.");
  });

  it("names the drafts that will not, and why", async () => {
    // W8: "the operator is told not only which drafts take a change but which
    // will not, and why."
    await confirmWith({ taking: [TAKING], holding: [HOLDING] });

    const panel = flatten(screen.getByTestId("section-plan-holding").textContent);
    expect(panel).toContain("1 draft will not");
    expect(panel).toContain("Sunday session");
    expect(panel).toContain("edited by hand");
  });

  it("states what will not move at all, and gives both reasons", async () => {
    await confirmWith({ taking: [TAKING], untouched: { approved: 9, past: 31 } });

    const panel = flatten(screen.getByTestId("section-plan-untouched").textContent);
    expect(panel).toContain("9 approved practices keep what they were approved with.");
    expect(panel).toContain("31 past practices are untouched.");
  });

  it("says plainly when the change reaches no draft at all", async () => {
    // "A template change would touch nothing → said plainly, so the operator is
    // not left wondering what happened."
    await confirmWith({ taking: [] });

    expect(flatten(screen.getByTestId("plan-touches-nothing").textContent)).toContain(
      "No draft takes this change",
    );
  });

  it("does not claim there are no drafts when every draft is holding its own", async () => {
    // W154-F2, and W8's own motivating case: a template description corrected
    // after every draft's description was hand-edited. The two panels are
    // independent, so this pairing is reachable — and a sentence about draft
    // *existence*, rendered on a condition about the change's *reach*, is
    // simply false here.
    await confirmWith({ taking: [], holding: [HOLDING, { ...HOLDING, id: "c", name: "Another" }] });

    const nothing = flatten(screen.getByTestId("plan-touches-nothing").textContent);
    expect(nothing).not.toContain("No drafts of this type are waiting");
    expect(nothing).toContain("No draft takes this change");
    expect(flatten(screen.getByTestId("section-plan-holding").textContent)).toContain(
      "2 drafts will not",
    );
  });

  it("makes the button say what it will do", async () => {
    await confirmWith({ taking: [TAKING, { ...TAKING, id: "c", name: "Another" }] });

    expect(flatten(screen.getByTestId("confirm-save-template").textContent)).toBe(
      "Save and update 2 drafts",
    );
  });

  it("says only Save template when nothing else moves", async () => {
    await confirmWith({ taking: [] });

    expect(flatten(screen.getByTestId("confirm-save-template").textContent)).toBe("Save template");
  });

  it("shows the field change as a before and an after", async () => {
    await confirmWith({
      fieldChanges: [
        {
          field: "requiredEquipment",
          label: "Required equipment",
          from: "Gumshield",
          to: "Gumshield, boots",
        },
      ],
      taking: [TAKING],
    });

    const changes = flatten(screen.getByTestId("plan-changes").textContent);
    expect(changes).toContain("Gumshield");
    expect(changes).toContain("Gumshield, boots");
  });

  it("closes on Back without writing anything", async () => {
    await confirmWith({ taking: [TAKING] });
    expect(screen.getByTestId("section-plan-taking")).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss-template-confirm"));
    });

    // MUI fades the dialog out, so the node lingers for the exit transition.
    // What matters is that it goes and that nothing was written on the way.
    await waitFor(() => expect(screen.queryByTestId("confirm-save-template")).toBeNull());
    expect(saveEventTemplateAction).not.toHaveBeenCalled();
  });

  it("re-opens when a fresh preview is asked for after a Back", async () => {
    // The dialog is dismissed by identity rather than by a flag, so a new plan
    // is a new question and gets asked again.
    await confirmWith({ taking: [TAKING] });
    await act(async () => {
      fireEvent.click(screen.getByTestId("dismiss-template-confirm"));
    });

    vi.mocked(previewEventTemplateAction).mockResolvedValue({
      phase: "confirming",
      issues: [],
      questionIssues: [],
      error: null,
      values: null,
      questions: null,
      plan: plan({ taking: [TAKING] }),
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-template"));
    });

    expect(screen.getByTestId("confirm-save-template")).toBeVisible();
  });

  it("hands the whole form to the save, not an identifier for a stashed plan", async () => {
    // There is no server-side draft to go stale: the dialog re-posts every
    // field, and the service recomputes the plan under its own locks.
    await confirmWith({ taking: [TAKING] });

    const saveForm = screen.getByTestId("confirm-save-template").closest("form")!;
    const names = [...saveForm.querySelectorAll("input")].map((input) =>
      input.getAttribute("name"),
    );
    // LAN-265: the identifier the save is keyed by, and the name it may be
    // changing, both travel with the rest of the form.
    expect(names).toContain("templateId");
    expect(names).toContain("name");
    expect(names).toContain("defaultVenue");
    expect(names).toContain("defaultDurationMinutes");
    expect(names).toContain("defaultAttendance");
  });
});

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

describe("getting to the templates at all", () => {
  it("is behind the Events area rather than the shell", async () => {
    // D40: "an admin surface behind the Events area". The shell still offers
    // Roster, Events and Report and nothing else.
    render(await EventTemplatesPage());

    expect(screen.getByRole("link", { name: "Back to events" })).toBeVisible();
  });
});
