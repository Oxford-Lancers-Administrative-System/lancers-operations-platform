/**
 * UX-20, UX-21, UX-22 and UX-23 — LAN-75, matrix rows 11 and 12.
 *
 * These render the real pages with the service layer mocked, so what is under
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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: () => "/operate/roster",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/membership")>();
  return { ...actual, listCurrentSeasonRoster: vi.fn(), readMembership: vi.fn() };
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NotFound } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  listCurrentSeasonRoster,
  readMembership,
  type MembershipRecord,
  type OnboardingItem,
  type Roster,
  type RosterEntry,
} from "@/lib/services/membership";
import RosterPage from "./page";
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

function rosterProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof RosterPage>[0];
}

const ENTRIES: RosterEntry[] = [
  {
    membershipId: MEMBERSHIP_ID,
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    givenName: "Avery",
    familyName: "Fielding",
    knownAs: "Avery",
    displayName: "Avery Fielding",
    status: "active",
    entry: "returning",
    email: "avery.fielding@example.invalid",
    phone: "+44 7700 900101",
    itemsTotal: 5,
    itemsResolved: 5,
    requiredOutstanding: 0,
  },
  {
    membershipId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    givenName: "Samira",
    familyName: "Quinn",
    knownAs: null,
    displayName: "Samira Quinn",
    status: "confirmed",
    entry: "returning",
    email: "samira.quinn@example.invalid",
    phone: "+44 7700 900103",
    itemsTotal: 5,
    itemsResolved: 3,
    requiredOutstanding: 2,
  },
  {
    // A first-name-only person, and no contact at all — the club's real shape.
    membershipId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    personId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    givenName: "Ari",
    familyName: null,
    knownAs: null,
    displayName: "Ari",
    status: "carried_forward",
    entry: "new",
    email: null,
    phone: null,
    itemsTotal: 0,
    itemsResolved: 0,
    requiredOutstanding: 0,
  },
];

function givenRoster(overrides: Partial<Roster> = {}): void {
  vi.mocked(listCurrentSeasonRoster).mockResolvedValue({
    season: { id: "season", label: "2026-27", status: "active" },
    entries: ENTRIES,
    totalInSeason: ENTRIES.length,
    ...overrides,
  } as Roster);
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
    knownAs: "Avery",
    displayName: "Avery Fielding",
    status: "confirmed",
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
        toStatus: "carried_forward",
        occurredAt: new Date("2026-08-12T13:36:00Z"),
        actorName: "Morgan Pike",
        actorLabel: null,
        reason: null,
      },
      {
        fromStatus: "carried_forward",
        toStatus: "confirmed",
        occurredAt: new Date("2026-08-12T13:37:00Z"),
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

describe("UX-20 — Roster", () => {
  beforeEach(async () => {
    givenRoster();
    render(await RosterPage(rosterProps()));
  });

  it("shows the approved heading, the season and how many memberships it holds", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Roster");
    expect(screen.getByTestId("season-label")).toHaveTextContent("Season 2026-27 · 3 memberships");
  });

  it("offers the one primary action the wireframe carries", () => {
    expect(screen.getByRole("link", { name: "Add player" })).toHaveAttribute(
      "href",
      "/operate/roster/new",
    );
  });

  it("carries the approved columns", () => {
    const table = screen.getByRole("table", { name: "Roster" });
    for (const column of ["Member", "Status", "Entry", "Email", "Phone", "Onboarding"]) {
      expect(within(table).getByText(column)).toBeInTheDocument();
    }
  });

  it("renders one row per membership, with its status in words", () => {
    expect(screen.getAllByTestId("roster-row")).toHaveLength(3);

    const table = screen.getByRole("table", { name: "Roster" });
    expect(within(table).getByText("Active")).toBeInTheDocument();
    expect(within(table).getByText("Confirmed")).toBeInTheDocument();
    expect(within(table).getByText("Carried forward")).toBeInTheDocument();
  });

  it("opens the membership record from the row", () => {
    // The approved criterion: "activating a row opens the correct
    // membership-detail route".
    expect(screen.getAllByRole("link", { name: "Avery Fielding" })[0]).toHaveAttribute(
      "href",
      `/operate/roster/${MEMBERSHIP_ID}`,
    );
  });

  it("states onboarding without making the operator open every record", () => {
    const table = screen.getByRole("table", { name: "Roster" });
    expect(within(table).getByText("Complete")).toBeInTheDocument();
    expect(within(table).getByText("2 outstanding")).toBeInTheDocument();
    expect(within(table).getByText("No items configured")).toBeInTheDocument();
  });

  it("shows a dash rather than an empty cell for missing contact detail", () => {
    // 26% of the club's records are first-name-only; a blank cell reads as a
    // rendering fault rather than as "the club does not have this".
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("offers search, status and entry filters, and sortable columns", () => {
    expect(screen.getByTestId("roster-filters")).toBeInTheDocument();
    expect(screen.getByLabelText("Search name or contact")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Entry")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Roster" });
    expect(within(table).getByRole("link", { name: /Member/ })).toHaveAttribute(
      "href",
      expect.stringContaining("sort=name"),
    );
  });

  it("also renders the phone card for every membership", () => {
    // Both presentations are in this DOM because jsdom ignores breakpoints;
    // what is assertable here is that the phone layout drops nobody.
    expect(screen.getAllByTestId("roster-card")).toHaveLength(3);
  });
});

describe("UX-20 — the sort links", () => {
  it("carries the current filters through a sort, rather than clearing them", async () => {
    givenRoster();
    render(await RosterPage(rosterProps({ q: "Avery", status: "active" })));

    const header = within(screen.getByRole("table", { name: "Roster" })).getByRole("link", {
      name: /Status/,
    });
    expect(header).toHaveAttribute("href", expect.stringContaining("q=Avery"));
    expect(header).toHaveAttribute("href", expect.stringContaining("status=active"));
  });

  it("flips the direction of the column already sorted", async () => {
    givenRoster();
    render(await RosterPage(rosterProps({ sort: "name", dir: "asc" })));

    expect(
      within(screen.getByRole("table", { name: "Roster" })).getByRole("link", { name: /Member/ }),
    ).toHaveAttribute("href", expect.stringContaining("dir=desc"));
  });
});

// ---------------------------------------------------------------------------

describe("UX-23 — No memberships match these filters", () => {
  it("uses the approved copy and offers both recoveries", async () => {
    givenRoster({ entries: [], totalInSeason: 42 });
    render(await RosterPage(rosterProps({ q: "nobody" })));

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "No memberships match these filters",
    );
    expect(screen.getByTestId("roster-filter-empty")).toHaveTextContent(
      "The roster is available, but the current search and filter combination returned no results.",
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/operate/roster",
    );
    expect(screen.getByRole("link", { name: "Add player" })).toBeInTheDocument();
  });

  /**
   * The wireframe's own note: "A system-empty roster uses different copy and
   * points to the authorized intake workflow." The recovery differs, so the
   * sentence has to.
   */
  it("says something different when the season is genuinely empty", async () => {
    givenRoster({ entries: [], totalInSeason: 0 });
    render(await RosterPage(rosterProps()));

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "This season has no memberships yet",
    );
    expect(screen.getByTestId("roster-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("roster-filter-empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("UX-21 — the membership record", () => {
  beforeEach(async () => {
    await renderMembership();
  });

  it("leads with the person and the membership line", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.getByTestId("membership-subtitle")).toHaveTextContent(
      "2026-27 membership · Returning · Confirmed",
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
    expect(within(history).getByText("Created as carried forward")).toBeInTheDocument();
    expect(within(history).getByText("Carried forward → Confirmed")).toBeInTheDocument();
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
    it(`shows ${access.state} no roster data`, async () => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
      givenRoster();

      const { container } = render(await RosterPage(rosterProps()));

      for (const secret of ["Avery", "Fielding", "avery.fielding@example.invalid", "Samira"]) {
        expect(container.innerHTML).not.toContain(secret);
      }
      expect(listCurrentSeasonRoster).not.toHaveBeenCalled();
    });

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

  it("sends a request with no session to the sign-in page, keeping the route", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    await expect(RosterPage(rosterProps())).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Froster",
    );
  });
});

// ---------------------------------------------------------------------------

/**
 * The one defect in this issue that no rendering test could have caught.
 *
 * `<Stack divider={<Divider />}>` renders correctly in jsdom and in the
 * browser, and throws "Element type is invalid ... got: undefined" during a
 * **full server render** on this project's MUI/Next combination. So every
 * direct hit or hard refresh of the membership record returned 500, while
 * clicking through to it from the roster worked — which is exactly why it
 * looked random, and why it survived a full suite, a passing CI run and an
 * independent review.
 *
 * Nothing about the rendered output distinguishes the broken form from the
 * working one, so the guard is on the source: no component under `src/` uses
 * Stack's `divider` prop. Separators are drawn explicitly instead.
 */
describe("the Stack divider prop, which breaks server rendering here", () => {
  function filesUnder(dir: string): string[] {
    const root = path.resolve(import.meta.dirname, "../../..");
    const absolute = path.join(root, dir);
    return readdirSync(absolute, { recursive: true, encoding: "utf8" })
      .map((entry) => path.join(absolute, entry))
      .filter((entry) => statSync(entry).isFile())
      .filter((entry) => entry.endsWith(".tsx") && !entry.endsWith(".test.tsx"));
  }

  const components = filesUnder("app").concat(filesUnder("lib").filter((f) => f.endsWith(".tsx")));

  it("checks a non-trivial set of components", () => {
    expect(components.length).toBeGreaterThan(10);
  });

  it.each(components)("%s does not pass a divider to Stack", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/divider=\{/);
  });
});
