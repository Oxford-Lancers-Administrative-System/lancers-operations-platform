import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("names what was searched and links to what resolves it (rule 5)", () => {
    render(
      <EmptyState
        title="Nobody matches"
        searched="Hallowfield"
        description="Search matches whole names and whole addresses."
        action={{ href: "/operate/people/new", label: "Add a person" }}
      />,
    );
    expect(screen.getByTestId("empty-state-searched")).toHaveTextContent("Hallowfield");
    expect(screen.getByTestId("empty-state-action")).toHaveAttribute("href", "/operate/people/new");
  });
});
