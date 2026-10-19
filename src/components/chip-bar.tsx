import type { ReactNode } from "react";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface ChipBarChip {
  readonly key: string;
  readonly label: ReactNode;
  readonly onDelete: () => void;
}

/**
 * A board's chip bar: a caption, one removable chip per active choice, and an
 * optional trailing action. The Roster and Recruits boards draw "Filtered by"
 * and, since LAN-495, "Sorted by" with it, so the two bars read alike.
 */
export function ChipBar({
  caption,
  chips,
  action,
  testId,
}: {
  caption: string;
  chips: readonly ChipBarChip[];
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
      data-testid={testId}
    >
      <Typography variant="body2" color="text.secondary">
        {caption}
      </Typography>
      {chips.map((chip) => (
        <Chip key={chip.key} size="small" label={chip.label} onDelete={chip.onDelete} />
      ))}
      {action}
    </Stack>
  );
}
