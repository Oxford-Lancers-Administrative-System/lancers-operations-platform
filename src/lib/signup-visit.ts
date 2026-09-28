/**
 * LAN-442 (W-4). Which requests for the sign-up door count as a **visit**.
 *
 * A page cannot see its own request method, so `src/proxy.ts` decides and
 * tells `/join/[code]` through one request header it always overwrites. A
 * visit is a document `GET` that is not a speculative prefetch or a link
 * preview the browser labels as one: a `HEAD` (a scanner, `curl -I`), a
 * server-action `POST` and a `Sec-Purpose: prefetch` load render the page
 * without anybody having opened it. Unfurlers that send an ordinary `GET` are
 * indistinguishable from a person and still count, as the column says.
 */
export const SIGNUP_DOOR_PREFIX = "/join";

/** Set to `"1"` by the proxy on a counted request, and stripped from every other. */
export const SIGNUP_VISIT_HEADER = "x-lancers-signup-visit";

export function isSignupDoorVisit(method: string, headers: Headers): boolean {
  if (method !== "GET") return false;
  const purpose = ["sec-purpose", "purpose", "x-purpose", "x-moz"]
    .map((name) => headers.get(name) ?? "")
    .join(" ")
    .toLowerCase();
  return !purpose.includes("prefetch") && !purpose.includes("preview");
}
