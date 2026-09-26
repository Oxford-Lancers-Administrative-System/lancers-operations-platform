import { redirect } from "next/navigation";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { BandColoursProvider } from "@/components/band-colours-provider";
import {
  DEFAULT_ROSTER_GROUP_COLOURS,
  type RosterGroupColourKeys,
} from "@/components/band-colours";
import { isServiceError } from "@/lib/db";
import { readRosterGroupColours } from "@/lib/services/roster-group-colours";
import OperatorAccountState from "./account-state";

import OperatorShell from "./operator-shell";
export { OPERATOR_SECTION, OPERATOR_CAPTION, COACH_SECTION } from "./operator-shell";

/** LAN-430: the club's roster group colours, for every band under `/operate`. A failed read draws the seeded colours rather than failing the page. */
async function groupColours(): Promise<RosterGroupColourKeys> {
  try {
    return await readRosterGroupColours();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return DEFAULT_ROSTER_GROUP_COLOURS;
  }
}

// The `/operate` shell — UX-02. Not the authorization boundary; every page guards itself too.
export default async function OperateLayout({ children }: LayoutProps<"/operate">) {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect("/login?redirectTo=/operate");
  }

  if (access.state !== "active") {
    return <OperatorAccountState state={access.state} />;
  }

  return (
    <BandColoursProvider groupColours={await groupColours()}>
      <OperatorShell operator={access.operator}>{children}</OperatorShell>
    </BandColoursProvider>
  );
}
