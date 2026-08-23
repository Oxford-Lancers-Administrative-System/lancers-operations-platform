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

/**
 * The ids one segment can be anchored at, in the order they are tried.
 *
 * `YearColumn` draws the year twice — a week grid above `md` and stacked week
 * cards below it — and the two cannot share an `id`, because duplicate ids are
 * invalid and `getElementById` would answer with whichever came first in the
 * document regardless of which one the reader can see.
 */
function anchorIdsFor(key: string): string[] {
  return [key, `${key}-stack`];
}

/**
 * The anchor for a segment **in the presentation that is actually on screen**.
 *
 * ## The defect this exists to stop, which shipped once
 *
 * The control used to resolve the desktop id and nothing else. Below `md` that
 * element is inside a `display: none` subtree: it has no geometry at all —
 * measured live at `{top: 0, height: 0, width: 0}` — so `scrollIntoView` on it
 * is a no-op. The jump control was therefore inert at every width below 900px,
 * **including 375px**, while the select's label changed and `replaceState`
 * rewrote the address bar. A reader on a phone was told they had navigated and
 * had not, on a nine-thousand-pixel page whose only navigation control this is.
 * False confirmation is worse than a dead control.
 *
 * ## Why `getClientRects()`
 *
 * It is empty for any element inside a `display: none` ancestor and non-empty
 * for one that is laid out, which is exactly the question being asked — and it
 * asks it of the browser rather than re-deriving the breakpoint here. A second
 * copy of "is this above `md`?" in JavaScript would be a rule that could drift
 * from the `sx` that actually decides, which is how this went wrong the first
 * time. Nothing here knows what `md` is.
 */
function laidOutAnchor(key: string): HTMLElement | null {
  const candidates = anchorIdsFor(key)
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => element !== null);

  // `getClientRects` is absent in jsdom, where nothing is laid out and the first
  // candidate is as good an answer as any.
  return (
    candidates.find((element) => (element.getClientRects?.().length ?? 0) > 0) ??
    candidates[0] ??
    null
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
      // `disableScrollLock` is load-bearing, and the reason is worth writing
      // down because the failure looked exactly like success.
      //
      // MUI opens a select's menu inside a `Modal`, which locks body scroll
      // while it is open **and restores the previous scroll position when it
      // closes**. Scrolling from `onChange` therefore happened and was then
      // silently undone by the menu's own restore, so the viewport never moved
      // — while the fragment updated, which made the control look live. Found by
      // driving it rather than by photographing it.
      // Through `slotProps.select`, not the deprecated `SelectProps`: MUI v9
      // ignores the latter, which is a silent no-op rather than a build error.
      slotProps={{ select: { MenuProps: { disableScrollLock: true } } }}
      onChange={(event) => {
        const key = event.target.value;
        const target = laidOutAnchor(key);
        if (!target) return;
        // `scrollIntoView` is absent in jsdom and in anything old enough not to
        // have it, so the fragment below is both the fallback and the bookmark.
        target.scrollIntoView?.({ behavior: "smooth", block: "start" });
        // `replaceState` rather than `location.hash`: assigning the hash jumps
        // instantly, which cancels the smooth scroll above, and it pushes a
        // history entry so Back becomes "un-jump" rather than "leave the page".
        window.history.replaceState(null, "", `#${key}`);
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
