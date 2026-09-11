import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { describeHeldCoachingSeats, isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { LAYOUT } from "@/theme-tokens";
import { signOut } from "@/app/login/actions";
import OperatorAccountState from "@/app/operate/account-state";
import { administrationDestinationsFor, destinationsFor } from "@/app/operate/destinations";
import { COACH_SECTION, OPERATOR_CAPTION, OPERATOR_SECTION } from "@/app/operate/layout";
// Preview's own copy, so `/operate`'s real shell is untouched on this branch.
import ShellNav from "@/app/operate/shell-nav";

/**
 * The proposed operator shell — LAN-225 screen 0. Same frame as
 * `src/app/operate/layout.tsx`, three presentation changes, no behaviour
 * change: palette-drawn sidebar (B1), no redundant wordmark block above each
 * page (B2), sign out in the sidebar's account block (B3). Same gating rule
 * as the real layout; every page still gates itself with `gateShellPage`.
 */
export default async function DesignPreviewOperatorLayout({
  children,
}: LayoutProps<"/design-preview">) {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect("/login?redirectTo=/design-preview");
  }
  if (access.state !== "active") {
    return <OperatorAccountState state={access.state} />;
  }

  const isCoachShell = isNarrowAttendanceRecorder(access.operator.roleCodes);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        minHeight: "100dvh",
        alignItems: "stretch",
        bgcolor: "background.default",
      }}
    >
      <ShellNav
        operatorName={access.operator.displayName}
        destinations={destinationsFor(access.operator.roleCodes)}
        administration={administrationDestinationsFor(access.operator.roleCodes)}
        sectionLabel={isCoachShell ? COACH_SECTION : OPERATOR_SECTION}
        roleCaption={
          isCoachShell ? describeHeldCoachingSeats(access.operator.roleCodes) : OPERATOR_CAPTION
        }
        accountAction={
          <Box component="form" action={signOut}>
            <Button
              type="submit"
              variant="outlined"
              size="small"
              sx={{
                color: "common.white",
                borderColor: "rgba(255, 255, 255, 0.4)",
                "&:hover": { borderColor: "common.white", bgcolor: "rgba(255, 255, 255, 0.08)" },
              }}
            >
              Sign out
            </Button>
          </Box>
        }
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: LAYOUT.gutterPhone, md: LAYOUT.gutterDesktop },
          pb: { xs: 3, md: 4 },
          pt: { xs: 10, md: 4 },
        }}
      >
        <Box sx={{ maxWidth: LAYOUT.contentMaxWidth, mx: "auto" }}>{children}</Box>
      </Box>
    </Box>
  );
}
