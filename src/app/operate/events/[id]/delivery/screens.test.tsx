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
      held: 0,
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

  it("says so plainly when nothing has been sent yet, and asserts no cause", async () => {
    vi.mocked(readEventDelivery).mockResolvedValue(delivery({ rows: [] }));
    const { container } = await renderPage();

    const empty = container.querySelector('[data-testid="delivery-empty"]')?.textContent;
    expect(empty).toContain("No invitations have been sent for this event.");

    // It used to continue "Invitations and their delivery are created when the
    // event is approved", which is false on an approved event whose
    // invitations were never dispatched — the state Brian found at the visual
    // gate on an approved event showing 0 of everything.
    expect(empty).not.toContain("created when the event is approved");
  });

  /**
   * LAN-156's cross-surface finding, on this side of it. The amend screen says
   * messages are held; this screen has to be able to say so too, or the two
   * describe one event differently.
   */
  it("names held messages, and says nothing about them when there are none", async () => {
    const { container, unmount } = await renderPage();
    expect(container.querySelector('[data-testid="delivery-held"]')).toBeNull();
    unmount();

    vi.mocked(readEventDelivery).mockResolvedValue(
      delivery({
        counts: {
          audience: 42,
          queued: 0,
          attempted: 0,
          delivered: 38,
          failed: 0,
          retryable: 0,
          held: 4,
        },
      }),
    );
    const second = await renderPage();
    expect(second.container.querySelector('[data-testid="delivery-held"]')?.textContent).toContain(
      "4 messages are held after a change to this event.",
    );
  });

  /**
   * The other way this screen can have nothing to show, and the one that is not
   * an empty state: the read itself failed.
   *
   * The state was already being rendered further down, by the control audit,
   * but nothing asserted what it said — so the refusal could have shown the
   * wrong sentence, or no sentence, with the suite green. LAN-118 moved this
   * markup into a shared `UnavailableScreen`, which is the moment to pin it.
   */
  it("shows the service's own sentence, and the way back, when the read fails", async () => {
    vi.mocked(readEventDelivery).mockRejectedValue(new NotFound("That event no longer exists."));
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid="delivery-unavailable"]')?.textContent).toContain(
      "That event no longer exists.",
    );
    expect(container.querySelector('[data-testid="delivery-empty"]')).toBeNull();
    expect(within(container).getByRole("heading", { level: 1 })).toHaveTextContent("Delivery");
    expect(within(container).getByRole("link", { name: "Back to events" })).toHaveAttribute(
      "href",
      "/operate/events",
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
  overview: ["View diagnostics", "Delivery overview", "Back to event"],
  diagnostics: ["Open selected issue", "Delivery overview", "Back to event"],
  /**
   * The status filter with its menu open.
   *
   * MUI portals a `Select`'s options into `document.body`, and they do not
   * exist at all until it is opened — so seven labels sat in the permitted set
   * guarding nothing, and any control added to that menu would have been
   * invisible. The presence assertion below is what surfaced it.
   */
  "diagnostics (filter open)": [
    "Open selected issue",
    "Delivery overview",
    "Back to event",
    "All",
    "Needs attention",
    "Queued",
    "Attempted",
    "Delivered",
    "Failed",
    "Retryable",
  ],
  /** A search that matches nobody. Renders the filter, and no rows. */
  "diagnostics (nothing matches)": ["Delivery overview", "Back to event"],
  repair: ["Retry delivery", "Revoke and reissue link", "Delivery overview", "Back to event"],
  /**
   * The reissue disclosure, open.
   *
   * Review defeated the inventory here once: this branch renders only after a
   * click, nothing in the suite clicked, and its `Cancel` button was absent
   * from every permitted set while the tests passed — which is the proof the
   * branch was never reached.
   */
  "repair (reissue open)": [
    "Retry delivery",
    "Revoke and reissue link",
    "Cancel",
    "Delivery overview",
    "Back to event",
  ],
  /** The service-error branch, reached whenever the read throws. */
  unavailable: ["Back to events"],
};

