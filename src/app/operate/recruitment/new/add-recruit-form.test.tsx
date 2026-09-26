// @vitest-environment jsdom
/**
 * `AddRecruitForm` — V-1 and V-10, correction round 2.
 *
 * `./actions` is mocked at the boundary (the same posture
 * `record-view.test.tsx` already uses for this door's sibling record) —
 * `actions.test.ts` already proves the server action's own logic against a
 * mocked service layer, and `recruitment-add.test.ts` proves the writes
 * against the real database. What this file proves is the form itself:
 * inline validation renders and blocks submission before any round trip,
 * and the one authorised explanatory paragraph is on the page.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({ submitAddRecruit: vi.fn() }));

import { submitAddRecruit } from "./actions";
import { INITIAL_ADD_RECRUIT_STATE } from "./create-state";
import AddRecruitForm from "./add-recruit-form";
import { redactRecruitCandidates } from "@/lib/services/person-candidate-access";
import { mergeGrantRows } from "@/lib/auth/grants";

describe("V-1, correction round 2 — inline phone and email validation", () => {
  it("shows no format error and an enabled Check button before anything is typed", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    expect(screen.getByTestId("add-recruit-check")).not.toBeDisabled();
    expect(screen.queryByTestId("add-recruit-format-invalid")).toBeNull();
  });

  it("shows an inline error and disables Check for duplicates the moment a malformed number is typed — never only after pressing it", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const mobile = screen.getByTestId("mobile-field").querySelector("input") as HTMLInputElement;
    await user.type(mobile, "93939");

    expect(
      screen.getByText(/is not the right number of digits|has no country code/i),
    ).not.toBeNull();
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
  });

  it("shows an inline error for a malformed email, using the shared validator's own message", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const email = screen
      .getByTestId("personal-email-field")
      .querySelector("input") as HTMLInputElement;
    await user.type(email, "not-an-email");

    expect(screen.getByText(/does not look like an email address/i)).not.toBeNull();
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
  });

  /**
   * LAN-275 correction round 1, F1. The college email was validated inline but
   * left out of the aggregate that disables the two submit controls, so a
   * non-Oxford address turned the field red and still let the operator press
   * Check for duplicates / Create — V-1 says both.
   *
   * `Create` only exists once the duplicate check has answered, so the check is
   * driven first (the action is mocked, and answers with an empty candidate
   * list) to bring that button onto the page before the bad value goes in.
   *
   * The fields are filled with `fireEvent.change` rather than `user.type`: this
   * test has to put a value into four fields before it can even start, and
   * typing them a character at a time re-renders the whole form on every
   * keystroke — enough to run past the 5s test timeout on a loaded CI runner,
   * which is exactly how it first failed. What is under test is what the form
   * does with a value, not how the value arrives.
   */
  it("disables both Check for duplicates and Create for a non-Oxford college email", async () => {
    vi.mocked(submitAddRecruit).mockResolvedValue({
      ...INITIAL_ADD_RECRUIT_STATE,
      candidates: [],
    });
    render(<AddRecruitForm seasonLabel="2026-27" />);

    // The browser's own constraint validation refuses to submit a form with an
    // empty required field, so all four required fields get a valid value
    // first; the malformed one goes in afterwards.
    const named = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    const inside = (testId: string) =>
      screen.getByTestId(testId).querySelector("input") as HTMLInputElement;
    const collegeEmail = inside("college-email-field");

    fireEvent.change(named("givenName"), { target: { value: "Ada" } });
    fireEvent.change(named("familyName"), { target: { value: "Nkemelu" } });
    fireEvent.change(inside("mobile-field"), { target: { value: "07700 900461" } });
    // LAN-389: the confirm box under the number is required the moment a
    // number is typed, and the form will not submit until the two agree.
    fireEvent.change(inside("mobile-field-confirm"), { target: { value: "07700 900461" } });
    fireEvent.change(collegeEmail, { target: { value: "ada.nkemelu@balliol.ox.ac.uk" } });

    fireEvent.click(screen.getByTestId("add-recruit-check"));
    const create = await screen.findByTestId("add-recruit-create");
    expect(create).not.toBeDisabled();

    fireEvent.change(collegeEmail, { target: { value: "someone@gmail.com" } });

    expect(screen.getByTestId("add-recruit-format-invalid").textContent).toContain(
      "Correct the field marked in red",
    );
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();
    expect(screen.getByTestId("add-recruit-create")).toBeDisabled();
  });

  it("clears the error and re-enables Check once the number is corrected", async () => {
    const user = userEvent.setup();
    render(<AddRecruitForm seasonLabel="2026-27" />);

    const mobile = screen.getByTestId("mobile-field").querySelector("input") as HTMLInputElement;
    await user.type(mobile, "93939");
    expect(screen.getByTestId("add-recruit-check")).toBeDisabled();

    await user.clear(mobile);
    await user.type(mobile, "07700 900461");
    expect(screen.getByTestId("add-recruit-check")).not.toBeDisabled();
  });
});

