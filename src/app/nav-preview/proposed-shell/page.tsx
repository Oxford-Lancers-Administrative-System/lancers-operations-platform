import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ADMINISTRATION_DESTINATIONS, DESTINATIONS } from "../../operate/destinations";
import { OPERATOR_CAPTION, OPERATOR_SECTION } from "../../operate/layout";
import ContentPlaceholder from "../content-placeholder";
import { SIGNED_IN_OPERATOR } from "../fixtures";
import ProposedShellNav from "../proposed-shell-nav";

/**
 * LAN-195 — the proposed hamburger-and-drawer nav, standalone.
 *
 * Embedded by `/nav-preview` at 375px (twice, one `?open=1`) and at desktop
 * width, so the same component can be checked against every state LAN-195
 * asks for without Brian having to drive one frame through all of them.
 *
 * `pt` replaces the real layout's `pb: {xs: 12}` — LAN-195 calls this out
 * directly: "layout.tsx's bottom padding that clears the fixed bar moves to
 * the top." This route is the standalone proof of that move; the real change
 * belongs in `src/app/operate/layout.tsx`, not here.
 */
export default async function ProposedShellFramePage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", alignItems: "stretch" }}>
      <ProposedShellNav
        operatorName={SIGNED_IN_OPERATOR}
        destinations={DESTINATIONS}
        administration={ADMINISTRATION_DESTINATIONS}
        sectionLabel={OPERATOR_SECTION}
        roleCaption={OPERATOR_CAPTION}
        defaultOpen={open === "1"}
      />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 }, pt: { xs: 9, md: 4 } }}>
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
