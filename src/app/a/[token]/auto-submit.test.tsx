/**
 * `AutoSubmitOnInteraction` in isolation — LAN-172, OWNER-LAN172-17,
 * interaction-gated by Q-30 (round 7, LAN-172-r5-F1), corrected again by
 * OWNER-LAN172-22 (round 8): the gate must not consume the player's own
 * interaction with the form.
 *
 * Proved against a plain `<form>` with `HTMLFormElement.prototype.requestSubmit`
 * spied, never against the real `submitAnswer` server action — `page.tsx`'s
 * own `screens.test.tsx` proves the screen wires this component to the right
 * form id and gates it on `busy`; the release gate itself (the GET writes
 * nothing, the POST needs the GET's cookie, the token is single-use and
 * idempotent) is proved in `actions.test.ts` and
 * `player-answer-tokens.test.ts` against the one write this component only
 * ever triggers, never duplicates. What is under test here is exactly what
 * Q-30 and round 8 both ask for: the write must never fire from rendering
 * alone; it must fire exactly once after a genuine interaction that is not
 * directed at the form's own controls; and an interaction that IS directed
 * at the form (focusing a field, opening a control, pressing the visible
 * submit button) must never trigger it, leaving the player free to complete
 * and submit the form themselves.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup as rtlCleanup } from "@testing-library/react";

import { AutoSubmitOnInteraction } from "./auto-submit";

afterEach(() => {
  rtlCleanup();
});

/**
 * A form standing in for `page.tsx`'s own shared confirm-and-follow-up
 * form: a text field (the reason box / a question's own input) and a
 * submit button, both real controls a player would actually touch — plus
 * an element outside the form, standing in for the rest of the page
 * (`page.tsx`'s heading, fact box, banner) a passive interaction might land
 * on instead.
 */
function pageWithFormAndElsewhere(formId: string) {
  return (
    <>
      <form id={formId}>
        <input type="text" name="reason" data-testid="reason-field" />
        <button type="submit" data-testid="submit-button">
          Save
        </button>
      </form>
      <div data-testid="elsewhere">Heading and fact box live out here</div>
      <AutoSubmitOnInteraction formId={formId} />
    </>
  );
}

function spySubmit() {
  return vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
}

