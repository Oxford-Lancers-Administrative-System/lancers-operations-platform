/**
 * Edit categories — the roster group colour selector (LAN-430). LAN-474
 * restored regular Blue beside Oxford Blue: both must be options here, drawn
 * from the shared palette, and a chosen Blue must be what Save colours posts.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("./group-colour-actions", () => ({
  saveRosterGroupColoursAction: vi.fn(async () => ({ ok: true })),
}));

import { TEMPLATE_COLOUR_PALETTE } from "@/lib/services/event-template-input";
import EditCategories from "./edit-categories";
import { saveRosterGroupColoursAction } from "./group-colour-actions";

describe("Edit categories lists the board's eleven groups — LAN-457", () => {
  it("puts Attendance after Availability, in Slate by default", async () => {
    render(<EditCategories />);
    fireEvent.click(screen.getByTestId("edit-categories"));

    const dialog = await screen.findByTestId("roster-categories-dialog");
    const rows = within(dialog)
      .getAllByTestId(/^roster-category-[a-z_]+$/)
      .map((row) => row.getAttribute("data-testid")!.replace("roster-category-", ""));
    expect(rows).toEqual([
      "person",
      "onboarding",
      "membership",
      "availability",
      "attendance",
      "coaching",
      "offensive",
      "defensive",
      "special_teams",
      "warmup",
      "kit",
    ]);
    expect(
      within(dialog).getByTestId("roster-category-preview-attendance").getAttribute("data-colour"),
    ).toBe("slate");
    expect(within(dialog).getByTestId("roster-category-preview-attendance").textContent).toBe(
      "Attendance",
    );
  });
});

describe("Edit categories offers the shared palette — LAN-474", () => {
  it("lists Blue and Oxford Blue as two options, and saves Blue on a group", async () => {
    render(<EditCategories />);
    fireEvent.click(screen.getByTestId("edit-categories"));

    const dialog = await screen.findByTestId("roster-categories-dialog");
    // MUI's select is a combobox beside its hidden input, opened as an operator would.
    const coaching = within(dialog).getByTestId("roster-category-colour-coaching");
    fireEvent.mouseDown(within(coaching.parentElement!).getByRole("combobox"));
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("data-colour"))).toEqual(
      TEMPLATE_COLOUR_PALETTE.map((swatch) => swatch.key),
    );
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["Oxford Blue", "Blue"]),
    );

    fireEvent.click(within(listbox).getByRole("option", { name: "Blue" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("roster-categories-save"));
    });

    expect(vi.mocked(saveRosterGroupColoursAction)).toHaveBeenCalledWith(
      expect.objectContaining({ coaching: "royal_blue", person: "blue" }),
    );
  });
});
