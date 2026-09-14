/**
 * `./photo-release-form.tsx` — LAN-347, step 3.
 *
 * The step is the University of Oxford's own consent form, so this suite
 * renders it against **the wording the migration actually shipped**, read out
 * of `supabase/migrations` rather than restated here: a test that carried its
 * own copy of the form would pass while the row said something else, which is
 * the exact failure the versioned slot exists to prevent.
 *
 * What is under test is the screen: that every printed line of the form is on
 * the page, that a field sits where the paper form has a box, that the
 * refusals name the box they belong to, and that the second printing of the
 * name follows the Name box as it is typed. `./actions.test.ts` and
 * `player-questionnaire.test.ts` prove what is written.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ agreePhotoRelease: vi.fn() }));

import { parseAgreementBody } from "@/lib/services/onboarding-agreement-body";

import { agreePhotoRelease } from "./actions";
import { PhotoReleaseForm } from "./photo-release-form";
import { PHOTO_RELEASE_MUST_AGREE_ERROR, photoReleaseEventLine } from "./presentation";
import { EMPTY_PHOTO_RELEASE_VALUES, type PhotoReleaseFormValues } from "./validation";

/**
 * The body of the `oxford-consent-form-v1` row, lifted from the migration that
 * inserts it. Dollar-quoted in SQL precisely so it can be read back whole.
 */
function shippedConsentFormBody(): string {
  const migration = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../supabase/migrations/20260919090000_photo_release_consent_form.sql",
    ),
    "utf8",
  );
  const body = /\$body\$([\s\S]*?)\$body\$/.exec(migration);
  if (!body) throw new Error("the migration no longer carries a dollar-quoted body");
  return body[1];
}

const SECTIONS = parseAgreementBody(shippedConsentFormBody());

const PREFILLED: PhotoReleaseFormValues = {
  name: "Jordan Ashworth",
  address: "",
  postcode: "",
  tel: "07700 900000",
  email: "jordan@example.com",
  // Never prefilled — the one box the player has to type (decision 5).
  printedName: "",
};

const EVENT_LINE = photoReleaseEventLine("2026-27");
const DATE_LINE = "14 Sept 2026";

function renderForm(
  values: PhotoReleaseFormValues = PREFILLED,
): ReturnType<typeof render> & { form: HTMLFormElement } {
  const result = render(
    <PhotoReleaseForm
      token="tok"
      sections={SECTIONS}
      initialValues={values}
      eventLine={EVENT_LINE}
      dateLine={DATE_LINE}
    />,
  );
  return { ...result, form: result.container.querySelector("form")! };
}

async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    fireEvent.submit(form);
  });
}

/** The text of whatever `aria-describedby` points an input at — the wiring `helperText` produces. */
function describedTextFor(input: HTMLElement): string {
  const ids = input.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

/** MUI puts the required asterisk inside the label's own text. */
function labelStartingWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
}

function flat(node: HTMLElement): string {
  return (node.textContent ?? "").replace(/\s+/g, " ");
}

describe("the University's wording is on the page, and it is the row's", () => {
  it("prints every line the version carries", () => {
    const { container } = renderForm();
    const page = flat(container);

    // Every printed line of every section — the whole form, not a sample.
    // A field's own label is printed by MUI as the label, which is part of the
    // page text too, so one assertion covers printed text and box labels alike.
    for (const section of SECTIONS) {
      for (const block of section.blocks) {
        expect(page, `missing: ${block.text}`).toContain(block.text.replace(/\s+/g, " "));
      }
    }
  });

  it("prints the party as the University's form writes it, never the club", () => {
    const { container } = renderForm();
    const page = flat(container);
    expect(page).toContain("agrees that the University of Oxford can photograph");
    expect(page).toContain("You confirm that Oxford University can:");
  });

  it("carries the Data Protection Privacy Notice and the club's own contact block", () => {
    renderForm();
    const notice = flat(screen.getByTestId("photo-release-privacy"));
    expect(notice).toContain("Data Protection Privacy Notice");
    expect(notice).toContain("How we use your data");
    expect(notice).toContain("Your rights");

    const contact = flat(screen.getByTestId("photo-release-privacy-contact"));
    expect(contact).toContain("Oxford University Lancers American Football Club");
    expect(contact).toContain("american.football@sport.ox.ac.uk");
  });

  it("prints the three permissions and the two numbered clauses with their own markers", () => {
    renderForm();
    // The marker and its line are separate elements, spaced by the layout, so
    // the page's own text runs them together — what matters is that the form's
    // bullet and its printed numbers are rendered rather than invented by a list.
    const permissions = flat(screen.getByTestId("photo-release-permissions"));
    expect(permissions).toMatch(/•\s?store copies of any photograph\/recording/);
    expect(permissions.match(/•/g)).toHaveLength(3);

    const clauses = flat(screen.getByTestId("photo-release-clauses"));
    expect(clauses).toMatch(/1\.\s?The University will process the photograph\/recording/);
    expect(clauses).toMatch(/2\.\s?This consent form is governed by/);
  });
});

