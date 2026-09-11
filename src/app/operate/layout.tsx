import { redirect } from "next/navigation";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import OperatorAccountState from "./account-state";

import OperatorShell from "./operator-shell";
export { OPERATOR_SECTION, OPERATOR_CAPTION, COACH_SECTION } from "./operator-shell";

// The `/operate` shell — UX-02. Not the authorization boundary; every page guards itself too. Decision history: docs/ux/tickets/LAN-73-shell-and-access.md.
export default async function OperateLayout({ children }: LayoutProps<"/operate">) {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect("/login?redirectTo=/operate");
  }

  if (access.state !== "active") {
    return <OperatorAccountState state={access.state} />;
  }

  return <OperatorShell operator={access.operator}>{children}</OperatorShell>;
}
