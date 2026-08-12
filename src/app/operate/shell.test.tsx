/**
 * The `/operate` shell and its account states — LAN-73, test-matrix rows 2, 3,
 * 4, 13, 14 and 16.
 *
 * ## The copy is asserted literally, character for character
 *
 * Both account-state sentences are owner-approved wording (LAN-107, 12 August
 * 2026), reproduced here as literals rather than imported from the component.
 * Importing the string the component renders would assert only that a variable
 * equals itself; the point is that the *approved* words are the ones on screen,
 * including the typographic apostrophe in "You’re".
 *
 * ## What "renders no data" is taken to mean
 *
 * Not "shows no data visibly" — contains none. The assertions read
 * `container.innerHTML`, so a role code in a data attribute, a name in a hidden
 * element or an email in a title fails them just as a visible one would. A
 * server-rendered page ships its DOM to the browser; anything in it is
 * disclosed whether or not it is painted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real `redirect` throws to unwind the render; mirroring that keeps the
    // control flow under test honest rather than letting it fall through.
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/roster",
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../login/actions", () => ({ signOut: vi.fn() }));

import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import OperateLayout from "./layout";
import OperatePage from "./page";
import RosterPage from "./roster/page";
import EventsPage from "./events/page";
import ReportPage from "./report/page";

/** The approved unlinked copy — UX-03, `slice-ux.md` § 8. */
const UNLINKED_COPY =
  "You’re signed in, but this account is not connected to a Lancers operator profile. " +
  "Contact the club administrator and provide the email address you used to sign in.";

/** The approved inactive copy — UX-04, `slice-ux.md` § 8. */
const INACTIVE_COPY =
  "Your Lancers operator access is inactive. Contact the club administrator if you " +
  "believe access should be restored.";

const ROLE_CODES = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "it_officer",
  "general_manager",
  "head_coach",
  "offence_coach",
  "defence_coach",
];

function actor(roleCodes: string[], displayName = "Rowan Ashdown"): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName,
    roleCodes,
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function layoutProps(children: React.ReactNode) {
  return { children } as unknown as LayoutProps<"/operate">;
}

/** Text with runs of whitespace collapsed, so wrapping cannot break a match. */
function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("row 2 — the unlinked account state (UX-03)", () => {
  it("renders the approved sentence exactly", async () => {
    givenAccess({ state: "unlinked" });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(flatten(container.textContent)).toContain(UNLINKED_COPY);
    expect(screen.getByRole("heading", { name: "Operator profile not connected" })).toBeVisible();
  });

  it("never falls through to the shell", async () => {
    givenAccess({ state: "unlinked" });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    // The page element is not rendered at all — not hidden, not styled away.
    expect(container.textContent).not.toContain("shell content");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: "Roster" })).toBeNull();
  });

  it("offers signing out, and nothing else", async () => {
    givenAccess({ state: "unlinked" });

    render(await OperateLayout(layoutProps(null)));

    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("is reached from a deep destination too, not only from /operate", async () => {
    givenAccess({ state: "unlinked" });

    const { container } = render(await RosterPage());

    expect(flatten(container.textContent)).toContain(UNLINKED_COPY);
    expect(container.textContent).not.toContain("not built yet");
  });
});

