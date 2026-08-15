/**
 * The venue combobox — LAN-115.
 *
 * Four of this issue's acceptance criteria can only be proved here, because
 * they are about what the browser does between keystrokes:
 *
 *   * "A slow earlier query cannot overwrite a later query's results."
 *   * "Manual venue/address entry remains possible when autocomplete cannot
 *     resolve the location."
 *   * "No-results, provider-error, rate-limit, and unavailable-provider states
 *     are understandable and do not crash the form."
 *   * "Keyboard-only operation can search, navigate suggestions, select,
 *     dismiss, and continue through the form."
 *
 * `fetch` is replaced rather than the network being reached. The debounce is
 * driven with fake timers so a 300 ms wait is not paid twelve times over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import VenueField, { DEBOUNCE_MS } from "./venue-field";

const HORSPATH = {
  id: "0",
  label: "Horspath Sports Ground",
  detail: "Oxford, OX33 1RY",
  formatted: "Horspath Sports Ground, Oxford, OX33 1RY",
};

const IFFLEY = {
  id: "1",
  label: "Iffley Road Sports Ground",
  detail: "76 Iffley Road, Oxford, OX4 1EQ",
  formatted: "Iffley Road Sports Ground, 76 Iffley Road, Oxford, OX4 1EQ",
};

function venueInput(): HTMLInputElement {
  return screen.getByRole("combobox", { name: /Venue/ }) as HTMLInputElement;
}

function statusText(): string {
  return screen.getByTestId("venue-search-status").textContent ?? "";
}

/** Type, then let the debounce elapse. */
async function type(text: string) {
  fireEvent.change(venueInput(), { target: { value: text } });
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS);
  });
}

/** A `fetch` that answers every call with one JSON body. */
function answering(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VenueField", () => {
  it("shows the stored venue when an existing event is edited", () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [] }));
    render(<VenueField name="venue" defaultValue="University Parks, Oxford" />);

    expect(venueInput()).toHaveValue("University Parks, Oxford");
    // Displaying a stored venue is not a reason to go and search for it.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits under the same field name the action already reads", () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [] }));
    render(<VenueField name="venue" defaultValue="" />);

    expect(venueInput()).toHaveAttribute("name", "venue");
  });

  it("does not search until there is enough typed to mean anything", async () => {
    const fetchImpl = answering({ status: "ok", suggestions: [] });
    vi.stubGlobal("fetch", fetchImpl);
    render(<VenueField name="venue" defaultValue="" />);

    await type("ox");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("searches once for a burst of typing, not once per keystroke", async () => {
    const asked: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      asked.push(String(url));
      return new Response(JSON.stringify({ status: "ok", suggestions: [HORSPATH] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    render(<VenueField name="venue" defaultValue="" />);

    for (const text of ["hor", "hors", "horsp", "horspa"]) {
      fireEvent.change(venueInput(), { target: { value: text } });
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS / 4);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The one request carries what was typed last, not what was typed first.
    expect(asked[0]).toContain("q=horspa");
  });

  it("offers a suggestion, and stores its formatted address when it is chosen", async () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [HORSPATH] }));
    render(<VenueField name="venue" defaultValue="" />);

    await type("horspath");

    const option = await screen.findByText("Horspath Sports Ground");
    // The qualifying line is what tells two similar places apart.
    expect(screen.getByText("Oxford, OX33 1RY")).toBeInTheDocument();

    fireEvent.click(option);

    expect(venueInput()).toHaveValue(HORSPATH.formatted);
  });

  it("can be searched, navigated, selected and dismissed by keyboard alone", async () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [HORSPATH, IFFLEY] }));
    render(<VenueField name="venue" defaultValue="" />);

    const input = venueInput();
    act(() => input.focus());
    await type("sports ground");

    await screen.findByText("Iffley Road Sports Ground");

    // Down twice reaches the second suggestion; Enter takes it.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue(IFFLEY.formatted);
    expect(document.activeElement).toBe(input);

    // And the list can be dismissed without choosing anything.
    await type("sports ground again");
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(input).toHaveValue("sports ground again");
  });

  it("does not search again for the suggestion it has just been given", async () => {
    const fetchImpl = answering({ status: "ok", suggestions: [HORSPATH] });
    vi.stubGlobal("fetch", fetchImpl);
    render(<VenueField name="venue" defaultValue="" />);

    await type("horspath");
    fireEvent.click(await screen.findByText("Horspath Sports Ground"));

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 4);
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps a venue the provider has never heard of", async () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [] }));
    render(<VenueField name="venue" defaultValue="" />);

    // The club's own pitch, which no geocoder indexes.
    await type("The far pitch, behind the pavilion");

    expect(venueInput()).toHaveValue("The far pitch, behind the pavilion");
    await waitFor(() => expect(statusText()).toContain("No matching place found"));
  });

  it.each([
    ["unavailable", { status: "unavailable" }, 200, /not set up here/],
    ["rate-limited", { status: "rate_limited" }, 200, /busy right now/],
    ["failing", { status: "provider_error" }, 200, /unavailable right now/],
    ["refusing", { status: "forbidden" }, 403, /unavailable right now/],
  ])(
    "explains a %s provider without taking the field away",
    async (_case, body, status, message) => {
      vi.stubGlobal("fetch", answering(body, status));
      render(<VenueField name="venue" defaultValue="" />);

      await type("horspath");

      await waitFor(() => expect(statusText()).toMatch(message));
      // Typed text survives every one of them; the draft is still savable.
      expect(venueInput()).toHaveValue("horspath");
      expect(venueInput()).not.toBeDisabled();
    },
  );

  it("survives a provider answering 200 with something that is not an outcome", async () => {
    vi.stubGlobal("fetch", answering({ unexpected: true }));
    render(<VenueField name="venue" defaultValue="" />);

    await type("horspath");

    await waitFor(() => expect(statusText()).toMatch(/unavailable right now/));
  });

  it("shows a validation correction instead of any search state", async () => {
    vi.stubGlobal("fetch", answering({ status: "ok", suggestions: [] }));
    render(<VenueField name="venue" defaultValue="" errorMessage="Give the venue a name." />);

    expect(statusText()).toBe("Give the venue a name.");
    expect(venueInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("never lets a slow earlier query overwrite a later one's results", async () => {
    // The first query resolves *after* the second, which is the ordering that
    // put the wrong list under a newer query in every naive implementation.
    let releaseFirst: (() => void) | undefined;
    const firstArrived = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const fetchImpl = vi.fn(async (url: unknown) => {
      const body = String(url).includes("q=iffley")
        ? { status: "ok", suggestions: [IFFLEY] }
        : { status: "ok", suggestions: [HORSPATH] };

      if (String(url).includes("q=horspath")) await firstArrived;

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    render(<VenueField name="venue" defaultValue="" />);

    await type("horspath");
    await type("iffley");

    // The newer query has landed.
    await screen.findByText("Iffley Road Sports Ground");

    // Now the older one finally answers.
    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText("Horspath Sports Ground")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Iffley Road Sports Ground")).toBeInTheDocument();
  });

  it("abandons an in-flight search when the field is emptied", async () => {
    const fetchImpl = answering({ status: "ok", suggestions: [HORSPATH] });
    vi.stubGlobal("fetch", fetchImpl);
    render(<VenueField name="venue" defaultValue="" />);

    await type("horspath");
    await screen.findByText("Horspath Sports Ground");

    await type("");

    await waitFor(() =>
      expect(screen.queryByText("Horspath Sports Ground")).not.toBeInTheDocument(),
    );
  });
});