describe("V-10, correction round 2 — the opt-in evidence explains itself", () => {
  it("carries the explanatory paragraph and the plain-language labels, not the old unexplained ones", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    expect(screen.getByTestId("opt-in-explanation").textContent).toMatch(/why we ask/i);
    expect(screen.getByLabelText("How did their contact details reach you?")).not.toBeNull();
    expect(screen.getByLabelText(/Describe how, in your own words/i)).not.toBeNull();
    expect(screen.queryByLabelText("How we came by this number")).toBeNull();
    expect(screen.queryByLabelText("In your own words")).toBeNull();
  });
});

describe("V-2, correction round 2 — the widened field set", () => {
  it("offers Known as, expected graduation, degree, date of birth and the emergency contact, all optional", () => {
    render(<AddRecruitForm seasonLabel="2026-27" />);
    for (const label of [
      "Known as",
      "Expected graduation",
      "Degree field",
      "Date of birth",
      "First name", // inside the Emergency contact subsection, alongside "Who they are"'s own
      "Relationship",
      "Phone",
      "Email",
    ]) {
      expect(screen.getAllByLabelText(new RegExp(`^${label}`)).length).toBeGreaterThan(0);
    }
    // None of the widened fields carry MUI's `required` marker.
    expect(screen.getByLabelText("Known as")).not.toBeRequired();
  });
});

/**
 * LAN-389, entry points 3 and 4 of 10 (Clint, 2026-09-17). Two numbers on one
 * form — the recruit's own and their emergency contact's — and each confirms
 * itself independently.
 */
