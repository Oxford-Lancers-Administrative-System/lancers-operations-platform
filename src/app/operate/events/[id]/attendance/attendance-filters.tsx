"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { ATTENDANCE_PRESENCES } from "@/lib/services/attendance-vocabulary";
import { useFilterSearch } from "../../../filter-search";
import { NOT_MARKED, PRESENCE_LABELS } from "./presentation";

/**
 * UX-72's Search/RSVP/Attendance filters — all in the query string (filtered
 * board is a shareable link). Search reuses `../../../filter-search`
 * (filter-as-you-type, no dropped keystrokes). Attendance defaults to
 * unfiltered, not "Not marked" — filtering it by default would make an
 * end-of-evening board look broken instead of finished (`slice-ux.md` §9).
 */
export function AttendanceFilters({
  basePath,
  search,
  rsvp,
  attendance,
}: {
  basePath: string;
  search: string;
  rsvp: string;
  attendance: string;
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
    filters: { rsvp, attendance },
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(withFilter(patch));

  return (
    <Box
      component="form"
      method="get"
      action={basePath}
      data-testid="attendance-filters"
      sx={{ width: "100%" }}
    >
      <input type="hidden" name="rsvp" value={rsvp} />
      <input type="hidden" name="attendance" value={attendance} />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" } }}
      >
        <Field
          label="Search player"
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          sx={{ flexGrow: 1, minWidth: { md: 220 } }}
        />

        <Button
          variant="outlined"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls="attendance-filter-fields"
          sx={{ display: { xs: "inline-flex", md: "none" }, alignSelf: "flex-start" }}
        >
          Filters
        </Button>

        <Stack
          id="attendance-filter-fields"
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ display: { xs: showFilters ? "flex" : "none", md: "flex" } }}
        >
          <Field
            select
            label="RSVP"
            value={rsvp}
            onChange={(event) => apply({ rsvp: event.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="yes">Attending</MenuItem>
            <MenuItem value="no">Not attending</MenuItem>
            <MenuItem value="none">No response</MenuItem>
          </Field>

          <Field
            select
            label="Attendance"
            value={attendance}
            onChange={(event) => apply({ attendance: event.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="unmarked">{NOT_MARKED}</MenuItem>
            {ATTENDANCE_PRESENCES.map((presence) => (
              <MenuItem key={presence} value={presence}>
                {PRESENCE_LABELS[presence]}
              </MenuItem>
            ))}
          </Field>
        </Stack>
      </Stack>
    </Box>
  );
}
