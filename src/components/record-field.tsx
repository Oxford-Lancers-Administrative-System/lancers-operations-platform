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
        label={label}
        labelItalic={labelItalic}
        value={children}
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
      {saving ? (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 0.25 }}
          data-testid="field-saving"
        >
          {SAVING}
        </Typography>
      ) : null}
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
    </RecordRow>
  );
}
