import type { ReactElement } from "react";
import { GRANT_REQUIREMENT } from "@/lib/auth/access";
import type { TemplateLevel } from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { readEventTemplateLevel } from "@/lib/services/events";
import { gateShellPage } from "../gate";
import NotPermittedScreen from "../not-permitted";
import { OPERATOR_EVENTS_PATH } from "@/app/calendar/routes";

const LEVEL_RANK: Readonly<Record<TemplateLevel, number>> = { none: 0, view: 1, manage: 2 };

/**
 * The gate every `/operate/events/[id]` page opens with — LAN-431.
 *
 * The shell gate first (any template at `minimum`), then the event's own
 * template: below `minimum` the page is refused, so a typed URL for an event
 * of a `none` template is refused rather than shown. An unknown event passes
 * with `level: null`; the page's own read then says it no longer exists.
 */
export async function gateEventPage(
  route: string,
  eventId: string,
  minimum: Exclude<TemplateLevel, "none">,
): Promise<{ operator: ResolvedOperator; level: TemplateLevel | null } | { screen: ReactElement }> {
  const gate = await gateShellPage(route, { anyOf: "template", minimum });
  if ("screen" in gate) return gate;

  const level = await readEventTemplateLevel(gate.operator, eventId);
  if (level !== null && LEVEL_RANK[level] < LEVEL_RANK[minimum]) {
    return {
      screen: (
        <NotPermittedScreen requirement={GRANT_REQUIREMENT} returnHref={OPERATOR_EVENTS_PATH} />
      ),
    };
  }
  return { operator: gate.operator, level };
}
