import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { NOT_RECORDED, NotRecorded } from "@/components/fact";
import { FIELD_EDITOR_SX, FieldStatus, RecordRow as Row } from "@/components/record-field";
import type { PositionOptions } from "@/lib/services/roster-board";

/** One position field: a code, editable from a fixed option list. */
export default function PositionField({
  label,
  value,
  options,
  editing,
  readOnly,
  saving,
  error,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  value: string | null;
  options: PositionOptions["offence"];
  editing: boolean;
  readOnly: boolean;
  /** This field's own save is in flight — LAN-380. */
  saving?: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string) => void;
}) {
  const editable = !readOnly && !saving;
  return (
    <Row label={label}>
      {editing ? (
        <Select
          size="small"
          open
          autoFocus
          value={value ?? ""}
          onClose={onClose}
          onChange={(event) => onCommit(event.target.value)}
          sx={{ ...FIELD_EDITOR_SX, minWidth: 220 }}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">
            <em>{NOT_RECORDED}</em>
          </MenuItem>
          {options.map((option) => (
            <MenuItem key={option.code} value={option.code}>
              {option.code} — {option.label}
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
          {value === null ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: "underline",
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
    </Row>
  );
}
