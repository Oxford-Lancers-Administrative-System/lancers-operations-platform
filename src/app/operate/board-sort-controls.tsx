"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ChipBar } from "@/components/chip-bar";
import {
  keepAllowed,
  MAX_SORT_KEYS,
  orderLabel,
  parseSortParam,
  formatSortParam,
  setSortRow,
  type SortDirection,
  type SortField,
  type SortKey,
} from "./board-sort";

/**
 * The Roster and Recruits boards' sort controls — LAN-495, Alternative A.
 *
 * One state, read by the portrait cards, the landscape table and the desktop
 * table alike, so rotating a phone changes the layout and never the order. It
 * lives in the address bar (`?sort=status:asc,college:asc`) and in this
 * browser's `localStorage`, per board; a visit with no sort in the address
 * restores the stored one in every layout.
 */

type Board = "roster" | "recruitment";

/**
 * The storage key LAN-426's phone select used. Its stored value, `lastName:desc`,
 * is the one-key case of today's format, so a remembered phone sort carries over.
 */
function storageKey(board: Board): string {
  return `lancers:board-phone-sort:${board}`;
}

function remember(board: Board, keys: readonly SortKey[]) {
  try {
    if (keys.length === 0) window.localStorage.removeItem(storageKey(board));
    else window.localStorage.setItem(storageKey(board), formatSortParam(keys));
  } catch {
    // Storage refused: the address bar still carries the sort.
  }
}

/**
 * The board's sort keys. `onChange` is the board's own address-bar sync; it is
 * told every change, including the one restored from storage on arrival.
 */
export function useBoardSort(
  board: Board,
  fields: readonly SortField[],
  initial: readonly SortKey[],
  onChange: (keys: readonly SortKey[]) => void,
) {
  const allowed = useMemo(() => new Set(fields.map((field) => field.key)), [fields]);
  const [keys, setKeysState] = useState<readonly SortKey[]>(() => keepAllowed(initial, allowed));
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const setKeys = useCallback(
    (next: readonly SortKey[]) => {
      const kept = keepAllowed(next, allowed);
      setKeysState(kept);
      remember(board, kept);
      onChangeRef.current(kept);
    },
    [allowed, board],
  );

  const setKeysRef = useRef(setKeys);
  useEffect(() => {
    setKeysRef.current = setKeys;
  });

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("sort")) return;
      const stored = parseSortParam(window.localStorage.getItem(storageKey(board)));
      // setKeys drops what this viewer can no longer see, and stores the rest.
      if (stored.length > 0) setKeysRef.current(stored);
    } catch {
      // No storage, no restore.
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { keys, setKeys };
}

/** The field's label and order for one key, e.g. "Status A–Z". */
export function sortKeyLabel(fields: readonly SortField[], key: SortKey): string {
  const field = fields.find((entry) => entry.key === key.key);
  return field ? `${field.label} ${orderLabel(field.kind, key.direction)}` : key.key;
}

/** Sort, with the number of keys in force — the Filters button's own idiom. */
export function SortButton({
  count,
  onClick,
  testId,
  sx,
}: {
  count: number;
  onClick: () => void;
  testId: string;
  sx?: Parameters<typeof Button>[0]["sx"];
}) {
  return (
    <Button variant="outlined" onClick={onClick} data-testid={testId} sx={sx}>
      {`Sort${count > 0 ? ` (${count})` : ""}`}
    </Button>
  );
}

/** The numbered "Sorted by" chips; removing one moves the later keys up. */
export function SortChips({
  fields,
  keys,
  onChange,
  testId,
}: {
  fields: readonly SortField[];
  keys: readonly SortKey[];
  onChange: (keys: readonly SortKey[]) => void;
  testId: string;
}) {
  if (keys.length === 0) return null;
  return (
    <ChipBar
      caption="Sorted by"
      testId={testId}
      chips={keys.map((key, index) => ({
        key: key.key,
        label: `${index + 1} ${sortKeyLabel(fields, key)}`,
        onDelete: () => onChange(keys.filter((_, at) => at !== index)),
      }))}
    />
  );
}

const ROW_LABELS = ["Sort by", "Then by", "Then by"] as const;
const NONE = "";

