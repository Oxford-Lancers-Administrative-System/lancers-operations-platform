import { redirect } from "next/navigation";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import OperatorAccountState from "./account-state";

import OperatorShell from "./operator-shell";
export { OPERATOR_SECTION, OPERATOR_CAPTION, COACH_SECTION } from "./operator-shell";

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

  return <OperatorShell operator={access.operator}>{children}</OperatorShell>;
}