describe("the confirm boxes on Add recruit", () => {
  const inside = (testId: string) =>
    screen.getByTestId(testId).querySelector("input") as HTMLInputElement;

  function fillRequired() {
    const named = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    fireEvent.change(named("givenName"), { target: { value: "Ada" } });
    fireEvent.change(named("familyName"), { target: { value: "Nkemelu" } });
    fireEvent.change(inside("college-email-field"), {
      target: { value: "ada.nkemelu@balliol.ox.ac.uk" },
    });
  }

  it("refuses a mismatched mobile, and checks nothing", async () => {
    vi.mocked(submitAddRecruit).mockClear();
    const { container } = render(<AddRecruitForm seasonLabel="2026-27" />);
    fillRequired();

    fireEvent.change(inside("mobile-field"), { target: { value: "07700900461" } });
    fireEvent.change(inside("mobile-field-confirm"), { target: { value: "07700900416" } });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitAddRecruit).not.toHaveBeenCalled();
    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
  });

  it("refuses a mismatched emergency contact phone, and checks nothing", async () => {
    vi.mocked(submitAddRecruit).mockClear();
    const { container } = render(<AddRecruitForm seasonLabel="2026-27" />);
    fillRequired();

    fireEvent.change(inside("mobile-field"), { target: { value: "07700900461" } });
    fireEvent.change(inside("mobile-field-confirm"), { target: { value: "07700900461" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "07700900777" } });
    fireEvent.change(screen.getByLabelText(/^Confirm phone/), {
      target: { value: "07700900778" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitAddRecruit).not.toHaveBeenCalled();
    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
  });

  it("posts both numbers once both are confirmed, and neither confirm value", async () => {
    vi.mocked(submitAddRecruit).mockClear();
    vi.mocked(submitAddRecruit).mockResolvedValue({
      ...INITIAL_ADD_RECRUIT_STATE,
      candidates: [],
    });
    const { container } = render(<AddRecruitForm seasonLabel="2026-27" />);
    fillRequired();

    fireEvent.change(inside("mobile-field"), { target: { value: "07700900461" } });
    fireEvent.change(inside("mobile-field-confirm"), { target: { value: "07700900461" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "07700900777" } });
    fireEvent.change(screen.getByLabelText(/^Confirm phone/), {
      target: { value: "07700900777" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitAddRecruit).toHaveBeenCalled();
    const posted = vi.mocked(submitAddRecruit).mock.calls[0][1];
    expect(posted.get("mobile")).toBe("+447700900461");
    expect(posted.get("emergencyPhone")).toBe("+447700900777");
    expect([...posted.keys()].filter((key) => key.toLowerCase().includes("confirm"))).toEqual([]);
  });
});

// LAN-423 fix round 3, H1: Add recruit is opened by a switch, so its match
// list is narrowed to the seat's grants on the server. The HTML a switch-only
// seat receives carries the name and why it matched, and no contact or status.
describe("the duplicate check, to a seat holding the switch and nothing else", () => {
  const FULL = [
    {
      personId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      givenName: "Corwin",
      familyName: "Vellacott",
      displayAlias: null,
      displayName: "Corwin Vellacott",
      currentEmails: ["corwin.vellacott@ashridge.ox.ac.example"],
      currentPhones: ["+447700900999"],
      matchedOn: ["phone" as const],
      identity: { kind: "player" as const, membershipStatus: "active", seasonLabel: "2026-27" },
    },
  ];
  const SWITCH_ONLY = mergeGrantRows([
    { subject_kind: "switch", subject_key: "add_recruits", template_id: null, level: "yes" },
  ]);
  const WITH_PERSON = mergeGrantRows([
    { subject_kind: "switch", subject_key: "add_recruits", template_id: null, level: "yes" },
    {
      subject_kind: "recruiting_category",
      subject_key: "recruit_person",
      template_id: null,
      level: "view",
    },
    {
      subject_kind: "roster_category",
      subject_key: "membership",
      template_id: null,
      level: "view",
    },
  ]);

  async function checkedWith(grants: typeof SWITCH_ONLY) {
    vi.mocked(submitAddRecruit).mockResolvedValue({
      ...INITIAL_ADD_RECRUIT_STATE,
      candidates: redactRecruitCandidates(FULL, grants),
    });
    const { container } = render(<AddRecruitForm seasonLabel="2026-27" />);
    fireEvent.click(screen.getByTestId("add-recruit-check"));
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    await screen.findByText("Corwin Vellacott");
    return container.innerHTML;
  }

  it("draws the name and the match reason, and no email, phone or membership status", async () => {
    const html = await checkedWith(SWITCH_ONLY);

    expect(html).toContain("Corwin Vellacott");
    expect(html).toContain("matched phone");
    expect(html).not.toContain("corwin.vellacott@ashridge.ox.ac.example");
    expect(html).not.toContain("900999");
    expect(html).not.toContain("Active");
    // Still usable for its purpose.
    expect(screen.getByRole("button", { name: "This is them" })).toBeTruthy();
  });

  it("draws them to a seat holding Person information and Membership at View", async () => {
    const html = await checkedWith(WITH_PERSON);

    expect(html).toContain("corwin.vellacott@ashridge.ox.ac.example");
    expect(html).toContain("+447700900999");
    expect(html).toContain("Active");
  });
});
