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
  // The events list's filter bar navigates rather than submitting a form; it is
  // rendered here only as part of the destination.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
// LAN-76 filled the Events destination in. These assertions are about the
// shell — the gate, the account states and the navigation — so the list's data
// access is stubbed rather than exercised here; `src/app/operate/events/` owns
// its own suites, against the real database.
vi.mock("@/lib/services/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/events")>()),
  listCurrentSeasonEvents: vi.fn(async () => ({
    season: { id: "season", label: "2026-27", status: "active" },
    events: [],
    totalInSeason: 0,
  })),
}));
// LAN-75 filled the Roster destination in, on the same terms.
vi.mock("@/lib/services/membership", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/membership")>()),
  listCurrentSeasonRoster: vi.fn(async () => ({
    season: { id: "season", label: "2026-27", status: "active" },
    entries: [],
    totalInSeason: 0,
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../login/actions", () => ({ signOut: vi.fn() }));

import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { listCurrentSeasonEvents, type EventListEntry } from "@/lib/services/events";
import { londonToday, shiftDays } from "./events/coach-event-buckets";
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

/** The events list reads its filters from the query string; here there are none. */
function eventsProps() {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events">;
}

function rosterProps() {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/roster">;
}

/** Text with runs of whitespace collapsed, so wrapping cannot break a match. */
function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** One event, as the coach's list receives it from the service. */
function eventEntry(
  id: string,
  name: string,
  scheduledOn: string,
  status: EventListEntry["status"] = "occurred",
): EventListEntry {
  return {
    id,
    name,
    eventType: "practice",
    status,
    scheduledOn,
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
  };
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

    const { container } = render(await RosterPage(rosterProps()));

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
    const atRoster = render(await RosterPage(rosterProps())).container.innerHTML;

    givenAccess({ state: "inactive" });
    const atEvents = render(await EventsPage(eventsProps())).container.innerHTML;

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

  it("renders each destination for any active operator", async () => {
    givenAccess({ state: "active", operator: actor([]) });
    expect(render(await RosterPage(rosterProps())).container.textContent).toContain("Roster");

    givenAccess({ state: "active", operator: actor([]) });
    expect(render(await EventsPage(eventsProps())).container.textContent).toContain("Events");
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
    [() => RosterPage(rosterProps()), "%2Foperate%2Froster"],
    [() => EventsPage(eventsProps()), "%2Foperate%2Fevents"],
    [() => ReportPage(), "%2Foperate%2Freport"],
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
    // required. LAN-110 changed *which* requirement — this actor's only
    // capability-bearing seat is a coaching one, so they are a narrow
    // attendance recorder and the Report destination is not theirs for that
    // reason rather than because nobody holds the report grant. The property
    // under test is unchanged and is the assertions above: whichever refusal
    // appears, it names no seat the reader holds.
    expect(container.textContent).toContain("You do not have access to this action");
    expect(container.textContent).toContain(
      "Attendance recording is the only operator surface open to a coaching assignment",
    );
  });

  it("names the empty grant, and no role, for a non-coaching operator", async () => {
    // The same property on the other path: an operator with seats that carry no
    // capability at all reaches Report's empty grant, and that refusal must be
    // just as silent about what they hold.
    const held = ["it_officer", "social_secretary", "kit_manager"];
    givenAccess({ state: "active", operator: actor(held) });

    const { container } = render(await ReportPage());
    const html = container.innerHTML.toLowerCase();

    for (const label of ["it_officer", "it officer", "social secretary", "kit manager"]) {
      expect(html, `the refusal screen names "${label}"`).not.toContain(label);
    }
    expect(container.textContent).toContain("No club role is currently authorized");
  });
});

/**
 * The shell's shape at each breakpoint — the defect Brian found by signing in
 * and looking, which every test in this file was blind to.
 *
 * The sidebar had `maxHeight: { md: "100dvh" }` and `alignSelf: { md:
 * "flex-start" }` and no floor, so the dark panel stopped at the end of its
 * three navigation items and left a column of white beneath it down the whole
 * left-hand side. Nothing here failed, because nothing here looked at layout.
 *
 * **What this test is, and what it is not.** jsdom applies no layout: it does
 * not know the viewport is 960px wide, does not evaluate media queries, and
 * computes no box for anything. So this reads the CSS Emotion actually emitted
 * for the element and asserts the declarations inside each breakpoint's block.
 * That makes it a regression guard on the *declared* style — it would have
 * caught this defect and will catch it coming back — and it is **not** proof
 * that the rendered page looks right. Only a person on a real screen can say
 * that, which is precisely how this was found.
 *
 * One trap worth naming, because falling into it would make the whole thing
 * decorative: `max-height:100dvh` **contains** the substring `height:100dvh`.
 * An assertion written with `toContain` would have passed against the broken
 * code. Every height assertion below is anchored to a declaration boundary.
 */
describe("row 16 — the shell's declared shape at each breakpoint", () => {
  /** Every rule Emotion has written into the document, as text. */
  function allStyleText(): string {
    return Array.from(document.querySelectorAll("style"))
      .map((tag) => tag.textContent ?? "")
      .join("\n");
  }

  function emotionClassOf(element: Element): string {
    const found = Array.from(element.classList).find((name) => name.startsWith("css-"));
    if (!found) throw new Error(`no Emotion class on <${element.tagName.toLowerCase()}>`);
    return found;
  }

  /**
   * The declarations this element gets at a breakpoint. `minWidth: null` means
   * the unconditional block. Returns every matching block joined, because
   * Emotion is free to split one `sx` across several.
   */
  function declarationsAt(element: Element, minWidth: number | null): string {
    const css = allStyleText();
    const cls = emotionClassOf(element);
    const selector = `\\.${cls}\\{([^}]*)\\}`;
    const pattern =
      minWidth === null
        ? new RegExp(`(?:^|\\n)${selector}`, "g")
        : new RegExp(`@media \\(min-width:${minWidth}px\\)\\{${selector}`, "g");

    const blocks = [...css.matchAll(pattern)].map((match) => match[1]);
    if (blocks.length === 0) {
      throw new Error(
        `no ${minWidth === null ? "base" : `min-width:${minWidth}px`} rule found for .${cls} — ` +
          "the test cannot assert anything about a block it did not find",
      );
    }
    return blocks.join(";");
  }

  /** `height:100dvh` as a declaration, never as the tail of `max-height:`. */
  function declares(declarations: string, property: string, value: string): boolean {
    return new RegExp(`(^|;)\\s*(-webkit-|-ms-)?${property}:\\s*${value}\\s*(;|$)`).test(
      declarations,
    );
  }

  async function renderShell() {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
    const { container } = render(await OperateLayout(layoutProps(<p>destination</p>)));
    return {
      nav: container.querySelector("nav")!,
      main: container.querySelector("main")!,
    };
  }

  it("gives the desktop sidebar a full viewport of height, not a ceiling", async () => {
    const { nav } = await renderShell();
    const desktop = declarationsAt(nav, 900);

    // The floor. Without it the panel collapses to its content and the rest of
    // the column is white — which is the whole of this defect.
    expect(declares(desktop, "height", "100dvh"), `md declarations were: ${desktop}`).toBe(true);
  });

  it("keeps the desktop sidebar sticky at the top, and out of the stretch", async () => {
    const { nav } = await renderShell();
    const desktop = declarationsAt(nav, 900);

    // Sticky and full-height have to hold together: the layout's flex parent
    // stretches its children, and a stretched item fills a container taller
    // than the viewport, leaving sticky nothing to do.
    expect(declares(desktop, "position", "sticky")).toBe(true);
    expect(declares(desktop, "top", "0")).toBe(true);
    expect(declares(desktop, "align-self", "flex-start")).toBe(true);
    expect(declares(desktop, "width", "226px")).toBe(true);
  });

  it("lets a short desktop viewport scroll the sidebar rather than clip it", async () => {
    const { nav } = await renderShell();

    expect(declares(declarationsAt(nav, 900), "overflow-y", "auto")).toBe(true);
  });

  it("leaves the phone bottom bar exactly as it was", async () => {
    const { nav } = await renderShell();
    const phone = declarationsAt(nav, 0);

    expect(declares(phone, "position", "fixed")).toBe(true);
    expect(declares(phone, "bottom", "0")).toBe(true);
    expect(declares(phone, "width", "100%")).toBe(true);
    // A bottom bar is as tall as its content. A full-height panel at 375px
    // would be a dark screen with three links on it.
    expect(declares(phone, "height", "100dvh")).toBe(false);
    expect(declares(phone, "align-self", "flex-start")).toBe(false);
  });

  it("keeps the phone main column clear of the fixed bottom bar", async () => {
    const { main } = await renderShell();

    // 12 spacing units. If this goes, the last line of every page sits under
    // the navigation and cannot be scrolled into view.
    expect(declares(declarationsAt(main, 0), "padding-bottom", "96px")).toBe(true);
    expect(declares(declarationsAt(main, 900), "padding-bottom", "32px")).toBe(true);
  });

  it("does not let the main column squeeze the sidebar or overflow sideways", async () => {
    const { main } = await renderShell();
    const base = declarationsAt(main, null);

    // `min-width: 0` on a flex child is what stops a wide table pushing the
    // whole layout past the viewport and producing horizontal scrolling.
    expect(declares(base, "min-width", "0")).toBe(true);
    expect(declares(base, "flex-grow", "1")).toBe(true);
  });
});

/**
 * The coach shell — LAN-110, and `slice-ux.md` § 3: an active Head Coach, OC or
 * DC assignment "receives only the occurred-event attendance surface. No
 * general operator navigation, roster editing, event administration, delivery,
 * report, contact, RSVP-reason, or availability data is exposed."
 *
 * The refusals below are the load-bearing half. Navigation is a courtesy — the
 * assertions that matter are that a coach who *types* `/operate/roster` gets a
 * refusal and no roster, which is what "hidden navigation or controls are not
 * an authorization boundary" means in LAN-110's own words.
 */
describe("LAN-110 — the coach shell", () => {
  const COACH = ["head_coach"];

  // `vi.clearAllMocks()` clears calls but keeps implementations, so a
  // `mockResolvedValue` set in one test here would leak into the next. Put the
  // empty default back before each.
  beforeEach(() => {
    vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
      season: { id: "season", label: "2026-27", status: "active" },
      events: [],
      totalInSeason: 0,
    });
  });

  it("shows one destination, and none of the operator's three", async () => {
    givenAccess({ state: "active", operator: actor(COACH, "Casey North") });

    render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(screen.getByRole("link", { name: /Attendance/ })).toBeVisible();
    for (const label of ["Roster", "Events", "Report"]) {
      expect(screen.queryByRole("link", { name: label }), label).toBeNull();
    }
  });

  it("captions the sidebar with the seat held, not with 'Authorized operator'", async () => {
    givenAccess({ state: "active", operator: actor(COACH, "Casey North") });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(flatten(container.textContent)).toContain("Head Coach");
    expect(container.textContent).not.toContain("Authorized operator");
    // UX-91's sidebar heading. The coach's shell is not "Operations".
    expect(flatten(container.textContent)).toContain("Attendance");
  });

  it("says which events the destination holds", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    const { container } = render(await OperateLayout(layoutProps(<p>shell content</p>)));

    expect(flatten(container.textContent)).toContain("This season's sessions");
  });

  it("keeps the operator shell intact for everybody else", async () => {
    // The narrowing must reach exactly one actor. A Secretary who also coaches
    // is not that actor.
    givenAccess({ state: "active", operator: actor(["secretary", "head_coach"]) });

    render(await OperateLayout(layoutProps(<p>shell content</p>)));

    for (const label of ["Roster", "Events", "Report"]) {
      expect(screen.getByRole("link", { name: label }), label).toBeVisible();
    }
  });

  it("refuses the roster, and renders none of it", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    const { container } = render(await RosterPage(rosterProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(flatten(container.textContent)).toContain(
      "Attendance recording is the only operator surface open to a coaching assignment",
    );
    expect(screen.queryByTestId("roster-row")).toBeNull();
    expect(container.textContent).not.toContain("2026-27");
  });

  it("refuses the report", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    render(await ReportPage());

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
  });

  it("sends the refused coach to their own destination, never to one that refuses again", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    render(await RosterPage(rosterProps()));

    const back = screen.getByRole("link", { name: "Return to an authorized area" });
    expect(back).toHaveAttribute("href", "/operate/events");
  });

  it("opens the shell on the attendance destination", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    // § 3: "the shell opens the first destination permitted by the operator's
    // capability map" — which for a coach is the only one they have.
    await expect(OperatePage()).rejects.toThrow("REDIRECT:/operate/events");
  });

  it("gives the coach the eligible-events list, not the club calendar", async () => {
    givenAccess({ state: "active", operator: actor(COACH) });

    const { container } = render(await EventsPage(eventsProps()));

    expect(screen.getByTestId("coach-eligible-events")).toBeVisible();
    // No create, no status filter, no audience or response columns.
    expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
    expect(container.textContent).not.toContain("Audience");
    expect(flatten(container.textContent)).toContain("This season's sessions");
  });

  it("looks forward: Upcoming first, then Earlier, with today drawn out", async () => {
    // Brian, 14 August 2026: "We should be looking forward… anything before
    // today is just Earlier. That's it."
    const today = londonToday();
    vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
      season: { id: "season", label: "2026-27", status: "active" },
      events: [
        eventEntry("today-practice", "Practice", today, "occurred"),
        eventEntry("next-week", "S&C", shiftDays(today, 5), "approved"),
        eventEntry("last-week", "Varsity", shiftDays(today, -3), "occurred"),
      ],
      totalInSeason: 3,
    });
    givenAccess({ state: "active", operator: actor(COACH) });

    const { container } = render(await EventsPage(eventsProps()));

    const sections = [...container.querySelectorAll("[data-testid^='coach-events-section-']")];
    expect(sections.map((node) => node.getAttribute("data-testid"))).toEqual([
      "coach-events-section-upcoming",
      "coach-events-section-earlier",
    ]);

    // Today is badged and sits at the top of Upcoming, not in a section of its
    // own — Upcoming holds the rest of the season behind it.
    const upcoming = [
      ...screen
        .getByTestId("coach-events-section-upcoming")
        .querySelectorAll("[data-testid='coach-event-row']"),
    ];
    expect(upcoming[0]).toHaveAttribute("data-today", "true");
    expect(upcoming[0].textContent).toContain("Today");
    expect(upcoming[1]).toHaveAttribute("data-today", "false");
  });

  it("says on the card when a register cannot be opened yet", async () => {
    // A coach who taps three sessions looking for a register they can fill in
    // has learned nothing except that the list is unreliable.
    const today = londonToday();
    vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
      season: { id: "season", label: "2026-27", status: "active" },
      events: [
        eventEntry("open", "Practice", today, "occurred"),
        eventEntry("not-yet", "S&C", shiftDays(today, 2), "approved"),
      ],
      totalInSeason: 2,
    });
    givenAccess({ state: "active", operator: actor(COACH) });

    render(await EventsPage(eventsProps()));

    expect(screen.getAllByTestId("coach-event-not-open")).toHaveLength(1);
    expect(screen.getByTestId("coach-event-not-open").textContent).toBe("Attendance not open");
  });

  it("draws no heading for a section with nothing in it", async () => {
    // A club practises for eight months and then stops for the summer.
    vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
      season: { id: "season", label: "2026-27", status: "active" },
      events: [eventEntry("long-ago", "Varsity", shiftDays(londonToday(), -60), "occurred")],
      totalInSeason: 1,
    });
    givenAccess({ state: "active", operator: actor(COACH) });

    render(await EventsPage(eventsProps()));

    expect(screen.queryByTestId("coach-events-section-upcoming")).toBeNull();
    expect(screen.getByTestId("coach-events-section-earlier")).toBeVisible();
  });

  it("shows no draft, cancelled or not-held session, whatever the query string says", async () => {
    // No status comes from the URL, so `?status=draft` cannot show a coach a
    // draft; and the visible set is decided in coach-event-buckets.ts.
    const today = londonToday();
    vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
      season: { id: "season", label: "2026-27", status: "active" },
      events: [
        eventEntry("draft", "A draft nobody approved", today, "draft"),
        eventEntry("cancelled", "A cancelled fixture", today, "cancelled"),
        eventEntry("not-held", "A washed-out practice", shiftDays(today, -1), "not_held"),
        eventEntry("real", "Practice", today, "occurred"),
      ],
      totalInSeason: 4,
    });
    givenAccess({ state: "active", operator: actor(COACH) });

    const { container } = render(
      await EventsPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ status: "draft" }),
      } as unknown as PageProps<"/operate/events">),
    );

    expect(screen.getAllByTestId("coach-event-row")).toHaveLength(1);
    expect(container.textContent).toContain("Practice");
    expect(container.textContent).not.toContain("A draft nobody approved");
    expect(container.textContent).not.toContain("A cancelled fixture");
    expect(container.textContent).not.toContain("A washed-out practice");
  });

  it("still gives an ordinary operator the club calendar", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    render(await EventsPage(eventsProps()));

    expect(screen.queryByTestId("coach-eligible-events")).toBeNull();
    expect(screen.getByTestId("season-label")).toBeVisible();
  });
});
