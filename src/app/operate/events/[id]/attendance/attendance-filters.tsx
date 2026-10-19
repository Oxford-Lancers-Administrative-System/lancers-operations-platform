"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { ATTENDANCE_PRESENCES } from "@/lib/services/attendance-vocabulary";
import {
  ATTENDANCE_GROUP_FAMILIES,
  ATTENDANCE_GROUP_FAMILY_LABELS,
  parseAttendanceGroupBy,
  type AttendanceGroupFamily,
} from "@/lib/services/attendance-group-by";
import { SIDEWAYS_PHONE } from "@/theme-tokens";
import { useFilterSearch } from "../../../filter-search";
import { GROUP_BY_LABEL, GROUP_BY_NONE, NOT_MARKED, PRESENCE_LABELS } from "./presentation";

/** The stored value for None, so a deliberate None is remembered rather than read as "nothing stored". */
const STORED_NONE = "none";

function readStored(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // No storage: the link still carries the choice.
  }
}

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
  groupFamilies = [],
  groupBy = null,
  storageKey = null,
}: {
  basePath: string;
  search: string;
  rsvp: string;
  attendance: string;
  /** LAN-497: the families this viewer may group by. Empty: no Group by select at all. */
  groupFamilies?: readonly AttendanceGroupFamily[];
  groupBy?: AttendanceGroupFamily | null;
  /** This viewer's key for the remembered choice; null remembers nothing. */
  storageKey?: string | null;
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
    filters: { rsvp, attendance, by: groupBy ?? "" },
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(withFilter(patch));

  // LAN-497: a link without `by` opens on the viewer's last choice in this browser —
  // None on a first visit. A remembered family they may no longer see is ignored.
  const familiesKey = groupFamilies.join(",");
  useEffect(() => {
    if (storageKey === null || groupBy !== null) return;
    if (new URLSearchParams(window.location.search).has("by")) return;
    const visible = ATTENDANCE_GROUP_FAMILIES.filter((family) =>
      familiesKey.split(",").includes(family),
    );
    const stored = parseAttendanceGroupBy(readStored(storageKey), visible);
    if (stored !== null) router.replace(withFilter({ by: stored }));
  }, [storageKey, groupBy, familiesKey, router, withFilter]);

  const chooseGroupBy = (value: string) => {
    if (storageKey !== null) writeStored(storageKey, value === "" ? STORED_NONE : value);
    apply({ by: value });
  };

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
      {groupBy ? <input type="hidden" name="by" value={groupBy} /> : null}

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        useFlexGap
        sx={{
          alignItems: { md: "center" },
          [SIDEWAYS_PHONE]: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
        }}
      >
        <Field
          label="Search player"
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          sx={{
            flexGrow: 1,
            minWidth: { md: 220 },
            [SIDEWAYS_PHONE]: { width: "auto", flex: "1 1 160px" },
          }}
        />

        <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: "center", flexShrink: 0 }}>
          <Button
            variant="outlined"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            aria-controls="attendance-filter-fields"
            sx={{ display: { xs: "inline-flex", md: "none" }, minHeight: 44 }}
          >
            Filters
          </Button>

          {groupFamilies.length > 0 ? (
            <Field
              select
              label={GROUP_BY_LABEL}
              value={groupBy ?? ""}
              onChange={(event) => chooseGroupBy(event.target.value)}
              sx={{ minWidth: 170, maxWidth: { xs: 220, md: "none" } }}
              data-testid="attendance-group-by"
            >
              <MenuItem value="">{GROUP_BY_NONE}</MenuItem>
              {groupFamilies.map((family) => (
                <MenuItem key={family} value={family}>
                  {ATTENDANCE_GROUP_FAMILY_LABELS[family]}
                </MenuItem>
              ))}
            </Field>
          ) : null}
        </Stack>

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
