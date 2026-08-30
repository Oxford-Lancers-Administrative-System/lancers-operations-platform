/**
 * `RosterFilters` — the roster's search-and-filter component. LAN-75, kept
 * alive here through two redesigns.
 *
 * `RosterPage` (UX-20/UX-23) moved out of this file with LAN-186: the board
 * that replaced the six-column list has its own tests in
 * `board-screens.test.tsx`, which no longer uses this component at all.
 * `MembershipPage` (UX-21) moved out with LAN-187: the redesigned player
 * record has its own tests in `[membershipId]/screens.test.tsx`.
 *
 * `./roster-filters.tsx` itself is unchanged by either redesign and stays a
 * live consumer of the shared `ListFilters` component
 * (`src/app/operate/list-filters.test.tsx`) — deleting this file's coverage
 * would break that outside test's own reasoning for keeping the component
 * alive, so it stays here rather than moving with either surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const routerPush = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/operate/roster",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

import RosterFilters, { SEARCH_DEBOUNCE_MS } from "./roster-filters";

/**
 * The search box, which nothing tested until independent review deleted the
 * debounce and watched all 1,884 tests stay green — returning the screen to
 * exactly the state Brian rejected on sight.
 *
 * These render the real filter component and assert on the URL it navigates to,
 * because that URL is the whole behaviour: the roster is a server component and
 * the query string is the only thing that reaches it.
 */
describe("UX-20 — the search box actually filters", () => {
  function renderFilters(props: Partial<Parameters<typeof RosterFilters>[0]> = {}) {
    return render(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search=""
        status=""
        entry=""
        sort="name"
        direction="asc"
        {...props}
      />,
    );
  }

  beforeEach(() => {
    routerPush.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates to the typed search after the debounce", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Brindlewood" },
    });
    expect(routerPush).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("q=Brindlewood"));
  });

  it("navigates once for a burst of typing, not once per keystroke", async () => {
    renderFilters();
    const box = screen.getByLabelText("Search name or contact");

    for (const value of ["B", "Br", "Bri"]) {
      fireEvent.change(box, { target: { value } });
    }
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("q=Bri"));
  });

  /**
   * The first of two races review found. `withFilter` closed over the `search`
   * prop, so a status chosen inside the debounce window built its URL from the
   * older value and silently discarded whatever had just been typed.
   */
  it("keeps the typed text when a filter is chosen before the debounce fires", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Quinn" },
    });
    // MUI's select is a combobox backed by a hidden input, so it is opened and
    // an option clicked, exactly as an operator would.
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    const pushed = routerPush.mock.calls.at(-1)?.[0] as string;
    expect(pushed).toContain("status=active");
    expect(pushed).toContain("q=Quinn");
  });

  /**
   * The second of the two races, and the one that shipped with no coverage at
   * all — independent review deleted the guard and the whole suite stayed green.
   *
   * The sequence: the operator types, a filter is chosen inside the debounce
   * window (which pushes a URL carrying the half-typed search), and that
   * navigation lands as a new `search` prop while the box still holds the same
   * text. The box must keep what was typed, and the pending debounce must not
   * fire a second navigation to a URL the browser is already on.
   */
  it("keeps the box and does not navigate twice when the URL catches up mid-type", async () => {
    const { rerender } = renderFilters();

    fireEvent.change(screen.getByLabelText("Search name or contact"), {
      target: { value: "Quinn" },
    });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Active" }));

    const afterFilter = routerPush.mock.calls.length;

    // The navigation lands: the prop now carries what the box already holds.
    rerender(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search="Quinn"
        status="active"
        entry=""
        sort="name"
        direction="asc"
      />,
    );

    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    // Nothing further: the URL already says what the box says.
    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");
    expect(routerPush).toHaveBeenCalledTimes(afterFilter);
  });

  it("adopts the URL when it genuinely changes underneath — Back, or Clear filters", () => {
    const { rerender } = renderFilters({ search: "Quinn" });
    expect(screen.getByLabelText("Search name or contact")).toHaveValue("Quinn");

    rerender(
      <RosterFilters
        statuses={["active"]}
        entries={["returning"]}
        sortColumns={[{ value: "name", label: "Name" }]}
        search=""
        status=""
        entry=""
        sort="name"
        direction="asc"
      />,
    );

    expect(screen.getByLabelText("Search name or contact")).toHaveValue("");
  });
});
