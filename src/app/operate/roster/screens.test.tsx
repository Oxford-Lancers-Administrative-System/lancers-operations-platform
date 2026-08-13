/**
 * The four approved screens — UX-10, UX-11, UX-12 and UX-13. LAN-74, matrix
 * row 11.
 *
 * ## Labels are asserted as literals
 *
 * The approved contract requires that "primary and secondary actions use the
 * exact approved labels shown in the wireframes", so those labels appear here
 * as strings rather than as imports from the components. Importing the string
 * the component renders would assert only that a variable equals itself; what
 * needs proving is that the *approved* words are the ones on screen.
 *
 * ## "No inaccessible data" is taken to mean "not in the DOM"
 *
 * Not "not painted". The unauthorized assertions read `container.innerHTML`, so
 * a name in a hidden input or a membership id in a data attribute fails them
 * exactly as a visible one would. A server-rendered page ships its DOM; whatever
 * is in it is disclosed.
 *
 * ## What this file CANNOT see, and must not be trusted for
 *
 * **Layout.** jsdom does not evaluate MUI breakpoints, so an `sx` of
 * `{ display: { xs: "none", md: "block" } }` renders here exactly like one that
 * shows at every width. Hiding the current-season indicator on phone — the one
 * field `CandidateRow` is documented as never allowed to drop, because it is
 * what tells the operator whether their selection will be refused — passes
 * every assertion below. That was demonstrated by injection, not assumed.
 *
 * So this file covers **copy, labels, states, field presence and the
 * unauthorized DOM**. It does not cover the responsive contract, and LAN-74's
 * "every field is reachable and submittable at 375px" is not evidenced here or
 * anywhere else automated. It needs a human at 375px, or a browser-driven test
 * this repository does not have yet.
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
  usePathname: () => "/operate/roster/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/roster", () => ({
  findPersonCandidates: vi.fn(),
  enterReturningPlayer: vi.fn(),
}));
// LAN-75 moved the membership record onto its own service. UX-13 is still the
// same screen at the same route; only where it reads from has changed.
vi.mock("@/lib/services/membership", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/membership")>(
    "@/lib/services/membership",
  );
  return { ...actual, readMembership: vi.fn() };
});
vi.mock("../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("./new/actions", async () => {
  const actual = await vi.importActual<typeof import("./new/actions")>("./new/actions");
  return { ...actual, submitReturnerIntake: vi.fn() };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { type PersonCandidate } from "@/lib/services/roster";
import { readMembership, type MembershipRecord } from "@/lib/services/membership";
import { submitReturnerIntake } from "./new/actions";
import type { IntakeState } from "./new/intake-state";
import NewReturnerPage from "./new/page";
import MembershipPage from "./[membershipId]/page";

/**
 * An operator holding no club role at all — the weakest actor these screens
 * must still serve, because returner intake is an ordinary operator action.
 */
const OPERATOR: OperatorAccess = {
  state: "active",
  operator: {
    authUserId: "00000000-1111-4111-8111-111111111111",
    personId: "11111111-1111-4111-8111-111111111111",
    displayName: "Morgan Pike",
    roleCodes: [],
    isActive: true,
  },
};

function signedInAs(access: OperatorAccess): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

/**
 * Renders the intake form already showing `state`.
 *
 * `useActionState` starts from the initial state and only moves when the action
 * returns, so the mocked action is made to return the state under test and the
 * form is submitted once to get there. That exercises the real component, the
 * real `useActionState` wiring and the real form, rather than a step component
 * lifted out of its context for the convenience of the test.
 */
async function renderIntakeAt(state: IntakeState) {
  vi.mocked(submitReturnerIntake).mockResolvedValue(state);
  const result = render(await NewReturnerPage());

  const alreadyThere =
    state.step === "details" && Object.keys(state.errors).length === 0 && !state.formError;
  if (alreadyThere) return result;

  // `act` flushes the action's promise and the re-render it causes. Without it
  // the assertions run against the pristine form and every one of them passes
  // or fails for the wrong reason.
  await act(async () => {
    fireEvent.submit(result.container.querySelector("form")!);
  });

  return result;
}

/**
 * Asserts a 44px minimum on every named action currently on screen.
 *
 * Buttons and links are looked up separately because MUI renders an `href`
 * action as an anchor, and a helper that only checked one role would silently
 * skip every navigation action — which is most of them on UX-12 and UX-13.
 */
