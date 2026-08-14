"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { ATTENDANCE_PRESENCES } from "@/lib/services/attendance-vocabulary";
import { useFilterSearch } from "../../../filter-search";
import { NOT_MARKED, PRESENCE_LABELS } from "./presentation";

/**
 * UX-72's **Search player**, **RSVP** and **Attendance** filters.
 *
 * Everything is in the query string, for the same reason it is on the roster
 * and the events list: a filtered board is a link, and the back button behaves.
 * The search box reuses `../../../filter-search`, which carries the two
 * corrections Brian paid for twice on the other two screens — filter-as-you-type
 * rather than a hidden Enter, and no dropped keystrokes when a navigation lands
 * mid-typing.
 *
 * The Attendance filter's default in the wireframe is **Not marked**, which is
 * the state a recorder is actually working through — but it is a *choice* here
 * rather than the default, because a board that silently hides everybody
 * already recorded would show an empty screen at the end of the evening and
 * look broken. `slice-ux.md` § 9 requires filter-empty and system-empty to be
 * distinguishable, and the surest way is not to filter by default at all.
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
        <TextField
          label="Search player"
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          size="small"
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
          <TextField
            select
            label="RSVP"
            size="small"
            value={rsvp}
            onChange={(event) => apply({ rsvp: event.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="yes">Attending</MenuItem>
            <MenuItem value="no">Not attending</MenuItem>
            <MenuItem value="none">No response</MenuItem>
          </TextField>

          <TextField
            select
            label="Attendance"
            size="small"
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
          </TextField>
        </Stack>
      </Stack>
    </Box>
  );
}
