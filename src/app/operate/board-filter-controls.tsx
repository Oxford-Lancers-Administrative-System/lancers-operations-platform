"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import MuiMenu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

/**
 * The board's own filter affordances — extracted from `../roster/roster-board.tsx`
 * (LAN-186) so a second board reuses the identical control rather than
 * inventing one that merely looks similar. LAN-204's own correction: Brian,
 * 2026-09-02 — "The filters here are weird because the UI elements are
 * completely different than what's on the roster page… it reinvented the
 * shit." The roster keeps importing from here too, unchanged in appearance
 * or behaviour; only where the code lives has moved.
 *
 * Two pieces:
 *
 *   - {@link FilterButton} — the small funnel icon a filterable column header
 *     carries, opening a menu anchored to itself.
 *   - {@link ColumnFilterMenu} — the single `Menu` every board owns one of,
 *     listing "All" plus whatever `optionsFor` returns for the column the
 *     last-opened `FilterButton` named.
 *
 * A board wires these to its own column model and its own `filters` state;
 * nothing here knows what a "column" is beyond `key` and `label`.
 */

export function FilterButton({
  label,
  active,
  onOpen,
}: {
  label: string;
  active: boolean;
  onOpen: (anchor: HTMLElement) => void;
}) {
  return (
    <Tooltip title={active ? `Filtering ${label}` : `Filter ${label}`} placement="top">
      <Box
        component="button"
        type="button"
        aria-label={active ? `Filtering ${label}` : `Filter ${label}`}
        aria-pressed={active}
        onClick={(event) => onOpen(event.currentTarget as HTMLElement)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 24,
          height: 24,
          p: 0,
          cursor: "pointer",
          borderRadius: 1,
          border: 1,
          borderColor: active ? "primary.main" : "divider",
          bgcolor: active ? "primary.main" : "transparent",
          color: active ? "common.white" : "text.secondary",
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: active ? "primary.dark" : "action.hover",
            color: active ? "common.white" : "primary.main",
          },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
        }}
      >
        <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 14, height: 14 }}>
          <path
            d="M4 5.5h16l-6.2 7.2V19l-3.6 1.8v-8.1z"
            fill={active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

/** The minimum a column needs to carry for the filter menu to work with it. */
export interface FilterMenuColumn {
  readonly key: string;
}

/**
 * The one `Menu` a board's column-header filters share — "All", then every
 * option `optionsFor` returns for whichever column's `FilterButton` opened
 * it, each labelled by `optionLabel`.
 */
export function ColumnFilterMenu<TColumn extends FilterMenuColumn>({
  menu,
  filters,
  optionsFor,
  optionLabel,
  onSelect,
  onClose,
}: {
  menu: { anchor: HTMLElement; column: TColumn } | null;
  filters: Readonly<Record<string, string>>;
  optionsFor: (column: TColumn) => readonly string[];
  optionLabel: (column: TColumn, option: string) => string;
  onSelect: (key: string, value: string) => void;
  onClose: () => void;
}) {
  return (
    <MuiMenu
      open={menu !== null}
      anchorEl={menu?.anchor ?? null}
      onClose={onClose}
      slotProps={{ paper: { sx: { maxHeight: 360 } } }}
    >
      <MenuItem
        selected={(filters[menu?.column.key ?? ""] ?? "") === ""}
        onClick={() => {
          if (menu) onSelect(menu.column.key, "");
          onClose();
        }}
      >
        <em>All</em>
      </MenuItem>
      <Divider />
      {menu
        ? optionsFor(menu.column).map((option) => (
            <MenuItem
              key={option}
              selected={(filters[menu.column.key] ?? "") === option}
              onClick={() => {
                onSelect(menu.column.key, option);
                onClose();
              }}
            >
              {optionLabel(menu.column, option)}
            </MenuItem>
          ))
        : null}
    </MuiMenu>
  );
}

/**
 * The board's one status-pill formula — `../roster/roster-board.tsx`'s own
 * `CellValue`, extracted (LAN-204, item 1: "the same pill formula"). A
 * colour-coded `Chip`, the single exception every board makes to "plain text
 * like every other select cell" — kept because a status is the fact an
 * operator scans the whole row for. Which MUI semantic colour each board's
 * own values map to is that board's own choice (Brian, 2026-09-02: recruitment's
 * own colours "are fine"); the formula — one small `Chip`, coloured, labelled,
 * nothing else — is what has to match.
 */
export function StatusPill({
  color,
  label,
}: {
  color: "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";
  label: string;
}) {
  return <Chip size="small" color={color} label={label} />;
}

/** The minimum a column needs to carry for the banding helpers below to work with it. */
export interface BandedColumn {
  readonly key: string;
  readonly band: string;
}

/**
 * Groups a column list into consecutive same-band runs, for a header's band
 * overline row — one `colSpan`ned cell per run rather than one per column.
 * Extracted from `../roster/roster-board.tsx` (LAN-186) alongside the rest
 * of this module; a board with its own band set (recruitment's Person /
 * Recruitment / one-per-event Events, in place of the roster's Person /
 * Onboarding / Season) calls this the same way.
 */
export function groupRuns<TColumn extends BandedColumn>(
  columns: readonly TColumn[],
): { band: TColumn["band"]; span: number }[] {
  const runs: { band: TColumn["band"]; span: number }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (last && last.band === column.band) last.span += 1;
    else runs.push({ band: column.band, span: 1 });
  }
  return runs;
}

/**
 * The key of the last column in each band's run — the seam between two
 * bands gets a visibly heavier border than the seam between two columns of
 * the same band, on both the header row and every body cell.
 */
export function bandBoundaryKeys<TColumn extends BandedColumn>(
  columns: readonly TColumn[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  columns.forEach((column, index) => {
    const next = columns[index + 1];
    if (!next || next.band !== column.band) keys.add(column.key);
  });
  return keys;
}
