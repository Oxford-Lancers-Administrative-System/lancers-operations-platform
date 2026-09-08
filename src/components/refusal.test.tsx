import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Refusal } from "./refusal";

describe("Refusal", () => {
  it("is a title, one sentence, the requirement and one action — never a second alert", () => {
    render(
      <Refusal
        title="You do not have access to this action"
        message="Your operator profile is active, but your current role assignments do not permit this action."
        requirement="This action requires the President, Vice-President, Secretary or General Manager role."
        action={{ href: "/operate/events", label: "Return to events" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You do not have access");
    expect(screen.getByTestId("refusal-requirement")).toHaveTextContent("requires the President");
    expect(screen.getByRole("link", { name: "Return to events" })).toHaveAttribute(
      "href",
      "/operate/events",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