describe("what the record fills in", () => {
  it("puts the season's own Event line and today's date in the form's boxes, read-only", () => {
    renderForm();
    expect(screen.getByTestId("photo-release-date").textContent).toBe(DATE_LINE);
    // Derived from the season, with the club's own en dash.
    expect(EVENT_LINE).toBe("Oxford Lancers activities, 2026–27 season");
    expect(screen.getByText(EVENT_LINE)).toBeInTheDocument();
  });

  it("prefills the name, phone and email, all editable in place", () => {
    renderForm();
    expect(screen.getByLabelText(labelStartingWith("Name"))).toHaveValue("Jordan Ashworth");
    expect(screen.getByLabelText(labelStartingWith("Tel:"))).toHaveValue("07700 900000");
    expect(screen.getByLabelText(labelStartingWith("Email:"))).toHaveValue("jordan@example.com");
  });

  // Decision 5. It stands where a signature would, so it is never filled in for
  // the player — not from the record, and not from the form they last
  // submitted. Everything else on this form starts filled.
  it("leaves Print name empty, whatever else the record fills in", () => {
    renderForm();
    expect(screen.getByLabelText(labelStartingWith("Print name"))).toHaveValue("");
  });

  it("leaves Print name empty on a reopened form too", () => {
    renderForm({ ...PREFILLED, address: "12 Turl Street\nOxford", postcode: "OX1 3DH" });
    expect(screen.getByLabelText(labelStartingWith("Print name"))).toHaveValue("");
  });

  it("prefills the address a reopened form was previously given (LAN-240)", () => {
    renderForm({ ...PREFILLED, address: "12 Turl Street\nOxford", postcode: "OX1 3DH" });
    expect(screen.getByLabelText(labelStartingWith("Address"))).toHaveValue(
      "12 Turl Street\nOxford",
    );
    expect(screen.getByLabelText(labelStartingWith("Post code:"))).toHaveValue("OX1 3DH");
  });

  it("prints the name a second time where the form prints it, following what is typed", async () => {
    renderForm();
    expect(screen.getByTestId("consent-name-echo").textContent).toBe("Jordan Ashworth");

    await act(async () => {
      fireEvent.change(screen.getByLabelText(labelStartingWith("Name")), {
        target: { value: "Jordan Ashworth-Blake" },
      });
    });
    expect(screen.getByTestId("consent-name-echo").textContent).toBe("Jordan Ashworth-Blake");
  });
});

describe("what it refuses, and what it says", () => {
  it("leaves the browser's own validation off, so every submission reaches the service", async () => {
    vi.mocked(agreePhotoRelease).mockResolvedValue({
      values: EMPTY_PHOTO_RELEASE_VALUES,
      errors: {},
      agreeError: false,
    });
    const { form } = renderForm(EMPTY_PHOTO_RELEASE_VALUES);

    expect(form).toHaveAttribute("noValidate");
    await submit(form);
    expect(agreePhotoRelease).toHaveBeenCalled();
  });

  it("names the missing address and post code under their own boxes", async () => {
    vi.mocked(agreePhotoRelease).mockResolvedValue({
      values: { ...PREFILLED, address: "", postcode: "" },
      errors: { address: "Address is required.", postcode: "Post code is required." },
      agreeError: false,
    });
    const { form } = renderForm();

    await submit(form);

    const address = screen.getByLabelText(labelStartingWith("Address"));
    expect(describedTextFor(address)).toContain("Address is required.");
    expect(address).toHaveAttribute("aria-invalid", "true");
    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Post code:")))).toContain(
      "Post code is required.",
    );
    // A box that was fine says nothing.
    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Tel:")))).toBe("");
  });

  it("names the missing printed name under the printed name box", async () => {
    vi.mocked(agreePhotoRelease).mockResolvedValue({
      values: { ...PREFILLED, printedName: "" },
      errors: { printedName: "Print name is required." },
      agreeError: false,
    });
    const { form } = renderForm();

    await submit(form);

    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Print name")))).toContain(
      "Print name is required.",
    );
  });

  it("says the tick is missing where the tick is, not against a box", async () => {
    vi.mocked(agreePhotoRelease).mockResolvedValue({
      values: PREFILLED,
      errors: {},
      agreeError: true,
    });
    const { container, form } = renderForm();

    await submit(form);

    expect(flat(container)).toContain(PHOTO_RELEASE_MUST_AGREE_ERROR);
    expect(describedTextFor(screen.getByLabelText(labelStartingWith("Address")))).toBe("");
  });

  it("keeps what the player typed in the boxes when it refuses", async () => {
    vi.mocked(agreePhotoRelease).mockResolvedValue({
      values: { ...PREFILLED, address: "12 Turl Street", postcode: "" },
      errors: { postcode: "Post code is required." },
      agreeError: false,
    });
    const { form } = renderForm();

    await submit(form);

    expect(screen.getByLabelText(labelStartingWith("Address"))).toHaveValue("12 Turl Street");
  });
});

describe("the shape of the page", () => {
  /**
   * jsdom lays nothing out, so a width cannot be measured here (the calendar
   * suite's own note). What a test can hold is the mechanism that makes 375px
   * work: nothing on this step declares a width, the address box is a genuine
   * textarea rather than a single line the player has to scroll, and the
   * form's own table row is a wrapping flex rather than columns. The rendered
   * result at 1440 and 375 is proved by `npm run visual:preflight`.
   */
  it("declares no fixed width anywhere on the step", () => {
    const { container } = renderForm();
    for (const element of container.querySelectorAll<HTMLElement>("*")) {
      // A relative width (MUI's own `fullWidth: 100%`) is fine; a pixel width
      // is what pushes a phone into a horizontal scroll.
      expect(element.style.width).not.toMatch(/px/);
      expect(element.style.minWidth).not.toMatch(/px/);
    }
  });

  it("gives the address the multi-line box a postal address needs", () => {
    renderForm();
    expect(screen.getByLabelText(labelStartingWith("Address")).tagName).toBe("TEXTAREA");
  });
});
