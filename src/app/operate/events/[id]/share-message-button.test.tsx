// @vitest-environment jsdom
/**
 * LAN-410 — **Copy share message** copies synchronously.
 *
 * Stewart, "Ops Event and share", 2026-09-21: "Error when seeing what the
 * share message was", with the button's own failure caption on screen, on Mac
 * Safari. The cause was not the server: four scripted runs through the real
 * login returned the six lines every time, and the clipboard write was what
 * failed, with `NotAllowedError`. Safari refuses a clipboard write once the
 * click's user activation has lapsed, and awaiting a server action guarantees
 * that it has.
 *
 * jsdom cannot reproduce user activation, so the thing this file proves is the
 * property that makes the difference: `writeText` is called in the click
 * handler itself, before control ever returns to the event loop.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ShareMessageButton } from "./share-message-button";

const MESSAGE = ["Thursday practice", "2 yes", "0 no"].join("\n");

function givenClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return { writeText };
}

describe("Copy share message", () => {
  it("writes the rendered text to the clipboard inside the click, with nothing awaited first", async () => {
    const { writeText } = givenClipboard();
    render(<ShareMessageButton message={MESSAGE} />);

    fireEvent.click(screen.getByTestId("copy-share-message"));

    // Synchronously: `fireEvent` returns as soon as the handler does, so a
    // call already recorded here is a call made before any await.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(MESSAGE);

    // Settle the state the resolved write sets, so the label change is not
    // left to land outside the test.
    await screen.findByText("Copied");
  });

  it("keeps the failure caption for a browser that refuses anyway", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ShareMessageButton message={MESSAGE} />);

    fireEvent.click(screen.getByTestId("copy-share-message"));

    expect(await screen.findByTestId("share-message-failed")).toHaveTextContent(
      "The message could not be copied. Try again.",
    );
  });

  it("says Copied once it has", async () => {
    givenClipboard();
    render(<ShareMessageButton message={MESSAGE} />);

    fireEvent.click(screen.getByTestId("copy-share-message"));

    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
