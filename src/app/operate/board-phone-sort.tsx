"use client";

import { useEffect, useId, useRef } from "react";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

/**
 * The phone boards' sort — LAN-426. Below `md` the Recruits and Roster boards
 * draw cards, which have no column headings to press, so this one select
 * offers the three sorts a phone needs: first name, last name and status, each
 * either way. It writes the same `sort` / `dir` the desktop headings do, so it
 * composes with every filter and applies to the whole filtered set.
 *
 * Status sorts alphabetically by its label, which on both boards is the stored
 * code capitalised — so the desktop Status column's own sort key is reused.
 *
 * Persistence: the choice is in the address bar (a reload keeps it) and in
 * `localStorage`, keyed per board, so coming back to the board from the menu —
 * a URL with no sort — restores it. The stored value is read only where the
 * cards are what is drawn, so the desktop table's default order never changes.
 */

const PHONE_SORT_KEYS = Object.freeze(["firstName", "lastName", "status"] as const);
type PhoneSortKey = (typeof PHONE_SORT_KEYS)[number];

export interface PhoneSort {
  key: PhoneSortKey;
  direction: "asc" | "desc";
}

/**
 * Where the boards draw cards rather than the table — below `md`, held
 * upright. LAN-427: a phone turned on its side gets the table.
 */
/** MUI's `md` breakpoint; `down("md")` stops 0.05px short of it. */
const MD_PX = 900;
const BELOW_MD = `(max-width: ${MD_PX - 0.05}px)`;
const PHONE_CARDS_MEDIA = `${BELOW_MD} and (orientation: portrait)`;

/**
 * LAN-427: an `sx` key for a phone on its side — below `md`, landscape — where
 * the boards draw the desktop table instead of cards. Rotating back upright
 * falls out of the query and the cards return.
 */
export const PHONE_LANDSCAPE = `@media ${BELOW_MD} and (orientation: landscape)`;

/**
 * LAN-427: the table's own scroll box on a phone on its side — nearly the
 * whole short screen, so the sticky headings stay in view while a swipe
 * scrolls the rows and the columns, and the page scroll brings the box itself
 * fully into view.
 */
export const LANDSCAPE_TABLE_HEIGHT = "calc(100dvh - 16px)";

const KEY_LABELS: Readonly<Record<PhoneSortKey, string>> = Object.freeze({
  firstName: "First name",
  lastName: "Last name",
  status: "Status",
});

function phoneSortValue(sort: PhoneSort): string {
  return `${sort.key}:${sort.direction}`;
}

function phoneSortLabel(sort: PhoneSort): string {
  return `${KEY_LABELS[sort.key]} ${sort.direction === "asc" ? "A–Z" : "Z–A"}`;
}

/** The sorts this viewer may choose — Status only where the board shows that column. */
function phoneSortOptions(statusAvailable: boolean): readonly PhoneSort[] {
  return PHONE_SORT_KEYS.filter((key) => key !== "status" || statusAvailable).flatMap((key) => [
    { key, direction: "asc" as const },
    { key, direction: "desc" as const },
  ]);
}

/** A stored or selected value, or null where it is not one of this viewer's options. */
function parsePhoneSort(value: string | null, statusAvailable: boolean): PhoneSort | null {
  if (!value) return null;
  return (
    phoneSortOptions(statusAvailable).find((option) => phoneSortValue(option) === value) ?? null
  );
}

function phoneSortStorageKey(board: "roster" | "recruitment"): string {
  return `lancers:board-phone-sort:${board}`;
}

/**
 * Restores the remembered phone sort once, on arrival, when the address bar
 * carries none and the cards are what is on screen. Storage can be missing or
 * refuse access; either way the board keeps its default order.
 */
export function useRememberedPhoneSort(
  board: "roster" | "recruitment",
  statusAvailable: boolean,
  apply: (sort: PhoneSort) => void,
) {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("sort")) return;
      if (!window.matchMedia(PHONE_CARDS_MEDIA).matches) return;
      const stored = parsePhoneSort(
        window.localStorage.getItem(phoneSortStorageKey(board)),
        statusAvailable,
      );
      if (stored) applyRef.current(stored);
    } catch {
      // No storage, no restore.
    }
  }, [board, statusAvailable]);
}

export function rememberPhoneSort(board: "roster" | "recruitment", sort: PhoneSort) {
  try {
    window.localStorage.setItem(phoneSortStorageKey(board), phoneSortValue(sort));
  } catch {
    // Storage refused: the address bar still carries the choice.
  }
}

export function PhoneSortSelect({
  sortKey,
  sortDirection,
  statusAvailable,
  onChange,
}: {
  sortKey: string | null;
  sortDirection: "asc" | "desc";
  statusAvailable: boolean;
  onChange: (sort: PhoneSort) => void;
}) {
  const labelId = useId();
  const options = phoneSortOptions(statusAvailable);
  const current = sortKey ? `${sortKey}:${sortDirection}` : "";
  const value = options.some((option) => phoneSortValue(option) === current) ? current : "";
  return (
    <FormControl size="small" sx={{ minWidth: 170 }}>
      <InputLabel id={labelId}>Sort</InputLabel>
      <Select
        labelId={labelId}
        label="Sort"
        value={value}
        onChange={(event) => {
          const next = parsePhoneSort(event.target.value, statusAvailable);
          if (next) onChange(next);
        }}
        data-testid="phone-sort"
      >
        {options.map((option) => (
          <MenuItem key={phoneSortValue(option)} value={phoneSortValue(option)}>
            {phoneSortLabel(option)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
