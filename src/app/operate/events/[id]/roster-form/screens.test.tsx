// @vitest-environment jsdom
/**
 * The roster form's own authorization boundary — LAN-267, corrected in
 * LAN-275's review round 1 (F3).
 *
 * This route is the one operator surface that prints two personal identifiers
 * side by side — a student number and a BAFA registration number — and the only
 * thing holding it to the four offices plus the IT officer is the capability
 * argument in `page.tsx`'s `gateShellPage` call. Independent review removed
 * that argument (the parameter is optional, so it type-checks, and its absence
 * means "any linked, active operator") and the whole 302-file suite stayed
 * green. These are the tests that notice.
 *
 * The service is mocked: what is under test is the gate and the screen it
 * renders. The reader itself is proved against the real database in
 * `src/lib/services/roster-form-read.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("./actions", () => ({ generateRosterFormAction: vi.fn() }));
vi.mock("@/lib/services/roster-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/roster-form")>();
  return { ...actual, readRosterFormData: vi.fn(), recordRosterFormGenerated: vi.fn() };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import { readRosterFormData, type RosterFormData } from "@/lib/services/roster-form";
import type { EventDetail } from "@/lib/services/events";
import RosterFormPage from "./page";
import { FILTERS_TITLE, HEADING, PLAYERS_TITLE } from "./presentation";

const EVENT_ID = "00780078-0078-4078-8078-000000000050";

/** The gate this page declares, read from the one place a role code decides anything. */
const PERMITTED = capabilityRoleCodes("event_calendar_management");

/**
 * Seats that are linked, active operators and are still not this page's
 * audience. The Treasurer and the Media Secretary hold plenty elsewhere; the
 * coaching seats are the case LAN-267 cares about most, since a coach is
 * exactly who would think to ask for a roster form.
 */
const REFUSED = ["treasurer", "media_secretary", "head_coach", "offence_coach", "defence_coach"];

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function signedInAs(roleCodes: string[]) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: operator(roleCodes),
  });
}

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: EVENT_ID,
    name: "Lancers vs. Falcons",
    eventType: "game",
    status: "approved",
    scheduledOn: "2026-11-08",
    startsAt: "13:00",
    endsAt: "16:00",
    deliveryMode: "in_person",
    venue: "Iffley Road",
    isMandatory: true,
    registerSaved: false,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
    saidYesCount: 0,
    showedCount: 0,
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    origin: "club_controlled",
    termId: null,
    termLabel: "michaelmas 2026-27",
    weekNumber: 5,
    createdByName: "Rowan Ashdown",
    decisionReason: null,
    seasonId: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  };
}

function formData(overrides: Partial<RosterFormData> = {}): RosterFormData {
  return {
    event: event(),
    players: [
      {
        membershipId: "55555555-5555-4555-8555-000000000001",
        personId: "66666666-6666-4666-8666-000000000001",
        givenName: "Ada",
        familyName: "Nkemelu",
        studentNumber: "SN-0099",
        jerseyNumber: 12,
        rsvp: "yes",
      },
    ],
    coaches: [
      {
        personId: "66666666-6666-4666-8666-000000000002",
        givenName: "Idris",
        familyName: "Vale",
        bafaRegistrationNumber: "BAFA-0099",
        roleLabel: "Head coach",
        roleCode: "HC",
      },
    ],
    ...overrides,
  };
}

function props(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/[id]/roster-form">;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readRosterFormData).mockResolvedValue(formData());
});

describe("the roster form's gate — event_calendar_management, and nothing looser", () => {
  it.each(PERMITTED)("opens the form to the %s", async (code) => {
    signedInAs([code]);

    const { container } = render(await RosterFormPage(props()));

    expect(screen.getAllByText(HEADING).length).toBeGreaterThan(0);
    expect(screen.getByText(FILTERS_TITLE)).toBeVisible();
    expect(screen.getByText(PLAYERS_TITLE)).toBeVisible();
    // The student number is on the picking screen, not only on the printed
    // form — so this is the fact the gate is actually holding.
    expect(container.textContent).toContain("SN-0099");
    expect(readRosterFormData).toHaveBeenCalledWith(EVENT_ID, "blue");
  });

  it.each(REFUSED)("refuses the %s, and reads nothing at all", async (code) => {
    signedInAs([code]);

    const { container } = render(await RosterFormPage(props()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    // The refusal is the whole page: a student number anywhere in the markup
    // would already have been shipped to the browser.
    expect(container.textContent).not.toContain("SN-0099");
    expect(readRosterFormData).not.toHaveBeenCalled();
  });

  it("refuses an operator holding no role at all", async () => {
    signedInAs([]);

    render(await RosterFormPage(props()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(readRosterFormData).not.toHaveBeenCalled();
  });

  it.each(["unlinked", "inactive"] as const)(
    "shows the %s account state, not the form",
    async (state) => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue({ state });

      render(await RosterFormPage(props()));

      expect(screen.getByTestId("operator-account-state")).toBeVisible();
      expect(screen.queryByText(PLAYERS_TITLE)).toBeNull();
      expect(readRosterFormData).not.toHaveBeenCalled();
    },
  );

  it("sends an operator with no session to the login page, keeping where they were going", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    await expect(RosterFormPage(props())).rejects.toThrow(
      `REDIRECT:/login?redirectTo=${encodeURIComponent(`/operate/events/${EVENT_ID}`)}`,
    );
    expect(readRosterFormData).not.toHaveBeenCalled();
  });
});

describe("what the form refuses even to a permitted operator", () => {
  it("refuses a draft game, because a draft is not a fixture yet", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readRosterFormData).mockResolvedValue(
      formData({ event: event({ status: "draft" }) }),
    );

    const { container } = render(await RosterFormPage(props()));

    expect(screen.getByTestId("roster-form-not-approved")).toBeVisible();
    expect(container.textContent).not.toContain("SN-0099");
  });
});
