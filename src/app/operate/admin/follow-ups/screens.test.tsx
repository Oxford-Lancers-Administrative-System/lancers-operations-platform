/**
 * The Follow-ups queue — W5.
 *
 * The service layer is mocked; what is under test is the screen — who reaches
 * it, what it groups and sorts, and what each status reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/admin/follow-ups",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/follow-ups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/follow-ups")>();
  return { ...actual, readFollowUpsQueue: vi.fn() };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readFollowUpsQueue, type FollowUpEvent } from "@/lib/services/follow-ups";
import FollowUpsPage from "./page";

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Casey Operator",
    roleCodes,
    isActive: true,
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: operator(roleCodes),
  });
}

async function renderPage(query: Record<string, string> = {}) {
  const element = await FollowUpsPage({ searchParams: Promise.resolve(query) } as never);
  return render(element);
}

const HAWKS: FollowUpEvent = {
  eventId: "event-hawks",
  eventName: "vs Harewell Hawks",
  scheduledOn: "2026-09-13",
  deadline: new Date("2026-09-13T17:00:00Z"),
  people: [
    {
      invitationId: "invitation-1",
      personName: "Gideon Thornbury",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: "WhatsApp 2 sent · email Fri 09:00",
      status: "escalated",
    },
    {
      invitationId: "invitation-2",
      personName: "Marlowe Fairhurst",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "delivery_problem",
    },
    {
      invitationId: "invitation-3",
      personName: "Peregrine Oakhanger",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "escalation_held",
    },
  ],
};

const PRACTICE: FollowUpEvent = {
  eventId: "event-practice",
  eventName: "Practice — hilary week 3",
  scheduledOn: "2026-09-16",
  deadline: new Date("2026-09-17T18:00:00Z"),
  people: [
    {
      invitationId: "invitation-4",
      personName: "Rufus",
      deadline: new Date("2026-09-17T18:00:00Z"),
      chasePosition: "Invitation delivered · WhatsApp 2 Wed 09:00",
      status: "chasing",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFollowUpsQueue).mockResolvedValue([HAWKS, PRACTICE]);
  signedInAs(["secretary"]);
});

describe("who may open the Follow-ups queue", () => {
  it("admits any linked, active operator", async () => {
    signedInAs([]);
    const { container } = await renderPage();
    expect(container.querySelector('[data-testid="follow-ups-screen"]')).not.toBeNull();
  });

  it("redirects to login with no session", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });
    await expect(renderPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Fadmin%2Ffollow-ups",
    );
  });
});

describe("the queue itself", () => {
  it("lists every outstanding person across both events, and says nobody compiled it", async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain("4 people across 2 approved events");
    expect(container.textContent).toContain("nobody compiles this list");
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
  });

  it("names the event against each person, repeated down the rows", async () => {
    await renderPage();
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows[0].textContent).toContain("vs Harewell Hawks");
    expect(rows.filter((row) => row.textContent?.includes("vs Harewell Hawks"))).toHaveLength(3);
  });

  it("carries the chase position beside each unresolved person", async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain("WhatsApp 2 sent · email Fri 09:00");
    expect(container.textContent).toContain("Invitation delivered · WhatsApp 2 Wed 09:00");
  });

  it.each([
    ["escalated", "Escalated"],
    ["delivery_problem", "Delivery problem"],
    ["escalation_held", "Escalation held: no President in post"],
    ["chasing", "Chasing"],
  ])("labels the %s status as %s", async (status, label) => {
    vi.mocked(readFollowUpsQueue).mockResolvedValue([
      {
        ...HAWKS,
        people: [
          { ...HAWKS.people[0], status: status as FollowUpEvent["people"][number]["status"] },
        ],
      },
    ]);
    const { container } = await renderPage();
    expect(container.textContent).toContain(label);
  });

  it("says so, rather than showing an empty table, when nobody is outstanding", async () => {
    vi.mocked(readFollowUpsQueue).mockResolvedValue([]);
    const { container } = await renderPage();
    expect(container.querySelector('[data-testid="follow-ups-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="follow-ups-table"]')).toBeNull();
  });

  it("filters to the name searched for, across every event", async () => {
    const { container } = await renderPage({ q: "Rufus" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(1);
    expect(container.textContent).toContain("Rufus");
    expect(container.textContent).not.toContain("Gideon Thornbury");
  });

  it("never prints a raw ISO date", async () => {
    const { container } = await renderPage();
    expect(container.innerHTML).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
