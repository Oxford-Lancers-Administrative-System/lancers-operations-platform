// The shell every RSVP screen shares, and the current-answer label. Split from `page.tsx` (LAN-300).
import { PublicShell } from "@/components/public-shell";
import Stack from "@mui/material/Stack";

import type { SignedRsvpPage } from "@/lib/services/rsvp";

import { ANSWER_ATTENDING, ANSWER_NONE, ANSWER_NOT_ATTENDING } from "./presentation";

/** A phone-first touch target. The player is outdoors on a small screen. */
export const MIN_TOUCH_TARGET = 48;

/** One column, centred, readable at 375px and not absurdly wide on a desktop. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <Stack spacing={2}>{children}</Stack>
    </PublicShell>
  );
}

export function currentAnswerLabel(page: SignedRsvpPage): string {
  if (page.currentResponse === null) return ANSWER_NONE;
  return page.currentResponse.response === "yes" ? ANSWER_ATTENDING : ANSWER_NOT_ATTENDING;
}
