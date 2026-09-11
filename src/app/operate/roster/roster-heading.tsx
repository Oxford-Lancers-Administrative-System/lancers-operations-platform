import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddPlayersMenu from "./add-players-menu";

/** The board's page-level heading: title, season and count, and the add-players action. */
export default function RosterHeading({
  count,
  columns,
  seasonLabel,
}: {
  count: number;
  columns: number;
  seasonLabel: string;
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
      <AddPlayersMenu />
    </Stack>
  );
}
