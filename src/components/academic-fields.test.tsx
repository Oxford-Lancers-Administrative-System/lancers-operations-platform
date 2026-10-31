import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { subjectsForLetters } from "@/lib/services/oxford-academic";
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
    const { container } = render(<DegreeFields defaultLetters="BA" defaultSubject="Geography" />);
    expect(posted(container, "degreeField")).toBe("Geography");
    const letters = screen.getByRole("combobox", { name: "Degree" });
    await user.clear(letters);
    await user.type(letters, "MChem");
    await user.click(screen.getByRole("option", { name: /^MChem —/ }));
    expect(posted(container, "degreeType")).toBe("MChem");
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

  it("keeps a subject chosen first when the degree offers it, and clears it when not", async () => {
    const user = userEvent.setup();
    const { container } = render(<DegreeFields />);
    const subject = screen.getByRole("combobox", { name: "Subject" });
    await user.type(subject, "Geography");
    await user.click(screen.getByRole("option", { name: "Geography" }));
    expect(posted(container, "degreeField")).toBe("Geography");

    const letters = screen.getByRole("combobox", { name: "Degree" });
    await user.type(letters, "Bachelor of Arts");
    await user.click(screen.getByRole("option", { name: /^BA —/ }));
    expect(posted(container, "degreeField")).toBe("Geography");

    await user.clear(letters);
    await user.type(letters, "Business");
    await user.click(screen.getByRole("option", { name: /^MBA —/ }));
    expect(posted(container, "degreeField")).toBe("");
    await user.click(screen.getByRole("combobox", { name: "Subject" }));
    expect(optionTexts()).toEqual(["Business Administration"]);
  });
});
