import "server-only";

import { headers } from "next/headers";

/** Where this deployment answers, for a club link an operator copies. `APP_BASE_URL` outranks the request (a `Host` header can be forged); falls back to the request rather than refusing, since a club link is not a credential. */
export async function publicOrigin(): Promise<string> {
  const configured = (process.env.APP_BASE_URL ?? "").trim();
  if (configured !== "") return configured.replace(/\/+$/, "");

  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const proto =
    incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
