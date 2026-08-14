/**
 * UX-50, UX-51 and UX-52 — LAN-78.
 *
 * Two things independent review found were asserted by nothing, and both are
 * here:
 *
 *   * **The authorization binding.** The capability *map* was tested
 *     exhaustively and the *wiring* was not, so re-gating this page to
 *     `attendance_recorder` — the coaching seats that `docs/ux/slice-ux.md`
 *     § 3 says must receive no delivery data at all — passed typecheck and the
 *     whole suite. These tests drive the real gate with real role codes, so a
 *     wrong capability changes who gets in and fails.
 *
 *   * **The absence of a manual send path.** `tests/no-manual-delivery.test.ts`
 *     scans source text for known phrasings, and a plausible "Open in WhatsApp
 *     to send this invitation yourself" button linking to `wa.me` walked past
 *     it. A blocklist of phrasings cannot close that. So the repair panel's
 *     interactive controls are pinned as a **complete inventory**: any control
 *     added to it, however worded, fails until somebody changes the expected
 *     set on purpose.
 *
 * The service layer is mocked. What is under test is the screen — who reaches
 * it, what it states, and what it offers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";

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
vi.mock("@/lib/services/delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/delivery")>();
  return { ...actual, readEventDelivery: vi.fn() };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readEventDelivery, type DeliveryRow, type EventDelivery } from "@/lib/services/delivery";
import DeliveryPage from "./page";

const EVENT = "00780078-0078-4078-8078-000000000050";

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Morgan Pike",
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

function row(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    jobId: "job-1",
    invitationId: "invitation-1",
    inviteeName: "Leo Hartwell",
    channel: "whatsapp",
    state: "retryable",
    lastAttemptAt: new Date("2026-10-12T17:04:00Z"),
    attemptCount: 1,
    failureReason: "The provider is rate-limiting the club's account.",
    tokenState: "live",
    responseState: "awaiting_response",
    retryable: true,
    ...overrides,
  };
}

function delivery(overrides: Partial<EventDelivery> = {}): EventDelivery {
  const rows = overrides.rows ?? [row()];
  return {
    eventId: EVENT,
    eventName: "Team Practice",
    eventStatus: "approved",
    counts: {
      audience: 42,
      queued: 2,
      attempted: 0,
      delivered: 38,
      failed: 1,
      retryable: 1,
      ...overrides.counts,
    },
    ...overrides,
    rows,
  };
}

async function renderPage(query: Record<string, string> = {}) {
  const element = await DeliveryPage({
    params: Promise.resolve({ id: EVENT }),
    searchParams: Promise.resolve(query),
  } as never);
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readEventDelivery).mockResolvedValue(delivery());
});

describe("who may open the delivery surface", () => {
  it.each(["president", "vice_president", "secretary", "general_manager"])(
    "admits the %s",
    async (code) => {
      signedInAs([code]);
      const { container } = await renderPage();

      expect(container.querySelector('[data-testid="delivery-screen"]')).not.toBeNull();
      expect(readEventDelivery).toHaveBeenCalledWith(EVENT);
    },
  );

  it.each(["head_coach", "offence_coach", "defence_coach", "treasurer", "media_secretary"])(
    "refuses the %s, and reads nothing",
    async (code) => {
      signedInAs([code]);
      const { container } = await renderPage();

      expect(container.querySelector('[data-testid="delivery-screen"]')).toBeNull();
      // The read happens after the gate returns, so an unauthorized role does
      // not merely fail to see the data — the data is never fetched, and no
      // invitee name can be in the payload.
      expect(readEventDelivery).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain("Leo Hartwell");
      expect(container.textContent).not.toContain("Team Practice");
    },
  );

  it("refuses an operator holding no role at all", async () => {
    signedInAs([]);
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="delivery-screen"]')).toBeNull();
    expect(readEventDelivery).not.toHaveBeenCalled();
  });

  it("shows the account state, not the screen, for an unlinked account", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="delivery-screen"]')).toBeNull();
    expect(readEventDelivery).not.toHaveBeenCalled();
  });
});

describe("UX-50 — the overview", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("states the policy that governs the whole surface", async () => {
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="delivery-policy-note"]')?.textContent).toBe(
      "Operators never copy, send or post invitations manually. Delivery telemetry does not " +
        "imply an RSVP.",
    );
  });

  it("counts the audience, the delivered, the waiting and the broken", async () => {
    const { container } = await renderPage();
    const read = (id: string) =>
      container.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";

    expect(read("count-audience")).toContain("42");
    expect(read("count-delivered")).toContain("38");
    // Queued and attempted are both "not yet resolved" to an operator.
    expect(read("count-queued")).toContain("2");
    // Failed and retryable are both "needs attention".
    expect(read("count-failed")).toContain("2");
  });

  it("says so plainly when nothing has been sent yet", async () => {
    vi.mocked(readEventDelivery).mockResolvedValue(delivery({ rows: [] }));
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="delivery-empty"]')?.textContent).toContain(
      "Invitations and their delivery are created when the event is approved",
    );
  });
});

describe("UX-51 — the diagnostics table", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("keeps delivery and RSVP as separate columns", async () => {
    const { container } = await renderPage({ view: "diagnostics" });
    const line = container.querySelector('[data-testid="delivery-row"]');

    expect(line?.textContent).toContain("Retryable");
    // "Delivered never means responded" — slice-ux.md § 6.
    expect(line?.textContent).toContain("Outstanding");
  });

  it.each([
    ["queued", "Queued"],
    ["attempted", "Attempted"],
    ["delivered", "Delivered"],
    ["failed", "Failed"],
    ["retryable", "Retryable"],
  ])("labels the %s state as %s", async (state, label) => {
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({ rows: [row({ state: state as DeliveryRow["state"] })] }),
    );
    const { container } = await renderPage({ view: "diagnostics" });

    expect(container.querySelector('[data-testid="delivery-row"]')?.textContent).toContain(label);
  });

  it("narrows to the two states an operator can act on", async () => {
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({
        rows: [
          row({ jobId: "a", inviteeName: "Delivered Person", state: "delivered" }),
          row({ jobId: "b", inviteeName: "Failed Person", state: "failed" }),
        ],
      }),
    );
    const { container } = await renderPage({ view: "diagnostics", status: "attention" });

    expect(container.textContent).toContain("Failed Person");
    expect(container.textContent).not.toContain("Delivered Person");
  });
});

describe("UX-52 — the repair panel offers exactly two controls", () => {
  beforeEach(() => signedInAs(["secretary"]));

  /**
   * A complete inventory, not a blocklist.
   *
   * The scan in `tests/no-manual-delivery.test.ts` matches known phrasings, and
   * review demonstrated that an "Open in WhatsApp to send this invitation
   * yourself" button linking to `wa.me` passes it. Pinning the whole set means
   * any control added here fails this test regardless of its wording, and
   * whoever adds one has to change this list deliberately.
   */
  const PERMITTED_CONTROLS = ["Retry delivery", "Revoke and reissue link"];

  it("offers those two and nothing else", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    const panel = container.querySelector('[data-testid="repair-panel"]');
    expect(panel).not.toBeNull();

    const controls = within(panel as HTMLElement)
      .queryAllByRole("button")
      .map((node) => node.textContent?.trim() ?? "");

    expect(controls.sort()).toEqual([...PERMITTED_CONTROLS].sort());
  });

  it("contains no link out of the application at all", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    const panel = container.querySelector('[data-testid="repair-panel"]') as HTMLElement;

    const hrefs = [...panel.querySelectorAll("a")].map((node) => node.getAttribute("href") ?? "");
    // A share sheet, a `wa.me` deep link or a `whatsapp://` URL would each be a
    // manual send path that no phrase blocklist recognises.
    expect(hrefs).toEqual([]);
  });

  it("never puts the RSVP link or a phone number in the DOM", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    const markup = container.innerHTML;

    expect(markup).not.toContain("/rsvp/");
    expect(markup).not.toContain("wa.me");
    expect(markup).not.toContain("whatsapp://");
    // Digit runs are checked against the text a person reads rather than the
    // whole markup: Emotion's generated class names carry digits and would make
    // this assertion fail for a reason that has nothing to do with privacy.
    expect(container.textContent ?? "").not.toMatch(/\b\d{7,}\b/);
  });

  it("shows the safe provider reason, and calls it that", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });

    expect(container.querySelector('[data-testid="latest-result"]')?.textContent).toContain(
      "Safe provider reason",
    );
  });

  it("disables retry once the attempt ceiling is reached", async () => {
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({ rows: [row({ state: "failed", attemptCount: 5, retryable: false })] }),
    );
    const { container } = await renderPage({ invitation: "invitation-1" });

    const retry = within(container.querySelector('[data-testid="retry-form"]') as HTMLElement)
      .getAllByRole("button")
      .at(0);
    expect(retry).toBeDisabled();
    expect(container.querySelector('[data-testid="retry-unavailable"]')?.textContent).toContain(
      "fix the cause",
    );
  });

  it("does not offer retry for a send the provider has already accepted", async () => {
    // `retryDelivery` refuses anything that is not pending, ready or failed, so
    // an enabled control here could only ever answer "already in progress".
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({ rows: [row({ state: "attempted", retryable: false })] }),
    );
    const { container } = await renderPage({ invitation: "invitation-1" });

    const retry = within(container.querySelector('[data-testid="retry-form"]') as HTMLElement)
      .getAllByRole("button")
      .at(0);
    expect(retry).toBeDisabled();
  });
});
