"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ChipBar } from "@/components/chip-bar";
import { Field } from "@/components/field";
import { PinnedSelect } from "@/components/pinned-select";

import {
  GROUP_BY_PARAM,
  PARTICIPATION_PARAMS,
  participationFilterHref,
  type ParticipationFilterKey,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import type { AttendanceGroupFamily } from "@/lib/services/attendance-group-by";
import { ColumnFilterMenu, FilterButton } from "../operate/board-filter-controls";
import { useFilterSearch } from "../operate/filter-search";
import { useRememberedGroupBy } from "../operate/group-by-memory";
import { GroupBySelect } from "../operate/group-by-select";

import {
  activeParticipationFilters,
  filterChoiceLabel,
  participationFilterDimension,
  participationFilterDimensions,
} from "./filter-dimensions";
import {
  CLEAR_FILTERS,
  FILTERED_BY,
  FILTER_HEADING,
  FILTER_SEARCH_LABEL,
  SEARCH_CHIP_LABEL,
} from "./presentation";

/**
 * W7's filters — by name, capacity, answer, attendance, delivery at the
 * operator tier. Brian, 2026-08-21: "I also should have filters to only
 * players, a filter to only yes, a filter to only no." State lives in the URL
 * (filtering done once, server-side, one pure function for both tiers).
 *
 * LAN-511, Brian's walk on 31 October: the one-tap rows above the table are
 * gone. On a desktop each of As, Delivery, Answer and Attendance is filtered
 * from a funnel in its own column heading (`ParticipationColumnFunnel`), the
 * roster board's own funnel and menu. Below the table's width there is no
 * heading row, so — as the roster does on a phone — each filter is a select
 * under the search. The "Filtered by" chips are the roster's too. The URL
 * parameters are unchanged, so links still work. `showDelivery` is the tier;
 * the club link carries no delivery state.
 */
export function ParticipationColumnFunnel({
  basePath,
  filters,
  groupBy = null,
  filterKey,
}: {
  basePath: string;
  filters: ParticipationFilters;
  groupBy?: string | null;
  filterKey: ParticipationFilterKey;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: { key: string } } | null>(null);
  const dimension = participationFilterDimension(filterKey);
  const value = filters[filterKey];
  return (
    <Box component="span" data-testid={`funnel-${filterKey}`} sx={{ display: "inline-flex" }}>
      <FilterButton
        label={dimension.label}
        active={value !== ""}
        onOpen={(anchor) => setMenu({ anchor, column: { key: filterKey } })}
      />
      <ColumnFilterMenu
        menu={menu}
        filters={{ [filterKey]: value }}
        optionsFor={() => dimension.options.map((option) => option.value)}
        optionLabel={(_, option) => filterChoiceLabel(dimension, option)}
        // R157C-B2: a filter change re-orders the screen, not a fresh page.
        onSelect={(_, next) =>
          router.push(participationFilterHref(basePath, filters, groupBy, { [filterKey]: next }), {
            scroll: false,
          })
        }
        onClose={() => setMenu(null)}
      />
    </Box>
  );
}

/** The roster board's caption under a filtered heading: the choice in force. */
export function ParticipationFunnelCaption({
  filters,
  filterKey,
}: {
  filters: ParticipationFilters;
  filterKey: ParticipationFilterKey;
}) {
  const value = filters[filterKey];
  if (value === "") return null;
  return (
    <Typography
      variant="caption"
      data-testid={`funnel-caption-${filterKey}`}
      sx={{ display: "block", color: "primary.main", fontWeight: 700, lineHeight: 1.3 }}
    >
      {filterChoiceLabel(participationFilterDimension(filterKey), value)}
    </Typography>
  );
}

const PARAM_OF: Readonly<Record<ParticipationFilterKey, string>> = Object.freeze({
  capacity: PARTICIPATION_PARAMS.capacity,
  answer: PARTICIPATION_PARAMS.answer,
  attendance: PARTICIPATION_PARAMS.attendance,
  delivery: PARTICIPATION_PARAMS.delivery,
});

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

  const dimensions = participationFilterDimensions(showDelivery);
  const active = activeParticipationFilters(filters, showDelivery);
  const anyFilter = filters.search !== "" || active.length > 0;

  return (
    <Stack
      component="section"
      aria-label={FILTER_HEADING}
      spacing={2}
      data-testid="participation-filters"
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        useFlexGap
        sx={{ gap: 2, alignItems: { md: "center" }, flexWrap: "wrap" }}
      >
        <Field
          label={FILTER_SEARCH_LABEL}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "filter-search" } }}
          sx={{ minWidth: { md: 260 }, maxWidth: { md: 320 } }}
        />
        {/* The roster's phone: no heading row to hold a funnel, so one select per filter. */}
        <Box
          data-testid="participation-phone-filters"
          sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 2 }}
        >
          {dimensions.map((dimension) => (
            <PinnedSelect
              key={dimension.key}
              label={dimension.label}
              testId={`filter-${dimension.key}`}
              value={filters[dimension.key]}
              options={dimension.options.map((option) => option.value)}
              optionLabel={(value) => filterChoiceLabel(dimension, value)}
              onChange={(value) => apply({ [PARAM_OF[dimension.key]]: value })}
            />
          ))}
        </Box>
        <GroupBySelect
          families={groupFamilies}
          value={groupBy}
          onChange={(value) => {
            remember(value);
            apply({ [GROUP_BY_PARAM]: value });
          }}
          sx={{ minWidth: 220 }}
        />
      </Stack>
      {anyFilter ? (
        <ChipBar
          caption={FILTERED_BY}
          testId="filter-chips"
          chips={[
            ...(filters.search !== ""
              ? [
                  {
                    key: "q",
                    label: `${SEARCH_CHIP_LABEL}: ${filters.search}`,
                    onDelete: () => setTyped(""),
                  },
                ]
              : []),
            ...active.map(({ dimension, value }) => ({
              key: dimension.key,
              label: (
                <>
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {dimension.label}:
                  </Box>{" "}
                  {filterChoiceLabel(dimension, value)}
                </>
              ),
              onDelete: () => apply({ [PARAM_OF[dimension.key]]: "" }),
            })),
          ]}
          action={
            <Button
              size="small"
              href={groupBy === null ? basePath : `${basePath}?${GROUP_BY_PARAM}=${groupBy}`}
              data-testid="filter-clear"
            >
              {CLEAR_FILTERS}
            </Button>
          }
        />
      ) : null}
    </Stack>
  );
}
