"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { Fact, FactList, NOT_RECORDED, NotRecorded } from "./fact";
import { StatusChip, type StatusDomain } from "./status-chip";

/** The one word a field says while its own save is outstanding — LAN-380. A state, not a sentence. */
export const SAVING = "Saving…";

/**
 * The height every state of a record field's value occupies — Brian's visual
 * pass of 2026-09-17, item 4: "a row must not change height when a cell is
 * edited or just after a pick".
 *
 * A record row's display state is one line of `body2`, about 20px; its editor
 * is a `Select`, 40px out of the box. Opening one therefore grew its row and
 * closing it dropped the row back. Both are given this slot instead, which is
 * tall enough for the control and is what the read-only state reserves, so the
 * row is the same height whatever it is doing.
 */
const FIELD_CONTROL_HEIGHT = 24;

/** The same height, said to a `Select`, whose own padding is what makes it 40px. */
export const FIELD_EDITOR_SX = {
  height: FIELD_CONTROL_HEIGHT,
  fontSize: 13,
  "& .MuiSelect-select": {
    minHeight: "unset",
    py: 0,
    lineHeight: `${FIELD_CONTROL_HEIGHT - 2}px`,
  },
} as const;

/**
 * What a field says about its own last save — LAN-380, drawn beside the value
 * rather than under it (item 4). One shape for all five field components, so
 * none of them can grow its row when the others do not.
 */
export function FieldStatus({ saving, error }: { saving?: boolean; error?: string | null }) {
  return (
    <>
      {saving ? (
        <Typography
          variant="caption"
          component="span"
          sx={{ color: "text.secondary", ml: 1 }}
          data-testid="field-saving"
        >
          {SAVING}
        </Typography>
      ) : null}
      {error ? (
        <Typography variant="caption" component="span" color="error" sx={{ ml: 1 }}>
          {error}
        </Typography>
      ) : null}
    </>
  );
}

/** Interactive records retain their click-to-edit controls inside the kit's fact layout. */
export function RecordRow({
  label,
  note,
  labelItalic,
  children,
}: {
  label: string;
  note?: string;
  /** LAN-374 — a slot name under its squad's bold heading. */
  labelItalic?: boolean;
  children: ReactNode;
}) {
  return (
    <FactList>
      <Fact
        layout="inline"
        dense
        label={label}
        labelItalic={labelItalic}
        value={
          // The slot item 4 asks for: the display state reserves exactly what
          // the editor needs, so neither is taller than the other.
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              minHeight: FIELD_CONTROL_HEIGHT,
            }}
          >
            {children}
          </Box>
        }
        provenance={note}
        testId="record-row"
      />
    </FactList>
  );
}

/**
 * A read-only or dropdown-editable label/value row — the board's own in-cell
 * interaction, restyled for a list. Given `options` and `onOpen`, the value
 * becomes a click target that opens an inline `Select`, autofocused, exactly
 * as a board cell's does; without them it is plain, permanently read-only
 * text.
 */
export function RecordField({
  label,
  labelItalic,
  value,
  note,
  status,
  readOnly,
  saving,
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
  /** LAN-374 — a slot name under its squad's bold heading. */
  labelItalic?: boolean;
  value: string | null;
  note?: string;
  status?: { domain: StatusDomain; code: string };
  readOnly?: boolean;
  /** This field's own save is in flight — LAN-380. It takes no further edit until it is back. */
  saving?: boolean;
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
  const editable = !readOnly && !saving && options !== undefined && onOpen !== undefined;

  return (
    <RecordRow label={label} labelItalic={labelItalic}>
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
          sx={{ ...FIELD_EDITOR_SX, minWidth: 220 }}
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
          ) : status ? (
            <StatusChip domain={status.domain} status={status.code} label={value} />
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
      <FieldStatus saving={saving} error={error} />
      {note ? (
        <Typography variant="caption" component="span" sx={{ color: "text.disabled", ml: 1 }}>
          {note}
        </Typography>
      ) : null}
    </RecordRow>
  );
}
