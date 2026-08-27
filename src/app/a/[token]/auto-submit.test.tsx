/**
 * `AutoSubmitOnInteraction` in isolation — LAN-172, OWNER-LAN172-17,
 * interaction-gated by Q-30 (correction round 7, LAN-172-r5-F1).
 *
 * Proved against a plain `<form>` with `HTMLFormElement.prototype.requestSubmit`
 * spied, never against the real `submitAnswer` server action — `page.tsx`'s
 * own `screens.test.tsx` proves the screen wires this component to the right
 * form id and gates it on `busy`; the release gate itself (the GET writes
 * nothing, the POST needs the GET's cookie, the token is single-use and
 * idempotent) is proved in `actions.test.ts` and
 * `player-answer-tokens.test.ts` against the one write this component only
 * ever triggers, never duplicates. What is under test here is narrower and
 * exactly what Q-30 asks for: the write must never fire from rendering
 * alone, and must fire exactly once after a genuine interaction signal.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup as rtlCleanup } from "@testing-library/react";

import { AutoSubmitOnInteraction } from "./auto-submit";

afterEach(() => {
  rtlCleanup();
});

function formAndTrigger(formId: string) {
  return (
    <>
      <form id={formId}>
        <input type="hidden" name="token" value="t" />
      </form>
      <AutoSubmitOnInteraction formId={formId} />
    </>
  );
}

function spySubmit() {
  return vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
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

    render(formAndTrigger("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("still does not submit after a re-render with no interaction in between", () => {
    const submitSpy = spySubmit();

    const { rerender } = render(formAndTrigger("answer-form"));
    rerender(formAndTrigger("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });

  it("does not submit on an unmount/remount pair (React Strict Mode's double-invoked effect) with no interaction in between", () => {
    const submitSpy = spySubmit();

    const { unmount } = render(formAndTrigger("answer-form"));
    unmount();
    render(formAndTrigger("answer-form"));

    expect(submitSpy).not.toHaveBeenCalled();
    submitSpy.mockRestore();
  });
});

describe("OWNER-LAN172-17 / Q-30 — the write fires once, and only once, after a genuine interaction", () => {
  it.each(QUALIFYING_EVENTS)("submits after a %s event", (type) => {
    const submitSpy = spySubmit();
    render(formAndTrigger("answer-form"));

    window.dispatchEvent(new Event(type));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("submits only once when several qualifying events arrive in a burst — a real touch dispatches both touchstart and pointerdown", () => {
    const submitSpy = spySubmit();
    render(formAndTrigger("answer-form"));

    window.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("pointermove"));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("does not submit again on a later event once it has already fired", () => {
    const submitSpy = spySubmit();
    render(formAndTrigger("answer-form"));

    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("keydown"));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    submitSpy.mockRestore();
  });

  it("never submits a form some other id names", () => {
    const submitSpy = spySubmit();

    render(
      <>
        <form id="answer-form">
          <input type="hidden" name="token" value="t" />
        </form>
        <AutoSubmitOnInteraction formId="a-different-id" />
      </>,
    );
    window.dispatchEvent(new Event("keydown"));

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

describe("OWNER-LAN172-17 / Q-30 — idempotent under remount, Strict Mode, and mid-flight reload", () => {
  it("an interaction on a fresh mount after Strict Mode's synchronous mount→cleanup→mount still fires exactly once", () => {
    // Strict Mode invokes this exact sequence synchronously in development,
    // on the same component instance, before any real interaction could
    // plausibly arrive. Simulated directly: mount, unmount (cleanup runs,
    // listeners removed), mount again — then one real interaction.
    const submitSpy = spySubmit();

    const { unmount } = render(formAndTrigger("answer-form"));
    unmount();
    render(formAndTrigger("answer-form"));
    window.dispatchEvent(new Event("keydown"));

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

    const { unmount } = render(formAndTrigger("answer-form"));
    window.dispatchEvent(new Event("keydown"));
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

    const { unmount } = render(formAndTrigger("answer-form"));
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

    const first = render(formAndTrigger("answer-form"));
    window.dispatchEvent(new Event("keydown"));
    expect(submitSpy).toHaveBeenCalledTimes(1);
    first.unmount();

    render(formAndTrigger("answer-form"));
    expect(submitSpy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("keydown"));
    expect(submitSpy).toHaveBeenCalledTimes(2);

    submitSpy.mockRestore();
  });
});

describe("OWNER-LAN172-17 / Q-30 — passive listeners never block scrolling or touch", () => {
  it("attaches every listener with passive: true", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    render(formAndTrigger("answer-form"));

    for (const call of addSpy.mock.calls) {
      const options = call[2];
      expect(options).toMatchObject({ passive: true });
    }

    addSpy.mockRestore();
  });
});
