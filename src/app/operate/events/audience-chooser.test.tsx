// LAN-514, Brian's second walk on 31 October: on Messages the people picker
// starts closed — every group band and the search, filters and tick list —
// and a tick survives closing and reopening.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import type { AudienceCandidate } from "@/lib/services/audience-selection";
import { AudienceChooser, PEOPLE_HEADING, useAudienceChoice } from "./audience-chooser";

function candidate(id: string, name: string): AudienceCandidate {
  return {
    key: `player:m-${id}`,
    capacity: "player",
    anchorId: `m-${id}`,
    personId: `p-${id}`,
    displayName: name,
    standing: "Active",
    unit: null,
    contact: null,
  };
}

const CANDIDATES = [
  candidate("1", "Ann Abbot"),
  candidate("2", "Ben Brook"),
  candidate("3", "Cal Croft"),
];

function Chooser({ collapsed, initial = [] }: { collapsed?: boolean; initial?: string[] }) {
  const choice = useAudienceChoice(initial, []);
  return (
    <AudienceChooser
      eventType="training"
      candidates={CANDIDATES}
      counts={{ player: 3, recruit: 0, coach: 0, committee: 0 }}
      choice={choice}
      collapsed={collapsed}
    />
  );
}

const toggle = () => screen.getByTestId("audience-people-toggle");
const bands = () =>
  [...document.querySelectorAll('[data-testid^="section-audience-category-"]')].filter(
    (element) => element.tagName === "DETAILS",
  ) as HTMLDetailsElement[];

describe("the people picker on Messages (collapsed)", () => {
  it("starts closed: no search, no tick list, every group band shut", () => {
    render(<Chooser collapsed />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("audience-people")).toBeNull();
    expect(screen.queryByLabelText("Search name, role or contact")).toBeNull();
    expect(bands().length).toBeGreaterThan(1);
    expect(bands().filter((band) => band.open)).toEqual([]);
  });

  it("carries the chosen count in its closed header", () => {
    render(<Chooser collapsed initial={[CANDIDATES[0].key, CANDIDATES[1].key]} />);
    expect(within(toggle()).getByText(PEOPLE_HEADING)).toBeTruthy();
    expect(within(toggle()).getByText("2 of 3 chosen")).toBeTruthy();
  });

  it("opens on demand, and keeps a tick through closing and reopening", () => {
    render(<Chooser collapsed />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByTestId("candidate-list");
    fireEvent.click(within(list).getByLabelText(/^Include Ben Brook/));
    expect(within(toggle()).getByText("1 of 3 chosen")).toBeTruthy();

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle());
    expect(screen.getByLabelText(/^Include Ben Brook/)).toBeChecked();
    expect(screen.getByLabelText(/^Include Ann Abbot/)).not.toBeChecked();
  });
});

describe("the people picker elsewhere (the event audience builder)", () => {
  it("is open, with no fold, and the first two bands open as before", () => {
    render(<Chooser />);
    expect(screen.queryByTestId("audience-people-toggle")).toBeNull();
    expect(screen.getByTestId("candidate-list")).toBeTruthy();
    expect(
      bands()
        .filter((band) => band.open)
        .map((band) => band.getAttribute("data-testid")),
    ).toEqual(["section-audience-category-general", "section-audience-category-coaching"]);
  });
});
