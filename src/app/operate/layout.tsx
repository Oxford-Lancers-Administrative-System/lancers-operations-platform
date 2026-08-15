import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { describeHeldCoachingSeats, isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { signOut } from "../login/actions";
import OperatorAccountState from "./account-state";
import { destinationsFor } from "./destinations";
import ShellNav from "./shell-nav";

/** The sidebar's second line, and the caption under the signed-in name. */
export const OPERATOR_SECTION = "Operations";
export const OPERATOR_CAPTION = "Authorized operator";
export const COACH_SECTION = "Attendance";

/**
 * The `/operate` shell — UX-02, and the frame the account states are shown in.
 *
 * ## What it decides
 *
 * It resolves the operator once and picks one of three outcomes:
 *
 *   * **no session** — redirect to `/login`. `src/proxy.ts` already does this
 *     with the exact path preserved; this is the second line, for the case the
 *     proxy matcher is changed or bypassed, and it deliberately does not try to
 *     reconstruct a deep path it cannot see (a layout is not given one).
 *
 *   * **unlinked or deactivated** — render the account state **instead of**
 *     `children`. Not around it: an unrendered `children` element is a page
 *     component React never invokes, so a child that forgot to guard itself
 *     never runs a query, never renders and never leaks. That is why this
 *     layout drops children rather than styling them away.
 *
 *   * **active** — render the navigation and the page.
 *
 * ## What it is not
 *
 * It is not the authorization boundary, and no page may treat it as one. Layout
 * and page are separate render entry points; a page reached in any way that
 * skipped this layout would render unguarded. Every page under `/operate`
 * therefore guards itself as well, which is duplication with a purpose: two
 * independent checks, either of which refuses on its own.
 */
export default async function OperateLayout({ children }: LayoutProps<"/operate">) {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect("/login?redirectTo=/operate");
  }

  if (access.state !== "active") {
    return <OperatorAccountState state={access.state} />;
  }

  // LAN-110. A coaching assignment gets the coach shell — one destination, and
  // the sidebar captioned with the seat they hold rather than with the general
  // "Authorized operator", because they are not one and the shell should not
  // imply that they are. Resolved here, on the server, from the verified
  // session; `ShellNav` is handed the answer and never the roles.
  const isCoachShell = isNarrowAttendanceRecorder(access.operator.roleCodes);
  const roleCaption = isCoachShell
    ? describeHeldCoachingSeats(access.operator.roleCodes)
    : OPERATOR_CAPTION;

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
        operatorName={access.operator.displayName}
        destinations={destinationsFor(access.operator.roleCodes)}
        sectionLabel={isCoachShell ? COACH_SECTION : OPERATOR_SECTION}
        roleCaption={roleCaption}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          // Clears the fixed bottom navigation on a phone.
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
              Signed in as {access.operator.displayName}
            </Typography>
          </Box>
          <Box component="form" action={signOut}>
            <Button type="submit" variant="outlined">
              Sign out
            </Button>
          </Box>
        </Stack>
        {children}
      </Box>
    </Box>
  );
}
