import "server-only";

import type { RecruitmentCycleStepName } from "../recruitment-cycle";

// The step keys "sent"/"queued" is read from — shared by `read.ts` and
// `send.ts`. Decision history: docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md.
export const SENT_STEP_KEYS: Readonly<
  Record<"personal" | "recruitment", readonly RecruitmentCycleStepName[]>
> = Object.freeze({
  personal: ["welcome", "details_reminder"],
  recruitment: ["interest_ask", "interest_reminder"],
});
