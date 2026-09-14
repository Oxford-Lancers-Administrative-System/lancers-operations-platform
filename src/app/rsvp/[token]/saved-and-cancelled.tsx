/**
 * UX-62 (saved) and UX-66 (a valid link to a cancelled event). Split from
 * `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";

import type { SignedRsvpPage } from "@/lib/services/rsvp";
import { SEE_ALL_YOUR_EVENTS } from "@/app/events/[token]/presentation";

import { openEventsPage } from "./actions";
import {
  CANCELLED_HEADING,
  CANCELLED_NOTE,
  CHANGE_RESPONSE,
  CLOSE,
  SAVED_HEADING,
  SAVED_NOTE,
  cancelledSentence,
  eventSummary,
  formatEventDateShort,
} from "./presentation";
import { currentAnswerLabel, MIN_TOUCH_TARGET, Shell } from "./rsvp-shell";

export function ResponseSaved({ page, token }: { page: SignedRsvpPage; token: string }) {
  const answer = currentAnswerLabel(page);
  const summary = eventSummary(page.eventName, page.scheduledOn, page.startsAt);

  return (
    <Shell>
      <PageHeader title={SAVED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
        {`${answer} · ${summary}`}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>{SAVED_NOTE}</Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
        <Button
          href={`/rsvp/${encodeURIComponent(token)}`}
          variant="contained"
          sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
        >
          {CHANGE_RESPONSE}
        </Button>
        {/* A plain link, not a script trying to close the tab — `window.close()` does nothing for a tab the script didn't open. */}
        <Button
          href={`/rsvp/${encodeURIComponent(token)}`}
          variant="text"
          sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
        >
          {CLOSE}
        </Button>
      </Stack>

      {/*
        LAN-343. Both controls above point back at this same page, so this was
        a closed loop with no way to the player's own events page — and no
        message the club sends carries one either. A form rather than an `<a>`:
        that page needs a durable credential, a credential's plaintext cannot
        be recovered, and this route's GET must keep writing nothing for the
        link-preview crawler that fetches it first. A recruit has no events
        page at all (`REQ-recruit-sees-public-only`), so they are not offered
        one.
      */}
      {page.capacity === "recruit" ? null : (
        <Box component="form" action={openEventsPage} sx={{ mt: 2 }}>
          <input type="hidden" name="token" value={token} />
          <Button
            type="submit"
            variant="text"
            sx={{ minHeight: MIN_TOUCH_TARGET, textTransform: "none" }}
          >
            {SEE_ALL_YOUR_EVENTS}
          </Button>
        </Box>
      )}
    </Shell>
  );
}

/**
 * The one terminal state that is not uniform. The invitation resolved: this
 * holder is a genuine invitee, so telling them it is off leaks nothing they
 * were not already told when invited. Shows the event and its date only —
 * no other player, no roster, no response history.
 */
export function CancelledEvent({ page }: { page: SignedRsvpPage }) {
  return (
    <Shell>
      <PageHeader title={CANCELLED_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        {cancelledSentence(page.eventName, formatEventDateShort(page.scheduledOn))}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>
        {CANCELLED_NOTE}
      </Typography>
    </Shell>
  );
}
