import "server-only";

import { applicationNow } from "./test-runtime";

/**
 * LAN-340. How far the application's own clock is ahead of the real one, in
 * milliseconds — zero everywhere but the LAN-222 test box, whose advanced
 * test clock is what `applicationNow()` reads there. A client control that
 * defaults a field to "now" adds this so it reads the same clock the server
 * will judge the value against. Server-only, like the seam it reads.
 */
export function applicationClockOffsetMs(): number {
  return applicationNow().getTime() - Date.now();
}
