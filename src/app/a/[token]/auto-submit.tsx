"use client";

import { useEffect, useRef } from "react";

/**
 * Q-11's one accepted deviation, built — OWNER-LAN172-17.
 *
 * `page.tsx`'s own form (`id={formId}`) already records whatever this
 * token's own `y`/`n` encodes — this component's only job is to make a
 * JS-capable browser submit that exact form itself, the instant the page
 * mounts, so the WhatsApp tap really is the whole interaction. Without
 * JavaScript this effect never runs at all, and the page's own visible
 * button remains: the one accepted deviation, a second tap for a small
 * minority of clients.
 *
 * ## Why this does not touch the release gate
 *
 * This calls `requestSubmit()` on the form's own DOM node — the same
 * mechanism a manual click already uses, not a new write path. The cookie
 * `actions.ts` checks was already set by the GET that rendered this page
 * (`src/proxy.ts`, on that GET, before this component ever mounts); an
 * ordinary same-origin form submission carries it automatically, exactly as
 * a manual click would. Nothing here writes anything itself, sniffs the
 * user agent, or guesses whether a caller is a human — it only triggers the
 * one write `page.tsx`'s own form already makes, gated exactly as before.
 *
 * `fired` guards against Strict Mode's double-invoked effect (and any other
 * re-render before the resulting navigation lands) submitting the same form
 * twice from one mount — `consumeAnswerTokenIn` is idempotent regardless,
 * but there is no reason to fire the request twice.
 */
export function AutoSubmitOnMount({ formId }: { formId: string }): null {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [formId]);

  return null;
}
