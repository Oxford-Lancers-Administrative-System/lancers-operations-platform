"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Field } from "@/components/field";

import {
  ANSWER_FILTERS,
  ATTENDANCE_FILTERS,
  GROUP_BY_PARAM,
  PARTICIPATION_PARAMS,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import type { AttendanceGroupFamily } from "@/lib/services/attendance-group-by";
import { useFilterSearch } from "../operate/filter-search";
import { useRememberedGroupBy } from "../operate/group-by-memory";
import { GroupBySelect } from "../operate/group-by-select";

import {
  ANSWER_NO,
  ANSWER_NONE,
  ANSWER_YES,
  CAPACITY_LABELS,
  CLEAR_FILTERS,
  DELIVERY_LABELS,
  DELIVERY_NOT_QUEUED,
  FILTER_ANSWER_LABEL,
  FILTER_ATTENDANCE_LABEL,
  FILTER_CAPACITIES,
  FILTER_CAPACITY_LABEL,
  FILTER_DELIVERY_LABEL,
  FILTER_HEADING,
  FILTER_SEARCH_LABEL,
  NEEDS_ATTENTION_FILTER_LABEL,
  NOT_DELIVERED,
  NOT_RECORDED,
  PRESENCE_LABELS,
  WALK_UP_LABEL,
} from "./presentation";

/**
 * W7's filter bar — by name, capacity, answer, attendance, delivery at the
 * operator tier. Brian, 2026-08-21: "I also should have filters to only
 * players, a filter to only yes, a filter to only no." State lives in the URL
 * (filtering done once, server-side, one pure function for both tiers).
 *
 * LAN-511 (Brian and Stewart, 29 October): one-tap buttons in the calendar's
 * idiom (its period and term buttons) instead of dropdowns — every choice
 * visible, the chosen one filled, a second tap on it clears that filter. One
 * choice per row, as before, and the same URL parameters, so links still
 * work. `showDelivery` is the tier; those rows carry no delivery state.
 */
const ANSWER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  yes: ANSWER_YES,
  no: ANSWER_NO,
  none: ANSWER_NONE,
});

