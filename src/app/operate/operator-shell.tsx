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

// Presentation only. Each entry point retains its own session and capability gates.
export default function OperatorShell({
  operator,
  children,
}: {
  operator: ResolvedOperator;
  children: ReactNode;
}) {
  // LAN-110: the coach shell's caption is resolved server-side, from the
  // verified session — ShellNav is handed the answer, never the roles.
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
        // LAN-133: resolved server-side, same rule as the coach shell above.
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
          // LAN-195: clearance for the phone top bar (56px + ordinary 24px spacing).
          pt: { xs: 10, md: 4 },
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: "auto" }}>{children}</Box>
      </Box>
    </Box>
  );
}