function SortRow({
  index,
  fields,
  keys,
  onChange,
}: {
  index: number;
  fields: readonly SortField[];
  keys: readonly SortKey[];
  onChange: (keys: readonly SortKey[]) => void;
}) {
  const fieldLabelId = useId();
  const orderLabelId = useId();
  const current = keys[index];
  const field = current ? fields.find((entry) => entry.key === current.key) : undefined;
  // A row opens only once every row above it holds a field.
  const reachable = index <= keys.length;
  const takenAbove = new Set(keys.slice(0, index).map((key) => key.key));
  const offered = fields.filter((entry) => !takenAbove.has(entry.key));

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center" }}
      data-testid={`sort-row-${index + 1}`}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontWeight: 600, width: 56, flexShrink: 0 }}
      >
        {ROW_LABELS[index]}
      </Typography>
      <FormControl size="small" sx={{ flex: 1, minWidth: 0 }} disabled={!reachable}>
        <InputLabel id={fieldLabelId} shrink>
          Field
        </InputLabel>
        <Select
          labelId={fieldLabelId}
          label="Field"
          notched
          displayEmpty
          value={current?.key ?? NONE}
          onChange={(event) => {
            const key = event.target.value;
            onChange(
              setSortRow(
                keys,
                index,
                key === NONE ? null : { key, direction: current?.direction ?? "asc" },
              ),
            );
          }}
          data-testid={`sort-field-${index + 1}`}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
        >
          <MenuItem value={NONE}>None</MenuItem>
          {offered.map((entry) => (
            <MenuItem key={entry.key} value={entry.key}>
              {entry.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ width: 148, flexShrink: 0 }} disabled={!field}>
        <InputLabel id={orderLabelId} shrink>
          Order
        </InputLabel>
        <Select
          labelId={orderLabelId}
          label="Order"
          notched
          displayEmpty
          value={current && field ? current.direction : NONE}
          onChange={(event) => {
            if (!current) return;
            onChange(
              setSortRow(keys, index, {
                key: current.key,
                direction: event.target.value as SortDirection,
              }),
            );
          }}
          data-testid={`sort-order-${index + 1}`}
        >
          {field ? null : <MenuItem value={NONE}>—</MenuItem>}
          {field
            ? (["asc", "desc"] as const).map((direction) => (
                <MenuItem key={direction} value={direction}>
                  {orderLabel(field.kind, direction)}
                </MenuItem>
              ))
            : null}
        </Select>
      </FormControl>
    </Stack>
  );
}

function SortRows(props: {
  fields: readonly SortField[];
  keys: readonly SortKey[];
  onChange: (keys: readonly SortKey[]) => void;
}) {
  return (
    <Stack spacing={1.5} sx={{ pt: 1 }}>
      {Array.from({ length: MAX_SORT_KEYS }, (_, index) => (
        <SortRow key={index} index={index} {...props} />
      ))}
    </Stack>
  );
}

/**
 * The sort sheet: three rows, then Clear and Done. Changes apply as they are
 * made; Done only closes. On a phone, upright or on its side, it is the
 * Filters bottom drawer; on a desktop, a dialog.
 */
export function SortSheet({
  open,
  fields,
  keys,
  onChange,
  onClear,
  onClose,
  testId,
}: {
  open: "sheet" | "dialog" | null;
  fields: readonly SortField[];
  keys: readonly SortKey[];
  onChange: (keys: readonly SortKey[]) => void;
  onClear: () => void;
  onClose: () => void;
  testId: string;
}) {
  const titleId = useId();
  const rows = <SortRows fields={fields} keys={keys} onChange={onChange} />;
  return (
    <>
      <Drawer anchor="bottom" open={open === "sheet"} onClose={onClose}>
        <Box sx={{ p: 2, maxHeight: "88dvh", overflowY: "auto" }} data-testid={`${testId}-sheet`}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            Sort
          </Typography>
          {rows}
          <Stack direction="row" sx={{ justifyContent: "space-between", mt: 2 }}>
            <Button onClick={onClear} data-testid={`${testId}-clear`}>
              Clear
            </Button>
            <Button variant="contained" onClick={onClose} sx={{ minWidth: 120 }}>
              Done
            </Button>
          </Stack>
        </Box>
      </Drawer>
      <Dialog
        open={open === "dialog"}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titleId}
        data-testid={`${testId}-dialog`}
      >
        <DialogTitle id={titleId}>Sort</DialogTitle>
        <DialogContent>{rows}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
          <Button onClick={onClear}>Clear</Button>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
