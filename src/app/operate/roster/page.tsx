import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { gateShellPage } from "../gate";

/**
 * `/operate/roster` — UX-02's destination.
 *
 * LAN-73 built the shell and the boundary; LAN-74 adds the one action that
 * starts from here, and LAN-75 adds the roster list itself (UX-20) and the
 * membership detail (UX-21). The list is deliberately still absent: this issue
 * owns intake, and a half-built roster would be a screen LAN-75 has to unpick.
 *
 * It shows no club data, because none of it is this issue's to show. When
 * LAN-75 fills it, the guard above stays exactly where it is.
 */
export default async function RosterPage() {
  const gate = await gateShellPage("/operate/roster");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6" component="h1">
        Roster
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button href="/operate/roster/new" variant="contained" sx={{ minHeight: 44 }}>
          Add returning player
        </Button>
      </Stack>
      <Alert severity="info">
        Navigation contains Roster, Events and Report only. There is no operator Home destination in
        this MVP.
      </Alert>
      <Typography color="text.secondary">
        The current-season roster list is not built yet — LAN-75 adds it, and the membership detail
        it links to.
      </Typography>
    </Stack>
  );
}
