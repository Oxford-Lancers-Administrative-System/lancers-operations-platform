"use client";

import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

/**
 * Moving around the calendars — LAN-114, and LAN-153's jump control.
 *
 * ## Why these navigate rather than submit
 *
 * The same defect the event list already paid for: MUI's `TextField select` is
 * a combobox backed by a hidden input, and React writes the chosen value into
 * that input *after* the change handler returns. A handler that submitted the
 * surrounding form would post the previous value, so choosing Hilary would
 * navigate to Michaelmas. The value is therefore taken straight off the change
 * event and the router is pushed with it — see the events list's own filters,
 * which record how that was found on a real screen rather than in a test.
 *
 * Everything the controls change is a query parameter, so a term card or a
 * month is a link somebody can send, the back button works, and a refresh lands
 * on the same view. The previous and next controls are plain links for the same
 * reason and need no JavaScript at all.
 *
 * ## The month field
 *
 * A native `<input type="month">`, which is the direct navigation a month
 * calendar wants: an operator jumps to March without pressing next five times.
 * It is uncontrolled between renders — `defaultValue` rather than `value` —
 * because the page it navigates to re-renders it with the new month anyway, and
 * a controlled field would fight the picker while the operator is still in it.
 */
export function GregorianControls({
  month,
  previousHref,
  nextHref,
  todayHref,
  basePath,
}: {
  month: string;
  previousHref: string;
  nextHref: string;
  todayHref: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { sm: "center" }, flexWrap: "wrap", gap: 1.5 }}
      data-testid="gregorian-controls"
    >
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" href={previousHref} data-testid="month-previous">
          Previous month
        </Button>
        <Button size="small" variant="outlined" href={nextHref} data-testid="month-next">
          Next month
        </Button>
        <Button size="small" variant="text" href={todayHref} data-testid="month-today">
          Today
        </Button>
      </Stack>

      <TextField
        type="month"
        size="small"
        label="Go to month"
        defaultValue={month}
        // A picker fires `change` for each partial value while it is being
        // edited; an empty one means the operator cleared the field rather
        // than chose 1970, so it navigates nowhere.
        onChange={(event) => {
          const value = event.target.value;
          if (/^\d{4}-\d{2}$/.test(value)) {
            router.push(`${basePath}?mode=gregorian&month=${value}`);
          }
        }}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 190 }}
        data-testid="month-input"
      />
    </Stack>
  );
}

/** One segment of the year, as the jump control needs it. */
export interface SegmentChoice {
  /** The segment key, which is also the anchor id on the column. */
  readonly key: string;
  /** "Michaelmas", "Christmas Vacation", "Long Vacation 2026". */
  readonly label: string;
}

/**
 * Jump to a term or a vacation — the Oxford View's one control. LAN-153.
 *
 * ## A jump, not a switch
 *
 * The column is one continuous academic year, so there is nothing to switch
 * *to*: every term and every vacation is already on the page, and the only
 * question is where in it to look. Stewart Humble, 17 August 2026, asking for
 * exactly this — "you can do a continuous scroll and it's going to merge from
 * Michaelmas to Christmas vacation to Hilary to Easter vacation to Trinity to
 * long vacation to the next".
 *
 * It is deliberately **not** a link that changes the query string. A parameter
 * here would imply the page shows one segment at a time, which is the term card
 * this replaced. Moving the viewport is the whole action, so the control moves
 * the viewport and leaves a fragment behind as a bookmark.
 *
 * ## And there is no season selector
 *
 * Brian, 21 August 2026: "that filter should be removed entirely from the
 * calendar … we know what calendar we're looking at." One season is open and the
 * mission knows no other (`REQ-one-open-season`), so a control offering another
 * would offer something that does not exist. The page header names the season.
 *
 * The option values are segment keys and the anchors they scroll to are rendered
 * by the column itself, so a key that no longer exists scrolls nowhere rather
 * than throwing.
 */
export function YearJumpControl({
  segments,
  current,
}: {
  segments: readonly SegmentChoice[];
  /** Where the reader is now — the segment holding today, where there is one. */
  current: string;
}) {
  if (segments.length === 0) return null;

  return (
    <TextField
      select
      size="small"
      label="Jump to"
      defaultValue={current}
      onChange={(event) => {
        const key = event.target.value;
        const target = document.getElementById(key);
        if (!target) return;
        // `scrollIntoView` is absent in jsdom and in anything old enough not to
        // have it. Setting the hash moves the viewport on its own, so the
        // control works either way and no test has to stub a browser API.
        target.scrollIntoView?.({ behavior: "smooth", block: "start" });
        window.location.hash = key;
      }}
      sx={{ minWidth: 220 }}
      data-testid="year-jump"
    >
      {segments.map((segment) => (
        <MenuItem key={segment.key} value={segment.key}>
          {segment.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
