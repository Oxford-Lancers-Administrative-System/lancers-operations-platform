"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field, SelectField } from "@/components/field";
import { useFilterSearch } from "./filter-search";

// The search-and-filter bar the roster and events list both use — LAN-127
// finding 3 (two screens had it twice, drifted on the 44px touch target).
// Every word (labels, placeholders, vocabulary) stays with the screen —
// passed in, not owned here. Selects navigate rather than submit (MUI's
// TextField select writes its hidden input on the next render — a found
// defect); filters combine, each patching one key.

/** One select: the query key it owns, and the vocabulary it offers. */
export interface ListFilterField {
  name: string;
  label: string;
  value: string;
  allLabel: string;
  options: readonly { value: string; label: string }[];
  minWidth: number;
}

export default function ListFilters({
  basePath,
  testId,
  fieldsId,
  search,
  searchLabel,
  searchPlaceholder,
  searchMinWidth,
  fields,
  sortColumns,
  sort,
  direction,
  directionOptions,
  carry = {},
}: {
  basePath: string;
  testId: string;
  fieldsId: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchMinWidth: number;
  fields: readonly ListFilterField[];
  sortColumns: readonly { value: string; label: string }[];
  sort: string;
  direction: string;
  directionOptions: readonly { value: string; label: string }[];
  search: string;
  /** Other query keys this bar does not own (e.g. LAN-153's period), kept through as the reader narrows. */
  carry?: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);

  const push = useCallback((href: string) => router.push(href), [router]);
  const {
    typed,
    setTyped,
    hrefFor: withFilter,
  } = useFilterSearch({
    search,
    basePath,
    filters: {
      ...carry,
      ...Object.fromEntries(fields.map((field) => [field.name, field.value])),
      sort,
      dir: direction,
    },
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(withFilter(patch));

  return (
    <Box
      component="form"
      method="get"
      action={basePath}
      data-testid={testId}
      sx={{ width: "100%" }}
    >
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      {Object.entries(carry).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={direction} />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" } }}
      >
        <Field
          label={searchLabel}
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={searchPlaceholder}
          sx={{ flexGrow: 1, minWidth: { md: searchMinWidth } }}
        />

        <Button
          variant="outlined"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls={fieldsId}
          sx={{
            display: { xs: "inline-flex", md: "none" },
            alignSelf: "flex-start",
            minHeight: 44,
          }}
        >
          Filters
        </Button>

        <Stack
          id={fieldsId}
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ display: { xs: showFilters ? "flex" : "none", md: "flex" }, alignItems: "center" }}
        >
          {fields.map((field) => (
            <SelectField
              key={field.name}
              label={field.label}
              value={field.value}
              onChange={(event) => apply({ [field.name]: event.target.value })}
              sx={{ minWidth: field.minWidth }}
              options={[{ value: "", label: field.allLabel }, ...field.options]}
            />
          ))}

          {/* Sorting lives in the column headers; these are phone-only, where there's no header to click. */}
          <SelectField
            label="Sort by"
            value={sort}
            onChange={(event) => apply({ sort: event.target.value })}
            sx={{ display: { xs: "flex", md: "none" }, minWidth: 150 }}
            options={sortColumns}
          />

          <SelectField
            label="Order"
            value={direction}
            onChange={(event) => apply({ dir: event.target.value })}
            sx={{ display: { xs: "flex", md: "none" }, minWidth: 150 }}
            options={directionOptions}
          />
        </Stack>
      </Stack>
    </Box>
  );
}
