import "server-only";

import { headers } from "next/headers";

/**
 * Where this deployment answers, for building a club link an operator copies.
 *
 * `APP_BASE_URL` outranks the request, which is the same order
 * `emailLinkRedirectDestination` takes and for the same reason: a `Host` header
 * is whatever the caller wrote, and a link built from a forged one is a link
 * pointing at somebody else's host. The environment value is set by whoever
 * deployed the revision.
 *
 * It falls back to the request rather than refusing, because a club link is not
 * a credential being sent somewhere — it is a URL an operator is about to read
 * off their own screen, and the host they are looking at is the right host. The
 * trailing slash is trimmed so `clubLinkUrl` never builds `//e/…`.
 */
export async function publicOrigin(): Promise<string> {
  const configured = (process.env.APP_BASE_URL ?? "").trim();
  if (configured !== "") return configured.replace(/\/+$/, "");

  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
