/**
 * The Administration surfaces — LAN-133, `WP-surfaces`.
 *
 * ## Labels are asserted as literals
 *
 * `DEC-administration-language-and-states` fixes the club's words, so they
 * appear here as strings rather than as imports from the components. Importing
 * the string the component renders would assert only that a variable equals
 * itself; what needs proving is that the **approved** words are on screen — and
 * that the technical ones the decision forbids are not.
 *
 * ## What "not shown" is taken to mean
 *
 * Not "not painted": contains none. The negative assertions read
 * `container.innerHTML`, so a role code in a data attribute or an email in a
 * hidden input fails them exactly as a visible one would. A server-rendered
 * page ships its DOM; whatever is in it is disclosed.
 *
 * ## What this file cannot see
 *
 * **Layout.** jsdom does not evaluate MUI breakpoints, so `{ xs: "none", md:
 * "block" }` renders here exactly like a style that shows at every width. Both
 * presentations of every list are therefore in the DOM at once during these
 * tests, which is why the row assertions use `getAllBy*` and count rather than
 * asserting a single element. Nothing here evidences the 375px contract; that
 * needs a human at that width.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: () => "/operate/admin/operators",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/administration-directory", () => ({
  readOperatorDirectory: vi.fn(),
  readOperatorRecord: vi.fn(),
  readPlayerMembership: vi.fn(),
  readRoleCatalogue: vi.fn(),
}));
vi.mock("@/lib/services/administration-audit", () => ({
  readOperatorAuditHistory: vi.fn(),
  readHolderHistory: vi.fn(),
}));
vi.mock("./permissions", () => ({
  permittedAccountActions: vi.fn(),
  permittedRoleActions: vi.fn(),
}));
// The server actions are POST endpoints; these tests render the screens that
// post to them. Their own behaviour is the services' and is covered there.
//
// Every one of them resolves to an `AdminActionState`, because every real one
// does and the type demands it — LAN-141. A bare `vi.fn()` resolves to
// `undefined`, which `useActionState` then hands the panel as its state: a
// shape production cannot produce, and one that would make a component
// tolerating it look correct here and crash on the real page. The literal is
// inline rather than imported because `vi.mock` factories are hoisted above the
// imports.
vi.mock("./actions", () => {
  const state = () => ({ notice: null, error: null, refusal: null, candidates: null });
  return {
    assignRoleAction: vi.fn(state),
    correctInvitationAction: vi.fn(state),
    deactivateOperatorAction: vi.fn(state),
    endRoleAction: vi.fn(state),
    inviteOperatorAction: vi.fn(state),
    replaceRoleHolderAction: vi.fn(state),
    resendInvitationAction: vi.fn(state),
    restoreOperatorAction: vi.fn(state),
    searchCandidatesAction: vi.fn(state),
    startEmailRehomeAction: vi.fn(state),
  };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  readHolderHistory,
  readOperatorAuditHistory,
  type AdministrationHistoryEntry,
} from "@/lib/services/administration-audit";
import {
  readOperatorDirectory,
  readOperatorRecord,
  readPlayerMembership,
  readRoleCatalogue,
  type CatalogueHolder,
  type CatalogueRole,
  type DirectoryOperator,
  type DirectoryRole,
  type OperatorDirectory,
  type RoleCatalogue,
} from "@/lib/services/administration-directory";
import { addClubDays, formatClubDay, todayInClubZone } from "@/lib/club-time";
import { permittedAccountActions, permittedRoleActions } from "./permissions";
import { assignRoleAction, correctInvitationAction, searchCandidatesAction } from "./actions";
import { EMPTY_ADMIN_ACTION_STATE } from "./action-state";
import OperatorsPage from "./operators/page";
import OperatorRecordPage from "./operators/[operatorId]/page";
import InviteOperatorPage from "./operators/new/page";
import RolesPage from "./roles/page";
import RoleRecordPage from "./roles/[roleId]/page";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const YEAR = { scope: "committee_year" as const, id: "cycle-1", label: "2026-27" };
const SEASON = { scope: "season" as const, id: "season-1", label: "2026-27" };

function administrator(seat = "it_officer"): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Brian Schuster",
    roleCodes: [seat],
    isActive: true,
  };
}

function signedIn(operator: ResolvedOperator | null) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(
    operator === null ? { state: "no_session" } : { state: "active", operator },
  );
}

function seat(overrides: Partial<DirectoryRole> = {}): DirectoryRole {
  return {
    roleAssignmentId: "assignment-1",
    roleId: "role-1",
    code: "president",
    label: "President",
    groupCode: "club_committee",
    groupLabel: "Club Committee",
    groupSortOrder: 2,
    effectiveFrom: "2026-08-18",
    effectiveTo: null,
    scheduled: false,
    ...overrides,
  };
}

function operatorRow(overrides: Partial<DirectoryOperator> = {}): DirectoryOperator {
  return {
    operatorAccountId: "aaaaaaaa-1111-4111-8111-111111111111",
    personId: "bbbbbbbb-1111-4111-8111-111111111111",
    displayName: "Clint Grohmann",
    loginEmail: "clint@example.com",
    state: "active",
    invitedAt: new Date("2026-08-18T13:09:00Z"),
    activatedAt: new Date("2026-08-18T14:00:00Z"),
    deliveryFailedAt: null,
    deliveryFailureReason: null,
    emailRehomePendingAt: null,
    roles: [seat()],
    ...overrides,
  };
}

function holder(overrides: Partial<CatalogueHolder> = {}): CatalogueHolder {
  return {
    roleAssignmentId: "assignment-1",
    personId: "bbbbbbbb-1111-4111-8111-111111111111",
    displayName: "Clint Grohmann",
    effectiveFrom: "2026-08-18",
    effectiveTo: null,
    scheduled: false,
    operatorAccountId: "aaaaaaaa-1111-4111-8111-111111111111",
    operatorState: "active",
    accessDeactivated: false,
    ...overrides,
  };
}

function catalogueRole(overrides: Partial<CatalogueRole> = {}): CatalogueRole {
  const holders = overrides.holders ?? [];
  return {
    id: "role-1",
    code: "president",
    label: "President",
    scope: "committee_year",
    admitsMultipleHolders: false,
    scheduled: [],
    vacant: holders.length === 0,
    cycleMissing: false,
    assignable: true,
    ...overrides,
    holders,
  };
}

/** The three approved groups, as the catalogue reader returns them. */
function catalogue(overrides: Partial<RoleCatalogue> = {}): RoleCatalogue {
  return {
    committeeYear: YEAR,
    season: SEASON,
    seasonWritable: true,
    groups: [
      {
        code: "operational_administration",
        label: "Operational Administration",
        roles: [
          catalogueRole({
            id: "role-gm",
            code: "general_manager",
            label: "General Manager",
            holders: [holder({ displayName: "Stewart Humble" })],
          }),
        ],
      },
      {
        code: "club_committee",
        label: "Club Committee",
        roles: [
          catalogueRole({ holders: [holder()] }),
          catalogueRole({ id: "role-kit-manager", code: "kit_manager", label: "Kit Manager" }),
        ],
      },
      {
        code: "coaching_staff",
        label: "Coaching Staff",
        roles: [
          catalogueRole({
            id: "role-head-coach",
            code: "head_coach",
            label: "Head Coach",
            scope: "season",
            admitsMultipleHolders: true,
          }),
        ],
      },
    ],
    ...overrides,
  };
}

