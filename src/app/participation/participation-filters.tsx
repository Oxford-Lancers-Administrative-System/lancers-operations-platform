"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import {
  ANSWER_FILTERS,
  ATTENDANCE_FILTERS,
  PARTICIPATION_PARAMS,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import { useFilterSearch } from "../operate/filter-search";

import {
  ANSWER_NO,
  ANSWER_NONE,
  ANSWER_YES,
  CAPACITY_LABELS,
  CLEAR_FILTERS,
  DELIVERY_LABELS,
  DELIVERY_NOT_QUEUED,
  FILTER_ALL,
  FILTER_ANSWER_LABEL,
  FILTER_ATTENDANCE_LABEL,
  FILTER_CAPACITY_LABEL,
  FILTER_DELIVERY_LABEL,
  FILTER_SEARCH_LABEL,
  FILTERS_COMBINE,
  NEEDS_ATTENTION_FILTER_LABEL,
  NOT_RECORDED,
  PRESENCE_LABELS,
  WALK_UP_LABEL,
} from "./presentation";

/**
 * W7's filter bar — by name, capacity, answer, attendance, and delivery at the
 * operator tier. Brian, 2026-08-21: "I also should have filters to only
 * players, a filter to only yes, a filter to only no … I can see only the nos."
 *
 * ## Why the state is in the URL
 *
 * The same reason the roster, the events list and the attendance board put
 * theirs there: a filtered table is a link, the back button undoes a filter,
 * and a shared club link can carry one. It also means the filtering itself is
 * done once, on the server, by the same pure function both tiers call — rather
 * than twice, in two components, from two copies of the rules.
 *
 * The search box is `useFilterSearch`, which carries the two corrections Brian
 * paid for twice on the other screens: filter as you type rather than a hidden
 * Enter, and no keystrokes dropped when a navigation lands mid-typing.
 *
 * ## Native selects, deliberately
 *
 * Every filter is a real `<select>` rather than MUI's menu. Three reasons, and
 * the third is the one that matters here: it is the phone control the club
 * actually uses at 375px; it needs no portal, so the element a test drives is
 * the element the operator drives; and a `change` event on it is the same event
 * either way. This mission has already shipped a control that looked right and
 * was inert, and a filter whose test drives a different element from the
 * operator is exactly how that happens.
 *
 * ## The delivery filter exists only where the column does
 *
 * `showDelivery` is the tier, and the club-link page passes `false`. There is
 * nothing to hide: those rows carry no delivery state, so the control would
 * filter on a field that is not there.
 */
const ANSWER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  yes: ANSWER_YES,
  no: ANSWER_NO,
  none: ANSWER_NONE,
});

function FilterSelect({
  label,
  testId,
  value,
  options,
  onPick,
  minWidth,
}: {
  label: string;
  testId: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onPick: (value: string) => void;
  minWidth: number;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onPick(event.target.value)}
      slotProps={{
        select: { native: true },
        inputLabel: { shrink: true },
        htmlInput: { "data-testid": testId },
      }}
      sx={{ minWidth }}
    >
      <option value="">{FILTER_ALL}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </TextField>
  );
}

export function ParticipationFilterBar({
  basePath,
  filters,
  showDelivery,
}: {
  basePath: string;
  filters: ParticipationFilters;
  showDelivery: boolean;
}) {
  const router = useRouter();
  // R157C-B2. A filter change re-orders what is already on screen; it is not a
  // fresh page, so it must not fling an operator part-way down the table back
  // to the top. `scroll: false` is Next.js's own control for this
  // (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  // § Disable scrolling to the top of the page) — the URL still carries every
  // filter and sort key, which stays the single source of truth for the view.
  const push = useCallback((href: string) => router.push(href, { scroll: false }), [router]);

  const carried: Record<string, string> = {
    [PARTICIPATION_PARAMS.capacity]: filters.capacity,
    [PARTICIPATION_PARAMS.answer]: filters.answer,
    [PARTICIPATION_PARAMS.attendance]: filters.attendance,
    [PARTICIPATION_PARAMS.sort]: filters.sort,
    [PARTICIPATION_PARAMS.direction]: filters.direction,
  };
  if (showDelivery) carried[PARTICIPATION_PARAMS.delivery] = filters.delivery;

  const { typed, setTyped, hrefFor } = useFilterSearch({
    search: filters.search,
    basePath,
    filters: carried,
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(hrefFor(patch), { scroll: false });

  const anyFilter =
    filters.search !== "" ||
    filters.capacity !== "" ||
    filters.answer !== "" ||
    filters.attendance !== "" ||
    filters.delivery !== "";

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}
      data-testid="participation-filters"
    >
      <TextField
        size="small"
        label={FILTER_SEARCH_LABEL}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "filter-search" } }}
        sx={{ flex: 1, minWidth: 170 }}
      />
      <FilterSelect
        label={FILTER_CAPACITY_LABEL}
        testId="filter-capacity"
        value={filters.capacity}
        minWidth={140}
        options={[
          ...Object.entries(CAPACITY_LABELS).map(([value, label]) => ({ value, label })),
          { value: "walk_up", label: WALK_UP_LABEL },
        ]}
        onPick={(value) => apply({ [PARTICIPATION_PARAMS.capacity]: value })}
      />
      <FilterSelect
        label={FILTER_ANSWER_LABEL}
        testId="filter-answer"
        value={filters.answer}
        minWidth={140}
        options={ANSWER_FILTERS.map((value) => ({ value, label: ANSWER_LABELS[value] }))}
        onPick={(value) => apply({ [PARTICIPATION_PARAMS.answer]: value })}
      />
      <FilterSelect
        label={FILTER_ATTENDANCE_LABEL}
        testId="filter-attendance"
        value={filters.attendance}
        minWidth={150}
        options={ATTENDANCE_FILTERS.map((value) => ({
          value,
          label:
            value === "not_recorded"
              ? NOT_RECORDED
              : PRESENCE_LABELS[value as keyof typeof PRESENCE_LABELS],
        }))}
        onPick={(value) => apply({ [PARTICIPATION_PARAMS.attendance]: value })}
      />
      {showDelivery ? (
        <FilterSelect
          label={FILTER_DELIVERY_LABEL}
          testId="filter-delivery"
          value={filters.delivery}
          minWidth={150}
          options={[
            { value: "attention", label: NEEDS_ATTENTION_FILTER_LABEL },
            ...Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label })),
            { value: "none", label: DELIVERY_NOT_QUEUED },
          ]}
          onPick={(value) => apply({ [PARTICIPATION_PARAMS.delivery]: value })}
        />
      ) : null}
      {anyFilter ? (
        <Button size="small" href={basePath} data-testid="filter-clear">
          {CLEAR_FILTERS}
        </Button>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {FILTERS_COMBINE}
        </Typography>
      )}
    </Stack>
  );
}
