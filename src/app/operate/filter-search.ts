"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A search box that filters as you type — shared after two screens shipped the identical broken version. Decision history: docs/ux/tickets/LAN-73-shell-and-access.md.
export const SEARCH_DEBOUNCE_MS = 250;

export interface FilterSearch {
  typed: string;
  setTyped: (value: string) => void;
  hrefFor: (patch: Record<string, string>) => string;
}

export function useFilterSearch({
  search,
  basePath,
  filters,
  push,
}: {
  search: string;
  basePath: string;
  filters: Record<string, string>;
  push: (href: string) => void;
}): FilterSearch {
  const [typed, setTyped] = useState(search);
  const committed = useRef(search);

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

  // Adopted only when the URL says something new — see relocations.md.
  useEffect(() => {
    if (search === committed.current) return;
    committed.current = search;
    setTyped(search);
  }, [search]);

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
