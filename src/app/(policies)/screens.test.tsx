// @vitest-environment jsdom
/**
 * The three public documents — LAN-361, Brian 2026-09-16.
 *
 * The controller is the University of Oxford, and all three say so; the
 * privacy notice also names every processor and states the retention periods.
 * These are the club's answers to a regulator, so they are asserted rather
 * than reviewed by eye.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import DataDeletionPage from "./data-deletion/page";

const CONTROLLER = "University of Oxford";

describe("the controller", () => {
  it("is named on all three documents", () => {
    for (const [name, Page] of [
      ["privacy", PrivacyPage],
      ["terms", TermsPage],
      ["data deletion", DataDeletionPage],
    ] as const) {
      const { container, unmount } = render(<Page />);
      expect(container.textContent, name).toContain(CONTROLLER);
      unmount();
    }
  });
});

describe("the privacy notice", () => {
  it("names every processor, by name", () => {
    const { container } = render(<PrivacyPage />);
    for (const processor of [
      "Google Cloud",
      "Supabase",
      "Firebase Hosting",
      "GitHub",
      "WhatsApp Business Platform",
      "Resend",
    ]) {
      expect(container.textContent).toContain(processor);
    }
  });

  it("states how long each kind of record is kept, and that nothing is enforced on a timer yet", () => {
    render(<PrivacyPage />);
    const text = screen.getByText(/recruit who never joins/i).closest("div")?.textContent ?? "";
    expect(text).toMatch(/anonymised at the end of the season/i);
    expect(text).toMatch(/alumnus/i);
    expect(text).toMatch(/message and delivery logs/i);
    expect(text).toMatch(/grace period/i);
    expect(text).toMatch(/indefinitely/i);
    // LAN-361 states the periods; it does not enforce them, and says so.
    expect(document.body.textContent).toMatch(/not yet enforced automatically/i);
  });

  it("says where a request has to come from, and how long the club has", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.textContent).toMatch(/already on your record/i);
    expect(container.textContent).toMatch(/verified with an officer in person/i);
    expect(container.textContent).toMatch(/one month/i);
  });
});

describe("the data-deletion page", () => {
  it("says deletion means anonymisation, and that two officers approve it", () => {
    const { container } = render(<DataDeletionPage />);
    expect(container.textContent).toMatch(/Deletion means anonymisation/i);
    expect(container.textContent).toMatch(/cannot be recovered/i);
    expect(container.textContent).toMatch(/Two club officers/i);
    expect(container.textContent).toMatch(/one month/i);
  });
});
