import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { gateShellPage } from "../gate";

/**
 * `/operate/roster` — UX-02's destination, deliberately empty.
 *
 * LAN-73 builds the shell and the boundary, not the slice's features: the
 * roster itself is LAN-75 and returner intake is LAN-74. The page exists now so
 * that the navigation has somewhere to go, the landing rule has a first
 * permitted destination, and the guard has a real page to guard.
 *
 * It shows no club data, because there is none to show yet. When LAN-75 fills
 * it, the guard above stays exactly where it is.
 */
export default async function RosterPage() {
  const gate = await gateShellPage("/operate/roster");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6" component="h1">
        Roster
      </Typography>
      <Alert severity="info">
        Navigation contains Roster, Events and Report only. There is no operator Home destination in
        this MVP.
      </Alert>
      <Typography color="text.secondary">
        The current-season roster is not built yet. LAN-74 adds returner intake and LAN-75 adds the
        roster and membership detail.
      </Typography>
    </Stack>
  );
}
