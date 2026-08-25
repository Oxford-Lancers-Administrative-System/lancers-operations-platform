/**
 * Where the two tiers' event surfaces live. LAN-153.
 *
 * One module rather than template literals scattered through the screens,
 * because `REQ-three-arrangements` requires that "every tile and row leads to
 * the same event page" — and a destination built in six places is a destination
 * that will eventually be built five ways. The tile components take an `href`
 * for the same reason; this is where the two tiers answer it.
 *
 * These are addresses, not permissions. Reaching `/operate/events/<id>` without
 * an operator profile is refused by the service layer and by `/operate`'s gate;
 * knowing the shape of the address grants nothing (`slice-ux.md` § 4: "Routes do
 * not authorize").
 */

/** The public calendar's list — the club's noticeboard. */
export const PUBLIC_CALENDAR_PATH = "/calendar";

/**
 * The public calendar's two calendar arrangements.
 *
 * A static child segment rather than a query parameter on `/calendar`, so the
 * public surface mirrors `/operate/events` and `/operate/events/calendar`
 * exactly. Next resolves a static segment before a dynamic sibling, so this
 * never collides with `/calendar/[id]`.
 */
export const PUBLIC_CALENDAR_VIEW_PATH = "/calendar/view";

/** One event, at the public tier. */
export function publicEventHref(eventId: string): string {
  return `${PUBLIC_CALENDAR_PATH}/${eventId}`;
}

/**
 * `W2`'s one public subscription feed — LAN-158.
 *
 * A route, not a page: `src/app/calendar/feed.ics/route.ts` serves
 * `text/calendar` from it, and `SubscribeToCalendarButton` is the one place
 * that builds a URL from it, so the address a subscriber's calendar app is
 * given and the address the route actually answers on can never drift apart.
 */
export const PUBLIC_CALENDAR_FEED_PATH = "/calendar/feed.ics";

export const OPERATOR_EVENTS_PATH = "/operate/events";

export const OPERATOR_CALENDAR_PATH = "/operate/events/calendar";

/**
 * The seven fixed templates, behind the Events area — LAN-165.
 *
 * Reachable only by typing the address until this constant's one caller
 * (`EventsPage`'s `Edit templates` button) was added: nothing linked to it,
 * which the mission's final workflow walk found and Brian named as a stopgap
 * to fix immediately rather than a considered navigation decision to design
 * properly later. See that button's own doc comment.
 */
export const OPERATOR_EVENT_TEMPLATES_PATH = "/operate/events/templates";

/** One event, at the operator tier. */
export function operatorEventHref(eventId: string): string {
  return `${OPERATOR_EVENTS_PATH}/${eventId}`;
}
