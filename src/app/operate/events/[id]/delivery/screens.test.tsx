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
import { fireEvent, render, within } from "@testing-library/react";

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

import { NotFound } from "@/lib/db";
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

/**
 * A complete inventory of every control on every delivery view, not a blocklist.
 *
 * Round one of review defeated a phrase blocklist with a `wa.me` button, so the
 * repair panel's controls were pinned. Round two defeated *that* by putting the
 * same button in the diagnostics table instead: the inventory was scoped to
 * `[data-testid="repair-panel"]`, and two of the three screens had no
 * structural guard at all.
 *
 * So the pin now covers all three views, and it covers **links as well as
 * buttons** — a manual send path is far more likely to be an anchor than a
 * button. Adding any control to any of these screens fails this test whatever
 * it is called, and whoever adds one has to widen the list on purpose.
 */
const PERMITTED_CONTROLS: Readonly<Record<string, readonly string[]>> = {
  overview: ["View diagnostics", "Delivery overview", "Back to event", "Sign out"],
  diagnostics: [
    "Open selected issue",
    "Delivery overview",
    "Back to event",
    "Sign out",
    "All",
    "Needs attention",
    "Queued",
    "Attempted",
    "Delivered",
    "Failed",
    "Retryable",
  ],
  repair: [
    "Retry delivery",
    "Revoke and reissue link",
    "Delivery overview",
    "Back to event",
    "Sign out",
  ],
  /**
   * The reissue disclosure, open.
   *
   * Review defeated the inventory here: this branch only renders after a click,
   * nothing in the suite clicked, and its `Cancel` button was absent from every
   * permitted set while the tests passed — which is the proof the branch was
   * never reached. A `wa.me` control beside `Cancel` was invisible to
   * everything, and an operator pressing **Revoke and reissue link** would have
   * been looking straight at it.
   */
  "repair (reissue open)": [
    "Retry delivery",
    "Revoke and reissue link",
    "Cancel",
    "Delivery overview",
    "Back to event",
    "Sign out",
  ],
  /** The service-error branch, reached whenever the read throws. */
  unavailable: ["Back to events", "Sign out"],
};

/** Every href the delivery screens are allowed to produce, as a shape. */
const PERMITTED_HREF = /^\/(operate|login)(\/|\?|$)/;

