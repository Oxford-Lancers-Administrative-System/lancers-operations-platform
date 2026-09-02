"use client";

import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";

/**
 * The shipped player record's own shell — extracted from
 * `./roster/[membershipId]/record-view.tsx` (LAN-187) so a second record
 * reuses the identical banded-card language rather than inventing one that
 * merely looks similar. LAN-204's own correction: Brian, 2026-09-02 — "The
 * UI here is completely different from how it's done for … roster. How we
 * did it for the roster should be the same language, the same UI elements,
 * and the same thing should be identical here."
 *
 * Three pieces, in the order a record uses them:
 *
 *   - {@link Section} — one banded card: a coloured header bar, a tinted
 *     body. Which band belongs to which colour is each record's own — the
 *     roster reads it off `./roster/board-columns.ts`'s `bandOf()`, the
 *     recruit record off its own `board-columns.ts`'s `BAND_COLOURS` — so
 *     this takes the resolved `{ header, tint }` pair directly rather than
 *     importing either board's band model.
 *   - {@link Row} — one label/value line inside a section, with an optional
 *     note underneath.
 *   - {@link RecordField} — a `Row` whose value is either plain text, a
 *     status pill (`chip`), or read-only — and, given `options`, click-to-edit
 *     in place: the same one-click-opens-a-`Select`, commits-on-change
 *     interaction the board's own cells use, restyled for a label/value list.
 *
 * Nothing here reaches a database or a server action; a record wires these
 * to its own fields and its own commit functions.
 */

export const NOT_RECORDED = "not recorded";

export function NotRecorded() {
  return (
    <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
      {NOT_RECORDED}
    </Typography>
  );
}

/** One banded section — a coloured header bar over a tinted body. */
export function Section({
  colours,
  title,
  action,
  children,
  testId,
}: {
  colours: { header: string; tint: string };
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** Distinguishes sections that share a band. */
  testId: string;
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }} data-testid={`section-${testId}`}>
      <Stack
        direction="row"
        sx={{
          bgcolor: colours.header,
          color: "common.white",
          px: 2,
          py: 0.75,
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700 }} component="h2">
          {title}
        </Typography>
        {action ?? null}
      </Stack>
      <Box sx={{ bgcolor: colours.tint, px: 2, py: 0.5 }}>{children}</Box>
    </Paper>
  );
}

/** One label/value row, with an optional note underneath. */
export function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        alignItems: { sm: "baseline" },
        "&:first-of-type": { borderTop: "none" },
      }}
      data-testid="record-row"
      data-label={label}
    >
      <Box sx={{ minWidth: { sm: 200 }, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {children}
        {note ? (
          <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mt: 0.25 }}>
            {note}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

export type RecordFieldChipColour =
  | "default"
  | "primary"
  | "secondary"
  | "error"
  | "info"
  | "success"
  | "warning";

/**
 * A read-only or dropdown-editable label/value row — the board's own in-cell
 * interaction, restyled for a list. Given `options` and `onOpen`, the value
 * becomes a click target that opens an inline `Select`, autofocused, exactly
 * as a board cell's does; without them it is plain, permanently read-only
 * text.
 */
export function RecordField({
  label,
  value,
  note,
  chip,
  readOnly,
  options,
  optionLabels,
  editing,
  error,
  rawValue,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  value: string | null;
  note?: string;
  chip?: RecordFieldChipColour;
  readOnly?: boolean;
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  editing?: boolean;
  error?: string | null;
  /** The stored value, when it differs from the display label — feeds the open `Select`. */
  rawValue?: string | null;
  onOpen?: () => void;
  onClose?: () => void;
  onCommit?: (next: string) => void;
}) {
  const editable = !readOnly && options !== undefined && onOpen !== undefined;

  return (
    <Row label={label}>
      {editing && options ? (
        <Select
          size="small"
          open
          autoFocus
          value={rawValue ?? ""}
          onClose={onClose}
          onChange={(event) => {
            onCommit?.(event.target.value);
          }}
          sx={{ minWidth: 220 }}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">
            <em>{NOT_RECORDED}</em>
          </MenuItem>
          {options.map((option) => (
            <MenuItem key={option} value={option}>
              {optionLabels?.[option] ?? option}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {value === null || value === "" ? (
            <NotRecorded />
          ) : chip ? (
            <Chip size="small" color={chip} label={value} />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: editable ? "underline" : "none",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {value}
            </Typography>
          )}
        </Box>
      )}
      {note ? (
        <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mt: 0.25 }}>
          {note}
        </Typography>
      ) : null}
      {error ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
          {error}
        </Typography>
      ) : null}
    </Row>
  );
}
