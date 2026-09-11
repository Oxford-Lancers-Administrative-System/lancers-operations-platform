import "server-only";

import type { RecruitmentCycleStepName } from "../recruitment-cycle";

export const SENT_STEP_KEYS: Readonly<
  Record<"personal" | "recruitment", readonly RecruitmentCycleStepName[]>
> = Object.freeze({
  personal: ["welcome", "details_reminder"],
  recruitment: ["interest_ask", "interest_reminder"],
});