/** Dispatches a real, bubbling event directly on `element`, as a trusted browser event would. */
function fireOn(element: Element, type: string): void {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Every named category Brian approved (Q-30): pointer, key, touch, scroll. */
const QUALIFYING_EVENTS = [
  "pointerdown",
  "pointermove",
  "mousemove",
  "keydown",
  "touchstart",
  "touchmove",
  "scroll",
  "wheel",
] as const;

describe("OWNER-LAN172-17 / Q-30 — the write never fires from rendering alone", () => {
  it("does not submit the form merely by mounting — no event dispatched at all", () => {
    const submitSpy = spySubmit();

    render(pageWithFormAndElsewhere("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("still does not submit after a re-render with no interaction in between", () => {
    const submitSpy = spySubmit();

    const { rerender } = render(pageWithFormAndElsewhere("answer-form"));
    rerender(pageWithFormAndElsewhere("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does not submit on an unmount/remount pair (React Strict Mode's double-invoked effect) with no interaction in between", () => {
    const submitSpy = spySubmit();

    const { unmount } = render(pageWithFormAndElsewhere("answer-form"));
    unmount();
    render(pageWithFormAndElsewhere("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });
});

describe("OWNER-LAN172-17 / Q-30 — the write fires once, and only once, after a genuine interaction elsewhere on the page", () => {
  it.each(QUALIFYING_EVENTS)("submits after a %s event dispatched outside the form", (type) => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));

    fireOn(getByTestId("elsewhere"), type);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("submits only once when several qualifying events arrive in a burst — a real touch dispatches both touchstart and pointerdown", () => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));
    const elsewhere = getByTestId("elsewhere");

    fireOn(elsewhere, "touchstart");
    fireOn(elsewhere, "pointerdown");
    fireOn(elsewhere, "pointermove");

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("does not submit again on a later event once it has already fired", () => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));
    const elsewhere = getByTestId("elsewhere");

    fireOn(elsewhere, "keydown");
    fireOn(elsewhere, "scroll");
    fireOn(elsewhere, "keydown");

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("never submits a form some other id names", () => {
    const submitSpy = spySubmit();

    const { getByTestId } = render(
      <>
        <form id="answer-form">
          <input type="hidden" name="token" value="t" />
        </form>
        <div data-testid="elsewhere" />
        <AutoSubmitOnInteraction formId="a-different-id" />
      </>,
    );
    fireOn(getByTestId("elsewhere"), "keydown");

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does nothing, without throwing, when no element with that id exists", () => {
    const submitSpy = spySubmit();

    expect(() => render(<AutoSubmitOnInteraction formId="never-rendered" />)).not.toThrow();
    expect(() => window.dispatchEvent(new Event("keydown"))).not.toThrow();

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });
});

describe("OWNER-LAN172-22 — an interaction directed at the form's own controls never triggers the auto-submit", () => {
  it("does not submit when the reason field is focused/clicked", () => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));

    fireOn(getByTestId("reason-field"), "pointerdown");

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does not submit while typing into the reason field", () => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));

    fireOn(getByTestId("reason-field"), "keydown");

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does not submit when the visible submit button itself is pressed — the native form submission handles it instead", () => {
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));

    fireOn(getByTestId("submit-button"), "pointerdown");

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("disengages entirely after a form-directed event — a later interaction elsewhere no longer fires it either", () => {
    // Without this, a later ambient event (the page scrolling under a mobile
    // keyboard while the player is mid-type) could still auto-submit the
    // default and discard whatever they had already started typing.
    const submitSpy = spySubmit();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));

    fireOn(getByTestId("reason-field"), "pointerdown");
    fireOn(getByTestId("elsewhere"), "scroll");
    fireOn(getByTestId("elsewhere"), "keydown");

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("the player can still focus the reason field, then deliberately submit it themselves, with exactly one write from their own submit", () => {
    // This component never calls requestSubmit() for the deliberate path —
    // proved by the previous tests. What this proves is the other half: a
    // real click on the visible submit button still reaches the form's own
    // native submission mechanism (jsdom's own request-submit-on-click),
    // completely unaffected by this component having run first.
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));
    const form = document.getElementById("answer-form");
    if (!(form instanceof HTMLFormElement)) throw new Error("form did not render");
    let submitCount = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    fireOn(getByTestId("reason-field"), "pointerdown");
    getByTestId("reason-field").dispatchEvent(new Event("focus", { bubbles: true }));
    (getByTestId("submit-button") as HTMLButtonElement).click();

    expect(submitCount).toBe(1);
  });
});

describe("OWNER-LAN172-17 / Q-30 — idempotent under remount, Strict Mode, and mid-flight reload", () => {
  it("an interaction outside the form on a fresh mount after Strict Mode's synchronous mount→cleanup→mount still fires exactly once", () => {
    // Strict Mode invokes this exact sequence synchronously in development,
    // on the same component instance, before any real interaction could
    // plausibly arrive. Simulated directly: mount, unmount (cleanup runs,
    // listeners removed), mount again — then one real interaction.
    const submitSpy = spySubmit();

    const { unmount } = render(pageWithFormAndElsewhere("answer-form"));
    unmount();
    const { getByTestId } = render(pageWithFormAndElsewhere("answer-form"));
    fireOn(getByTestId("elsewhere"), "keydown");

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("unmounting after the interaction fired (a submit in flight) does not throw or fire again", () => {
    // A player interacting, then immediately reloading before the POST's
    // navigation lands, unmounts this component mid-flight. The one earlier
    // requestSubmit() call already happened; the token's own single-use row
    // lock (player-answer-tokens.test.ts) is what makes a genuinely
    // duplicated request safe regardless — this only proves the component
    // itself does not misbehave (double-fire, throw) around that unmount.
    const submitSpy = spySubmit();

    const { getByTestId, unmount } = render(pageWithFormAndElsewhere("answer-form"));
    fireOn(getByTestId("elsewhere"), "keydown");
    expect(submitSpy).toHaveBeenCalledTimes(1);

    expect(() => unmount()).not.toThrow();
    window.dispatchEvent(new Event("scroll"));
    expect(submitSpy).toHaveBeenCalledTimes(1);

    submitSpy.mockRestore();
  });

  it("removes its listeners on unmount — no submit after the component is gone", () => {
    const submitSpy = spySubmit();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(pageWithFormAndElsewhere("answer-form"));
    const addedTypes = addSpy.mock.calls.map(([type]) => type);
    for (const type of QUALIFYING_EVENTS) expect(addedTypes).toContain(type);

    unmount();
    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    for (const type of QUALIFYING_EVENTS) expect(removedTypes).toContain(type);

    window.dispatchEvent(new Event("keydown"));
    expect(submitSpy).not.toHaveBeenCalled();

    submitSpy.mockRestore();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("a second, independent mount (a fresh navigation to the same URL) gets its own fresh guard and needs its own interaction", () => {
    const submitSpy = spySubmit();

    const first = render(pageWithFormAndElsewhere("answer-form"));
    fireOn(first.getByTestId("elsewhere"), "keydown");
    expect(submitSpy).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = render(pageWithFormAndElsewhere("answer-form"));
    expect(submitSpy).toHaveBeenCalledTimes(1);
    fireOn(second.getByTestId("elsewhere"), "keydown");
    expect(submitSpy).toHaveBeenCalledTimes(2);

    submitSpy.mockRestore();
  });
});

describe("OWNER-LAN172-17 / Q-30 — passive listeners never block scrolling or touch", () => {
  it("attaches every listener with passive: true", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    render(pageWithFormAndElsewhere("answer-form"));

    for (const call of addSpy.mock.calls) {
      const options = call[2];
      expect(options).toMatchObject({ passive: true });
    }

    addSpy.mockRestore();
  });
});
