import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidateRow } from "./candidate-row";

describe("CandidateRow", () => {
  it("names the match in the club's words and offers one resolving action", () => {
    render(
      <CandidateRow
        name="Caspian Hallowfield"
        facts={["St Hilda's", "2024"]}
        matched={["Matched first name", "Matched last name"]}
        action={{ label: "This is them", href: "/operate/roster/new?person=p1" }}
      />,
    );
    expect(screen.getByTestId("candidate-matched")).toHaveTextContent(
      "Matched first name · Matched last name",
    );
    expect(screen.getByTestId("candidate-matched")).not.toHaveTextContent("given_name");
    expect(screen.getByRole("link", { name: "This is them" })).toHaveAttribute(
      "href",
      "/operate/roster/new?person=p1",
    );
  });
});