function FilterButtons({
  label,
  testId,
  value,
  options,
  onPick,
}: {
  label: string;
  testId: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  return (
    <Stack
      role="group"
      aria-label={label}
      data-testid={testId}
      data-value={value}
      direction={{ xs: "column", sm: "row" }}
      sx={{ gap: { xs: 0.5, sm: 1.5 }, alignItems: { sm: "center" } }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: { sm: 80 }, fontWeight: 600 }}
      >
        {label}
      </Typography>
      {/* The calendar's buttons: they wrap at desktop and scroll in one row at 375. */}
      <Stack
        direction="row"
        sx={{
          gap: 1,
          flexWrap: { xs: "nowrap", sm: "wrap" },
          overflowX: { xs: "auto", sm: "visible" },
          pb: { xs: 0.5, sm: 0 },
        }}
      >
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <Button
              key={option.value}
              size="small"
              variant={chosen ? "contained" : "outlined"}
              aria-pressed={chosen}
              data-testid={`${testId}-${option.value}`}
              sx={{ minHeight: 44, flexShrink: 0, whiteSpace: "nowrap" }}
              onClick={() => onPick(chosen ? "" : option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </Stack>
    </Stack>
  );
}

export function ParticipationFilterBar({
  basePath,
  filters,
  showDelivery,
  groupFamilies = [],
  groupBy = null,
  storageKey = null,
}: {
  basePath: string;
  filters: ParticipationFilters;
  showDelivery: boolean;
  /** LAN-497: the families this viewer may group by. Empty: no Group by select at all. */
  groupFamilies?: readonly AttendanceGroupFamily[];
  groupBy?: AttendanceGroupFamily | null;
  /** The viewer's key for the remembered choice, shared with the attendance register. */
  storageKey?: string | null;
}) {
  const router = useRouter();
  // R157C-B2: a filter change re-orders the screen, not a fresh page — `scroll: false` keeps an operator part-way down from bouncing to the top.
  const push = useCallback((href: string) => router.push(href, { scroll: false }), [router]);

  const carried: Record<string, string> = {
    [PARTICIPATION_PARAMS.capacity]: filters.capacity,
    [PARTICIPATION_PARAMS.answer]: filters.answer,
    [PARTICIPATION_PARAMS.attendance]: filters.attendance,
    [PARTICIPATION_PARAMS.sort]: filters.sort,
    [PARTICIPATION_PARAMS.direction]: filters.direction,
  };
  if (showDelivery) carried[PARTICIPATION_PARAMS.delivery] = filters.delivery;
  carried[GROUP_BY_PARAM] = groupBy ?? "";

  const { typed, setTyped, hrefFor } = useFilterSearch({
    search: filters.search,
    basePath,
    filters: carried,
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(hrefFor(patch), { scroll: false });

  const restore = useCallback(
    (family: AttendanceGroupFamily) => router.replace(hrefFor({ [GROUP_BY_PARAM]: family })),
    [router, hrefFor],
  );
  const remember = useRememberedGroupBy({ storageKey, groupBy, families: groupFamilies, restore });

  const anyFilter =
    filters.search !== "" ||
    filters.capacity !== "" ||
    filters.answer !== "" ||
    filters.attendance !== "" ||
    filters.delivery !== "";

  return (
    <Stack
      component="section"
      aria-label={FILTER_HEADING}
      spacing={1.25}
      data-testid="participation-filters"
    >
      <Typography variant="subtitle2" component="h3">
        {FILTER_HEADING}
      </Typography>
      <Field
        label={FILTER_SEARCH_LABEL}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "filter-search" } }}
        sx={{ maxWidth: { sm: 320 } }}
      />
      <FilterButtons
        label={FILTER_CAPACITY_LABEL}
        testId="filter-capacity"
        value={filters.capacity}
        options={[
          ...FILTER_CAPACITIES.map((value) => ({ value, label: CAPACITY_LABELS[value] })),
          { value: "walk_up", label: WALK_UP_LABEL },
        ]}
        onPick={(value) => apply({ [PARTICIPATION_PARAMS.capacity]: value })}
      />
      <FilterButtons
        label={FILTER_ANSWER_LABEL}
        testId="filter-answer"
        value={filters.answer}
        options={ANSWER_FILTERS.map((value) => ({ value, label: ANSWER_LABELS[value] }))}
        onPick={(value) => apply({ [PARTICIPATION_PARAMS.answer]: value })}
      />
      <FilterButtons
        label={FILTER_ATTENDANCE_LABEL}
        testId="filter-attendance"
        value={filters.attendance}
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
        <FilterButtons
          label={FILTER_DELIVERY_LABEL}
          testId="filter-delivery"
          value={filters.delivery}
          options={[
            { value: "attention", label: NEEDS_ATTENTION_FILTER_LABEL },
            ...Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label })),
            // LAN-411: one option, over Attempted rather than beside the five.
            { value: "not_delivered", label: NOT_DELIVERED },
            { value: "none", label: DELIVERY_NOT_QUEUED },
          ]}
          onPick={(value) => apply({ [PARTICIPATION_PARAMS.delivery]: value })}
        />
      ) : null}
      {groupFamilies.length > 0 || anyFilter ? (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <GroupBySelect
            families={groupFamilies}
            value={groupBy}
            onChange={(value) => {
              remember(value);
              apply({ [GROUP_BY_PARAM]: value });
            }}
            sx={{ minWidth: 220 }}
          />
          {anyFilter ? (
            <Button
              size="small"
              href={groupBy === null ? basePath : `${basePath}?${GROUP_BY_PARAM}=${groupBy}`}
              data-testid="filter-clear"
            >
              {CLEAR_FILTERS}
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
