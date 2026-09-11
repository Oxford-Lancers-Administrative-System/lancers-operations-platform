import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { NotRecorded } from "@/components/fact";
import { RecordRow as Row } from "@/components/record-field";
import type { FormalwearItemKey } from "@/lib/services/roster-board";
import type { PlayerSeasonFacts } from "@/lib/services/player-record";
import { FORMALWEAR_ITEMS, FORMALWEAR_LABELS } from "../board-columns";

/** The formalwear multiselect field, editable as a set of owned items. */
export default function FormalwearField({
  season,
  editing,
  readOnly,
  onOpen,
  onClose,
  onToggle,
}: {
  season: PlayerSeasonFacts;
  editing: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (item: FormalwearItemKey, owned: boolean) => void;
}) {
  const editable = !readOnly;
  const owned = FORMALWEAR_ITEMS.filter((item) => season.formalwear[item]);
  const display =
    owned.length === 0 ? null : owned.map((item) => FORMALWEAR_LABELS[item]).join(", ");

  return (
    <Row label="Formalwear">
      {editing ? (
        <Select
          size="small"
          open
          multiple
          value={owned}
          onClose={onClose}
          renderValue={(value) =>
            (value as string[]).map((item) => FORMALWEAR_LABELS[item]).join(", ") || "—"
          }
          sx={{ minWidth: 220 }}
        >
          {FORMALWEAR_ITEMS.map((item) => (
            <MenuItem
              key={item}
              value={item}
              onClick={() => onToggle(item, !season.formalwear[item])}
            >
              <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={season.formalwear[item]} />
              <ListItemText primary={FORMALWEAR_LABELS[item]} />
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
    </Row>
  );
}
