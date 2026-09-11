"use client";

import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

/**
 * Moving around the calendars — LAN-114, and LAN-153's jump control. These
 * navigate rather than submit: MUI's `TextField select` writes the chosen
 * value into its hidden input *after* the change handler returns, so a submit
 * handler would post the previous value. The value is taken off the change
 * event instead. Everything changed is a query parameter (link, back button
 * and refresh all work). The month field is uncontrolled (`defaultValue`): the
 * page it navigates to re-renders it anyway.
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

/** The ids one segment can be anchored at, in order — `YearColumn` draws the year twice (grid above `md`, stacked cards below) and duplicate ids are invalid. */
function anchorIdsFor(key: string): string[] {
  return [key, `${key}-stack`];
}

/**
 * The anchor for a segment in the presentation actually on screen (W153-F1: a
 * desktop-only id was previously used unconditionally, making the jump inert
 * below 900px while the address bar still updated — false confirmation).
 * `getClientRects()` is empty inside a `display: none` ancestor and asks the
 * browser directly, rather than re-deriving the `md` breakpoint in JS.
 */
function laidOutAnchor(key: string): HTMLElement | null {
  const candidates = anchorIdsFor(key)
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => element !== null);

  return (
    candidates.find((element) => (element.getClientRects?.().length ?? 0) > 0) ??
    candidates[0] ??
    null
  );
}

export interface SegmentChoice {
  readonly key: string;
  readonly label: string;
}

/**
 * Jump to a term or a vacation — the Oxford View's one control. LAN-153. A
 * jump, not a switch: the column is one continuous academic year, so this
 * moves the viewport and leaves a fragment as a bookmark, rather than
 * changing a query string that would imply one segment at a time. Buttons,
 * not a dropdown (BG-153-2, Brian at the visual gate). No season selector:
 * one season is open and the mission knows no other (`REQ-one-open-season`).
 * A key that no longer exists scrolls nowhere rather than throwing.
 */
export function YearJumpControl({
  segments,
  current,
}: {
  segments: readonly SegmentChoice[];
  current: string;
}) {
  if (segments.length === 0) return null;

  return (
    <Stack
      component="nav"
      aria-label="Jump to a term or vacation"
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", gap: 1 }}
      data-testid="year-jump"
    >
      {segments.map((segment) => (
        <Button
          key={segment.key}
          size="small"
          variant={segment.key === current ? "contained" : "outlined"}
          aria-current={segment.key === current ? "true" : undefined}
          data-testid={`year-jump-${segment.key}`}
          data-segment={segment.key}
          sx={{ minHeight: 44 }}
          onClick={() => jumpTo(segment.key)}
        >
          {segment.label}
        </Button>
      ))}
    </Stack>
  );
}

/** Move the viewport to a segment, and leave a fragment behind. Shared by every button. */
function jumpTo(key: string): void {
  const target = laidOutAnchor(key);
  if (!target) return;
  target.scrollIntoView?.({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${key}`); // not `location.hash`, which jumps instantly and cancels the smooth scroll
}
