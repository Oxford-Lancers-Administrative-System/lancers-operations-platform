import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@mui/material/Button";
import { ActionBar } from "./action-bar";

describe("ActionBar", () => {
  it("orders primary, secondary, cancel and carries the enabling sentence (rule 4)", () => {
    render(
      <ActionBar
        primary={
          <Button variant="contained" disabled>
            Save draft
          </Button>
        }
        secondary={<Button variant="outlined">Save and choose audience</Button>}
        cancel={<Button variant="text">Cancel</Button>}
        note="Choose a date to enable saving."
      />,
    );
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Save draft", "Save and choose audience", "Cancel"]);
    expect(screen.getByTestId("action-bar-note")).toHaveTextContent(
      "Choose a date to enable saving.",
    );
    expect(screen.getByTestId("action-bar").tagName).toBe("FOOTER");
  });
});
