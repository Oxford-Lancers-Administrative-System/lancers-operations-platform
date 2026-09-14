/**
 * The three read-only terminal states: already recorded (player and
 * recruit), and cancelled. Split from `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";

import type { PlayerAnswer } from "@/lib/services/player-answer-tokens";
import type { SignedRsvpPage } from "@/lib/services/rsvp";
import { SEE_ALL_YOUR_EVENTS } from "@/app/events/[token]/presentation";

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
import { openEventsPage } from "./actions";

/**
 * LAN-343. A form rather than an `<a>`: the events page needs a durable
 * credential, a credential's plaintext cannot be recovered, and a GET on this
 * route is guaranteed to be fetched by a link-preview crawler before any human
 * arrives — so the mint happens on this submit and nowhere else. The visible
 * control is a plain text link; only the mechanism underneath it is a POST.
 */
export function AlreadyRecorded({ token }: { token: string }) {
  return (
    <Shell>
      <PageHeader title={ALREADY_RECORDED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {ALREADY_RECORDED_NOTE}
      </Typography>
      <Box component="form" action={openEventsPage}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="text" sx={{ minHeight: 44, textTransform: "none" }}>
          {SEE_ALL_YOUR_EVENTS}
        </Button>
      </Box>
    </Shell>
  );
}

/**
 * The recruit journey's actual saved page: the answer and the event on one
 * line, reached because `submitAnswer` sends a recruit back to this exact
 * route rather than to `/events/[token]`. No "your own page" note, because there
 * is no such page for them.
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
