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
}));
vi.mock("@/lib/services/event-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-templates")>();
  return {
    ...actual,
    listEventTemplates: vi.fn(),
    readEventTemplate: vi.fn(),
    planEventTemplateChange: vi.fn(),
    saveEventTemplate: vi.fn(),
  };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  listEventTemplates,
  readEventTemplate,
  type EventTemplate,
  type EventTemplateSummary,
  type TemplateChangePlan,
} from "@/lib/services/event-templates";
import { groupsForEventType } from "@/lib/services/audience-selection";
import { previewEventTemplateAction, saveEventTemplateAction } from "./actions";
import EventTemplatesPage from "./page";
import EventTemplatePage from "./[type]/page";
import TemplateEditor from "./template-editor";

const SEVEN_TYPES = [
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
];

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
    eventType: "practice",
    audienceGroups: [],
    defaultVenue: null,
    defaultDeliveryMode: null,
    questionCount: 0,
    ...overrides,
  };
}

function template(overrides: Partial<EventTemplate> = {}): EventTemplate {
  return {
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

function typeProps(type = "practice") {
  return {
    params: Promise.resolve({ type }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events/templates/[type]">;
}

function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(listEventTemplates).mockResolvedValue(
    SEVEN_TYPES.map((eventType) => summary({ eventType })),
  );
  vi.mocked(readEventTemplate).mockResolvedValue(template());
});

// ---------------------------------------------------------------------------
// W8-01
// ---------------------------------------------------------------------------

describe("W8-01 — seven types, seven templates", () => {
  it("lists all seven, and links each to its own template", async () => {
    render(await EventTemplatesPage());

    const rows = screen.getAllByTestId("template-row");
    expect(rows).toHaveLength(7);
    expect(within(rows[0]).getByRole("link", { name: "Practice" }).getAttribute("href")).toBe(
      "/operate/events/templates/practice",
    );
  });

  it("offers no way to add a template, and says why there is none", async () => {
    // The place an operator would look for **Add a type** is the place to say
    // that adding one is a decision about the club's own model.
    const { container } = render(await EventTemplatesPage());

    const labels = [...container.querySelectorAll("button, a")].map((node) =>
      flatten(node.textContent).toLowerCase(),
    );
    expect(labels.some((label) => label.includes("add") && label.includes("template"))).toBe(false);
    expect(labels.some((label) => label.includes("new type"))).toBe(false);
    expect(flatten(screen.getByTestId("templates-are-fixed").textContent)).toContain(
      "cannot be added or removed",
    );
  });

  it("offers no way to delete one either", async () => {
    const { container } = render(await EventTemplatesPage());

    const labels = [...container.querySelectorAll("button, a")].map((node) =>
      flatten(node.textContent).toLowerCase(),
    );
    expect(labels.some((label) => label.includes("delete"))).toBe(false);
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
  it("says whose template it is and that anything may be left undecided", async () => {
    render(await EventTemplatePage(typeProps()));

    expect(screen.getByRole("heading", { name: "Practice" })).toBeVisible();
    expect(flatten(document.body.textContent)).toContain("Leave anything undecided");
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

  it("has no field for a name, a date or a start time", async () => {
    // Brian, 2026-08-21: "the name is always going to be unique ... Usual time
    // doesn't make any sense to me. That is not a field you would have."
    const { container } = render(await EventTemplatePage(typeProps()));

    const names = [...container.querySelectorAll("input, textarea")].map((node) =>
      node.getAttribute("name"),
    );
    expect(names).not.toContain("name");
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

  it("asks for a default length as a fixed field, not a start time", async () => {
    const { container } = render(await EventTemplatePage(typeProps()));

    expect(container.querySelector('input[name="defaultDurationMinutes"]')).not.toBeNull();
    expect(flatten(container.textContent)).toContain("Default length");
  });

  it("reads back a saved length in the club's words", async () => {
    render(
      <TemplateEditor
        eventType="practice"
        eventTypeLabel="Practice"
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
          eventType="practice"
          eventTypeLabel="Practice"
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
          eventType="practice"
          eventTypeLabel="Practice"
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
          eventType="practice"
          eventTypeLabel="Practice"
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
          eventType="practice"
          eventTypeLabel="Practice"
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
// The audience toggles, driven
// ---------------------------------------------------------------------------

describe("choosing what a type invites by default (D47)", () => {
  function editor(initialGroups: string[] = []) {
    return render(
      <TemplateEditor
        eventType="practice"
        eventTypeLabel="Practice"
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

    expect(flatten(container.textContent)).toContain("Groups, never people");
  });
});

// ---------------------------------------------------------------------------
// W8-03 — the blast radius, before the act
// ---------------------------------------------------------------------------

describe("W8-03 — what the change will touch", () => {
  function editor() {
    return render(
      <TemplateEditor
        eventType="practice"
        eventTypeLabel="Practice"
        initial={{}}
        initialQuestions={[]}
        groups={groupsForEventType("practice")}
      />,
    );
  }

  it("shows no confirmation until one has been asked for", () => {
    editor();

    expect(screen.queryByTestId("plan-taking")).toBeNull();
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
        eventType="practice"
        eventTypeLabel="Practice"
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

    const panel = flatten(screen.getByTestId("plan-taking").textContent);
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

    const panel = flatten(screen.getByTestId("plan-taking").textContent);
    expect(panel).toContain("Its required equipment takes the new value.");
    expect(panel).toContain("Its audience takes the new default.");
    expect(panel).toContain("Its questions take the change.");
  });

  it("leaves out what a draft does not take", async () => {
    await confirmWith({ taking: [TAKING] });

    const panel = flatten(screen.getByTestId("plan-taking").textContent);
    expect(panel).toContain("Its required equipment takes the new value.");
    expect(panel).not.toContain("Its audience takes the new default.");
    expect(panel).not.toContain("Its questions take the change.");
  });

  it("names the drafts that will not, and why", async () => {
    // W8: "the operator is told not only which drafts take a change but which
    // will not, and why."
    await confirmWith({ taking: [TAKING], holding: [HOLDING] });

    const panel = flatten(screen.getByTestId("plan-holding").textContent);
    expect(panel).toContain("1 draft will not");
    expect(panel).toContain("Sunday session");
    expect(panel).toContain("edited by hand");
  });

  it("states what will not move at all, and gives both reasons", async () => {
    await confirmWith({ taking: [TAKING], untouched: { approved: 9, past: 31 } });

    const panel = flatten(screen.getByTestId("plan-untouched").textContent);
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
    expect(flatten(screen.getByTestId("plan-holding").textContent)).toContain("2 drafts will not");
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
    expect(screen.getByTestId("plan-taking")).toBeVisible();

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
    expect(names).toContain("eventType");
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
