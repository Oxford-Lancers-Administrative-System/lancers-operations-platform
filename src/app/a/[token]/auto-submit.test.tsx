/**
 * `AutoSubmitOnMount` in isolation — LAN-172, OWNER-LAN172-17.
 *
 * Proved against a plain `<form>` with `HTMLFormElement.prototype.requestSubmit`
 * spied, never against the real `submitAnswer` server action — `page.tsx`'s
 * own `screens.test.tsx` proves the screen wires this component to the right
 * form id and gates it on `busy`; the release gate itself (the GET writes
 * nothing, the POST needs the GET's cookie) is proved in `actions.test.ts`
 * and `player-answer-tokens.test.ts` against the one write this component
 * only ever triggers, never duplicates.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { AutoSubmitOnMount } from "./auto-submit";

function renderFormWithTrigger(formId: string) {
  return render(
    <>
      <form id={formId}>
        <input type="hidden" name="token" value="t" />
      </form>
      <AutoSubmitOnMount formId={formId} />
    </>,
  );
}

describe("OWNER-LAN172-17 — the WhatsApp tap auto-submits the page's own form", () => {
  it("submits the named form once it mounts", () => {
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});

    renderFormWithTrigger("answer-form");

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("never submits a form some other id names", () => {
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});

    render(
      <>
        <form id="answer-form">
          <input type="hidden" name="token" value="t" />
        </form>
        <AutoSubmitOnMount formId="a-different-id" />
      </>,
    );

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does nothing, without throwing, when no element with that id exists yet", () => {
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});

    expect(() => render(<AutoSubmitOnMount formId="never-rendered" />)).not.toThrow();
    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("fires only once per mount, not once per re-render", () => {
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});

    const { rerender } = renderFormWithTrigger("answer-form");
    rerender(
      <>
        <form id="answer-form">
          <input type="hidden" name="token" value="t" />
        </form>
        <AutoSubmitOnMount formId="answer-form" />
      </>,
    );

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });
});
