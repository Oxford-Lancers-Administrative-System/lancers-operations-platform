/**
 * `Add to your calendar` — the two screens, and nothing beyond them. LAN-158.
 *
 * `W2-01` (the pick screen) and `W2-02` (what was opened) are one `Dialog`
 * switched on local state, and this file is what proves there is no third:
 * every provider choice and the copy action are exercised, and each leaves
 * the dialog in one of exactly the two known states.
 *
 * LAN-320 pins the URL every destination is handed — all three `webcal:`,
 * because Google subscribes to an external feed only when `cid` carries that
 * scheme — and that the second screen states what was opened rather than
 * claiming a subscription it cannot observe.
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
    expect(screen.queryByTestId("subscribe-opened")).not.toBeInTheDocument();

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

  /** The one `webcal:` address every destination is built from, in this test environment. */
  function webcalFeedUrl(): string {
    return `${window.location.origin}${PUBLIC_CALENDAR_FEED_PATH}`.replace(/^https?:/, "webcal:");
  }

  it("hands Google a webcal: cid, never the https one — LAN-320", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-google"));
    });

    const url = openedUrl();
    expect(url).toBe(
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalFeedUrl())}`,
    );
    // The defect: an https cid is read as one of the reader's own calendar ids.
    expect(url).not.toContain(encodeURIComponent("https://"));

    expect(screen.getByTestId("subscribe-opened")).toBeInTheDocument();
    expect(screen.queryByTestId("subscribe-pick")).not.toBeInTheDocument();
  });

  it("Apple gets the same webcal: address, unwrapped", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-apple"));
    });

    expect(openedUrl()).toBe(webcalFeedUrl());
  });

  it("Outlook gets the documented addfromweb endpoint, with the webcal address", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-outlook"));
    });

    expect(openedUrl()).toBe(
      `https://outlook.live.com/calendar/0/addfromweb/?url=${encodeURIComponent(
        webcalFeedUrl(),
      )}&name=${encodeURIComponent("Oxford Lancers")}`,
    );
  });

  it("states what was opened and what to check there, and claims no success — LAN-320", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-google"));
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Opened in Google Calendar");
    expect(dialog).toHaveTextContent("Confirm there");
    expect(dialog).toHaveTextContent("Oxford Lancers listed under Other calendars");
    // The old screen said "Done" over a green tick for a subscription nothing here can see.
    expect(dialog).not.toHaveTextContent(/\bDone\b/);
    expect(dialog).not.toHaveTextContent(/has opened\. Confirm there and/);
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
    expect(screen.queryByTestId("subscribe-opened")).not.toBeInTheDocument();
  });

  it("closing and reopening always returns to the pick screen", async () => {
    render(<SubscribeToCalendarButton />);
    openDialog();
    await screen.findByRole("dialog");

    await act(async () => {
      fireEvent.click(screen.getByTestId("subscribe-provider-google"));
    });
    expect(screen.getByTestId("subscribe-opened")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("subscribe-opened")).getByRole("button", { name: "Close" }),
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
