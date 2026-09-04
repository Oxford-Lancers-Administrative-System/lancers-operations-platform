import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Chip from "@mui/material/Chip";
import { RowCard, RowCardList } from "./row-card";

describe("RowCard", () => {
  it("makes the whole card the one tap target", () => {
    render(
      <RowCardList>
        <RowCard
          title="Caspian Hallowfield"
          href="/operate/roster/m1"
          chips={<Chip size="small" label="Active" />}
          sublines={["Blue 7 · Offence QB", "No mobile recorded"]}
          trailing="Wk 3"
        />
      </RowCardList>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/operate/roster/m1");
    expect(link).toHaveTextContent("Caspian Hallowfield");
    expect(link).toHaveTextContent("No mobile recorded");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
