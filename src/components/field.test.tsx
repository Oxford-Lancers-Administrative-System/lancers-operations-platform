import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChoiceField, DateField, Field, SelectField, TimeField } from "./field";

describe("Field", () => {
  it("is full width by default and carries its data-field hook", () => {
    render(<Field label="Name" name="name" field="name" />);
    const root = screen.getByLabelText("Name").closest("[data-field]");
    expect(root).toHaveAttribute("data-field", "name");
    expect(root?.className).toMatch(/MuiFormControl-fullWidth/);
  });

  it("renders a select from options", () => {
    render(
      <SelectField
        label="Type"
        name="eventType"
        value="practice"
        options={[{ value: "practice", label: "Practice" }]}
      />,
    );
    expect(screen.getByText("Practice")).toBeInTheDocument();
  });

  it("renders a labelled choice and reports the chosen value", () => {
    let chosen = "";
    render(
      <ChoiceField
        label="Where"
        name="deliveryMode"
        value="in_person"
        onChange={(next) => {
          chosen = next;
        }}
        options={[
          { value: "in_person", label: "In person" },
          { value: "online", label: "Online" },
        ]}
      />,
    );
    fireEvent.click(screen.getByLabelText("Online"));
    expect(chosen).toBe("online");
  });

  it("posts the date as YYYY-MM-DD and the time as HH:mm through hidden inputs", () => {
    const { container } = render(
      <>
        <DateField label="Date" name="scheduledOn" value="2026-08-24" />
        <TimeField label="Start" name="startsAt" value="20:00" />
      </>,
    );
    expect(container.querySelector('input[name="scheduledOn"]')).toHaveValue("2026-08-24");
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue("20:00");
    // The visible field is the picker's own, day first — never the browser's locale.
    const shown = screen.getByRole("group", { name: "Date" }).textContent?.replace(/[^\d/]/g, "");
    expect(shown).toBe("24/08/2026");
  });
});
