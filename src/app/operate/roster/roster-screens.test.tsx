/**
 * UX-21 and UX-22 — the membership record and its activation dialog. LAN-75,
 * matrix rows 11 and 12.
 *
 * `RosterPage` (UX-20/UX-23) moved out of this file with LAN-186: the board
 * that replaced the six-column list has its own tests in
 * `board-screens.test.tsx`, and its search-and-filter component
 * (`./roster-filters.tsx`) is unchanged and still covered below — it stays a
 * live consumer of the shared `ListFilters` component
 * (`src/app/operate/list-filters.test.tsx`) even though the board no longer
 * uses it, and deleting it would break that outside test.
 *
 * These render the real page with the service layer mocked, so what is under
 * test is the screen: which facts it states, which actions it offers, and which
 * of them it offers to whom. The writes are proved against the real database in
 * `src/lib/services/membership.test.ts`, and the authorization boundary in
 * `./actions.test.ts`.
 *
 * ## Labels are asserted as literals
 *
 * The approved contract requires that "primary and secondary actions use the
 * exact approved labels shown in the wireframes", so those labels appear here
 * as strings rather than as imports from the components. Importing the string
 * the component renders would assert only that a variable equals itself.
 *
 * ## What this file CANNOT see, and must not be trusted for
 *
 * **Layout.** jsdom does not evaluate MUI breakpoints, so
 * `{ display: { xs: "none", md: "block" } }` renders here exactly like one that
 * shows at every width — which means the desktop table and the phone cards are
 * *both* in this DOM, and an assertion that finds a row proves nothing about
 * which width shows it. The approved "wide command view, not a stretched phone
 * layout" boundary is therefore **not** evidenced here. It needs a human at
 * both widths, and the pull request carries those screenshots.
 *
 * What this file does cover: copy, labels, states, which controls exist, and
 * what an unauthorized operator's DOM contains.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const routerPush = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: () => "/operate/roster",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/membership")>();
  return { ...actual, readMembership: vi.fn() };
});

import { NotFound } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  readMembership,
  type MembershipRecord,
  type OnboardingItem,
} from "@/lib/services/membership";
import RosterFilters, { SEARCH_DEBOUNCE_MS } from "./roster-filters";
import MembershipPage from "./[membershipId]/page";

const MEMBERSHIP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** An Exec seat — one of the five `membership_activation` grants. */
function execOperator(roleCodes: string[] = ["president"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
}

/** A linked, active operator who may read the roster and change no status. */
function readerOperator(): ResolvedOperator {
  return execOperator(["kit_manager"]);
}

function signedInAs(operator: ResolvedOperator): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator });
}

function item(overrides: Partial<OnboardingItem> = {}): OnboardingItem {
  return {
    id: "11111111-aaaa-4aaa-8aaa-111111111111",
    code: "kit_sorted",
    label: "Kit sorted",
    isRequired: true,
    isSubscription: false,
    sortOrder: 0,
    status: "pending",
    completedOn: null,
    waivedReason: null,
    waivedByName: null,
    updatedAt: new Date("2026-10-01T09:00:00Z"),
    ...overrides,
  };
}

const SUBSCRIPTION_ITEM = item({
  id: "22222222-aaaa-4aaa-8aaa-222222222222",
  code: "subs_paid",
  label: "Subscription paid",
  isRequired: false,
  isSubscription: true,
  sortOrder: 1,
});

function membership(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  const onboardingItems = overrides.onboardingItems ?? [item(), SUBSCRIPTION_ITEM];
  return {
    membershipId: MEMBERSHIP_ID,
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    givenName: "Avery",
    familyName: "Fielding",
    displayAlias: "Avery",
    displayName: "Avery Fielding",
    status: "onboarding",
    entry: "returning",
    seasonId: "season",
    seasonLabel: "2026-27",
    confirmedOn: "2026-08-12",
    activatedOn: null,
    inactivityLabel: null,
    contacts: [
      { kind: "email", rawValue: "avery.fielding@example.invalid", isPreferred: true },
      { kind: "phone", rawValue: "+44 7700 900101", isPreferred: true },
    ],
    statusHistory: [
      {
        fromStatus: null,
        toStatus: "onboarding",
        occurredAt: new Date("2026-08-12T13:36:00Z"),
        actorName: "Morgan Pike",
        actorLabel: null,
        reason: "Returner verification completed (operator entry)",
      },
    ],
    ...overrides,
    onboardingItems,
    outstandingRequired:
      overrides.outstandingRequired ??
      onboardingItems.filter(
        (each) =>
          each.isRequired &&
          !each.isSubscription &&
          !["complete", "waived", "not_applicable"].includes(each.status),
      ),
  };
}

