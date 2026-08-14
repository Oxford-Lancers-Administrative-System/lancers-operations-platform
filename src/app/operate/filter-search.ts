"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A search box that filters as you type, and the two bugs that shape it.
 *
 * ## Why this is shared rather than written twice
 *
 * The roster had it first. Its search box relied on the browser's implicit form
 * submission — type, then press Enter — and Brian's verdict on the real screen
 * was blunt and correct: "the search absolutely does not work. I cannot
 * filter." A box that looks like a filter and only responds to a keypress
 * nothing on screen mentions is a broken filter, whatever the HTML says.
 *
 * The events list then shipped with the identical broken version, and he found
 * it again. Two screens re-inventing the same defect is the argument for one
 * implementation, so this is that implementation and both screens call it.
 *
 * ## The two corrections it carries
 *
 * Neither is obvious, and both were paid for on a real screen:
 *
 *   * **`q` defaults to what is in the box, not to the committed prop.** A
 *     filter chosen inside the debounce window used to build its URL from the
 *     older prop and silently discard the text just typed — and the pending
 *     debounce would then fire with a stale filter and discard *that*. One of
 *     the two was always lost. Independent review found it. `buildHref` is
 *     therefore handed the current text.
 *   * **An arriving URL is adopted only when it says something new.** A
 *     navigation landing while the operator keeps typing used to re-seed the
 *     box from the older prop, jumping the caret and dropping the characters
 *     typed in that window.
 */
export const SEARCH_DEBOUNCE_MS = 250;

export interface FilterSearch {
  /** What is in the box right now. Bind it to `value`. */
  typed: string;
  setTyped: (value: string) => void;
  /**
   * The href for a filter change, built with the *current* search text.
   *
   * Use this for every other control on the form, so choosing a status inside
   * the debounce window carries the half-typed search with it.
   */
  hrefFor: (patch: Record<string, string>) => string;
}

export function useFilterSearch({
  search,
  basePath,
  filters,
  push,
}: {
  /** What the URL currently carries. The source of truth. */
  search: string;
  /** Where the form lives — `/operate/roster`, `/operate/events`. */
  basePath: string;
  /** Every other query key, and its current value. Empty values are dropped. */
  filters: Record<string, string>;
  /** `router.push`. Passed in so this module never imports the router. */
  push: (href: string) => void;
}): FilterSearch {
  const [typed, setTyped] = useState(search);
  /** What the URL last carried, as far as this component is concerned. */
  const committed = useRef(search);

  // `filters` is a fresh object on every render, so depending on its identity
  // would rebuild `hrefFor` every time and restart the debounce with it.
  // Serialising it gives a value that changes only when a filter actually does.
  const filterKey = JSON.stringify(filters);

  const hrefFor = useCallback(
    (patch: Record<string, string>): string => {
      const next = {
        q: typed,
        ...(JSON.parse(filterKey) as Record<string, string>),
        ...patch,
      };
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value !== "") params.set(key, value);
      }
      const query = params.toString();
      return query === "" ? basePath : `${basePath}?${query}`;
    },
    [typed, basePath, filterKey],
  );

  /**
   * The URL is the source of truth — Back, Clear filters, a shared link — but
   * only adopt it when it says something we did not just say ourselves.
   *
   * This used to carry a second clause, `|| search === typed`, meant to stop a
   * landing navigation re-seeding the box while the operator kept typing.
   * Independent review found it untested, and writing the missing test showed it
   * was worse than inert.
   *
   * The clause only fires when the arriving URL says **exactly** what the box
   * already holds — so it is never protecting unsaved keystrokes; there are none
   * to protect. What it did was skip advancing `committed.current`, leaving a
   * pending debounce believing it still had something to say.
   *
   * The redundant navigation that produced is worth stating precisely, because
   * the mechanism is indirect: advancing `committed.current` does **not** cancel
   * a running timer. What cancels it is the effect re-running — and it re-runs
   * because changing a filter changes `filterKey`, which changes `hrefFor`'s
   * identity, which is in the effect's dependency list. The timer is then
   * recreated, sees `typed === committed.current`, and returns without pushing.
   * A future change that memoised `hrefFor` differently would silently restore
   * the double navigation, and the test would still pass.
   *
   * Adopting an identical value is safe: `setTyped` with the same string is a
   * no-op to React, so there is no re-render and no caret to jump. The guard
   * against stale props is `search === committed.current`, which is the one that
   * was doing the work all along.
   */
  useEffect(() => {
    if (search === committed.current) return;
    committed.current = search;
    setTyped(search);
  }, [search]);

  /**
   * The pause matters. Without it every keystroke is a server round trip and a
   * re-render, and these screens read the whole roster or the whole season's
   * events each time.
   */
  useEffect(() => {
    if (typed === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = typed;
      push(hrefFor({ q: typed }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, hrefFor, push]);

  return { typed, setTyped, hrefFor };
}
