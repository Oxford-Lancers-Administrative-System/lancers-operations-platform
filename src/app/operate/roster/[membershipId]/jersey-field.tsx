import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { NotRecorded } from "@/components/fact";
import { RecordRow as Row } from "@/components/record-field";
import JerseyPicker from "../jersey-picker";

/** The board's own jersey picker — the fuller editor W6 keeps, since the board shows only the predominant number. */
export default function JerseyField({
  label,
  held,
  holders,
  editing,
  readOnly,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  held: readonly string[];
  holders: Record<string, string>;
  editing: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string[]) => void;
}) {
  const editable = !readOnly;
  return (
    <Row label={label}>
      {editing ? (
        <JerseyPicker
          held={held}
          holders={holders}
          onCommit={onCommit}
          onClose={onClose}
          width={264}
        />
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
          {held.length === 0 ? (
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
              {held.join(", ")}
            </Typography>
          )}
        </Box>
      )}
    </Row>
  );
}