describe("row 3 — the inactive account state (UX-04)", () => {
  it("renders the approved sentence exactly", async () => {
    givenAccess({ state: "inactive" });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(flatten(container.textContent)).toContain(INACTIVE_COPY);
    expect(screen.getByRole("heading", { name: "Operator access inactive" })).toBeVisible();
  });

  it("is a different message from the unlinked one, not a shared euphemism", async () => {
    givenAccess({ state: "unlinked" });
    const unlinked = flatten(render(await OperateLayout(layoutProps(null))).container.textContent);

    givenAccess({ state: "inactive" });
    const inactive = flatten(render(await OperateLayout(layoutProps(null))).container.textContent);

    expect(unlinked).not.toBe(inactive);
    // Each says the thing the other must not: one is about connecting an
    // account, the other about restoring access already granted.
    expect(unlinked).toContain("not connected to a Lancers operator profile");
    expect(inactive).toContain("access should be restored");
    expect(unlinked).not.toContain("restored");
    expect(inactive).not.toContain("not connected");
  });

  it("denies the shell exactly as the unlinked state does", async () => {
    givenAccess({ state: "inactive" });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(container.textContent).not.toContain("shell content");
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("row 4 — neither account state leaks anything", () => {
  it.each(["unlinked", "inactive"] as const)(
    "%s exposes no role code anywhere in the DOM",
    async (state) => {
      givenAccess({ state });

      const { container } = render(await OperateLayout(layoutProps(null)));
      const html = container.innerHTML.toLowerCase();

      for (const code of ROLE_CODES) {
        expect(html).not.toContain(code);
      }
      // Nor the human labels for them.
      for (const label of [
        "president",
        "secretary",
        "treasurer",
        "head coach",
        "general manager",
      ]) {
        expect(html).not.toContain(label);
      }
    },
  );

  it.each(["unlinked", "inactive"] as const)(
    "%s names no person and no contact detail",
    async (state) => {
      givenAccess({ state });

      const { container } = render(await OperateLayout(layoutProps(null)));
      const html = container.innerHTML;
      const text = flatten(container.textContent);

      expect(html).not.toContain("Rowan");
      expect(html).not.toContain("@");
      // A phone number is checked against the rendered text rather than the
      // markup: MUI's icons are inline SVG, and their path coordinates are digits
      // that no reader ever sees.
      expect(text).not.toMatch(/\+?\d[\d\s-]{7,}/);
      // The administrator is referred to, never named — a name would be a
      // contact detail about somebody who did not ask to be published.
      expect(text).not.toMatch(/administrator[^.]*\b[A-Z][a-z]+ [A-Z][a-z]+/);
    },
  );

  it.each(["unlinked", "inactive"] as const)("%s carries no id of any kind", async (state) => {
    givenAccess({ state });

    const { container } = render(await OperateLayout(layoutProps(null)));

    expect(container.innerHTML).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("says the same thing whichever page the person asked for", async () => {
    givenAccess({ state: "inactive" });
    const atRoster = render(await RosterPage()).container.innerHTML;

    givenAccess({ state: "inactive" });
    const atEvents = render(await EventsPage()).container.innerHTML;

    expect(atRoster).toBe(atEvents);
  });
});

describe("row 13 — the shell for an authorized operator (UX-02)", () => {
  it("shows Roster, Events and Report, and no Home destination", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    render(await OperateLayout(layoutProps(<p>destination content</p>)));

    expect(screen.getByRole("link", { name: "Roster" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Events" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Report" })).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /home/i })).toBeNull();
  });

  it("renders the destination inside the shell", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    const { container } = render(await OperateLayout(layoutProps(<p>destination content</p>)));

    expect(container.textContent).toContain("destination content");
  });

  it("opens on the first permitted destination rather than a Home page", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    await expect(OperatePage()).rejects.toThrow("REDIRECT:/operate/roster");
  });

  it("opens on the same first destination for an operator holding no role", async () => {
    // Roster is an ordinary operator surface, so an unroled operator still has
    // somewhere to land. The shell is not role-gated; the actions are.
    givenAccess({ state: "active", operator: actor([]) });

    await expect(OperatePage()).rejects.toThrow("REDIRECT:/operate/roster");
  });

  it("shows the same three destinations to an operator who holds no role", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    render(await OperateLayout(layoutProps(null)));

    // Navigation visibility is not authorization, in either direction.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("names the signed-in operator, and lists none of their roles", async () => {
    givenAccess({ state: "active", operator: actor(["president", "it_officer"]) });

    const { container } = render(await OperateLayout(layoutProps(null)));

    expect(container.textContent).toContain("Rowan Ashdown");
    expect(container.innerHTML.toLowerCase()).not.toContain("it_officer");
    expect(container.innerHTML.toLowerCase()).not.toContain("president");
  });

  it("renders the empty destinations for any active operator", async () => {
    givenAccess({ state: "active", operator: actor([]) });
    expect(render(await RosterPage()).container.textContent).toContain("Roster");

    givenAccess({ state: "active", operator: actor([]) });
    expect(render(await EventsPage()).container.textContent).toContain("Events");
  });
});

