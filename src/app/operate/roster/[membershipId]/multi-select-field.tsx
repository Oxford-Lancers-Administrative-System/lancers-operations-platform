import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { NotRecorded } from "@/components/fact";
import { FIELD_EDITOR_SX, FieldStatus, RecordRow as Row } from "@/components/record-field";

/**
 * One uncapped multi-select record field — LAN-387. Formalwear used to be the
 * only one and had its own component; the coaching group and the two position
 * groups are the same control over a different list, so there is one component
 * and each caller brings its vocabulary. Nothing is capped, and the whole
 * selection is what commits.
 */
export default function MultiSelectField({
  label,
  values,
  options,
  optionLabels,
  editing,
  readOnly,
  saving,
  error,
  testId,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  values: readonly string[];
  options: readonly string[];
  /** Display text per option, where the stored value is not the word shown. */
  optionLabels?: Readonly<Record<string, string>>;
  editing: boolean;
  readOnly: boolean;
  /** This field's own save is in flight — LAN-380. */
  saving?: boolean;
  error?: string | null;
  testId?: string;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string[]) => void;
}) {
  const editable = !readOnly && !saving;
  const labelOf = (value: string) => optionLabels?.[value] ?? value;
  const display = values.length === 0 ? null : values.map(labelOf).join(", ");

  return (
    <Row label={label}>
      {editing ? (
        <Select
          size="small"
          open
          multiple
          value={[...values]}
          onClose={onClose}
          onChange={(event) => onCommit(event.target.value as string[])}
          renderValue={(value) => (value as string[]).map(labelOf).join(", ") || "—"}
          sx={{ ...FIELD_EDITOR_SX, minWidth: 220 }}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
        >
          {options.map((option) => (
            <MenuItem key={option} value={option}>
              <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={values.includes(option)} />
              <ListItemText primary={labelOf(option)} />
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : testId}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {display === null ? (
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
              {display}
            </Typography>
          )}
        </Box>
      )}
      <FieldStatus saving={saving} error={error} />
    </Row>
  );
}
