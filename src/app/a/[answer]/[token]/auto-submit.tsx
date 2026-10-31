"use client";

import { useEffect, useRef } from "react";

/**
 * Q-11's accepted deviation from "click submits": auto-submit gated on a
 * real human-interaction event — OWNER-LAN172-17, corrected by Q-30 (round 7)
 * and OWNER-LAN172-22 (round 8). Fires once, on the first qualifying event
 * NOT directed at either of `page.tsx`'s two forms (a click that reaches a
 * form control is the player using it, and must not be consumed). The GET
 * this page renders still writes nothing; the POST this triggers still goes
 * through the ordinary `<form>` mechanism and the unchanged cookie/token gate.
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

/** Every control on this page lives inside one of its two `<form>` elements, so `closest("form")` is the whole test, without enumerating MUI's internal DOM shape. */
function directedAtAForm(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("form") !== null;
}

export function AutoSubmitOnInteraction({ formId }: { formId: string }): null {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    function cleanup(): void {
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, handleFirstInteraction);
      }
    }

    function handleFirstInteraction(event: Event): void {
      if (fired.current) return;
      fired.current = true;
      cleanup();
      if (directedAtAForm(event.target)) return;
      const form = document.getElementById(formId);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    }

    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, handleFirstInteraction, { passive: true });
    }

    return cleanup;
  }, [formId]);

  return null;
}

/**
 * LAN-498 (Brian, 31 October 2026): a link delivered by WhatsApp saves its
 * answer the moment the page has hydrated — no interaction needed. Clint's
 * players tapped Yes, read the page, and left; nothing was recorded, because
 * the save waited for a touch.
 *
 * Safe only where the delivery channel is WhatsApp, and `page.tsx` renders
 * this only there: WhatsApp's preview fetcher reads HTML and runs no script,
 * so this never fires for it. Email keeps `AutoSubmitOnInteraction` above —
 * Safe Links and other mail scanners open links in a browser that does run
 * script. The GET still writes nothing; this submits the ordinary form
 * through the same action, cookie gate and throttle. Once per mount, Strict
 * Mode's double effect included.
 */
export function SubmitOnLoad({ formId }: { formId: string }): null {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [formId]);

  return null;
}
