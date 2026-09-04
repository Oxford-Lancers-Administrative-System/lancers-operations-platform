import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { withTransaction } from "@/lib/db";
import { readSignedRsvpPageIn } from "@/lib/services/rsvp";
import { Fact, FactGrid } from "@/components/fact";
import { PublicShell } from "@/components/public-shell";
import { Refusal } from "@/components/refusal";
import { gateShellPage } from "@/app/operate/gate";
import {
  ATTENDING,
  ANSWER_ATTENDING,
  ANSWER_NONE,
  ANSWER_NOT_ATTENDING,
  CURRENT_ANSWER_LABEL,
  CURRENT_ANSWER_NOTE,
  DEADLINE_LABEL,
  DEADLINE_NOTE,
  INVITATION_LABEL,
  NOT_ATTENDING,
  PLAYER_LABEL,
  PRIVACY_NOTE,
  VENUE_LABEL,
  eventTypeLabel,
  formatDeadline,
  formatEventDate,
  formatEventTime,
} from "@/app/rsvp/[token]/presentation";
import { pickApprovedEvent, pickInvitationId } from "../picks";

/**
 * S5 — the player's RSVP invitation (UX-60), on the public shell. LAN-225.
 *
 * Read by invitation id through the operator tier — never by token, and no
 * token is rendered — for one seeded player on the next approved event. The
 * copy is `/rsvp/[token]`'s, unchanged. Yes keeps its emphasis (LAN-172).
 * The buttons are drawn, not wired.
 */
const TOUCH = 48;

export default async function RsvpPreviewPage() {
  const gate = await gateShellPage("/design-preview/rsvp");
  if ("screen" in gate) return gate.screen;

  const event = await pickApprovedEvent();
  const invitationId = event ? await pickInvitationId(event.id) : null;
  if (!invitationId) {
    return (
      <PublicShell caption="Your invitation" width="medium">
        <Refusal
          title="No invitation to show"
          message="The seed has no approved event with an invitation to a player."
          action={{ href: "/design-preview", label: "Back to the preview" }}
        />
      </PublicShell>
    );
  }

  const page = await withTransaction((tx) => readSignedRsvpPageIn(tx, invitationId));
  const date = formatEventDate(page.scheduledOn);
  const time = formatEventTime(page.startsAt, page.endsAt);
  const deadline = formatDeadline(page.responseDeadline);
  const answer =
    page.currentResponse === null
      ? ANSWER_NONE
      : page.currentResponse.response === "yes"
        ? ANSWER_ATTENDING
        : ANSWER_NOT_ATTENDING;

  return (
    <PublicShell caption="Your invitation" width="medium" testId="rsvp-preview">
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="overline" component="p" color="text.secondary">
            {eventTypeLabel(page.eventType)}
          </Typography>
          <Typography variant="h1" component="h1">
            {page.eventName}
          </Typography>
          {date ? (
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {time ? `${date} · ${time}` : date}
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {PRIVACY_NOTE}
          </Typography>
        </Stack>

        <FactGrid columns={2}>
          <Fact label={PLAYER_LABEL} value={page.playerName} note={INVITATION_LABEL} emphasis />
          {page.venue ? <Fact label={VENUE_LABEL} value={page.venue} emphasis /> : null}
          {deadline ? (
            <Fact label={DEADLINE_LABEL} value={deadline} note={DEADLINE_NOTE} emphasis />
          ) : null}
          <Fact label={CURRENT_ANSWER_LABEL} value={answer} note={CURRENT_ANSWER_NOTE} emphasis />
        </FactGrid>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button type="button" variant="contained" fullWidth sx={{ minHeight: TOUCH, flex: 1 }}>
            {ATTENDING}
          </Button>
          <Button type="button" variant="outlined" fullWidth sx={{ minHeight: TOUCH, flex: 1 }}>
            {NOT_ATTENDING}
          </Button>
        </Stack>
      </Stack>
    </PublicShell>
  );
}
