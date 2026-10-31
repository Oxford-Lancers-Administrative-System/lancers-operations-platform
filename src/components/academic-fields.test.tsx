import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEGREE_LETTER_OPTIONS, subjectsForLetters } from "@/lib/services/oxford-academic";
import { CollegeField, DegreeFields } from "./academic-fields";

/** LAN-512 — the two controls every college and degree entry point uses. */
function posted(container: HTMLElement, name: string): string {
  return (container.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement)
    .value;
}

function optionTexts(): string[] {
  return within(screen.getByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("the college field", () => {
  it("filters the University's list as you type, and posts only a listed name", async () => {
    const user = userEvent.setup();
    const { container } = render(<CollegeField />);
    await user.type(screen.getByRole("combobox", { name: "College" }), "cather");
    expect(optionTexts()).toEqual(["St Catherine's College"]);
    await user.click(screen.getByRole("option", { name: "St Catherine's College" }));
    expect(posted(container, "college")).toBe("St Catherine's College");
  });

  it("finds nothing for free text that is not in the list, and posts nothing", async () => {
    const user = userEvent.setup();
    const { container } = render(<CollegeField />);
    await user.type(screen.getByRole("combobox", { name: "College" }), "St Catz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await user.tab();
    expect(posted(container, "college")).toBe("");
  });

  it("shows a legacy value beside the empty field and posts it unchanged", () => {
    const { container } = render(<CollegeField defaultValue="Christ church" />);
    expect(screen.getByText("On file: Christ church. Not in the list.")).toBeTruthy();
    expect(posted(container, "college")).toBe("Christ church");
  });
});

describe("the degree fields", () => {
  it("offers only the subjects the chosen letters carry", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    await user.type(screen.getByRole("combobox", { name: "Degree" }), "Business");
    await user.click(screen.getByRole("option", { name: /^MBA —/ }));
    expect(posted(container, "degreeType")).toBe("MBA");

    await user.click(screen.getByRole("combobox", { name: "Subject" }));
    expect(optionTexts()).toEqual(["Business Administration"]);
  });

  it("clears a subject the new letters do not offer", async () => {
    const user = userEvent.setup();
    // A legacy subject on file no letters offer: the Degree still lists every letter.
    const { container } = render(<DegreeFields defaultSubject="Biochem" />);
    const letters = screen.getByRole("combobox", { name: "Degree" });
    await user.click(letters);
    expect(optionTexts()).toHaveLength(DEGREE_LETTER_OPTIONS.length);
    await user.type(letters, "Bachelor of Arts");
    await user.click(screen.getByRole("option", { name: /^BA —/ }));
    expect(posted(container, "degreeType")).toBe("BA");
    expect(posted(container, "degreeField")).toBe("");
  });
});

describe("LAN-512 — the subject with no degree chosen (Brian's walk, 31 October)", () => {
  it("is open and lists every subject, not No options", async () => {
    const user = userEvent.setup();
    render(<DegreeFields />);
    const subject = screen.getByRole("combobox", { name: "Subject" });
    expect(subject).not.toBeDisabled();
    await user.click(subject);
    expect(optionTexts()).toHaveLength(subjectsForLetters("").length);
    await user.type(subject, "Fusion");
    expect(optionTexts()).toEqual(["Fusion Power (EPSRC CDT)"]);
  });

  it("keeps a subject chosen first when the degree offers it", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    const subject = screen.getByRole("combobox", { name: "Subject" });
    await user.type(subject, "Geography");
    await user.click(screen.getByRole("option", { name: "Geography" }));
    expect(posted(container, "degreeField")).toBe("Geography");

    const letters = screen.getByRole("combobox", { name: "Degree" });
    await user.type(letters, "Bachelor of Arts");
    await user.click(screen.getByRole("option", { name: /^BA —/ }));
    expect(posted(container, "degreeType")).toBe("BA");
    expect(posted(container, "degreeField")).toBe("Geography");
  });
});

describe("LAN-512 — Degree and Subject filter each other (Brian's second walk, 31 October)", () => {
  function labelsOf(values: readonly string[]): string[] {
    return DEGREE_LETTER_OPTIONS.filter((option) => values.includes(option.value)).map(
      (option) => option.label,
    );
  }

  it("lists only the degrees that offer a subject chosen first, and fills in nothing when several do", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    const subject = screen.getByRole("combobox", { name: "Subject" });
    await user.type(subject, "Geography");
    await user.click(screen.getByRole("option", { name: "Geography" }));
    expect(posted(container, "degreeType")).toBe("");

    await user.click(screen.getByRole("combobox", { name: "Degree" }));
    expect(optionTexts()).toEqual(labelsOf(["BA", "PGCE"]));
  });

  it("fills in the Degree when only one offers the subject chosen first", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    const subject = screen.getByRole("combobox", { name: "Subject" });
    await user.type(subject, "Business Administration");
    await user.click(screen.getByRole("option", { name: "Business Administration" }));
    expect(posted(container, "degreeField")).toBe("Business Administration");
    expect(posted(container, "degreeType")).toBe("MBA");
    expect(screen.getByRole("combobox", { name: "Degree" })).toHaveValue(
      "MBA — Master of Business Administration",
    );
  });

  it("fills in the Subject when the Degree offers only one, and nothing when it offers several", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    const letters = screen.getByRole("combobox", { name: "Degree" });
    await user.type(letters, "MChem");
    await user.click(screen.getByRole("option", { name: /^MChem —/ }));
    expect(posted(container, "degreeField")).toBe("Chemistry");

    // Clearing the Subject widens the Degree list; choosing BA fills nothing in.
    await user.clear(screen.getByRole("combobox", { name: "Subject" }));
    expect(posted(container, "degreeField")).toBe("");
    expect(posted(container, "degreeType")).toBe("MChem");
    await user.clear(letters);
    expect(posted(container, "degreeType")).toBe("");
    await user.type(letters, "Bachelor of Arts");
    await user.click(screen.getByRole("option", { name: /^BA —/ }));
    expect(posted(container, "degreeField")).toBe("");
  });

  it("widens each list again when the other is cleared, clearing nothing itself", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields defaultLetters="BA" defaultSubject="Geography" />);
    const letters = screen.getByRole("combobox", { name: "Degree" });
    const subject = screen.getByRole("combobox", { name: "Subject" });

    await user.click(letters);
    expect(optionTexts()).toEqual(labelsOf(["BA", "PGCE"]));
    await user.keyboard("{Escape}");

    await user.clear(letters);
    expect(posted(container, "degreeType")).toBe("");
    expect(posted(container, "degreeField")).toBe("Geography");
    await user.click(subject);
    expect(optionTexts()).toHaveLength(subjectsForLetters("").length);
    await user.keyboard("{Escape}");

    await user.clear(subject);
    expect(posted(container, "degreeField")).toBe("");
    await user.click(letters);
    expect(optionTexts()).toHaveLength(DEGREE_LETTER_OPTIONS.length);
  });
});