function directory(operators: DirectoryOperator[]): OperatorDirectory {
  return { operators, committeeYear: YEAR };
}

/** One recorded event, in the shape both projections return. */
function historyEntry(
  overrides: Partial<AdministrationHistoryEntry> = {},
): AdministrationHistoryEntry {
  return {
    id: "event-1",
    // An ISO instant, as the service returns it — a string, not a `Date`.
    occurredAt: "2026-08-18T22:30:00.123Z",
    action: "administration.operator.invitation_resent",
    family: "operator",
    label: "Invitation resent",
    actor: { personId: "actor", name: "Clint Grohmann" },
    authority: { kind: "capability", capability: "role_management", roleCodes: ["president"] },
    target: { personId: "person", operatorAccountId: "account", name: "Casey Quinn" },
    role: null,
    operatingYear: YEAR,
    fromState: null,
    toState: null,
    reason: null,
    correlationId: null,
    backdated: false,
    detail: {},
    unreadable: null,
    ...overrides,
  } as AdministrationHistoryEntry;
}

function pageProps(params: Record<string, string>, query: Record<string, string> = {}) {
  return {
    params: Promise.resolve(params),
    searchParams: Promise.resolve(query),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(administrator());
  vi.mocked(readOperatorDirectory).mockResolvedValue(directory([operatorRow()]));
  vi.mocked(readRoleCatalogue).mockResolvedValue(catalogue());
  vi.mocked(readOperatorRecord).mockResolvedValue(operatorRow());
  vi.mocked(readPlayerMembership).mockResolvedValue(null);
  vi.mocked(readOperatorAuditHistory).mockResolvedValue([]);
  vi.mocked(readHolderHistory).mockResolvedValue([]);
  vi.mocked(permittedAccountActions).mockResolvedValue({
    resend: true,
    correct: true,
    deactivate: true,
    restore: true,
    recoverEmail: true,
  });
  vi.mocked(permittedRoleActions).mockResolvedValue({ assign: true, replace: true, end: true });
});

// ---------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------

describe("every Administration surface guards itself", () => {
  const surfaces: [string, () => Promise<unknown>][] = [
    ["Operators", () => OperatorsPage()],
    ["Invite operator", () => InviteOperatorPage()],
    ["Roles", () => RolesPage()],
    ["one operator", () => OperatorRecordPage(pageProps({ operatorId: "aaaa" }))],
    ["one role", () => RoleRecordPage(pageProps({ roleId: "role-1" }))],
  ];

  it.each(surfaces)("refuses the Secretary on the %s page", async (_name, open) => {
    signedIn(administrator("secretary"));

    const { container } = render((await open()) as React.ReactElement);

    // UX-05's refusal names the requirement rather than the reader's holdings.
    expect(container.textContent).toContain("You do not have access to this action");
    expect(container.innerHTML).not.toContain("secretary");
  });

  it.each(surfaces)("sends a signed-out visitor to sign in from the %s page", async (_n, open) => {
    signedIn(null);

    await expect(open()).rejects.toThrow(/^REDIRECT:\/login\?redirectTo=/);
  });

  it("refuses a narrow attendance recorder, whatever the capability says", async () => {
    signedIn({ ...administrator(), roleCodes: ["head_coach"] });

    const { container } = render(await OperatorsPage());

    expect(container.textContent).toContain("Attendance recording is the only operator surface");
  });
});

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

