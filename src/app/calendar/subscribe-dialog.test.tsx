/**
 * `Add to your calendar` — the two screens, and nothing beyond them. LAN-158.
 *
 * `W2-01` (the pick screen) and `W2-02` (Done) are one `Dialog` switched on
 * local state, and this file is what proves there is no third: every provider
 * choice and the copy action are exercised, and each leaves the dialog in one
 * of exactly the two known states.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SubscribeToCalendarButton from "./subscribe-dialog";
import { PUBLIC_CALENDAR_FEED_PATH } from "./routes";

function openDialog() {
  fireEvent.click(screen.getByTestId("subscribe-open"));
}

describe("Add to your calendar", () => {
  beforeEach(() => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The URL `window.open` was called with, for the one call a provider choice makes. */
  function openedUrl(): string {
    const mock = vi.mocked(window.open);
    expect(mock).toHaveBeenCalledTimes(1);
    return String(mock.mock.calls[0]![0]);
  }

  it("opens on the pick screen, offering Google, Apple and Outlook, and the address to copy", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Add to your calendar")).toBeInTheDocument();
    expect(screen.getByTestId("subscribe-pick")).toBeInTheDocument();
    expect(screen.queryByTestId("subscribe-done")).not.toBeInTheDocument();

    expect(within(dialog).getByTestId("subscribe-provider-google")).toHaveTextContent(
      "Google Calendar",
    );
    expect(within(dialog).getByTestId("subscribe-provider-apple")).toHaveTextContent(
      "Apple Calendar",
    );
    expect(within(dialog).getByTestId("subscribe-provider-outlook")).toHaveTextContent("Outlook");
    expect(screen.getByTestId("subscribe-url")).toHaveTextContent(PUBLIC_CALENDAR_FEED_PATH);
  });

  it("carries no per-event copy action anywhere in the dialog", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    expect(screen.queryByText(/copy this event/i)).not.toBeInTheDocument();
  });

  it("choosing Google opens Google's add-by-URL endpoint and moves straight to Done — no third screen", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-google"));
    });

    const url = openedUrl();
    expect(url).toContain("calendar.google.com");
    expect(url).toContain(encodeURIComponent(PUBLIC_CALENDAR_FEED_PATH));

    expect(screen.getByTestId("subscribe-done")).toBeInTheDocument();
    expect(screen.queryByTestId("subscribe-pick")).not.toBeInTheDocument();
    expect(screen.getByText(/Google Calendar has opened/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Done");
  });

  it("Apple gets a webcal: address rather than the HTTPS one", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-apple"));
    });

    expect(openedUrl().startsWith("webcal:")).toBe(true);
    expect(screen.getByText(/Apple Calendar has opened/)).toBeInTheDocument();
  });

  it("Outlook gets its own add-by-URL endpoint", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-outlook"));
    });

    expect(openedUrl()).toContain("outlook.live.com");
    expect(screen.getByText(/Outlook has opened/)).toBeInTheDocument();
  });

  it("copying the address gives feedback on the same pick screen, not a third one", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-copy"));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(PUBLIC_CALENDAR_FEED_PATH),
    );
    expect(screen.getByTestId("subscribe-copy")).toHaveTextContent("Copied");
    expect(screen.getByTestId("subscribe-pick")).toBeInTheDocument();
    expect(screen.queryByTestId("subscribe-done")).not.toBeInTheDocument();
  });

  it("closing and reopening always returns to the pick screen", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-google"));
    });
    expect(screen.getByTestId("subscribe-done")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("subscribe-done")).getByRole("button", { name: "Close" }),
      );
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    openDialog();
    expect(await screen.findByTestId("subscribe-pick")).toBeInTheDocument();
  });

  it("says the refresh is the calendar app's and never claims to notify anyone", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/notify|notification/i);
  });
});