async function renderMembership(record: MembershipRecord | null = membership()) {
  if (record === null) {
    vi.mocked(readMembership).mockRejectedValue(
      new NotFound("That membership no longer exists.", { rule: "season_memberships_not_found" }),
    );
  } else {
    vi.mocked(readMembership).mockResolvedValue(record);
  }
  return render(
    await MembershipPage({
      params: Promise.resolve({ membershipId: MEMBERSHIP_ID }),
      searchParams: Promise.resolve({}),
    } as Parameters<typeof MembershipPage>[0]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(execOperator());
});

// ---------------------------------------------------------------------------

describe("UX-21 — the membership record", () => {
  beforeEach(async () => {
    await renderMembership();
  });

  it("leads with the person and the membership line", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.getByTestId("membership-subtitle")).toHaveTextContent(
      "2026-27 membership · Returning · Onboarding",
    );
  });

  it("states the person, the known-as and the raw contact detail", () => {
    expect(screen.getByText("Known as Avery")).toBeInTheDocument();
    expect(screen.getByText("avery.fielding@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("+44 7700 900101")).toBeInTheDocument();
  });

  it("lists the onboarding items and their states", () => {
    const panel = screen.getByTestId("onboarding-panel");
    expect(within(panel).getAllByTestId("onboarding-item")).toHaveLength(2);
    expect(within(panel).getByText("Kit sorted")).toBeInTheDocument();
    expect(within(panel).getByText("Subscription paid")).toBeInTheDocument();
  });

  /**
   * Register D10 is a rule an operator has to be able to see. "Subs paid,
   * outstanding" beside a blocked Activate button would teach exactly the wrong
   * lesson about how this club works.
   */
  it("says on the subscription item that it never blocks activation", () => {
    expect(screen.getByText("Never blocks activation")).toBeInTheDocument();
  });

  it("offers the three resolutions, and not the two process states", async () => {
    const form = screen.getAllByTestId("onboarding-item-form")[0];
    expect(within(form).getByRole("combobox")).toBeInTheDocument();
    // `pending` and `invited` are states the process moves through, not
    // decisions this screen makes.
    expect(within(form).queryByText("Invited")).not.toBeInTheDocument();
  });

  it("reads the typed status history rather than summarising it", () => {
    const history = screen.getByTestId("status-history");
    expect(within(history).getByText("Created as onboarding")).toBeInTheDocument();
    expect(
      within(history).getByText("Returner verification completed (operator entry)"),
    ).toBeInTheDocument();
  });

  it("formats every time in a fixed locale and zone", () => {
    // Not `toLocaleString()` with no arguments: server and client would
    // disagree on any machine not set to en-GB/London.
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-08-12T13:36:00.000Z");
    expect(time).toHaveTextContent("12 Aug 2026, 14:36");
  });

  it("offers one exit, to the roster", () => {
    expect(screen.getByRole("link", { name: "Back to roster" })).toHaveAttribute(
      "href",
      "/operate/roster",
    );
  });
});

describe("UX-21 — a membership that is not there", () => {
  it("is a 404 rather than an empty record", async () => {
    await expect(renderMembership(null)).rejects.toThrow("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------

describe("UX-22 — activation", () => {
  it("offers the primary action to an Exec operator on a confirmed membership", async () => {
    await renderMembership();

    expect(screen.getByRole("button", { name: "Activate membership" })).toBeInTheDocument();
    expect(screen.getByText(/Activation is available only to Exec\/GM/)).toBeInTheDocument();
  });

  it("says how many required items are outstanding, and that they do not block", async () => {
    await renderMembership();

    expect(screen.getByTestId("outstanding-note")).toHaveTextContent(
      "One required item is still outstanding. Activation is still possible — the reason for proceeding is recorded.",
    );
  });

  it("names the outstanding items and takes the reason, with the approved labels", async () => {
    await renderMembership();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Activate membership" }));
    });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Activate with outstanding onboarding")).toBeInTheDocument();
    expect(within(dialog).getByTestId("override-summary")).toHaveTextContent(
      "Avery Fielding has one required item outstanding.",
    );
    expect(within(dialog).getByText("Kit sorted")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Override reason/)).toBeRequired();
    expect(
      within(dialog).getByText(
        "Only Exec/GM can perform this transition. The reason and actor are written to the audit trail.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm activation" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  /**
   * The defect this exists for was found by pressing the real button against
   * the real database, and every other assertion in this file passed while the
   * screen did nothing at all.
   *
   * MUI renders a `Dialog` through a **portal** onto `document.body`. The first
   * implementation wrapped the dialog in the `<form>`, so in the DOM the submit
   * button and the override-reason field were outside that form entirely:
   * pressing Confirm submitted nothing, and the reason never reached the
   * action. In jsdom the portal still contains the markup, so "the button
   * exists" and "the field is required" were both true and both irrelevant.
   *
   * The only thing that distinguishes the broken shape from the working one is
   * where the controls sit relative to a `form` element — so that is what is
   * asserted, on the elements themselves rather than on the JSX.
   */
  it("keeps the override controls inside a form that carries the membership", async () => {
    await renderMembership();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Activate membership" }));
    });

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Confirm activation" });
    const reason = within(dialog).getByLabelText(/Override reason/);

    const form = confirm.closest("form");
    expect(form, "the confirm button is not inside any form").not.toBeNull();
    // The same form, and one that carries the membership the action needs.
    expect(reason.closest("form")).toBe(form);
    expect(form?.querySelector('input[name="membershipId"]')).toHaveValue(MEMBERSHIP_ID);
  });

  it("activates directly, with no override question, when nothing is outstanding", async () => {
    await renderMembership(
      membership({ onboardingItems: [item({ status: "complete" }), SUBSCRIPTION_ITEM] }),
    );

    const button = screen.getByRole("button", { name: "Activate membership" });
    expect(button).toHaveAttribute("type", "submit");
    expect(screen.queryByTestId("outstanding-note")).not.toBeInTheDocument();
  });

  it("offers `active → inactive` on an active membership, and no activation", async () => {
    await renderMembership(membership({ status: "active", activatedOn: "2026-10-04" }));

    expect(screen.getByRole("button", { name: "Mark inactive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate membership" })).not.toBeInTheDocument();
  });

  it("offers the way back on an inactive membership", async () => {
    await renderMembership(
      membership({ status: "inactive", activatedOn: "2026-10-04", inactivityLabel: "Away" }),
    );

    expect(screen.getByRole("button", { name: "Mark active again" })).toBeInTheDocument();
  });

  it("offers no transition at all from a state outside this slice", async () => {
    await renderMembership(membership({ status: "departed" }));

    expect(screen.getByTestId("no-transition")).toHaveTextContent(
      "Season close, departure and reinstatement are outside this slice.",
    );
    expect(screen.queryByRole("button", { name: "Activate membership" })).not.toBeInTheDocument();
  });
});

describe("UX-22 — an operator who may not activate", () => {
  let markup: string;

  beforeEach(async () => {
    signedInAs(readerOperator());
    const { container } = await renderMembership();
    markup = container.innerHTML;
  });

  it("is told what the action needs, and offered no control", () => {
    expect(screen.getByTestId("activation-not-permitted")).toHaveTextContent(
      "Changing a membership’s status is available only to the Exec and the General Manager.",
    );
    expect(screen.queryByRole("button", { name: "Activate membership" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("activate-form")).not.toBeInTheDocument();
  });

  /**
   * The control is absent from the markup the browser receives, not merely
   * unpainted. A hidden form is still a form somebody can submit.
   */
  it("ships no activation form in the DOM at all", () => {
    // Scoped to the activation controls. `membershipId` legitimately appears in
    // the onboarding-item forms, which this operator may use — asserting on it
    // would fail for the wrong reason and would hide the thing being checked.
    expect(markup).not.toContain('name="overrideReason"');
    expect(markup).not.toContain('data-testid="activate-form"');
    expect(markup).not.toContain('data-testid="deactivate-form"');
    expect(markup).not.toContain("Activate membership");
    expect(markup).not.toContain("Mark inactive");
  });

  it("still reads the record, and still resolves onboarding items", () => {
    // Marking the kit sorted is roster work; only the readiness declaration is
    // the Exec's. UX-21's audience is "Authorized roster operator".
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.getAllByTestId("onboarding-item-form").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("an operator who may not be here at all", () => {
  const denied: OperatorAccess[] = [{ state: "unlinked" }, { state: "inactive" }];

  for (const access of denied) {
    it(`shows ${access.state} no membership record`, async () => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
      vi.mocked(readMembership).mockResolvedValue(membership());

      const { container } = render(
        await MembershipPage({
          params: Promise.resolve({ membershipId: MEMBERSHIP_ID }),
          searchParams: Promise.resolve({}),
        } as Parameters<typeof MembershipPage>[0]),
      );

      for (const secret of ["Avery", "avery.fielding@example.invalid", "Kit sorted"]) {
        expect(container.innerHTML).not.toContain(secret);
      }
      expect(readMembership).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------

/**
 * The search box, which nothing tested until independent review deleted the
 * debounce and watched all 1,884 tests stay green — returning the screen to
 * exactly the state Brian rejected on sight.
 *
 * These render the real filter component and assert on the URL it navigates to,
 * because that URL is the whole behaviour: the roster is a server component and
 * the query string is the only thing that reaches it.
 */
describe("UX-20 — the search box actually filters", () => {
  function renderFilters(props: Partial<Parameters<typeof RosterFilters>[0]> = {}) {
    return render(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search=""
        status=""
        entry=""
        sort="name"
        direction="asc"
        {...props}
      />,
    );
  }

  beforeEach(() => {
    routerPush.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates to the typed search after the debounce", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Brindlewood" },
    });
    expect(routerPush).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("q=Brindlewood"));
  });

  it("navigates once for a burst of typing, not once per keystroke", async () => {
    renderFilters();
    const box = screen.getByLabelText("Search name or contact");

    for (const value of ["B", "Br", "Bri"]) {
      fireEvent.change(box, { target: { value } });
    }
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("q=Bri"));
  });

  /**
   * The first of two races review found. `withFilter` closed over the `search`
   * prop, so a status chosen inside the debounce window built its URL from the
   * older value and silently discarded whatever had just been typed.
   */
  it("keeps the typed text when a filter is chosen before the debounce fires", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Quinn" },
    });
    // MUI's select is a combobox backed by a hidden input, so it is opened and
    // an option clicked, exactly as an operator would.
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    const pushed = routerPush.mock.calls.at(-1)?.[0] as string;
    expect(pushed).toContain("status=active");
    expect(pushed).toContain("q=Quinn");
  });

  /**
   * The second of the two races, and the one that shipped with no coverage at
   * all — independent review deleted the guard and the whole suite stayed green.
   *
   * The sequence: the operator types, a filter is chosen inside the debounce
   * window (which pushes a URL carrying the half-typed search), and that
   * navigation lands as a new `search` prop while the box still holds the same
   * text. The box must keep what was typed, and the pending debounce must not
   * fire a second navigation to a URL the browser is already on.
   */
  it("keeps the box and does not navigate twice when the URL catches up mid-type", async () => {
    const { rerender } = renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Quinn" },
    });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    const afterFilter = routerPush.mock.calls.length;

    // The navigation lands: the prop now carries what the box already holds.
    rerender(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search="Quinn"
        status="active"
        entry=""
        sort="name"
        direction="asc"
      />,
    );

    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    // Nothing further: the URL already says what the box says.
    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");
    expect(routerPush).toHaveBeenCalledTimes(afterFilter);
  });

  it("adopts the URL when it genuinely changes underneath — Back, or Clear filters", () => {
    const { rerender } = renderFilters({ search: "Quinn" });
    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");

    rerender(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search=""
        status=""
        entry=""
        sort="name"
        direction="asc"
      />,
    );

    expect(screen.getByLabelText("Search name or contact")).toHaveValue("");
  });
});