function expectTouchTargets(buttons: string[], links: string[] = []): void {
  for (const name of buttons) {
    expect(
      screen.getByRole("button", { name }),
      `"${name}" has no touch-target minimum`,
    ).toHaveStyle({ minHeight: "44px" });
  }
  for (const name of links) {
    expect(screen.getByRole("link", { name }), `"${name}" has no touch-target minimum`).toHaveStyle(
      { minHeight: "44px" },
    );
  }
}

const CANDIDATES: PersonCandidate[] = [
  {
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    givenName: "Avery",
    familyName: "Fielding",
    knownAs: "Avery",
    email: "avery.fielding@example.invalid",
    phone: "+44 7700 900101",
    currentMembership: null,
    matchedOn: ["given name", "email"],
  },
  {
    // The case this issue exists for: a first-name-only record.
    personId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    givenName: "Ari",
    familyName: null,
    knownAs: null,
    email: null,
    phone: null,
    currentMembership: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "active",
      seasonLabel: "2026-27",
    },
    matchedOn: ["given name"],
  },
];

const VALUES = {
  givenName: "Avery",
  familyName: "Fielding",
  email: "avery.fielding@example.invalid",
  phone: "+44 7700 900101",
};

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(OPERATOR);
});

// ---------------------------------------------------------------------------

describe("UX-10 — Add player", () => {
  beforeEach(async () => {
    await renderIntakeAt({
      step: "details",
      values: { givenName: "", familyName: "", email: "", phone: "" },
      errors: {},
    });
  });

  it("shows the approved heading and body", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Add player");
    expect(
      screen.getByText(
        "Enter the person’s details. A duplicate check runs before anything is written.",
      ),
    ).toBeInTheDocument();
  });

  it("does not lecture the operator about when writes happen", () => {
    // The wireframe's info strip is deliberately gone (Brian, 12 August 2026).
    // The behaviour it described is still true and still enforced — see
    // `actions.test.ts`, which proves no write happens before an explicit
    // decision — but it is not narrated on screen.
    expect(screen.queryByTestId("no-write-promise")).not.toBeInTheDocument();
    expect(screen.queryByText(/No person or membership is created until/)).not.toBeInTheDocument();
  });

  it("has exactly four fields, in the approved order", () => {
    const labels = ["First name", "Last name", "Email", "Phone"];
    for (const label of labels) expect(screen.getByLabelText(label)).toBeInTheDocument();

    // Order is part of the decision, not an accident of the markup.
    const rendered = screen.getAllByRole("textbox").map((input) => input.getAttribute("name"));
    expect(rendered).toEqual(["givenName", "familyName", "email", "phone"]);
  });

  it("does not ask for a nickname", () => {
    // Removed on Brian's instruction: "not a good way to talk about it". The
    // service still accepts a `knownAs` for imports; this form never sends one,
    // so intake writes no `person_aliases` row.
    expect(screen.queryByLabelText("Known as")).not.toBeInTheDocument();
  });

  it("shows no entry-marker chip", () => {
    // "Entry marker: Returning (fixed)" named an internal value the operator
    // could neither change nor interpret. The membership is still written with
    // `entry = 'returning'` — proved in `roster.test.ts` — and UX-13 states it
    // in words. Brian, 12 August 2026.
    expect(screen.queryByTestId("entry-marker")).not.toBeInTheDocument();
    expect(screen.queryByText(/Entry marker/)).not.toBeInTheDocument();
  });

  it("uses the approved action labels", () => {
    expect(screen.getByRole("button", { name: "Check for matches" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/operate/roster");
  });
});

describe("UX-10 — validation state", () => {
  it("shows the message against the field and keeps what was typed", async () => {
    await renderIntakeAt({
      step: "details",
      values: { ...VALUES, givenName: "" },
      errors: { givenName: "Enter a first name. It is the one name the club always has." },
    });

    const givenName = screen.getByLabelText("First name");
    expect(givenName).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Enter a first name. It is the one name the club always has."),
    ).toBeInTheDocument();
    // Nothing else the operator typed was thrown away.
    expect(screen.getByLabelText("Last name")).toHaveValue("Fielding");
    expect(screen.getByLabelText("Email")).toHaveValue("avery.fielding@example.invalid");
  });
});

// ---------------------------------------------------------------------------

describe("UX-10 — the accessibility claims the ticket makes", () => {
  // The UX-conformance checklist in docs/ux/tickets/LAN-74-returner-intake.md
  // asserts three things: real labels, focus moved to the first invalid
  // control, and a 44px minimum on the actions. Two of them were asserted by
  // nothing — removing the focus call, or dropping the touch target to 1px,
  // left the whole suite green. A checklist row that claims evidence has to
  // have some.

  it("moves focus to the first invalid control", async () => {
    await renderIntakeAt({
      step: "details",
      values: { ...VALUES, givenName: "" },
      errors: { givenName: "Enter a first name. It is the one name the club always has." },
    });

    expect(screen.getByLabelText("First name")).toHaveFocus();
  });

  it("focuses the field that is wrong, not simply the first field", async () => {
    // A component that focused the top of the form would pass the test above.
    await renderIntakeAt({
      step: "details",
      values: { ...VALUES, email: "no-at-sign" },
      errors: { email: "This does not look like an email address." },
    });

    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("First name")).not.toHaveFocus();
  });

  it("associates each error with its own field", async () => {
    await renderIntakeAt({
      step: "details",
      values: { ...VALUES, email: "no-at-sign" },
      errors: { email: "This does not look like an email address." },
    });

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");

    // The message is reachable from the field, not merely present on the page.
    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy, "the invalid field must point at its message").toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "This does not look like an email address.",
    );

    // And a valid field is not marked invalid.
    expect(screen.getByLabelText("First name")).toHaveAttribute("aria-invalid", "false");
  });

  it("gives every action on UX-10 a touch target big enough to hit on a phone", async () => {
    await renderIntakeAt({
      step: "details",
      values: { givenName: "", familyName: "", email: "", phone: "" },
      errors: {},
    });

    // Every action, not one. Asserting a single button let the other six lose
    // their target silently — which injection confirmed.
    //
    // jsdom does not lay out, so this reads the value each component asked for
    // rather than a measured box. That is the honest limit: it catches the
    // target being dropped, not the layout being wrong.
    expectTouchTargets(["Check for matches"], ["Cancel"]);
  });
});