describe("row 14 — an operator with no relevant role is refused, and told what is needed", () => {
  it("refuses the report destination and names the requirement (UX-05)", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const { container } = render(await ReportPage());

    expect(
      screen.getByRole("heading", { name: "You do not have access to this action" }),
    ).toBeVisible();
    expect(flatten(container.textContent)).toContain(
      "Your operator profile is active, but your current role assignments do not permit this action.",
    );
    // The requirement, not the holdings.
    expect(container.textContent).toContain("No club role is currently authorized");
    expect(container.textContent).not.toContain("not built yet");
  });

  it("refuses the President too, because nobody holds the report capability yet", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    const { container } = render(await ReportPage());

    expect(container.textContent).toContain("You do not have access to this action");
  });

  it("is a refusal, not a 404 and not a silent no-op", async () => {
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    const { container } = render(await ReportPage());

    expect(container.textContent).toContain("You do not have access to this action");
    expect(container.textContent).not.toMatch(/not found|404/i);
  });

  it("does not say who does hold the missing role", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    const { container } = render(await ReportPage());
    const text = flatten(container.textContent);

    expect(text).not.toMatch(/held by|ask the|contact the president|the president can/i);
    expect(container.innerHTML.toLowerCase()).not.toContain("secretary");
  });

  it("offers a way back to somewhere the operator can actually go", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    render(await ReportPage());

    const back = screen.getByRole("link", { name: "Return to an authorized area" });
    expect(back).toHaveAttribute("href", "/operate/roster");
  });
});

describe("row 1 — no session reaches nothing, from the layout or from any page", () => {
  it("redirects the layout to the login page", async () => {
    givenAccess({ state: "no_session" });

    await expect(OperateLayout(layoutProps(null))).rejects.toThrow(
      "REDIRECT:/login?redirectTo=/operate",
    );
  });

  it.each([
    [RosterPage, "%2Foperate%2Froster"],
    [EventsPage, "%2Foperate%2Fevents"],
    [ReportPage, "%2Foperate%2Freport"],
  ])("redirects a page to the login page, keeping where it was going", async (page, encoded) => {
    givenAccess({ state: "no_session" });

    await expect(page()).rejects.toThrow(`REDIRECT:/login?redirectTo=${encoded}`);
  });
});

describe("row 6 — the refusal screen names the requirement, never the reader's roles", () => {
  it("renders none of the roles the refused operator actually holds", async () => {
    // The screen builds its requirement from the capability, not from the
    // actor, and this is what holds it to that. A UX-05 that helpfully listed
    // "your roles: it_officer, kit_manager" would tell whoever has the session
    // exactly what the account is worth.
    const held = ["it_officer", "social_secretary", "kit_manager", "head_coach"];
    givenAccess({ state: "active", operator: actor(held) });

    const { container } = render(await ReportPage());
    const html = container.innerHTML.toLowerCase();

    for (const code of held) {
      expect(html, `the refusal screen names "${code}"`).not.toContain(code);
    }
    for (const label of ["it officer", "social secretary", "kit manager", "head coach"]) {
      expect(html, `the refusal screen names "${label}"`).not.toContain(label);
    }
    // Non-vacuous: this really is the refusal, and it really does say what is
    // required.
    expect(container.textContent).toContain("You do not have access to this action");
    expect(container.textContent).toContain("No club role is currently authorized");
  });
});
