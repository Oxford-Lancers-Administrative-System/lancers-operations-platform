/**
 * `SubmitOnLoad` in isolation — LAN-498 (Brian, 31 October 2026). A WhatsApp
 * link saves as soon as the page has hydrated: once per mount with no
 * interaction at all, and never twice, Strict Mode's double effect included.
 * `screens.test.tsx` proves the page renders it only for a WhatsApp token;
 * `auto-submit.test.tsx` proves the email path still waits for a touch.
 */
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup as rtlCleanup } from "@testing-library/react";

import { AutoSubmitOnInteraction, SubmitOnLoad } from "./auto-submit";

afterEach(() => {
  rtlCleanup();
  vi.restoreAllMocks();
});

function spySubmit() {
  return vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
}

function page(formId: string, trigger: "load" | "interaction") {
  return (
    <>
      <form id={formId}>
        <button type="submit">Save</button>
      </form>
      {trigger === "load" ? (
        <SubmitOnLoad formId={formId} />
      ) : (
        <AutoSubmitOnInteraction formId={formId} />
      )}
    </>
  );
}

describe("a WhatsApp link saves on load", () => {
  it("submits its form once on mount, with no interaction at all", () => {
    const submitSpy = spySubmit();
    render(page("lo-answer-form", "load"));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy.mock.contexts[0]).toBe(document.getElementById("lo-answer-form"));
  });

  it("submits exactly once under Strict Mode's double-invoked effect", () => {
    const submitSpy = spySubmit();
    render(<StrictMode>{page("lo-answer-form", "load")}</StrictMode>);

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it("does not submit again on a re-render", () => {
    const submitSpy = spySubmit();
    const { rerender } = render(page("lo-answer-form", "load"));
    rerender(page("lo-answer-form", "load"));

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it("does nothing, without throwing, when no form has that id", () => {
    const submitSpy = spySubmit();
    render(<SubmitOnLoad formId="missing" />);

    expect(submitSpy).not.toHaveBeenCalled();
  });
});

describe("an email link still does not", () => {
  it("submits nothing on mount, Strict Mode included", () => {
    const submitSpy = spySubmit();
    render(<StrictMode>{page("lo-answer-form", "interaction")}</StrictMode>);

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("submits on the first interaction outside the form, as before", () => {
    const submitSpy = spySubmit();
    render(page("lo-answer-form", "interaction"));
    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