describe("UX-11 — Review possible matches", () => {
  beforeEach(async () => {
    await renderIntakeAt({ step: "candidates", values: VALUES, candidates: CANDIDATES });
  });

  it("shows the approved heading, count and note", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Review possible matches");
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "2 people match the supplied names or contact details.",
    );
    expect(
      screen.getByText(
        "The operator must make an explicit choice. The system never silently merges or " +
          "silently creates a person.",
      ),
    ).toBeInTheDocument();
  });

  it("offers both explicit decisions, with the approved labels", () => {
    expect(screen.getByRole("button", { name: "Use selected person" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm this is a new person" }),
    ).toBeInTheDocument();
  });

  it("selects nobody by default", () => {
    // A pre-selected candidate would be the system making the choice.
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("shows the first-name-only candidate and says the surname is missing", () => {
    const candidates = screen.getAllByTestId("candidate");
    expect(candidates).toHaveLength(2);
    expect(candidates[1]).toHaveTextContent("Ari");
    expect(candidates[1]).toHaveTextContent("(no family name on record)");
  });

  // Named for what it actually proves. jsdom does not evaluate breakpoints, so
  // no test in this file can assert "at phone width" — see the header.
  it("shows each candidate's current-season membership, the field it must never drop", () => {
    const candidates = screen.getAllByTestId("candidate");
    expect(candidates[0]).toHaveTextContent("No membership");
    // The field that decides whether selecting this person will be refused is
    // never the one dropped to make a narrow layout fit.
    expect(within(candidates[1]).getByTestId("candidate-has-membership")).toHaveTextContent(
      "Already a member",
    );
  });

  it("gives every action and the candidate radio a usable touch target", () => {
    expectTouchTargets(["Use selected person", "Confirm this is a new person", "Back to details"]);
    // The radio is the primary selection control on this screen and had no
    // minimum at all.
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("span"), "a candidate radio has no touch target").toHaveStyle({
        minHeight: "44px",
      });
    }
  });

  it("says why each candidate surfaced", () => {
    expect(screen.getAllByTestId("candidate")[0]).toHaveTextContent("Matched on given name, email");
  });

  it("keeps the operator's typed values for the next submission", () => {
    const form = screen.getByRole("button", { name: "Use selected person" }).closest("form");
    const hidden = form!.querySelectorAll('input[type="hidden"]');
    const carried = Object.fromEntries(
      Array.from(hidden).map((input) => [input.getAttribute("name"), input.getAttribute("value")]),
    );
    expect(carried).toMatchObject(VALUES);
  });
});

