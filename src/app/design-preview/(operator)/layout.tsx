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
// The preview's own copy of the proposed shell, so `/operate`'s real one is
// untouched on this branch and merging changes nobody's navigation.
import ShellNav from "@/app/operate/shell-nav";

/**
 * The proposed operator shell — LAN-225 screen 0.
 *
 * The same frame `src/app/operate/layout.tsx` draws, with three presentation
 * changes and no behaviour change:
 *
 *   - **B1** the sidebar and drawer draw from the palette (`./shell-nav.tsx`,
 *     this folder's copy of `src/app/operate/shell-nav.tsx`, does; this layout
 *     only mounts it — the real one is left exactly as it is on `main`);
 *   - **B2** the "Lancers Operations / Signed in as …" block above every page
 *     is gone — the wordmark and the account live in the shell, and the page's
 *     own `PageHeader` is its one heading;
 *   - **B3** sign out moves into the sidebar's account block, so a phone never
 *     spends its first screen on the account before the page title.
 *
 * Gating is the same two-line rule as the real layout: no session redirects to
 * login; an unlinked or inactive account gets the account state and never the
 * children. Every page under this route gates itself again with
 * `gateShellPage`, exactly as every page under `/operate` does.
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
