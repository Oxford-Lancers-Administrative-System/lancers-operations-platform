// @vitest-environment node
/**
 * The template editor's server actions — LAN-276 correction round 1.
 *
 * `src/app/operate/events/templates/screens.test.tsx` mocks this module
 * entirely, because it is testing the screen. This file is the other half:
 * it calls the real actions, with the service layer mocked, so what is under
 * test is exactly what changed — where a successful save and a successful
 * create send the browser, and that a refused submission still does not.
 *
 * Brian, walking the review environment, 2026-09-10: "When I create a test
 * template and I save, it should take me back to the other test templates,
 * and I should see the list automatically. Right now, when I save, it just
 * stays on the same screen." Confirmed for a rename too, and confirmed that a
 * refused save still stays on the editor with the field errors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real `redirect` throws to unwind the render. Mirroring it keeps the
    // control flow under test honest rather than letting it fall through.
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/event-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-templates")>();
  return {
    ...actual,
    createEventTemplate: vi.fn(),
    saveEventTemplate: vi.fn(),
    deleteEventTemplate: vi.fn(),
    planEventTemplateChange: vi.fn(),
  };
});

import { Conflict, NotPermitted, type ServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  createEventTemplate,
  deleteEventTemplate,
  planEventTemplateChange,
  saveEventTemplate,
} from "@/lib/services/event-templates";
import {
  createEventTemplateAction,
  deleteEventTemplateAction,
  previewEventTemplateAction,
  saveEventTemplateAction,
} from "./actions";
import { EMPTY_TEMPLATE_FORM_STATE } from "./form-state";
import { seededGrantsFor } from "@/lib/auth/capabilities";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";

function actor(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Rowan Ashdown",
    roleCodes,
    grants: seededGrantsFor(roleCodes),
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

/** A complete, valid submission. Individual tests spoil one field at a time. */
function templateForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    name: "Kicking Clinic",
    colourKey: "indigo",
    defaultVenue: "",
    defaultDeliveryMode: "",
    defaultDurationMinutes: "",
    defaultDescription: "",
    defaultRequiredEquipment: "",
    defaultAttendance: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/**
 * The refusal an action handed back as its own state — LAN-423 fix round 4,
 * J1 — read back as the refusal it is. A throw fails this helper: a thrown
 * refusal is what rendered "This page couldn't load" when a grant was lowered
 * under an open page.
 */
async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  const returned = (await attempt()) as { error?: unknown; formError?: unknown } | null;
  const message = typeof returned?.formError === "string" ? returned.formError : returned?.error;
  expect(message).toMatch(
    /^(You do not have access to this action\.|This action needs an active Lancers operator profile\.)/,
  );
  return new NotPermitted(message as string);
}

/** The real `redirect()`'s throw, surfaced as the URL it was given. */
async function redirectedTo(attempt: () => Promise<unknown>): Promise<string> {
  try {
    await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("Expected the action to redirect, but it returned.");
}

beforeEach(() => {
  vi.clearAllMocks();
  givenAccess({ state: "active", operator: actor() });
});

describe("saving redirects to the template list — Brian, 2026-09-10", () => {
  it("redirects to /operate/events/templates on a successful save", async () => {
    vi.mocked(saveEventTemplate).mockResolvedValue({
      templateId: TEMPLATE_ID,
      name: "Kicking Clinic",
      eventType: "practice",
      renamedFrom: null,
      fieldChanges: [],
      questionChanges: [],
      audienceBefore: [],
      audienceAfter: [],
      taking: [],
      holding: [],
      untouched: { approved: 0, past: 0 },
    });

    const form = templateForm({ templateId: TEMPLATE_ID });
    const url = await redirectedTo(() => saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, form));

    expect(url).toBe("/operate/events/templates");
    expect(saveEventTemplate).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      TEMPLATE_ID,
      expect.objectContaining({ name: "Kicking Clinic", colourKey: "indigo" }),
      [],
    );
  });

  it("redirects the same way for a rename — the editor is never a dead end", async () => {
    vi.mocked(saveEventTemplate).mockResolvedValue({
      templateId: TEMPLATE_ID,
      name: "Film Review",
      eventType: "practice",
      renamedFrom: "Chalk",
      fieldChanges: [],
      questionChanges: [],
      audienceBefore: [],
      audienceAfter: [],
      taking: [],
      holding: [],
      untouched: { approved: 0, past: 0 },
    });

    const form = templateForm({ templateId: TEMPLATE_ID, name: "Film Review" });
    const url = await redirectedTo(() => saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, form));

    expect(url).toBe("/operate/events/templates");
  });

  it("stays on the editor with the field error on a refused save, and writes nothing", async () => {
    const form = templateForm({ templateId: TEMPLATE_ID, name: "" });

    const state = await saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, form);

    expect(state.phase).toBe("editing");
    expect(state.issues.map((issue) => issue.field)).toContain("name");
    expect(saveEventTemplate).not.toHaveBeenCalled();
  });

  it("stays on the editor with the service's message when the service refuses, rather than redirecting", async () => {
    vi.mocked(saveEventTemplate).mockRejectedValue(
      new Conflict("There is already a template with that name.", {
        rule: "event_templates_name_unique",
      }),
    );

    const form = templateForm({ templateId: TEMPLATE_ID });
    const state = await saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, form);

    expect(state.phase).toBe("editing");
    expect(state.error).toBe("There is already a template with that name.");
  });

  it("rethrows a failure that is not a ServiceError, rather than reporting it as a field issue", async () => {
    vi.mocked(saveEventTemplate).mockRejectedValue(new Error("simulated database failure"));

    const form = templateForm({ templateId: TEMPLATE_ID });

    await expect(saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, form)).rejects.toThrow(
      "simulated database failure",
    );
  });

  it("refuses a caller with no calendar-management capability, and writes nothing", async () => {
    givenAccess({ state: "active", operator: actor(["treasurer"]) });

    const error = await refusalFrom(() =>
      saveEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, templateForm({ templateId: TEMPLATE_ID })),
    );

    expect(error).toBeInstanceOf(NotPermitted);
    expect(saveEventTemplate).not.toHaveBeenCalled();
  });
});

