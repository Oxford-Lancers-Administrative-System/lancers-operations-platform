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

describe("RowCard with its own actions", () => {
  it("keeps the row's controls reachable instead of wrapping them in the card's link", () => {
    render(
      <RowCardList at="all">
        <RowCard
          title="Practice — michaelmas week 1"
          href="/me/abc?open=i1"
          sublines={["Answer by 12 Sep 2026"]}
          actions={
            <>
              <button type="button">Yes</button>
              <button type="button">No</button>
            </>
          }
        />
      </RowCardList>,
    );
    // A `CardActionArea` renders an anchor around the whole body, and a button
    // inside an anchor is neither reachable nor valid. A card that carries its
    // own actions therefore drops the whole-card target.
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByTestId("row-card-actions")).toBeInTheDocument();
  });

  it('shows at every width when the list is at="all"', () => {
    const { container } = render(
      <RowCardList at="all" testId="invitations">
        <RowCard title="Pre-season camp" />
      </RowCardList>,
    );
    expect(container.querySelector('[data-testid="invitations"]')).toBeInTheDocument();
    expect(screen.getByText("Pre-season camp")).toBeInTheDocument();
  });
});
