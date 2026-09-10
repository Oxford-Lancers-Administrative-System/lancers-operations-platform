import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Fact, FactGrid, FactList, NOT_RECORDED } from "./fact";

describe("Fact", () => {
  it("renders label and value, and says not recorded for an absent value", () => {
    render(
      <FactGrid>
        <Fact label="College" value="St Hilda's" />
        <Fact label="Degree field" value={null} testId="absent" />
      </FactGrid>,
    );
    expect(screen.getByText("College")).toBeInTheDocument();
    expect(screen.getByText("St Hilda's")).toBeInTheDocument();
    expect(screen.getByTestId("absent")).toHaveTextContent(NOT_RECORDED);
    expect(screen.getByTestId("not-recorded")).toHaveStyle({ fontStyle: "italic" });
  });

  it("renders provenance only when there is something to say", () => {
    const { rerender } = render(<Fact label="Email" value="a@b.example" layout="inline" />);
    expect(screen.queryByTestId("fact-provenance")).toBeNull();
    rerender(
      <Fact label="Email" value="a@b.example" layout="inline" provenance="Player, 3 Sep 2026" />,
    );
    expect(screen.getByTestId("fact-provenance")).toHaveTextContent("Player, 3 Sep 2026");
  });

  it("lays inline facts out as a definition list", () => {
    render(
      <FactList testId="list">
        <Fact label="Status" value="Active" layout="inline" />
      </FactList>,
    );
    const list = screen.getByTestId("list");
    expect(list.tagName).toBe("DL");
    expect(list.querySelector("dt")).toHaveTextContent("Status");
    expect(list.querySelector("dd")).toHaveTextContent("Active");
  });
  // LAN-264 — a value the operator typed into a multi-line field.
  it("keeps the line breaks of a multiline value, and collapses them otherwise", () => {
    const { rerender } = render(
      <Fact label="Required equipment" value={"Gumshield\nCleats\nWater"} testId="kit" />,
    );
    expect(screen.getByTestId("kit").querySelector("dd p")).not.toHaveStyle({
      whiteSpace: "pre-line",
    });

    rerender(
      <Fact label="Required equipment" value={"Gumshield\nCleats\nWater"} multiline testId="kit" />,
    );
    expect(screen.getByTestId("kit").querySelector("dd p")).toHaveStyle({
      whiteSpace: "pre-line",
    });
  });
});