describe("UX-11 — nothing matched", () => {
  beforeEach(async () => {
    await renderIntakeAt({ step: "candidates", values: VALUES, candidates: [] });
  });

  it("still demands an explicit confirmation rather than creating", () => {
    expect(screen.getByTestId("candidate-count")).toHaveTextContent(
      "No existing person matches the supplied names or contact details.",
    );
    expect(
      screen.getByRole("button", { name: "Confirm this is a new person" }),
    ).toBeInTheDocument();
    // Nothing to select, so the selection action is not offered at all.
    expect(screen.queryByRole("button", { name: "Use selected person" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("UX-12 — already a member this season", () => {
  beforeEach(async () => {
    await renderIntakeAt({
      step: "membership_refused",
      values: VALUES,
      candidates: CANDIDATES,
      refusal: {
        message:
          "This person already has a membership for the 2026-27 season. " +
          "No duplicate membership was created, and nothing else was changed.",
        personName: "Ari Fielding",
        personGivenName: "Ari",
        seasonLabel: "2026-27",
        membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    });
  });

  it("shows the approved heading and states that nothing was written", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This person already has a current-season membership",
    );
    // The approved UX-12 body copy names the person and the season, in that
    // order — "Avery Fielding is already a member for the 2026–27 season. No
    // duplicate membership was created." Asserting only the tail of that
    // sentence is how the shipped screen managed to name nobody at all.
    expect(screen.getByTestId("refusal-message")).toHaveTextContent(
      "Ari Fielding is already a member for the 2026-27 season. " +
        "No duplicate membership was created.",
    );
    // The wireframe's warning strip is gone: the heading and sentence already
    // say it, and an alert made a normal outcome look like a fault.
    expect(
      screen.queryByText(
        "The write is refused before any person, contact method or membership is changed.",
      ),
    ).not.toBeInTheDocument();
  });

  it("names the person in the action that goes to them, and offers a plain way back", () => {
    expect(screen.getByRole("link", { name: "View Ari’s roster entry" })).toHaveAttribute(
      "href",
      "/operate/roster/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to candidate review" }),
    ).not.toBeInTheDocument();
  });

  it("gives both recovery actions a usable touch target", () => {
    expectTouchTargets(["Go back"], ["View Ari\u2019s roster entry"]);
  });

  it("shows a sentence an operator can act on, not a database error", () => {
    const message = screen.getByTestId("refusal-message").textContent ?? "";
    expect(message).not.toMatch(/duplicate key|violates|constraint|SQLSTATE|23505/i);
  });
});

// ---------------------------------------------------------------------------

describe("UX-12 — when the refused person is no longer a candidate", () => {
  it("falls back to the service's own sentence rather than a blank", async () => {
    // The composed sentence needs a season label, and that only comes from the
    // candidate list. When the refused person has dropped out of it, the
    // operator must still get a sentence.
    await renderIntakeAt({
      step: "membership_refused",
      values: VALUES,
      candidates: [],
      refusal: {
        message: "This person already has a membership for the 2026-27 season.",
        personName: "Ari Fielding",
        personGivenName: "Ari",
        seasonLabel: null,
        membershipId: null,
      },
    });

    expect(screen.getByTestId("refusal-message")).toHaveTextContent(
      "This person already has a membership for the 2026-27 season.",
    );
    // With no membership to open, that action is not offered at all.
    expect(screen.queryByRole("link", { name: /roster entry/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });
});

/**
 * The membership UX-13 confirms, as the record service returns it.
 *
 * LAN-75 replaced `findMembershipSummary` with `readMembership`, which returns
 * the whole record rather than the confirmation's slice of it. "Created by" now
 * comes from the first row of the typed status history rather than a separate
 * lateral join — the same fact, read from the table that owns it.
 */
const MEMBERSHIP: MembershipRecord = {
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  givenName: "Avery",
  familyName: "Fielding",
  knownAs: "Avery",
  displayName: "Avery Fielding",
  status: "confirmed",
  entry: "returning",
  seasonId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  seasonLabel: "2026-27",
  confirmedOn: "2026-08-12",
  activatedOn: null,
  inactivityLabel: null,
  contacts: [
    { kind: "email", rawValue: "avery.fielding@example.invalid", isPreferred: true },
    { kind: "phone", rawValue: "+44 7700 900101", isPreferred: true },
  ],
  onboardingItems: [],
  outstandingRequired: [],
  statusHistory: [
    {
      fromStatus: null,
      toStatus: "carried_forward",
      occurredAt: new Date("2026-08-12T13:36:00Z"),
      actorName: "Morgan Pike",
      actorLabel: null,
      reason: null,
    },
  ],
};

async function renderMembership(
  created: boolean,
  membership: MembershipRecord | null = MEMBERSHIP,
) {
  if (membership === null) {
    vi.mocked(readMembership).mockRejectedValue(
      new NotFound("That membership no longer exists.", { rule: "season_memberships_not_found" }),
    );
  } else {
    vi.mocked(readMembership).mockResolvedValue(membership);
  }
  return render(
    await MembershipPage({
      params: Promise.resolve({ membershipId: MEMBERSHIP.membershipId }),
      searchParams: Promise.resolve(created ? { created: "1" } : {}),
    } as Parameters<typeof MembershipPage>[0]),
  );
}

describe("UX-13 — Returning player added", () => {
  beforeEach(async () => {
    await renderMembership(true);
  });

  it("shows the approved heading and subtitle", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Returning player added");
    expect(screen.getByTestId("created-summary")).toHaveTextContent(
      "Person and 2026-27 membership were created together.",
    );
  });

  it("identifies the person, membership, contact and actor", () => {
    expect(screen.getByText("Avery Fielding")).toBeInTheDocument();
    expect(screen.getByText("Known as Avery")).toBeInTheDocument();
    expect(screen.getByText("2026-27 · Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Entry: Returning")).toBeInTheDocument();
    // The actor is still named, in the status-history panel rather than in a
    // second "Audit" block beside the membership. Brian's verdict on the real
    // screen was that audit appeared twice and belonged at the bottom only, so
    // the duplicate went and this assertion follows it rather than being
    // dropped — UX-13 still has to say who created the membership.
    expect(
      within(screen.getByTestId("status-history")).getByText(/Morgan Pike/),
    ).toBeInTheDocument();
  });

  it("shows contact values exactly as they were recorded", () => {
    expect(screen.getByText("avery.fielding@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("+44 7700 900101")).toBeInTheDocument();
    expect(screen.getByText(/Raw contact values are retained as entered/)).toBeInTheDocument();
  });

  it("formats the time in a fixed locale and zone", () => {
    // Not `toLocaleString()` with no arguments: server and client would disagree
    // on any machine not set to en-GB/London, which is a hydration mismatch and
    // a date that reads as American to a club in Oxford.
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-08-12T13:36:00.000Z");
    expect(time).toHaveTextContent("12 Aug 2026, 14:36");
  });

  it("gives its one exit a usable touch target", () => {
    expectTouchTargets([], ["Back to roster"]);
  });

  it("offers exactly one exit", () => {
    // "View membership" led to this same page with the banner dismissed, which
    // is nowhere the operator could tell. Brian, 12 August 2026.
    expect(screen.getByRole("link", { name: "Back to roster" })).toHaveAttribute(
      "href",
      "/operate/roster",
    );
    expect(screen.queryByRole("link", { name: "View membership" })).not.toBeInTheDocument();
  });
});

describe("the membership route without the confirmation", () => {
  it("drops the success state and leads with the person's name", async () => {
    await renderMembership(false);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.queryByTestId("created-summary")).not.toBeInTheDocument();
  });

  it("says when a supplied contact did not become the preferred one", async () => {
    await renderMembership(false, {
      ...MEMBERSHIP,
      contacts: [{ kind: "phone", rawValue: "07700 900999", isPreferred: false }],
    });

    expect(screen.getByText(/the existing preferred phone was left unchanged/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("an operator who may not be here", () => {
  const denied: { label: string; access: OperatorAccess }[] = [
    { label: "unlinked", access: { state: "unlinked" } },
    { label: "deactivated", access: { state: "inactive" } },
  ];

  for (const { label, access } of denied) {
    it(`shows ${label} the account state and no intake form`, async () => {
      signedInAs(access);
      render(await NewReturnerPage());

      // The account-state screen has a sign-out form of its own, so the
      // assertion is that none of the *intake* controls exist — not that no
      // form does.
      for (const label of ["First name", "Last name", "Email", "Phone"]) {
        expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      }
      expect(screen.queryByRole("button", { name: "Check for matches" })).not.toBeInTheDocument();
    });

    it(`shows ${label} no membership record at all`, async () => {
      signedInAs(access);
      vi.mocked(readMembership).mockResolvedValue(MEMBERSHIP);

      const { container } = render(
        await MembershipPage({
          params: Promise.resolve({ membershipId: MEMBERSHIP.membershipId }),
          searchParams: Promise.resolve({ created: "1" }),
        } as Parameters<typeof MembershipPage>[0]),
      );

      // Not merely unpainted — absent from the DOM the browser receives.
      for (const secret of [
        "Avery",
        "Fielding",
        "avery.fielding@example.invalid",
        "+44 7700 900101",
        MEMBERSHIP.personId,
      ]) {
        expect(container.innerHTML).not.toContain(secret);
      }
      // And the record was never even read.
      expect(readMembership).not.toHaveBeenCalled();
    });
  }

  it("sends a request with no session to the sign-in page, preserving the route", async () => {
    signedInAs({ state: "no_session" });

    await expect(NewReturnerPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Froster%2Fnew",
    );
  });
});