/** Every href the delivery screens are allowed to produce, as a shape. */
const PERMITTED_HREF = /^\/(operate|login)(\/|\?|$)/;

describe("every delivery view offers only the controls it is meant to", () => {
  beforeEach(() => signedInAs(["secretary"]));

  /**
   * What a control is called, for the purpose of this inventory.
   *
   * Its **accessible name**, not its text. Reducing a control to `textContent`
   * and then discarding the empty ones means an icon-only button has no label,
   * is filtered out, and never reaches the comparison — which is how review
   * slipped a `window.open` handoff past an earlier version of this test.
   *
   * An unnamed control is reported as `(unnamed control)`, which is in no
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

  /**
   * Anything a person can activate.
   *
   * `[role='option']` is here because MUI's `Select` gives its menu entries
   * that role, not `menuitem` — an omission that made the seven status filter
   * options unreachable by this query even once the menu was open.
   */
  const CONTROL_SELECTOR = [
    "button",
    "a",
    "[role='button']",
    "[role='link']",
    "[role='option']",
    "[role='menuitem']",
    "[onclick]",
    "input[type='submit']",
  ].join(", ");

  /**
   * The row shapes the delivery screens branch on.
   *
   * Five *route* states were not enough. Review put a `wa.me` control behind
   * `row.tokenState === "revoked"` and the whole suite stayed green, because
   * every fixture rendered exactly one row: retryable, live token, awaiting a
   * response. A screen's reach is the cross-product of its route and its data,
   * and `tokenState === "revoked"` is not a corner — it is what an operator
   * sees immediately after pressing **Revoke and reissue link** on a
   * deployment where WhatsApp is not configured, which is every deployment
   * today. The state where somebody is most tempted to reach for WhatsApp
   * themselves was the one state nothing guarded.
   */
  const ROW_SHAPES: readonly (Partial<DeliveryRow> | null)[] = [
    // No rows at all — the empty screen.
    null,
    { state: "queued", tokenState: "none", retryable: true },
    { state: "attempted", tokenState: "live", retryable: false },
    { state: "delivered", tokenState: "live", retryable: false, responseState: "responded_yes" },
    { state: "failed", tokenState: "revoked", retryable: false, failureReason: "Refused." },
    { state: "retryable", tokenState: "revoked", retryable: true },
    { state: "retryable", tokenState: "none", retryable: true, responseState: "responded_no" },
    { state: "failed", tokenState: "live", retryable: true, attemptCount: 5 },
    // `describeChannel` has three arms and only one was ever rendered. `email`
    // and `sms` are real `notification_channel` values, and "Automated email /
    // calendar" is the contract's named fallback, so a control behind one of
    // them is not hypothetical — review put one there and nothing noticed.
    { state: "delivered", channel: "email", tokenState: "live", retryable: false },
    { state: "failed", channel: "sms", tokenState: "none", retryable: true },
    // The rest of the response vocabulary.
    { state: "queued", responseState: "expired_without_response", tokenState: "none" },
    { state: "delivered", responseState: "cancelled", tokenState: "revoked", retryable: false },
    { state: "queued", responseState: "not_solicited", tokenState: "none" },
  ];

  const QUERIES: Readonly<Record<string, Record<string, string>>> = {
    overview: {},
    diagnostics: { view: "diagnostics" },
    "diagnostics (filter open)": { view: "diagnostics" },
    "diagnostics (nothing matches)": { view: "diagnostics", q: "nobody-by-this-name" },
    repair: { invitation: "invitation-1" },
    "repair (reissue open)": { invitation: "invitation-1" },
    unavailable: {},
  };

  /**
   * Every state of these screens that renders a control, including the two that
   * appear only after an interaction or a failure.
   */
  async function renderState(state: string, shape: Partial<DeliveryRow> | null = {}) {
    if (state === "unavailable") {
      vi.mocked(readEventDelivery).mockRejectedValue(new NotFound("That event no longer exists."));
    } else {
      // `null` means the **empty** screen — no invitations at all. It is a
      // first-class supported state (the overview says "Nothing has been sent
      // for this event yet", the diagnostics table says "No invitations exist")
      // and it was outside the matrix, because every fixture rendered exactly
      // one row. Review put an external WhatsApp-group link in that branch and
      // the whole suite stayed green.
      vi.mocked(readEventDelivery).mockResolvedValue(
        delivery({ rows: shape === null ? [] : [row(shape)] }),
      );
    }

    const rendered = await renderPage(QUERIES[state]);

    if (state === "repair (reissue open)") {
      const open = rendered.queryByRole("button", { name: "Revoke and reissue link" });
      // Disabled at the attempt ceiling, which is itself one of the shapes.
      if (open && !(open as HTMLButtonElement).disabled) fireEvent.click(open);
    }

    if (state === "diagnostics (filter open)") {
      // MUI's `Select` renders its options only once opened, and portals them
      // into `document.body` — which is why the queries below read
      // `baseElement` rather than `container`.
      const combobox = rendered.queryAllByRole("combobox").at(0);
      if (combobox) fireEvent.mouseDown(combobox);
    }

    return rendered;
  }

  const ALL_STATES = Object.keys(QUERIES);

  /**
   * Which row shapes are meaningful for a state.
   *
   * The empty shape is skipped for the two repair states, because a repair
   * route with no rows finds no invitation and degrades to the overview — a
   * real and correct behaviour, asserted on its own below rather than folded
   * into the repair panel's inventory, where it would mean listing the
   * overview's controls as permitted on a screen that does not have them.
   */
  function shapesFor(state: string): readonly (Partial<DeliveryRow> | null)[] {
    if (state === "unavailable") return [{}];
    if (state.startsWith("repair")) return ROW_SHAPES.filter((shape) => shape !== null);
    return ROW_SHAPES;
  }

  it("falls back to the overview when the chosen invitation is not there", async () => {
    const { container } = await renderState("repair", null);

    // Not an error, and not an empty panel: the operator lands on the screen
    // that can still tell them something.
    expect(container.querySelector('[data-testid="repair-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="delivery-empty"]')).not.toBeNull();
  });

  it("renders every state it claims to cover", () => {
    expect([...ALL_STATES].sort()).toEqual(Object.keys(PERMITTED_CONTROLS).sort());
  });

  /**
   * Absence **and** presence.
   *
   * Checking only that nothing unexpected appears lets a permitted entry name a
   * control that never renders — which is how an earlier version hid a whole
   * state behind an entry nobody had observed. Every permitted label must be
   * seen at least once across the matrix, so a stale entry fails instead of
   * quietly widening what is allowed.
   */
  const observed = new Set<string>();

  it.each(ALL_STATES)(
    "pins the interactive controls on %s",
    async (state) => {
      for (const shape of shapesFor(state)) {
        const { baseElement, unmount } = await renderState(state, shape);

        // `baseElement`, not `container`: MUI portals a select menu, a dialog or a
        // popover into `document.body`, and a control rendered there would be
        // invisible to a container-scoped query.
        const controls = [...baseElement.querySelectorAll(CONTROL_SELECTOR)].map(accessibleName);
        controls.forEach((label) => observed.add(label));

        const permitted = new Set(PERMITTED_CONTROLS[state]);
        // No `label !== ""` filter. An unnamed control is a control.
        const unexpected = controls.filter((label) => !permitted.has(label));

        expect(unexpected, `${state} with ${JSON.stringify(shape)}`).toEqual([]);
        unmount();
      }
      // Thirteen full page renders in one case. It fits comfortably alone and
      // exceeded the 5s default once under full-suite parallel load, which is a
      // red gate for no defect. Timed generously rather than split, because the
      // matrix is the point.
    },
    30_000,
  );

  it.each(ALL_STATES)(
    "lets %s point nowhere outside the application",
    async (state) => {
      for (const shape of shapesFor(state)) {
        const { baseElement, unmount } = await renderState(state, shape);

        const destinations: string[] = [];
        for (const attribute of URL_ATTRIBUTES) {
          for (const node of baseElement.querySelectorAll(`[${attribute}]`)) {
            destinations.push(node.getAttribute(attribute) ?? "");
          }
        }

        // A share sheet, a `wa.me` deep link, a `whatsapp://` URL, an `sms:` or a
        // `mailto:` would each be a manual send path that no phrase blocklist
        // recognises. Every one fails this shape, in any attribute that can carry
        // a destination rather than in `href` alone.
        for (const destination of destinations) {
          // React's own sentinel on a Server Action form. Framework machinery,
          // navigates nowhere, permitted by its exact text rather than by
          // dropping `action` from the check.
          if (REACT_FORM_SENTINEL.test(destination)) continue;
          expect(destination, `${destination} in ${state}`).toMatch(PERMITTED_HREF);
        }
        unmount();
      }
    },
    30_000,
  );

  it("observed every control it permits", () => {
    // Runs after the two above. A permitted label nothing ever rendered is an
    // entry guarding nothing, and the next control added under it would be
    // invisible.
    const permitted = new Set(Object.values(PERMITTED_CONTROLS).flat());
    const never = [...permitted].filter((label) => !observed.has(label));
    expect(never).toEqual([]);
  });

  it("would notice a control that has no name at all", () => {
    const icon = document.createElement("button");
    icon.innerHTML = "<svg></svg>";
    expect(accessibleName(icon)).toBe("(unnamed control)");
    expect(new Set(PERMITTED_CONTROLS.diagnostics).has(accessibleName(icon))).toBe(false);
  });
});

