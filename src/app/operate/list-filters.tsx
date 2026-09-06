"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field, SelectField } from "@/components/field";
import { useFilterSearch } from "./filter-search";

/**
 * The search-and-filter bar the roster and the events list both use — LAN-127
 * finding 3.
 *
 * ## Why this is shared
 *
 * The two screens had it twice, at exactly 202 lines each, structurally
 * identical down to the order of the hidden inputs. `filter-search.ts` was
 * already extracted from them for the same reason — the same broken
 * Enter-only search shipped on both, and Brian found it twice — so the search
 * box was shared while everything around it stayed duplicated.
 *
 * The copies had already diverged where it mattered: the roster's Filters
 * toggle carried a 44px minimum touch target and the events one carried none,
 * although `docs/ux/tickets/LAN-74-returner-intake.md` requires "every action
 * … carries a 44px minimum" and fifteen other files honour it. That is what
 * two copies do — not disagree loudly, but drift on the thing nobody re-reads.
 * Both now get the target, because one component cannot forget it on one
 * screen.
 *
 * ## What stays with the screen
 *
 * Every word. Labels, placeholders, the "All …" option, the order names, the
 * widths and the vocabulary maps are all passed in, because they belong to the
 * roster or to the events list and not to a shared control. "A to Z" is right
 * for names and wrong for dates; the component has no opinion.
 *
 * ## The two behaviours worth not re-deriving
 *
 * The selects **navigate** rather than submitting the form. MUI's
 * `TextField select` is a combobox backed by a hidden input that React writes
 * on the *next* render, so `requestSubmit()` inside the change handler posts
 * the previous value and the selection appears to clear itself. Brian found
 * that on the real screen; no render test could, because none of them submits
 * a form. The value is taken straight off the change event instead.
 *
 * Filters **combine**. Each control patches one key and carries the rest
 * through, so Status and Type narrow together rather than replacing one
 * another. The form stays a real `GET` around the search box so Enter still
 * works and a filtered list is still a shareable link, with the other filters
 * mirrored as hidden inputs so a native submit never silently drops them.
 */

/** One select: the query key it owns, and the vocabulary it offers. */
export interface ListFilterField {
  /** The query-string key, e.g. `status`, `entry`, `type`. */
  name: string;
  label: string;
  /** What the URL currently carries for this key. */
  value: string;
  /** The "no filter" option, e.g. "All statuses". */
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
  /** Where the form lives — `/operate/roster`, `/operate/events`. */
  basePath: string;
  testId: string;
  /** Ties the phone Filters toggle to the group it discloses. */
  fieldsId: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchMinWidth: number;
  /** The two narrowing selects, in the order they appear. */
  fields: readonly ListFilterField[];
  sortColumns: readonly { value: string; label: string }[];
  sort: string;
  direction: string;
  /** Named for what is being ordered — "A to Z" for names, dates differ. */
  directionOptions: readonly { value: string; label: string }[];
  /** What the URL currently carries for the search box. The source of truth. */
  search: string;
  /**
   * Other query keys this bar does not own, kept as the reader narrows.
   *
   * LAN-153: the event lists put the chosen period in the query string, and it
   * is not a filter this bar offers — but typing in the search box must not
   * silently move the reader back to the default period. Every control here
   * carries these through, and they are mirrored as hidden inputs so a native
   * form submit does not drop them either.
   */
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
      {/* So a native search submit carries the filters rather than clearing them. */}
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

          {/*
            Sorting lives in the column headers, which is where an operator
            looks for it — so these are phone-only, where there is no table and
            therefore no header to click.
          */}
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