describe("the Operators page", () => {
  it("groups operators as Standing Officers, Club Officers and Coaches", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([
        operatorRow({
          operatorAccountId: "op-gm",
          displayName: "Stewart Humble",
          roles: [
            seat({
              code: "general_manager",
              label: "General Manager",
              groupCode: "operational_administration",
              groupLabel: "Operational Administration",
              groupSortOrder: 1,
            }),
          ],
        }),
        operatorRow(),
        operatorRow({
          operatorAccountId: "op-coach",
          displayName: "Casey Quinn",
          roles: [
            seat({
              code: "wide_receivers_coach",
              label: "Wide Receivers Coach",
              groupCode: "coaching_staff",
              groupLabel: "Coaching Staff",
              groupSortOrder: 3,
            }),
          ],
        }),
      ]),
    );

    render(await OperatorsPage());

    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Standing Officers", "Club Officers", "Coaches"]);
  });

  it("carries Invite operator as the page's own action, and the guide link", async () => {
    render(await OperatorsPage());

    expect(screen.getByRole("link", { name: "Invite operator" })).toHaveAttribute(
      "href",
      "/operate/admin/operators/new",
    );
    expect(screen.getByRole("link", { name: /how administration works/i })).toHaveAttribute(
      "href",
      "/operate/admin/guide",
    );
  });

  it("says which operating year it is showing, and how many accounts", async () => {
    render(await OperatorsPage());

    expect(screen.getByTestId("admin-page-subtitle")).toHaveTextContent(
      "2026-27 · 1 operator account",
    );
  });

  it("shows the role and the account state as separate facts", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([operatorRow({ state: "deactivated", displayName: "Morgan Pike" })]),
    );

    render(await OperatorsPage());

    const row = screen.getAllByTestId("operator-row")[0];
    expect(within(row).getByText("President")).toBeVisible();
    expect(within(row).getByText("Deactivated")).toBeVisible();
  });

  it("renders the delivery failure reason beside a failed invitation — LAN131-A5", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([
        operatorRow({
          state: "delivery_failed",
          activatedAt: null,
          deliveryFailedAt: new Date("2026-08-18T14:22:00Z"),
          deliveryFailureReason:
            "This account has already been opened. Send them to Forgot password instead.",
        }),
      ]),
    );

    const { container } = render(await OperatorsPage());

    expect(container.textContent).toContain("Send them to Forgot password instead.");
  });

  it("lists an operator whose roles have all ended rather than dropping them", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([operatorRow({ displayName: "Avery Fielding", roles: [] })]),
    );

    render(await OperatorsPage());

    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
      "Without a current role",
    );
    expect(screen.getAllByText("No current role").length).toBeGreaterThan(0);
  });

  it("uses no technical label the language decision forbids", async () => {
    const { container } = render(await OperatorsPage());
    const html = container.innerHTML.toLowerCase();

    expect(html).not.toContain("durable person");
    expect(html).not.toContain("effective access");
    expect(html).not.toContain("access history");
    expect(html).not.toContain("person_id");
  });

  /**
   * LAN-141 finding 9.
   *
   * Each account used to be placed once, under the earliest group it sat in, so
   * a coach who also held a committee seat was absent from **Coaches**
   * entirely. `DEC-one-person-multiple-capacities` makes that combination
   * ordinary and `REQ-coach-operator-onboarding` requires Coaching Staff to be
   * visually separated — which a section missing some of the club's coaches
   * does not do.
   */
  it("shows a coach who also holds a committee seat under Coaches too", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([
        operatorRow({
          displayName: "Casey Quinn",
          roles: [
            seat(),
            seat({
              roleAssignmentId: "assignment-2",
              roleId: "role-head-coach",
              code: "head_coach",
              label: "Head Coach",
              groupCode: "coaching_staff",
              groupLabel: "Coaching Staff",
              groupSortOrder: 3,
            }),
          ],
        }),
      ]),
    );

    render(await OperatorsPage());

    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Club Officers", "Coaches"]);
    // The heading counts accounts, not rows, so one person in two sections does
    // not make the page's own count wrong.
    expect(screen.getByTestId("admin-page-subtitle")).toHaveTextContent("1 operator account");
  });

  /**
   * LAN-141 finding 11. This column showed a scheduled *start* and hid a
   * scheduled *end*, on the page an administrator scans to see who is leaving —
   * half of Brian's ruling, on the half he would notice last.
   */
  it("says when somebody's seat is due to end", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue(
      directory([operatorRow({ roles: [seat({ effectiveTo: "2026-08-27" })] })]),
    );

    const { container } = render(await OperatorsPage());

    expect(container.textContent).toContain("ends 27 Aug 2026");
  });

  /** LAN-141 finding 8, on the other index. */
  it("lists the club's operators during a gap between committee years", async () => {
    vi.mocked(readOperatorDirectory).mockResolvedValue({
      operators: [operatorRow()],
      committeeYear: null,
    });

    render(await OperatorsPage());

    expect(screen.queryByTestId("operators-unavailable")).toBeNull();
    expect(screen.getAllByTestId("operator-row").length).toBeGreaterThan(0);
    expect(screen.getByTestId("admin-page-subtitle")).toHaveTextContent(
      "No committee year recorded",
    );
  });
});

// ---------------------------------------------------------------------------
// One operator
// ---------------------------------------------------------------------------

