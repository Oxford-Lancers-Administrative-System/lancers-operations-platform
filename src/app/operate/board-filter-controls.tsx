"use client";

import Box from "@mui/material/Box";
import { StatusChip, type StatusDomain } from "@/components/status-chip";
import Divider from "@mui/material/Divider";
import MuiMenu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";

/** The board's own filter affordances — extracted from `../roster/roster-board.tsx` (LAN-186). */

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

/** The one `Menu` a board's column-header filters share — "All" plus `optionsFor`'s options for the opened column, labelled by `optionLabel`. */
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

/** The board's status-pill formula — `../roster/roster-board.tsx`'s `CellValue` (LAN-204 item 1). */
export function StatusPill({
  domain,
  status,
  label,
}: {
  domain: StatusDomain;
  status: string;
  label: string;
}) {
  return <StatusChip domain={domain} status={status} label={label} />;
}

/** The minimum a column needs to carry for the banding helpers below to work with it. */
export interface BandedColumn {
  readonly key: string;
  readonly band: string;
}

/** Groups columns into consecutive same-band runs for one `colSpan`ned header cell per run (extracted from `../roster/roster-board.tsx`, LAN-186). */
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

/** Last column key in each band's run — gets a heavier border seam than same-band neighbours. */
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