describe("creating redirects to the template list, not to the template it just made", () => {
  it("redirects to /operate/events/templates rather than the new template's own page", async () => {
    vi.mocked(createEventTemplate).mockResolvedValue({
      id: TEMPLATE_ID,
      name: "Kicking Clinic",
      colourKey: "indigo",
      eventType: "practice",
      defaultVenue: null,
      defaultDeliveryMode: null,
      defaultDurationMinutes: null,
      defaultDescription: null,
      defaultRequiredEquipment: null,
      defaultIsMandatory: null,
      audienceGroups: [],
      questions: [],
    });

    const url = await redirectedTo(() =>
      createEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, templateForm()),
    );

    expect(url).toBe("/operate/events/templates");
    expect(createEventTemplate).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      expect.objectContaining({ name: "Kicking Clinic", colourKey: "indigo" }),
      [],
    );
  });

  it("stays on the new-template form with the field error on a refused create", async () => {
    const state = await createEventTemplateAction(
      EMPTY_TEMPLATE_FORM_STATE,
      templateForm({ colourKey: "" }),
    );

    expect(state.phase).toBe("editing");
    expect(state.issues.map((issue) => issue.field)).toContain("colourKey");
    expect(createEventTemplate).not.toHaveBeenCalled();
  });

  it("refuses a caller with no calendar-management capability, and writes nothing", async () => {
    givenAccess({ state: "active", operator: actor(["treasurer"]) });

    const error = await refusalFrom(() =>
      createEventTemplateAction(EMPTY_TEMPLATE_FORM_STATE, templateForm()),
    );

    expect(error).toBeInstanceOf(NotPermitted);
    expect(createEventTemplate).not.toHaveBeenCalled();
  });
});

// LAN-423 fix round 4, J1: calendar management taken away while the editor is
// open. Every template action hands the refusal back as the editor's own
// error — entries intact where there are entries — never a crashed page.
describe("every template action returns its refusal", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["treasurer"]) });
  });

  it("the preview hands back the refusal and every entry", async () => {
    const state = await previewEventTemplateAction(
      EMPTY_TEMPLATE_FORM_STATE,
      templateForm({ templateId: TEMPLATE_ID, name: "Kicking Clinic, moved" }),
    );

    expect(state.phase).toBe("editing");
    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(state.values?.name).toBe("Kicking Clinic, moved");
    expect(planEventTemplateChange).not.toHaveBeenCalled();
  });

  it("the save hands back the entries with the refusal", async () => {
    const state = await saveEventTemplateAction(
      EMPTY_TEMPLATE_FORM_STATE,
      templateForm({ templateId: TEMPLATE_ID, name: "Kicking Clinic, moved" }),
    );

    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(state.values?.name).toBe("Kicking Clinic, moved");
  });

  it("the delete hands back the refusal", async () => {
    const state = await deleteEventTemplateAction(
      EMPTY_TEMPLATE_FORM_STATE,
      templateForm({ templateId: TEMPLATE_ID }),
    );

    expect(state.phase).toBe("editing");
    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(deleteEventTemplate).not.toHaveBeenCalled();
  });
});