describe("every delivery view offers only the controls it is meant to", () => {
  beforeEach(() => signedInAs(["secretary"]));

  /**
   * What a control is called, for the purpose of this inventory.
   *
   * Its **accessible name**, not its text. Reducing a control to `textContent`
   * and then discarding the empty ones — which is what this did — means an
   * icon-only button has no label, is filtered out, and never reaches the
   * comparison. Review defeated the inventory exactly that way: a `<button>`
   * containing only an `<svg>`, calling `window.open` on a `wa.me` URL, passed
   * every assertion here.
   *
   * An unnamed control is now reported as `(unnamed control)`, which is in no
   * permitted set and therefore fails. That is also the right answer for
   * accessibility: a control a screen reader cannot announce is a defect on its
   * own terms.
   */
  function accessibleName(node: Element): string {
    const label = node.getAttribute("aria-label")?.trim();
    if (label) return label;
    const text = (node.textContent ?? "").trim();
    return text === "" ? "(unnamed control)" : text;
  }

  /** React's own guard on a Server Action form. Navigates nowhere. */
  const REACT_FORM_SENTINEL =
    /^javascript:throw new Error\('A React form was unexpectedly submitted/;

  /** Every attribute that can carry a destination. */
  const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "ping", "data-href"];

  const QUERIES: Readonly<Record<string, Record<string, string>>> = {
    overview: {},
    diagnostics: { view: "diagnostics" },
    repair: { invitation: "invitation-1" },
    "repair (reissue open)": { invitation: "invitation-1" },
    unavailable: {},
  };

  /**
   * Every state of these screens that renders a control, including the two that
   * appear only after an interaction or a failure.
   *
   * The inventory is exactly as wide as the states it renders, and three of
   * five was enough for review to hide a control in one of the other two.
   */
  async function renderState(state: string) {
    if (state === "unavailable") {
      vi.mocked(readEventDelivery).mockRejectedValue(new NotFound("That event no longer exists."));
    }

    const rendered = await renderPage(QUERIES[state]);

    if (state === "repair (reissue open)") {
      // A client-side branch, opened the way an operator opens it.
      fireEvent.click(rendered.getByRole("button", { name: "Revoke and reissue link" }));
    }

    return rendered;
  }

  const ALL_STATES = Object.keys(QUERIES);

  it("renders every state it claims to cover", () => {
    // The inventory's reach is what failed twice, so it is asserted rather than
    // assumed: a permitted set with no fixture fails here instead of quietly
    // guarding nothing.
    expect([...ALL_STATES].sort()).toEqual(Object.keys(PERMITTED_CONTROLS).sort());
  });

  it.each(ALL_STATES)("pins the interactive controls on %s", async (state) => {
    const { container } = await renderState(state);

    const controls = [
      ...container.querySelectorAll(
        "button, a, [role='button'], [role='link'], [onclick], input[type='submit']",
      ),
    ].map(accessibleName);

    const permitted = new Set(PERMITTED_CONTROLS[state]);
    // No `label !== ""` filter. An unnamed control is a control.
    const unexpected = controls.filter((label) => !permitted.has(label));

    expect(unexpected).toEqual([]);
  });

  it.each(ALL_STATES)("lets %s point nowhere outside the application", async (state) => {
    const { container } = await renderState(state);

    const destinations: string[] = [];
    for (const attribute of URL_ATTRIBUTES) {
      for (const node of container.querySelectorAll(`[${attribute}]`)) {
        destinations.push(node.getAttribute(attribute) ?? "");
      }
    }

    // A share sheet, a `wa.me` deep link, a `whatsapp://` URL, an `sms:` or a
    // `mailto:` would each be a manual send path that no phrase blocklist
    // recognises. Every one of them fails this shape, in any attribute that can
    // carry a destination rather than in `href` alone.
    for (const destination of destinations) {
      // React renders its own sentinel into a Server Action form's `action`,
      // to catch a manual `form.submit()`. It is framework machinery, it
      // navigates nowhere, and it is permitted by its exact text rather than by
      // dropping `action` from the check — which would leave a real
      // `action="https://wa.me/…"` form unguarded.
      if (REACT_FORM_SENTINEL.test(destination)) continue;
      expect(destination, `${destination} is not an in-application route`).toMatch(PERMITTED_HREF);
    }
  });

  it("would notice a control that has no name at all", () => {
    // The filter this test used to have is the defect review exploited, so its
    // absence is asserted rather than assumed.
    const icon = document.createElement("button");
    icon.innerHTML = "<svg></svg>";
    expect(accessibleName(icon)).toBe("(unnamed control)");
    expect(new Set(PERMITTED_CONTROLS.diagnostics).has(accessibleName(icon))).toBe(false);
  });
});

describe("UX-51 — the Retry column says what the wireframe says", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it.each([
    ["queued", true, "Scheduled"],
    ["retryable", true, "Retryable"],
    ["delivered", false, "—"],
    ["attempted", false, "—"],
  ])("shows %s as %s", async (state, retryable, expected) => {
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({ rows: [row({ state: state as DeliveryRow["state"], retryable })] }),
    );
    const { container } = await renderPage({ view: "diagnostics" });

    const cells = [...(container.querySelector('[data-testid="delivery-row"]')?.children ?? [])];
    // The wireframe distinguishes a queued row waiting for its first send from
    // a failed one that will be tried again.
    expect(cells[4]?.textContent).toBe(expected);
  });

  it("never contradicts the result shown beside it", async () => {
    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({ rows: [row({ state: "failed", attemptCount: 1, retryable: true })] }),
    );
    const { container } = await renderPage({ invitation: "invitation-1" });

    const retry = container.querySelector('[data-testid="retry-fact"]')?.textContent ?? "";
    // It read "Failed after 1 attempts…" underneath the value **Retryable** —
    // ungrammatical, and the opposite of what the value said.
    expect(retry).toContain("Retryable");
    expect(retry).not.toMatch(/Failed after/);
    expect(retry).not.toMatch(/\b1 attempts\b/);
  });
});

describe("UX-52 — the repair panel offers exactly two controls", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("offers those two and nothing else", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    const panel = container.querySelector('[data-testid="repair-panel"]');
    expect(panel).not.toBeNull();

    const controls = within(panel as HTMLElement)
      .queryAllByRole("button")
      .map((node) => node.textContent?.trim() ?? "");

    expect(controls.sort()).toEqual(["Retry delivery", "Revoke and reissue link"].sort());
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
