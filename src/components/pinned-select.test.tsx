import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PinnedSelect } from "./pinned-select";

describe("PinnedSelect", () => {
  it("labels the select and lists 'All' plus every option", () => {
    render(
      <PinnedSelect label="Status" value="" options={["active", "inactive"]} onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("renders each option through optionLabel when given", () => {
    render(
      <PinnedSelect
        label="Status"
        value=""
        options={["yes", "no"]}
        optionLabel={(value) => (value === "yes" ? "Sent" : "Not sent")}
        onChange={() => {}}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Not sent")).toBeInTheDocument();
  });

  it("reports the chosen value", () => {
    let chosen = "";
    render(
      <PinnedSelect
        label="Status"
        value=""
        options={["active", "inactive"]}
        onChange={(value) => (chosen = value)}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("active"));
    expect(chosen).toBe("active");
  });

  it("carries an optional data-testid onto the select, for a caller that needs one", () => {
    render(
      <PinnedSelect
        label="Status"
        value=""
        options={["active"]}
        onChange={() => {}}
        testId="recruitment-filter-status"
      />,
    );
    expect(screen.getByTestId("recruitment-filter-status")).toBeInTheDocument();
  });
});