describe("one operator's record", () => {
  /**
   * The one-result rule, on the real page — LAN133-R2-B1.
   *
   * The mechanism has its own tests in `outcome.test.tsx`, and they passed
   * while the page wiring was missing entirely: `ArrivalNotice` has exactly one
   * production caller, and nothing rendered this page with a `notice` query
   * parameter. Reverting the notice to a plain `Alert`, or dropping the
   * provider from the page, reintroduced the defect Brian raised twice with
   * every gate green.
   *
   * So this renders the page, with the parameter `inviteOperatorAction`
   * actually redirects with, and follows the instruction that banner gives:
   * correct the address and send it again. The banner must go when it does.
   */
  it("clears the arrival banner when the action it tells you to take is started", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(
      operatorRow({
        state: "delivery_failed",
        activatedAt: null,
        deliveryFailedAt: new Date("2026-08-20T10:45:00Z"),
        deliveryFailureReason:
          "550 5.1.1 The email account that you tried to reach does not exist.",
      }),
    );

    render(
      await OperatorRecordPage(
        pageProps({ operatorId: "aaaa" }, { notice: "invited-undelivered" }),
      ),
    );

    expect(screen.getByTestId("arrival-notice")).toHaveTextContent("could not be delivered");

    // Every action returns a state; the type demands it. A mock that resolves
    // to `undefined` would make `useActionState` hand the panel something
    // production cannot produce.
    vi.mocked(correctInvitationAction).mockResolvedValue(EMPTY_ADMIN_ACTION_STATE);

    fireEvent.click(screen.getByRole("button", { name: "Correct email and resend" }));
    const panel = screen.getByTestId("correct-panel");
    const form = panel.querySelector("form");
    if (!form) throw new Error("the correct-and-resend panel has no form to submit");
    fireEvent.submit(form);

    expect(screen.queryByTestId("arrival-notice")).toBeNull();
  });

  /**
   * The banner itself, so that a fix which simply stopped rendering it would
   * fail rather than pass the test above by deleting the feature.
   */
  it("shows the arrival banner the invitation redirect sends it", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(
      operatorRow({ state: "invitation_pending", activatedAt: null }),
    );

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" }, { notice: "invited" })));

    expect(screen.getByTestId("arrival-notice")).toHaveTextContent("The invitation has been sent");
  });

  it("separates the operator account from the roles they hold", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(
      operatorRow({ state: "deactivated", displayName: "Morgan Pike" }),
    );

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(
      within(screen.getByTestId("operator-account-panel")).getByText("Deactivated"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("operator-relationships-panel")).getByText("President"),
    ).toBeVisible();
  });

  it("renders the delivery failure reason — LAN131-A5", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(
      operatorRow({
        state: "delivery_failed",
        activatedAt: null,
        deliveryFailedAt: new Date("2026-08-18T14:22:00Z"),
        deliveryFailureReason: "That address bounced.",
      }),
    );

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByTestId("delivery-failure-reason")).toHaveTextContent(
      "That address bounced.",
    );
  });

  it("names the audit projection Operator audit history", async () => {
    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByRole("heading", { name: "Operator audit history" })).toBeVisible();
  });

  /**
   * The entries were only ever asserted empty until the agent's browser
   * preflight opened a record that had one. `occurredAt` is an ISO **string**,
   * and the date helper was reading every string as a calendar date — which
   * threw out of `Intl.DateTimeFormat` and took the whole page down.
   */
  it("renders a recorded event, with when it happened and who did it", async () => {
    vi.mocked(readOperatorAuditHistory).mockResolvedValue([
      historyEntry({ label: "Invitation resent", reason: null }),
      historyEntry({
        id: "event-2",
        label: "Operator access deactivated",
        reason: "Access removed after a lost device.",
      }),
    ]);

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    const entries = screen.getAllByTestId("history-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("Invitation resent");
    expect(entries[0]).toHaveTextContent("18 Aug 2026, 23:30");
    expect(entries[0]).toHaveTextContent("By Clint Grohmann");
    expect(entries[1]).toHaveTextContent("Access removed after a lost device.");
  });

  /**
   * The other half of LAN-141 finding 7.
   *
   * Holder history had to name the holder because the page is one seat; this
   * page is one person, so what it lacks is the **seat**. The service carries
   * the role on every role event and the panel rendered neither half, which
   * left "Role assigned · By Clint Grohmann · 2026-27" — an entry about
   * something, with the something missing.
   */
  it("names the seat a role event concerns", async () => {
    vi.mocked(readOperatorAuditHistory).mockResolvedValue([
      historyEntry({
        action: "administration.role.assigned",
        label: "Role assigned",
        role: { id: "role-head-coach", code: "head_coach", assignmentId: "assignment-2" },
      }),
      historyEntry({ id: "event-2", label: "Invitation resent", role: null }),
    ]);

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    const entries = screen.getAllByTestId("history-entry");
    expect(entries[0]).toHaveTextContent("Head Coach");
    // An event that concerns no seat says nothing rather than an empty line.
    expect(within(entries[1]).queryByTestId("history-entry-subject")).toBeNull();
  });

  it("shows an entry a newer version wrote, rather than a shorter list", async () => {
    vi.mocked(readOperatorAuditHistory).mockResolvedValue([
      historyEntry({
        unreadable: {
          reason: "unsupported-envelope-version",
          storedVersion: 9,
          message: "This event is in the record but was written by a newer version.",
        },
      }),
    ]);

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByTestId("history-entry-unreadable")).toHaveTextContent(
      "written by a newer version",
    );
  });

  it("offers the approved actions for an active account", async () => {
    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByRole("button", { name: "Deactivate operator access" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Recover email access" })).toBeVisible();
    // Resend is offered "while pending or failed" and this account is active.
    expect(screen.queryByRole("button", { name: "Resend invitation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore operator access" })).toBeNull();
  });

  it("offers resend, and not deactivation, on an invitation that failed to deliver", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(
      operatorRow({ state: "delivery_failed", activatedAt: null }),
    );

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByRole("button", { name: "Resend invitation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Correct email and resend" })).toBeVisible();
    // An account that has never been signed into cannot have its address moved
    // by the recovery flow; correction is that account's route.
    expect(screen.queryByRole("button", { name: "Recover email access" })).toBeNull();
  });

  it("offers restoration, and nothing else, on a deactivated account", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(operatorRow({ state: "deactivated" }));

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByRole("button", { name: "Restore operator access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Deactivate operator access" })).toBeNull();
  });

  it("offers nothing the guard would refuse", async () => {
    vi.mocked(permittedAccountActions).mockResolvedValue({
      resend: false,
      correct: false,
      deactivate: false,
      restore: false,
      recoverEmail: false,
    });

    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByTestId("no-account-actions")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Deactivate operator access" })).toBeNull();
  });

  it("says plainly when somebody is not also a player", async () => {
    render(await OperatorRecordPage(pageProps({ operatorId: "aaaa" })));

    expect(screen.getByText("No current player membership")).toBeVisible();
  });

  it("answers an unknown record with not-found rather than an error", async () => {
    vi.mocked(readOperatorRecord).mockResolvedValue(null);

    await expect(OperatorRecordPage(pageProps({ operatorId: "nope" }))).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

describe("the Roles page", () => {
  it("shows the three approved groups in the catalogue's order", async () => {
    render(await RolesPage());

    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
      "Operational Administration",
      "Club Committee",
      "Coaching Staff",
    ]);
  });

  it("says Not assigned for a seat nobody holds", async () => {
    render(await RolesPage());

    expect(screen.getAllByText("Not assigned").length).toBeGreaterThan(0);
  });

  it("describes what a role can do from the enforced capability map", async () => {
    const { container } = render(await RolesPage());

    // The capability map's own phrases, verbatim and in its own order.
    expect(container.textContent).toContain("Can activate a season membership");
    // Four seats hold nothing, and that is a sentence rather than a blank.
    expect(container.textContent).toContain("This role carries no privileged actions");
  });

  it("shortens a long summary rather than filling the row with a paragraph", async () => {
    const { container } = render(await RolesPage());

    // The General Manager holds eight; the index shows three and counts the
    // rest, and the seat's own page shows every one.
    expect(container.textContent).toContain("and 5 more.");
    expect(container.textContent).not.toContain("read the Monday exception and action report");
  });

  it("offers no way to edit a role or a grant", async () => {
    const { container } = render(await RolesPage());

    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.textContent).toContain("neither the roles nor what they can do are editable");
  });

  it("carries the guide link and no Invite operator action", async () => {
    render(await RolesPage());

    expect(screen.getByRole("link", { name: /how administration works/i })).toHaveAttribute(
      "href",
      "/operate/admin/guide",
    );
    expect(screen.queryByRole("link", { name: "Invite operator" })).toBeNull();
  });

  /**
   * LAN-141 finding 4, on the page it was found on.
   *
   * A season marked `closing` is not an "active" one, so `cycleMissing` was
   * true for every coaching seat while their open-ended appointments were still
   * in force. The cell short-circuited on that flag before it looked at the
   * holders, so the club's Head Coach vanished from the Roles index while role
   * detail still named him.
   */
  it("still names a coach in post when no season is under way", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        season: null,
        seasonWritable: false,
        groups: [
          {
            code: "coaching_staff",
            label: "Coaching Staff",
            roles: [
              catalogueRole({
                id: "role-head-coach",
                code: "head_coach",
                label: "Head Coach",
                scope: "season",
                cycleMissing: true,
                assignable: false,
                holders: [holder({ displayName: "Zenas Yaxlington" })],
              }),
            ],
          },
        ],
      }),
    );

    const { container } = render(await RolesPage());

    expect(container.textContent).toContain("Zenas Yaxlington");
    expect(container.textContent).not.toContain("No season under way");
  });

  /**
   * The other half: with no cycle *and* no holder, Assign would open a form the
   * service is certain to refuse — LAN-141 findings 2 and 4 meeting.
   */
  it("does not offer Assign for a seat whose operating year cannot take one", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        season: null,
        seasonWritable: false,
        groups: [
          {
            code: "coaching_staff",
            label: "Coaching Staff",
            roles: [
              catalogueRole({
                id: "role-head-coach",
                code: "head_coach",
                label: "Head Coach",
                scope: "season",
                cycleMissing: true,
                assignable: false,
              }),
            ],
          },
        ],
      }),
    );

    render(await RolesPage());

    expect(screen.queryAllByRole("link", { name: "Assign" })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "View" }).length).toBeGreaterThan(0);
  });

  /**
   * LAN-141 finding 8. `committee_years.ends_on` is exclusive, so a club that
   * closes one year the day before the next opens has a gap — and during it the
   * whole of Administration answered with an unavailable screen telling the
   * reader the year "has to be recorded first", from a page with no route in
   * the application to record one.
   */
  it("draws the club's seats during a gap between committee years", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(catalogue({ committeeYear: null }));

    const { container } = render(await RolesPage());

    expect(screen.queryByTestId("roles-unavailable")).toBeNull();
    expect(container.textContent).toContain("Clint Grohmann");
    expect(screen.getByTestId("admin-page-subtitle")).toHaveTextContent(
      "no committee year is recorded as running",
    );
  });
});

