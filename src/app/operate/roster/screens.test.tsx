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
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/roster", () => ({
  findMembershipSummary: vi.fn(),
  findPersonCandidates: vi.fn(),
  enterReturningPlayer: vi.fn(),
}));
vi.mock("../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("./new/actions", async () => {
  const actual = await vi.importActual<typeof import("./new/actions")>("./new/actions");
  return { ...actual, submitReturnerIntake: vi.fn() };
});

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import {
  findMembershipSummary,
  type MembershipSummary,
  type PersonCandidate,
} from "@/lib/services/roster";
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
  familyName: "Fielding",
  givenName: "Avery",
  knownAs: "Avery",
  email: "avery.fielding@example.invalid",
  phone: "+44 7700 900101",
};

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(OPERATOR);
});

// ---------------------------------------------------------------------------

describe("UX-10 — Add returning player", () => {
  beforeEach(async () => {
    await renderIntakeAt({
      step: "details",
      values: { familyName: "", givenName: "", knownAs: "", email: "", phone: "" },
      errors: {},
    });
  });

  it("shows the approved heading and body", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Add returning player");
    expect(
      screen.getByText(
        "Enter the returning person’s details. A duplicate check runs before anything is written.",
      ),
    ).toBeInTheDocument();
  });

  it("carries the promise that nothing is written yet", () => {
    expect(screen.getByTestId("no-write-promise")).toHaveTextContent(
      "No person or membership is created until a candidate is selected or the operator " +
        "explicitly confirms this is a new person.",
    );
  });

  it("has all five fields, each with a real label", () => {
    for (const label of ["Family name", "Given name", "Known as", "Email", "Phone"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("fixes the entry marker to Returning", () => {
    expect(screen.getByTestId("entry-marker")).toHaveTextContent("Returning (fixed)");
    // Not a control: the operator does not get to choose the entry marker in
    // this slice, so there is nothing to change it with.
    expect(screen.queryByLabelText("Entry marker")).not.toBeInTheDocument();
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
      errors: { givenName: "Enter a given name. It is the one name the club always has." },
    });

    const givenName = screen.getByLabelText("Given name");
    expect(givenName).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Enter a given name. It is the one name the club always has."),
    ).toBeInTheDocument();
    // Nothing else the operator typed was thrown away.
    expect(screen.getByLabelText("Family name")).toHaveValue("Fielding");
    expect(screen.getByLabelText("Email")).toHaveValue("avery.fielding@example.invalid");
  });
});

// ---------------------------------------------------------------------------

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

  it("shows each candidate's current-season membership, including at phone width", () => {
    const candidates = screen.getAllByTestId("candidate");
    expect(candidates[0]).toHaveTextContent("No membership");
    // The field that decides whether selecting this person will be refused is
    // never the one dropped to make a narrow layout fit.
    expect(within(candidates[1]).getByTestId("candidate-has-membership")).toHaveTextContent(
      "Already a member",
    );
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
    expect(
      screen.getByText(
        "The write is refused before any person, contact method or membership is changed.",
      ),
    ).toBeInTheDocument();
  });

  it("offers both approved recovery actions", () => {
    expect(screen.getByRole("link", { name: "Open current membership" })).toHaveAttribute(
      "href",
      "/operate/roster/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(screen.getByRole("button", { name: "Back to candidate review" })).toBeInTheDocument();
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
        seasonLabel: null,
        membershipId: null,
      },
    });

    expect(screen.getByTestId("refusal-message")).toHaveTextContent(
      "This person already has a membership for the 2026-27 season.",
    );
    // With no membership to open, that action is not offered at all.
    expect(screen.queryByRole("link", { name: "Open current membership" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to candidate review" })).toBeInTheDocument();
  });
});

const SUMMARY: MembershipSummary = {
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  givenName: "Avery",
  familyName: "Fielding",
  knownAs: "Avery",
  status: "confirmed",
  entry: "returning",
  seasonLabel: "2026-27",
  confirmedOn: "2026-08-12",
  contacts: [
    { kind: "email", rawValue: "avery.fielding@example.invalid", isPreferred: true },
    { kind: "phone", rawValue: "+44 7700 900101", isPreferred: true },
  ],
  createdBy: { name: "Morgan Pike", occurredAt: new Date("2026-08-12T13:36:00Z") },
};

async function renderMembership(created: boolean, summary: MembershipSummary | null = SUMMARY) {
  vi.mocked(findMembershipSummary).mockResolvedValue(summary);
  return render(
    await MembershipPage({
      params: Promise.resolve({ membershipId: SUMMARY.membershipId }),
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
    expect(screen.getByText("Created by Morgan Pike")).toBeInTheDocument();
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

  it("uses the approved action labels", () => {
    expect(screen.getByRole("link", { name: "View membership" })).toHaveAttribute(
      "href",
      `/operate/roster/${SUMMARY.membershipId}`,
    );
    expect(screen.getByRole("link", { name: "Back to roster" })).toHaveAttribute(
      "href",
      "/operate/roster",
    );
  });
});

describe("the membership route without the confirmation", () => {
  it("drops the success state and leads with the person's name", async () => {
    await renderMembership(false);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Avery Fielding");
    expect(screen.queryByTestId("created-summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View membership" })).not.toBeInTheDocument();
  });

  it("says when a supplied contact did not become the preferred one", async () => {
    await renderMembership(false, {
      ...SUMMARY,
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
      for (const label of ["Family name", "Given name", "Known as", "Email", "Phone"]) {
        expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      }
      expect(screen.queryByRole("button", { name: "Check for matches" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("entry-marker")).not.toBeInTheDocument();
    });

    it(`shows ${label} no membership record at all`, async () => {
      signedInAs(access);
      vi.mocked(findMembershipSummary).mockResolvedValue(SUMMARY);

      const { container } = render(
        await MembershipPage({
          params: Promise.resolve({ membershipId: SUMMARY.membershipId }),
          searchParams: Promise.resolve({ created: "1" }),
        } as Parameters<typeof MembershipPage>[0]),
      );

      // Not merely unpainted — absent from the DOM the browser receives.
      for (const secret of [
        "Avery",
        "Fielding",
        "avery.fielding@example.invalid",
        "+44 7700 900101",
        SUMMARY.personId,
      ]) {
        expect(container.innerHTML).not.toContain(secret);
      }
      // And the record was never even read.
      expect(findMembershipSummary).not.toHaveBeenCalled();
    });
  }

  it("sends a request with no session to the sign-in page, preserving the route", async () => {
    signedInAs({ state: "no_session" });

    await expect(NewReturnerPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Froster%2Fnew",
    );
  });
});