/**
 * The screens' policy copy, pinned verbatim.
 *
 * The inventory guards **controls**, and prose hands off just as effectively as
 * a button: review rewrote `REPAIR_NOTE` to read "…ask the team manager to
 * message this player on WhatsApp themselves and note that they did", rendered
 * it under "Repair delivery", and the whole suite stayed green. `presentation.ts`
 * is exempt from the phrase rules — it has to be, since it holds the sentence
 * that *states* the prohibition — so nothing else was looking either.
 *
 * These are the sentences an operator reads about what they may and may not do.
 * Changing one should be a deliberate edit here, not a silent one there.
 */
describe("the delivery screens say what they are supposed to say", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("states the standing policy on every view", async () => {
    const views: Record<string, string>[] = [
      {},
      { view: "diagnostics" },
      { invitation: "invitation-1" },
    ];
    for (const query of views) {
      const { container, unmount } = await renderPage(query);
      expect(container.querySelector('[data-testid="delivery-policy-note"]')?.textContent).toBe(
        "Operators never copy, send or post invitations manually. Delivery telemetry does not " +
          "imply an RSVP.",
      );
      unmount();
    }
  });

  it("pins the repair panel's note", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    expect(container.textContent).toContain(
      "Retry and token repair are auditable system actions. There is no copy-link, " +
        "send-message or post-to-group control.",
    );
  });

  it("pins the diagnostics note", async () => {
    const { container } = await renderPage({ view: "diagnostics" });
    expect(container.textContent).toContain(
      "Provider-neutral statuses are queued, attempted, delivered, failed and retryable. " +
        "RSVP remains independent.",
    );
  });

  it("pins the fallback fact, which is where a handoff would read most naturally", async () => {
    const { container } = await renderPage({ invitation: "invitation-1" });
    const fallback = container.querySelector('[data-testid="fallback-fact"]')?.textContent ?? "";
    expect(fallback).toContain("Automated email / calendar");
    expect(fallback).toContain("No manual send action");
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
