import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ADMINISTRATION_DESTINATIONS, DESTINATIONS } from "../../operate/destinations";
import { OPERATOR_CAPTION, OPERATOR_SECTION } from "../../operate/layout";
import ShellNav from "../../operate/shell-nav";
import ContentPlaceholder from "../content-placeholder";
import { SIGNED_IN_OPERATOR } from "../fixtures";

/**
 * LAN-195 — today's real `ShellNav`, unmodified and unmocked.
 *
 * Embedded by `/nav-preview` at two widths, for two different points:
 *
 *   * At 375px, this is the defect itself — nine equal-flex destinations
 *     (the three ordinary ones plus all six Administration entries, which the
 *     real component does not hide at `xs`) crammed into a ~41.6px slot each.
 *     It is the genuine bug, not a redrawing of it, because this route
 *     imports `shell-nav.tsx` directly and changes nothing about it.
 *   * At desktop width, it is the "existing sticky sidebar" LAN-195 asks to
 *     see "side by side" with the proposal, to confirm nothing here is
 *     touched by this issue.
 *
 * No session, no database — this route sits outside every protected prefix in
 * `src/proxy.ts` for the same reason `roster-preview` does, and it must never
 * carry a real record. See `../README.md`.
 */
export default function LiveShellFramePage() {
  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", alignItems: "stretch" }}>
      <ShellNav
        operatorName={SIGNED_IN_OPERATOR}
        destinations={DESTINATIONS}
        administration={ADMINISTRATION_DESTINATIONS}
        sectionLabel={OPERATOR_SECTION}
        roleCaption={OPERATOR_CAPTION}
      />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, pb: { xs: 12, md: 4 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="p" sx={{ fontWeight: 800 }}>
              Lancers Operations
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Signed in as {SIGNED_IN_OPERATOR}
            </Typography>
          </Box>
          <Button variant="outlined" disabled>
            Sign out
          </Button>
        </Stack>
        <ContentPlaceholder />
      </Box>
    </Box>
  );
}
