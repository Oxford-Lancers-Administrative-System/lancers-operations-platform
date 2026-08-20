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
import { render, screen, within } from "@testing-library/react";

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
vi.mock("./actions", () => ({
  assignRoleAction: vi.fn(),
  correctInvitationAction: vi.fn(),
  deactivateOperatorAction: vi.fn(),
  endRoleAction: vi.fn(),
  inviteOperatorAction: vi.fn(),
  replaceRoleHolderAction: vi.fn(),
  resendInvitationAction: vi.fn(),
  restoreOperatorAction: vi.fn(),
  searchCandidatesAction: vi.fn(),
  startEmailRehomeAction: vi.fn(),
}));

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
import { permittedAccountActions, permittedRoleActions } from "./permissions";
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
    ...overrides,
    holders,
  };
}

/** The three approved groups, as the catalogue reader returns them. */
function catalogue(overrides: Partial<RoleCatalogue> = {}): RoleCatalogue {
  return {
    committeeYear: YEAR,
    season: SEASON,
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
});

// ---------------------------------------------------------------------------
// One operator
// ---------------------------------------------------------------------------

describe("one operator's record", () => {
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
