import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import EditCategories from "./edit-categories";

/** The board's page-level heading: title, season and count, and the add-players action where the seat may add — with Edit categories beside it for a `role_management` holder (LAN-430, W2-01). */
export default function RosterHeading({
  count,
  columns,
  seasonLabel,
  canEditCategories = false,
  addPlayers = null,
}: {
  count: number;
  columns: number;
  seasonLabel: string;
  /** Whether this operator holds `role_management`; the action behind the button asks again. */
  canEditCategories?: boolean;
  /** Add players, or nothing without the May add to the roster switch (LAN-432). */
  addPlayers?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
    >
      <Box>
        <Typography variant="h6" component="h1">
          Roster
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="season-label">
          {`Season ${seasonLabel} · ${count} ${count === 1 ? "player" : "players"} · ${columns} columns`}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {canEditCategories ? <EditCategories /> : null}
        {addPlayers}
      </Stack>
    </Stack>
  );
}
