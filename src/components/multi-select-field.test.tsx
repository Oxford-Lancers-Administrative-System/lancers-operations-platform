// @vitest-environment jsdom
/**
 * V-5, correction round 2 — Brian: "The dropdown should have a multi-tick.
 * It shouldn't just be up and about. That's awful." Correction round 1
 * shipped `MultiSelectCheckboxes`/`GroupedMultiSelectCheckboxes`: every
 * option as its own always-visible checkbox row, no outlined field, no
 * dropdown at all. This proves the replacement is a genuine dropdown — one
 * outlined field trigger when closed, tick boxes inside the opened menu —
 * not the bare inline list.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroupedMultiSelectField, MultiSelectField } from "@/components/multi-select-field";

describe("MultiSelectField", () => {
  it("renders one field trigger and no checkboxes at all while closed — not an always-visible list", () => {
    render(
      <MultiSelectField
        name="q_B4"
        label="What playing gear do you already have?"
        options={["Boots", "Gloves", "Mouthguard"]}
        selected={new Set()}
      />,
    );
    expect(screen.getByLabelText("What playing gear do you already have?")).not.toBeNull();
    // The defect this proves against: correction round 1's version rendered
    // every option as its own standalone checkbox, always in the DOM.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows tick boxes inside the opened menu, and joins the selection in the closed trigger", async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectField
        name="q_B4"
        label="What playing gear do you already have?"
        options={["Boots", "Gloves", "Mouthguard"]}
        selected={new Set(["Boots"])}
      />,
    );

    await user.click(screen.getByLabelText("What playing gear do you already have?"));
    const listbox = screen.getByRole("listbox");
    const bootsOption = within(listbox)
      .getByText("Boots")
      .closest('[role="option"]') as HTMLElement;
    expect(within(bootsOption).getByRole("checkbox")).toHaveProperty("checked", true);

    await user.click(within(listbox).getByText("Mouthguard"));
    await user.keyboard("{Escape}");

    // renderValue joins the current selection in the closed trigger — the
    // same shape `git show origin/chore/recruitment-fidelity-mockup:src/app/recruitment-preview/questionnaire-b.tsx`
    // uses.
    expect(screen.getByText("Boots, Mouthguard")).not.toBeNull();
  });

  it("posts the selection as one hidden field, joined with a bare comma — MultiSelectField's own wiring note", () => {
    const { container } = render(
      <MultiSelectField
        name="q_B4"
        label="Gear"
        options={["Boots", "Gloves"]}
        selected={new Set(["Boots", "Gloves"])}
      />,
    );
    const hidden = container.querySelector('input[name="q_B4"]') as HTMLInputElement;
    expect(hidden.value).toBe("Boots,Gloves");
  });
});

describe("GroupedMultiSelectField", () => {
  it("groups its options under a ListSubheader per group, inside the opened menu", async () => {
    const user = userEvent.setup();
    render(
      <GroupedMultiSelectField
        name="q_B3"
        label="Which positions interest you?"
        groups={[
          { label: "Offence", options: ["QB · Quarterback", "RB · Running Back"] },
          { label: "Defence", options: ["CB · Cornerback"] },
        ]}
        selected={new Set()}
      />,
    );
    await user.click(screen.getByLabelText("Which positions interest you?"));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("Offence")).not.toBeNull();
    expect(within(listbox).getByText("Defence")).not.toBeNull();
    expect(within(listbox).getByText("QB · Quarterback")).not.toBeNull();
  });
});
