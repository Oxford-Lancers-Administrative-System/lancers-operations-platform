"use client";

import { useEffect, useRef } from "react";

/**
 * Q-11's one accepted deviation, built — OWNER-LAN172-17, then corrected by
 * Q-30 (LAN-172 correction round 7, LAN-172-r5-F1).
 *
 * ## Round 6 shipped this unconditionally on mount, and that broke the gate
 *
 * The gate cookie `actions.ts` checks is set on *every* GET to `/a/[token]`,
 * unconditionally — `src/lib/rsvp/answer-gate.ts` is explicit that presence,
 * not value, is the whole check, because `Path` scoping is what proves the
 * cookie can only return on a request to this exact token's own URL. That
 * design was sound as long as only a human's own click could turn the GET's
 * cookie into a POST. Firing `requestSubmit()` unconditionally the instant
 * this component mounted collapsed that distinction: any JS-executing
 * visitor that renders this page — including the well-documented class of
 * corporate link/email security scanners that render full JavaScript in
 * headless Chromium specifically to catch dynamic phishing behaviour —
 * would carry the same cookie back on the same-origin POST its own script
 * fired, with no human action at all. `REQ-no-false-rsvp` names a security
 * scanner explicitly as an actor that must never produce an authoritative
 * response, so that was a release-gate violation, not a cosmetic gap.
 *
 * ## The fix: gate the submit on a genuine human-interaction signal
 *
 * Brian's resolution, Q-30, option (c): fire only after the browser reports
 * real, OS-level input — a pointer, a key, a touch, or a scroll — never on
 * mount alone. This is not the user-agent heuristic Q-11 already forbade:
 * that ruled out guessing *who* a visitor is from a string it sends. This is
 * direct evidence of *what actually happened* in this browser, and it is
 * strictly stronger evidence of a human than "the cookie came back" ever
 * was — a scanner that renders a page and moves on produces none of these
 * events, because nothing simulates them without deliberately choosing to.
 *
 * The listened-for events are exactly Brian's own named set: `pointerdown`
 * and `pointermove` (a pointer — covers mouse, pen and, on browsers with
 * Pointer Events, touch too), `mousemove` alongside it for the rare browser
 * without Pointer Events, `keydown` (a key), `touchstart` and `touchmove` (a
 * touch, kept alongside pointer events for the same reason), and `scroll`
 * and `wheel` (a scroll). All are attached to `window` with `passive: true`
 * — nothing here ever calls `preventDefault`, so scrolling and touch stay
 * exactly as responsive as they would be with no listener at all.
 *
 * The very first qualifying event removes every listener and submits,
 * guarded by `fired` so a burst of near-simultaneous events (a touch
 * legitimately dispatches both `touchstart` and `pointerdown` for the same
 * physical contact) still submits only once: the first handler to run sets
 * `fired.current` and calls `cleanup()` synchronously, before the browser's
 * own event queue reaches any sibling event already in flight for the same
 * input, so no other listener call can pass the guard. `fired` is a ref, so
 * it survives React Strict Mode's synchronous mount → cleanup → mount of the
 * same component instance in development: an interaction that (implausibly)
 * arrived inside that gap is not fired twice.
 *
 * ## What is unchanged
 *
 * The GET this page renders on still writes nothing, not even in response to
 * these listeners — they observe events, they do not touch the database.
 * The POST this triggers is still exactly `page.tsx`'s own form, still
 * checked against exactly the cookie `src/proxy.ts` set on that GET, still
 * refused without it. `consumeAnswerTokenIn`'s row lock still makes the
 * token single-use and every reload or double-submit idempotent, regardless
 * of anything this component does or does not guard client-side — that
 * safety was never this component's job. A visitor who never produces a
 * qualifying event — no JavaScript, or a human who simply reads without
 * touching the screen — still sees the page's own single visible button,
 * worded as the answer action and never as a confirmation: Q-11's fallback,
 * unchanged.
 *
 * ## What was deliberately left unchanged, and why
 *
 * The heading and "Your answer" fact box still describe the token's own
 * encoded answer immediately, before any interaction or write — the same
 * choice round 5 made (OWNER-LAN172-13) and the same tension the original
 * walk report first named. Interaction-gating can only widen the window
 * before a real write lands (a passive reader who never scrolls or taps
 * stays on the fallback indefinitely, exactly as intended), so this is not
 * a smaller version of that tension — deliberately not addressed here: it is
 * a copy and page-architecture question for `/a/[token]` as a whole, an
 * explicit prior owner decision (OWNER-LAN172-13), and orthogonal to Q-30's
 * own ask (gate the write, not redesign the page). Recorded as a residual
 * item in this round's receipt for Brian's attention, not decided silently.
 */
const INTERACTION_EVENTS = [
  "pointerdown",
  "pointermove",
  "mousemove",
  "keydown",
  "touchstart",
  "touchmove",
  "scroll",
  "wheel",
] as const;

export function AutoSubmitOnInteraction({ formId }: { formId: string }): null {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    function cleanup(): void {
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, submit);
      }
    }

    function submit(): void {
      if (fired.current) return;
      fired.current = true;
      cleanup();
      const form = document.getElementById(formId);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    }

    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, submit, { passive: true });
    }

    return cleanup;
  }, [formId]);

  return null;
}