describe("one role's record", () => {
  it("presents the current holder, the permissions and the holder history", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByRole("heading", { name: "Current holder" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Permissions" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Holder history" })).toBeVisible();
  });

  it("keeps a deactivated holder as the holder, and says so", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        groups: [
          {
            code: "club_committee",
            label: "Club Committee",
            roles: [
              catalogueRole({
                holders: [
                  holder({
                    displayName: "Morgan Pike",
                    operatorState: "deactivated",
                    accessDeactivated: true,
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("holder")).toHaveTextContent("Morgan Pike");
    expect(screen.getByTestId("holder-deactivated")).toHaveTextContent("the seat is not vacant");
    expect(screen.queryByText(/^Not assigned/)).toBeNull();
  });

  /**
   * Role detail and the roles index answer the same question and must not
   * contradict each other. Brian found them doing exactly that: the index read
   * "Not assigned + Alwyn Cholmondley from 1 Sept 2026" while detail said
   * "Nobody holds this role", and Holder history said nothing was recorded at
   * all. Two of those three statements were false about the same seat.
   */
  it("names the successor on a vacant seat instead of denying one", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        groups: [
          {
            code: "club_committee",
            label: "Club Committee",
            roles: [
              catalogueRole({
                holders: [],
                scheduled: [
                  holder({
                    displayName: "Alwyn Cholmondley",
                    effectiveFrom: "2026-09-01",
                    scheduled: true,
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("scheduled-holder")).toHaveTextContent("Alwyn Cholmondley");
    expect(screen.getByTestId("current-holder")).toHaveTextContent("Not assigned");
    expect(screen.getByTestId("current-holder")).not.toHaveTextContent(/nobody is due to/i);
  });

  it("does not claim nothing is recorded when an assignment exists", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        groups: [
          {
            code: "club_committee",
            label: "Club Committee",
            roles: [
              catalogueRole({
                holders: [],
                scheduled: [
                  holder({
                    displayName: "Alwyn Cholmondley",
                    effectiveFrom: "2026-09-01",
                    scheduled: true,
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );
    vi.mocked(readHolderHistory).mockResolvedValue([]);

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("holder-history-empty")).not.toHaveTextContent(
      /Nothing has been recorded/i,
    );
  });

  it("shows a filled seat's scheduled end rather than an open-ended holder", async () => {
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        groups: [
          {
            code: "club_committee",
            label: "Club Committee",
            roles: [
              catalogueRole({
                holders: [
                  holder({
                    displayName: "Zenas Yaxlington",
                    effectiveFrom: "2026-08-20",
                    effectiveTo: "2026-08-27",
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("holder")).toHaveTextContent("Zenas Yaxlington");
    expect(screen.getByTestId("holder")).toHaveTextContent("27 Aug 2026");
  });

  it("offers Replace role and End role to a held seat", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByRole("button", { name: "Replace role" })).toBeVisible();
    expect(screen.getByRole("button", { name: "End role" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Assign role" })).toBeNull();
  });

  it("offers Assign role, and nothing else, to a vacant single-holder seat", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-kit-manager" })));

    expect(screen.getByRole("button", { name: "Assign role" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Replace role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "End role" })).toBeNull();
  });

  it("offers nothing the guard would refuse", async () => {
    vi.mocked(permittedRoleActions).mockResolvedValue({
      assign: false,
      replace: false,
      end: false,
    });

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("no-role-actions")).toBeVisible();
  });

  it("answers an unknown seat with not-found", async () => {
    await expect(RoleRecordPage(pageProps({ roleId: "role-nope" }))).rejects.toThrow("NOT_FOUND");
  });

  /**
   * `assignable`, on the page that actually offers the actions — LAN-141
   * finding F1's neighbours, from the independent review of PR #58.
   *
   * The Roles **index** was bound for this: "does not offer Assign for a seat
   * whose operating year cannot take one" above. Role detail was not, and it is
   * the surface with the form on it. Deleting `assignable &&` from either
   * `offered.assign` or `offered.replace` in `role-actions.tsx` passed all 3769
   * unit tests, which is to say the index's rule was proved and the detail
   * page's identical rule was assumed.
   *
   * What it costs is the defect LAN-141 finding 2 names in its other half: a
   * form the service is certain to refuse. `assignable` is false between
   * committee years and false for a season in `closing` — current to read,
   * closed to write — so the administrator would fill in a person, a date and a
   * reason, press Assign, and be told no by a guard, having been offered the
   * button by the page.
   */
  describe("a seat whose operating year cannot take a new assignment", () => {
    /** The one seat on the page, with a live holder and a closed cycle. */
    function withClosedCycle(overrides: Partial<CatalogueRole> = {}) {
      vi.mocked(readRoleCatalogue).mockResolvedValue(
        catalogue({
          season: null,
          seasonWritable: false,
          groups: [
            {
              code: "coaching_staff",
              label: "Coaching Staff",
              roles: [
                catalogueRole({
                  id: "role-head-coach",
                  code: "head_coach",
                  label: "Head Coach",
                  scope: "season",
                  cycleMissing: true,
                  assignable: false,
                  ...overrides,
                }),
              ],
            },
          ],
        }),
      );
    }

    it("does not offer Assign role, however permitted the administrator is", async () => {
      // Every action permitted, and a seat that admits several holders, so
      // nothing but `assignable` can be withholding the button.
      withClosedCycle({ admitsMultipleHolders: true });

      render(await RoleRecordPage(pageProps({ roleId: "role-head-coach" })));

      expect(screen.queryByRole("button", { name: "Assign role" })).toBeNull();
    });

    it("does not offer Replace role, and still offers End role", async () => {
      // One holder, so `holders.length === 1` is satisfied and `assignable` is
      // the only thing that can refuse Replace. End needs no cycle — it dates
      // an assignment that already hangs off one — so it must survive, or this
      // test would pass for the wrong reason.
      withClosedCycle({ holders: [holder({ displayName: "Zenas Yaxlington" })] });

      render(await RoleRecordPage(pageProps({ roleId: "role-head-coach" })));

      expect(screen.queryByRole("button", { name: "Replace role" })).toBeNull();
      expect(screen.getByRole("button", { name: "End role" })).toBeVisible();
    });

    /**
     * The sentence that replaces the buttons, and why it is not the other one.
     *
     * With no cycle and no holder there is nothing to offer, and the panel
     * falls through to its message. Two messages are possible and they say
     * opposite things: "there is nothing you can change" is about the
     * administrator's authority, and is wrong here — their authority is
     * complete, and the club has no operating year. Nothing asserted which of
     * the two appeared, so collapsing the ternary to the authority sentence
     * passed the whole suite.
     */
    it("explains that no operating year is running, not that nothing can be changed", async () => {
      withClosedCycle();

      render(await RoleRecordPage(pageProps({ roleId: "role-head-coach" })));

      const message = screen.getByTestId("no-role-actions");
      expect(message).toHaveTextContent(/no operating year running for this role/i);
      expect(message).toHaveTextContent(/Opening the year is not done here/i);
      expect(message).not.toHaveTextContent(/nothing you can change/i);
    });

    /**
     * The other side of the same ternary. With a cycle in force and no
     * permission, the authority sentence is the right one — so a fix that
     * simply hard-coded the operating-year sentence would be caught here as
     * well as by the case above.
     */
    it("still blames authority, not the calendar, when the year is running", async () => {
      vi.mocked(permittedRoleActions).mockResolvedValue({
        assign: false,
        replace: false,
        end: false,
      });

      render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

      const message = screen.getByTestId("no-role-actions");
      expect(message).toHaveTextContent(/nothing you can change/i);
      expect(message).not.toHaveTextContent(/no operating year running/i);
    });
  });

  /**
   * The scope-aware "no holder" sentence — LAN-141 finding 8, on role detail.
   *
   * `presentation.test.ts` binds the *index's* two sentences. This page writes
   * its own pair inline, and nothing read them: making both branches say "no
   * season under way" passed all 3769 unit tests. The ten committee seats hang
   * off the committee year and have nothing to do with the season, so a
   * Treasurer's page answering a question about the season is the finding's
   * exact complaint, reached on a second surface.
   */
  describe("a seat with no operating year and no holder", () => {
    function withMissingCycle(role: Partial<CatalogueRole>) {
      vi.mocked(readRoleCatalogue).mockResolvedValue(
        catalogue({
          committeeYear: null,
          season: null,
          seasonWritable: false,
          groups: [
            {
              code: "club_committee",
              label: "Club Committee",
              roles: [
                catalogueRole({
                  holders: [],
                  scheduled: [],
                  cycleMissing: true,
                  assignable: false,
                  ...role,
                }),
              ],
            },
          ],
        }),
      );
    }

    it("tells a committee seat about the committee year, not the season", async () => {
      withMissingCycle({
        id: "role-treasurer",
        code: "treasurer",
        label: "Treasurer",
        scope: "committee_year",
      });

      render(await RoleRecordPage(pageProps({ roleId: "role-treasurer" })));

      const panel = screen.getByTestId("current-holder");
      expect(panel).toHaveTextContent(/no committee year is recorded as running/i);
      expect(panel).not.toHaveTextContent(/season/i);
    });

    it("tells a coaching seat about the season, not the committee year", async () => {
      withMissingCycle({
        id: "role-head-coach",
        code: "head_coach",
        label: "Head Coach",
        scope: "season",
      });

      render(await RoleRecordPage(pageProps({ roleId: "role-head-coach" })));

      const panel = screen.getByTestId("current-holder");
      expect(panel).toHaveTextContent(/there is no season under way/i);
      expect(panel).not.toHaveTextContent(/committee year/i);
    });
  });

  /**
   * LAN-141 finding 10, on the page.
   *
   * `permissionsLine` is identical for the two strongest seats in the club,
   * because they hold the same nine grants. The panel is only able to tell them
   * apart if the *limits* reach it, and nothing rendered them.
   */
  it("tells the General Manager's Permissions panel apart from the President's", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));
    const president = screen.getByTestId("limits").textContent;
    cleanup();

    render(await RoleRecordPage(pageProps({ roleId: "role-gm" })));
    const generalManager = screen.getByTestId("limits").textContent;

    expect(president).toBeTruthy();
    expect(generalManager).toBeTruthy();
    expect(president).not.toBe(generalManager);
    expect(president).toContain("General Manager");
  });

  it("says nothing about limits on a seat that administers nothing", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-kit-manager" })));

    expect(screen.queryByTestId("limits")).toBeNull();
  });

  /**
   * LAN-141 finding 7. The service resolves the target's name through a
   * dedicated join and carries the role on every role event, and the panel
   * rendered neither — so **Holder history**, the panel whose whole purpose is
   * holders, named no holder, and the past holders it exists to record were
   * unrecoverable from it.
   */
  it("names the holder each entry of Holder history is about", async () => {
    vi.mocked(readHolderHistory).mockResolvedValue([
      historyEntry({
        action: "administration.role.assigned",
        label: "Role assigned",
        target: { personId: "p", operatorAccountId: "a", name: "Avery Fielding" },
        role: { id: "role-1", code: "president", assignmentId: "assignment-9" },
      }),
    ]);

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));

    expect(screen.getByTestId("holder-history")).toHaveTextContent("Avery Fielding");
  });

  /**
   * LAN-141 finding 2, on the form that offers the date.
   *
   * The end date and the assignment's start both default to today, and the
   * schema requires `effective_to > effective_from`, so a role given to the
   * wrong person this morning could not be undone today by any route — while
   * the helper text read "Leave blank to end it today". There is no delete, and
   * deactivating the account deliberately does not vacate the seat.
   */
  it("names the earliest usable end date instead of offering today", async () => {
    const today = todayInClubZone();
    vi.mocked(readRoleCatalogue).mockResolvedValue(
      catalogue({
        groups: [
          {
            code: "club_committee",
            label: "Club Committee",
            roles: [catalogueRole({ holders: [holder({ effectiveFrom: today })] })],
          },
        ],
      }),
    );

    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));
    fireEvent.click(screen.getByRole("button", { name: "End role" }));

    const field = screen.getByTestId("end-panel").querySelector('input[name="effectiveTo"]');
    if (!(field instanceof HTMLInputElement)) throw new Error("the end panel has no date field");

    const tomorrow = addClubDays(today, 1) as string;
    expect(field.min).toBe(tomorrow);
    expect(field.required).toBe(true);
    expect(field.value).toBe(tomorrow);
    expect(screen.getByTestId("end-panel")).toHaveTextContent(formatClubDay(tomorrow));
    expect(screen.getByTestId("end-panel")).not.toHaveTextContent("Leave blank to end it today");
  });

  it("still offers today when the assignment did not start today", async () => {
    render(await RoleRecordPage(pageProps({ roleId: "role-1" })));
    fireEvent.click(screen.getByRole("button", { name: "End role" }));

    const field = screen.getByTestId("end-panel").querySelector('input[name="effectiveTo"]');
    if (!(field instanceof HTMLInputElement)) throw new Error("the end panel has no date field");

    expect(field.required).toBe(false);
    expect(screen.getByTestId("end-panel")).toHaveTextContent("Leave blank to end it today");
  });

  /**
   * LAN-141 finding 15 — the one-result rule, on the screen with three panels.
   *
   * `outcome.test.tsx` proves the mechanism against synthetic panels, and
   * operator detail binds it to a real page. Roles detail was unbound, and the
   * defect it was unbound against is real: each of these panels runs **two**
   * actions, a search and a submit, and only the second was inside the slot. A
   * failed search therefore sat above a fresh confirmation with both reading as
   * current — Brian's original complaint, on the other screen.
   */
  it("clears a failed search once the assignment itself is submitted", async () => {
    vi.mocked(searchCandidatesAction).mockResolvedValue({
      ...EMPTY_ADMIN_ACTION_STATE,
      error: "That is not an address this search can use.",
    });
    vi.mocked(assignRoleAction).mockResolvedValue({
      ...EMPTY_ADMIN_ACTION_STATE,
      notice: "Kit Manager has been assigned.",
    });

    render(await RoleRecordPage(pageProps({ roleId: "role-kit-manager" })));
    fireEvent.click(screen.getByRole("button", { name: "Assign role" }));

    const panel = screen.getByTestId("assign-panel");
    const [searchForm, submitForm] = panel.querySelectorAll("form");
    fireEvent.submit(searchForm);
    expect(await screen.findByTestId("admin-error")).toHaveTextContent("not an address");

    fireEvent.submit(submitForm);

    expect(await screen.findByTestId("admin-notice")).toHaveTextContent("has been assigned");
    expect(screen.queryByTestId("admin-error")).toBeNull();
  });

  /**
   * The two rules that turn a correct refusal back into a step —
   * `docs/ux/standards.md` rules 4 and 5, and LAN133-BRIAN-8 before it.
   *
   * Both were implemented and neither was asserted anywhere: the `no-candidates`
   * alert and the `choose-somebody-first` caption could both be deleted whole
   * and all 3769 unit tests still passed. (The one `no-candidates` assertion in
   * the repository belongs to the events audience builder, which is a different
   * component with a different alert.)
   *
   * What they are worth is the difference between a rule and a broken page. The
   * constraint is real — a seat goes to somebody the club already holds a record
   * for — but stating it on a screen with no route to create that record, above
   * a submit button that can never enable, reads as a fault rather than as a
   * rule.
   */
  describe("a search that finds nobody", () => {
    /** Opens the assign panel with search terms typed, and runs the search. */
    async function searchFor(terms: { first?: string; last?: string; email?: string }) {
      vi.mocked(searchCandidatesAction).mockResolvedValue({
        ...EMPTY_ADMIN_ACTION_STATE,
        candidates: [],
      });

      render(await RoleRecordPage(pageProps({ roleId: "role-kit-manager" })));
      fireEvent.click(screen.getByRole("button", { name: "Assign role" }));

      const panel = screen.getByTestId("assign-panel");
      if (terms.first !== undefined) {
        fireEvent.change(screen.getByLabelText("First name"), { target: { value: terms.first } });
      }
      if (terms.last !== undefined) {
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: terms.last } });
      }
      if (terms.email !== undefined) {
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: terms.email } });
      }

      fireEvent.submit(panel.querySelectorAll("form")[0]);
      return panel;
    }

    it("names what was searched for, so the reader can see what it looked for", async () => {
      await searchFor({ first: "Marigold", last: "Ashgrovemoor" });

      const alert = await screen.findByTestId("no-candidates");
      expect(alert).toHaveTextContent("Marigold Ashgrovemoor");
      // The reason a near miss found nothing is the matching rule itself, and
      // saying it is what stops the reader retrying the same near miss.
      expect(alert).toHaveTextContent(/whole names and whole addresses/i);
    });

    it("keeps the typed terms on screen instead of blanking the form", async () => {
      // React resets a form after its action runs, which is right for a form
      // that submits something and wrong for one that asks something —
      // LAN133-BRIAN-7. Controlled inputs are what survive it, and without this
      // the result appeared under three blank fields.
      await searchFor({ first: "Marigold", last: "Ashgrovemoor" });
      await screen.findByTestId("no-candidates");

      expect(screen.getByLabelText("First name")).toHaveValue("Marigold");
      expect(screen.getByLabelText("Last name")).toHaveValue("Ashgrovemoor");
    });

    it("says 'those details' rather than nothing when the search was empty", async () => {
      await searchFor({});

      expect(await screen.findByTestId("no-candidates")).toHaveTextContent("those details");
    });

    it("offers the route that creates the missing record", async () => {
      await searchFor({ email: "marigold@lan141.example" });
      await screen.findByTestId("no-candidates");

      // The way out, not just the rule. Without it the screen states a
      // constraint and stops.
      const invite = screen.getByRole("link", { name: /invite them as an operator/i });
      expect(invite).toHaveAttribute("href", "/operate/admin/operators/new");
    });

    it("tells the disabled submit button what would enable it", async () => {
      const panel = await searchFor({ first: "Marigold" });
      await screen.findByTestId("no-candidates");

      expect(within(panel).getByRole("button", { name: "Assign role" })).toBeDisabled();
      expect(screen.getByTestId("choose-somebody-first")).toHaveTextContent(
        /find the person above and choose them/i,
      );
    });

    /**
     * The caption changes with the state, which is the half that makes it an
     * instruction rather than a slogan: once there are candidates the step is
     * choosing one, not searching again.
     */
    it("changes the sentence once there is somebody to choose", async () => {
      vi.mocked(searchCandidatesAction).mockResolvedValue({
        ...EMPTY_ADMIN_ACTION_STATE,
        candidates: [
          {
            personId: "cccccccc-1111-4111-8111-111111111111",
            name: "Marigold Ashgrovemoor",
            email: "marigold@lan141.example",
            phone: null,
            matchedOn: ["email"],
            operatorState: null,
            operatorAccountId: null,
          },
        ],
      });

      render(await RoleRecordPage(pageProps({ roleId: "role-kit-manager" })));
      fireEvent.click(screen.getByRole("button", { name: "Assign role" }));
      const panel = screen.getByTestId("assign-panel");
      fireEvent.submit(panel.querySelectorAll("form")[0]);

      expect(await screen.findByTestId("candidate-choice")).toBeVisible();
      expect(screen.queryByTestId("no-candidates")).toBeNull();
      expect(screen.getByTestId("choose-somebody-first")).toHaveTextContent(
        /choose the person above to enable this/i,
      );
      expect(screen.getByTestId("choose-somebody-first")).not.toHaveTextContent(/find the person/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Invitation
// ---------------------------------------------------------------------------

describe("the invitation flow", () => {
  it("asks for the person before it asks for anything else", async () => {
    render(await InviteOperatorPage());

    expect(screen.getByRole("button", { name: "Check for an existing person" })).toBeVisible();
    expect(screen.getByLabelText(/First name/)).toBeVisible();
    expect(screen.getByLabelText(/Last name/)).toBeVisible();
  });

  it("offers every catalogue seat, coaching included", async () => {
    render(await InviteOperatorPage());

    // The select's options are rendered on open; the underlying value list is
    // what matters here, and it comes from the catalogue reader.
    expect(vi.mocked(readRoleCatalogue)).toHaveBeenCalled();
    expect(screen.getByLabelText(/Role/)).toBeVisible();
  });

  it("never asks for the operating year", async () => {
    const { container } = render(await InviteOperatorPage());

    expect(container.textContent).not.toContain("Operating year");
    expect(container.textContent).toContain("the club’s current one");
  });
});
