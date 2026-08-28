import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import ShellNav from "../operate/shell-nav";
import { DESTINATIONS } from "../operate/destinations";
import { OPERATOR_CAPTION, OPERATOR_SECTION } from "../operate/layout";
import PreviewShell from "./preview-shell";
import { SIGNED_IN_OPERATOR } from "./fixtures";

/**
 * A fidelity mockup of the redesigned roster — W5, `M-PEOPLE-AND-ROSTER`.
 *
 * ## What this is for
 *
 * The W5 review was photographed at two scroll positions, so three of the
 * board's Season columns appear in no frame at all, and the single biggest
 * change in the workflow — that this surface now *writes*, in the cell, with no
 * save button — has no picture anywhere. This page exists so the behaviour can
 * be driven rather than inferred: click a Season cell and watch it commit,
 * scroll sideways and watch the Player column hold, set a filter on a column
 * that is off the screen and watch the chip bar explain why the board went
 * short.
 *
 * ## What this is not
 *
 * It is **not the implementation**, and nothing here should be copied into
 * `/operate/roster` wholesale. It is not on the mission's branch, it is never
 * merged, and where it disagrees with `workflows/W5-work-this-seasons-roster.md`
 * or `field-inventory.md`, those win. The column set is illustrative; the
 * interaction model is the point.
 *
 * ## Why it lives outside `/operate`
 *
 * `/operate` is a protected prefix in `src/proxy.ts`, and the layout there
 * resolves a real operator against a real Supabase session. A mockup that
 * needed a login and a database lease would be a mockup nobody opened. So this
 * route sits outside the protected prefixes and reuses the shell's own
 * components — `ShellNav`, the theme, the header — rather than redrawing them,
 * which is what keeps it looking like the product instead of like a sketch.
 *
 * The consequence, stated: **this page has no authorization and must never
 * carry a real record.** It renders fixtures and nothing else. That is fine on
 * a branch that is never merged, and it is the reason this branch is never
 * merged.
 */
export default function RosterPreviewPage() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        minHeight: "100dvh",
        alignItems: "stretch",
      }}
    >
      <ShellNav
        operatorName={SIGNED_IN_OPERATOR}
        destinations={DESTINATIONS}
        administration={[
          { href: "/operate/admin/operators", label: "Operators", capability: null },
          { href: "/operate/admin/roles", label: "Roles", capability: null },
        ]}
        sectionLabel={OPERATOR_SECTION}
        roleCaption={OPERATOR_CAPTION}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          pb: { xs: 12, md: 4 },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            mb: 3,
          }}
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

        <PreviewShell />
      </Box>
    </Box>
  );
}
