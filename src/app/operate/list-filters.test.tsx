import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import RosterFilters from "./roster/roster-filters";
import EventFilters from "./events/event-filters";

/**
 * The bar the roster and the events list share — LAN-127 finding 3.
 *
 * These two screens had the same 202-line component twice, and the copies had
 * drifted apart on the one thing nobody re-reads: the roster's phone Filters
 * toggle carried a 44px minimum touch target and the events one carried none,
 * although `docs/ux/tickets/LAN-74-returner-intake.md` requires "**every**
 * action … carries a 44px minimum" and fifteen other files honour it.
 *
 * So the assertions here are deliberately about the properties that were
 * already proved to be forgettable, on **both** screens rather than one: the
 * touch target, the disclosure wiring that makes the phone toggle mean
 * something, and the hidden inputs that stop a native Enter submit dropping the
 * filters. Nothing here re-tests the search box; `../filter-search` owns that
 * and each screen's own suite exercises it.
 *
 * The limit LAN-74 states applies to the first of those and is worth repeating:
 * jsdom does not lay out, so this reads the requested value, not a measured
 * box.
 */

const ROSTER_SORT_COLUMNS = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
];

const EVENT_SORT_COLUMNS = [
  { value: "date", label: "Date" },
  { value: "name", label: "Name" },
];

function renderRoster() {
  return render(
    <RosterFilters
      statuses={["active", "inactive"]}
      entries={["returning", "new"]}
      sortColumns={ROSTER_SORT_COLUMNS}
      search=""
      status=""
      entry=""
      sort="name"
      direction="asc"
    />,
  );
}

function renderEvents() {
  return render(
    <EventFilters
      statuses={["draft", "approved"]}
      types={["practice", "social"]}
      sortColumns={EVENT_SORT_COLUMNS}
      search=""
      status=""
      eventType=""
      sort="date"
      direction="desc"
    />,
  );
}

describe("both list screens' filter bar", () => {
  it("gives the phone Filters toggle a 44px target on each screen", () => {
    renderRoster();
    expect(
      screen.getByRole("button", { name: "Filters" }),
      "the roster Filters toggle has no touch-target minimum",
    ).toHaveStyle({ minHeight: "44px" });

    const events = renderEvents();
    // Two bars are now mounted; scope to the second.
    expect(
      within(events.container).getByRole("button", { name: "Filters" }),
      "the events Filters toggle has no touch-target minimum",
    ).toHaveStyle({ minHeight: "44px" });
  });

  it("ties each toggle to the group it discloses", () => {
    const roster = renderRoster();
    const rosterToggle = within(roster.container).getByRole("button", { name: "Filters" });
    expect(rosterToggle).toHaveAttribute("aria-controls", "roster-filter-fields");
    expect(rosterToggle).toHaveAttribute("aria-expanded", "false");

    const events = renderEvents();
    const eventsToggle = within(events.container).getByRole("button", { name: "Filters" });
    expect(eventsToggle).toHaveAttribute("aria-controls", "event-filter-fields");
    expect(eventsToggle).toHaveAttribute("aria-expanded", "false");
  });

  /**
   * The hidden inputs are what stop a native Enter submit in the search box
   * clearing whatever the operator had already narrowed to. Each screen owns
   * different keys, so each is asserted with its own.
   */
  it("mirrors every other filter as a hidden input, so Enter cannot drop them", () => {
    const roster = renderRoster();
    const rosterForm = within(roster.container).getByTestId("roster-filters");
    expect(rosterForm).toHaveAttribute("action", "/operate/roster");
    for (const name of ["status", "entry", "sort", "dir"]) {
      expect(
        rosterForm.querySelector(`input[type="hidden"][name="${name}"]`),
        `the roster form drops "${name}" on a native submit`,
      ).not.toBeNull();
    }

    const events = renderEvents();
    const eventsForm = within(events.container).getByTestId("event-filters");
    expect(eventsForm).toHaveAttribute("action", "/operate/events");
    for (const name of ["status", "type", "sort", "dir"]) {
      expect(
        eventsForm.querySelector(`input[type="hidden"][name="${name}"]`),
        `the events form drops "${name}" on a native submit`,
      ).not.toBeNull();
    }
  });

  /** Each screen keeps its own words; the shared bar has no opinion. */
  it("keeps each screen's own vocabulary", () => {
    const roster = renderRoster();
    expect(within(roster.container).getByLabelText("Search name or contact")).toBeInTheDocument();

    const events = renderEvents();
    expect(within(events.container).getByLabelText("Search events")).toBeInTheDocument();
  });
});
