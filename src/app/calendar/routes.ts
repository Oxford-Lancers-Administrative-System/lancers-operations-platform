/**
 * Where the two tiers' event surfaces live. LAN-153. One module so a
 * destination is built once, per `REQ-three-arrangements`. These are
 * addresses, not permissions — the service layer and `/operate`'s gate do
 * the refusing (`slice-ux.md` § 4: "Routes do not authorize").
 */

/** The public calendar's list — the club's noticeboard. */
export const PUBLIC_CALENDAR_PATH = "/calendar";

/** The public calendar's two arrangements. A static segment, not a query parameter, mirrors `/operate/events`; never collides with `/calendar/[id]`. */
export const PUBLIC_CALENDAR_VIEW_PATH = "/calendar/view";

/** One event, at the public tier. */
export function publicEventHref(eventId: string): string {
  return `${PUBLIC_CALENDAR_PATH}/${eventId}`;
}

/** `W2`'s one public subscription feed (LAN-158). A route, not a page — `feed.ics/route.ts` serves `text/calendar` from it. */
export const PUBLIC_CALENDAR_FEED_PATH = "/calendar/feed.ics";

export const OPERATOR_EVENTS_PATH = "/operate/events";

export const OPERATOR_CALENDAR_PATH = "/operate/events/calendar";

/** The seven fixed templates, behind the Events area (LAN-165). */
export const OPERATOR_EVENT_TEMPLATES_PATH = "/operate/events/templates";

/** One event, at the operator tier. */
export function operatorEventHref(eventId: string): string {
  return `${OPERATOR_EVENTS_PATH}/${eventId}`;
}
