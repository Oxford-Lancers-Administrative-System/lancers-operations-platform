import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Chip from "@mui/material/Chip";
import { Metric, MetricRow } from "./metric";

describe("Metric", () => {
  it("renders the number over its label", () => {
    render(
      <MetricRow>
        <Metric value="37" label="Invited" testId="m" />
      </MetricRow>,
    );
    const metric = screen.getByTestId("m");
    expect(metric.querySelector("p")).toHaveTextContent("37");
    expect(metric).toHaveTextContent("Invited");
  });

  it("accepts a status chip where the headline is a state rather than a count", () => {
    render(
      <Metric
        value={<Chip label="Active" />}
        label="Membership"
        caption="This season"
        testId="m"
      />,
    );
    expect(screen.getByTestId("m")).toHaveTextContent("Active");
    expect(screen.getByTestId("m")).toHaveTextContent("This season");
  });
});
