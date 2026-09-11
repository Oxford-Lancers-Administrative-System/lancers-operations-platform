/**
 * The three read-only terminal states: already recorded (player and
 * recruit), and cancelled. Split from `page.tsx` (LAN-300).
 */
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";

import type { PlayerAnswer } from "@/lib/services/player-answer-tokens";
import type { SignedRsvpPage } from "@/lib/services/rsvp";

import {
  ALREADY_RECORDED_HEADING,
  ALREADY_RECORDED_NOTE,
  CANCELLED_HEADING,
  CANCELLED_NOTE,
  RECRUIT_NO_HEADING,
  RECRUIT_YES_HEADING,
  cancelledSentence,
} from "./presentation";
import { Shell } from "./confirm-panel";

export function AlreadyRecorded() {
  return (
    <Shell>
      <PageHeader title={ALREADY_RECORDED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {ALREADY_RECORDED_NOTE}
      </Typography>
    </Shell>
  );
}

/**
 * The recruit journey's actual saved page: the answer and the event on one
 * line, reached because `submitAnswer` sends a recruit back to this exact
 * route rather than to `/me/[token]`. No "your own page" note, because there
 * is no such page for them.
 *
 * Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md.
 */
export function RecruitAlreadyRecorded({
  answer,
  base,
}: {
  answer: PlayerAnswer;
  base: SignedRsvpPage;
}) {
  return (
    <Shell>
      <PageHeader title="Your response is saved" />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        {`${answer === "yes" ? RECRUIT_YES_HEADING : RECRUIT_NO_HEADING} · ${base.eventName}`}
      </Typography>
    </Shell>
  );
}

export function Cancelled({ eventName }: { eventName: string }) {
  return (
    <Shell>
      <PageHeader title={CANCELLED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        {cancelledSentence(eventName)}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>
        {CANCELLED_NOTE}
      </Typography>
    </Shell>
  );
}
