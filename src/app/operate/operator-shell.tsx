import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { describeHeldCoachingSeats, isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { signOut } from "../login/actions";
import { administrationDestinationsFor, destinationsFor } from "./destinations";
import ShellNav from "./shell-nav";

export const OPERATOR_SECTION = "Operations";
export const OPERATOR_CAPTION = "Authorized operator";
export const COACH_SECTION = "Attendance";

/** Presentation only. Each entry point retains its own session and capability gates. */
export default function OperatorShell({
  operator,
  children,
}: {
  operator: ResolvedOperator;
  children: ReactNode;
}) {
  // LAN-110. A coaching assignment gets the coach shell — one destination, and
  // the sidebar captioned with the seat they hold rather than with the general
  // "Authorized operator", because they are not one and the shell should not
  // imply that they are. Resolved here, on the server, from the verified
  // session; `ShellNav` is handed the answer and never the roles.
  const isCoachShell = isNarrowAttendanceRecorder(operator.roleCodes);
  const roleCaption = isCoachShell
    ? describeHeldCoachingSeats(operator.roleCodes)
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
        operatorName={operator.displayName}
        destinations={destinationsFor(operator.roleCodes)}
        // LAN-133. Resolved here, on the server, from the verified session —
        // the same rule the coach shell follows: `ShellNav` is handed the
        // answer and never the role codes it would have to be trusted with to
        // work it out. Empty for every operator who does not administer.
        administration={administrationDestinationsFor(operator.roleCodes)}
        sectionLabel={isCoachShell ? COACH_SECTION : OPERATOR_SECTION}
        roleCaption={roleCaption}
        accountAction={
          <Box component="form" action={signOut}>
            <Button
              type="submit"
              variant="outlined"
              sx={{ color: "common.white", borderColor: "rgba(255, 255, 255, 0.4)" }}
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
          px: { xs: 2, md: 4 },
          pb: { xs: 3, md: 4 },
          // LAN-195. The fixed bar moved from the bottom of the phone screen
          // to the top (the hamburger), so the clearance moves with it: 56px
          // of bar plus the ordinary 3-unit (24px) top spacing used everywhere
          // else, i.e. 10 spacing units rather than 3.
          pt: { xs: 10, md: 4 },
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>{children}</Box>
      </Box>
    </Box>
  );
}
