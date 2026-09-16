/**
 * The per-link throttle, said out loud — LAN-376.
 *
 * Until now a throttled request to this route rendered the same terminal
 * "this RSVP link can't be used" page an unknown, expired or revoked token
 * produces. Brian and a player reproduced what that costs: six answer changes
 * inside a minute is about twenty requests, the twenty-first is refused, and
 * from then on every load — including a hard refresh — tells the player their
 * link is dead. It is not; it is busy, and it works again a minute later.
 *
 * ## Why saying so is safe here, and only here
 *
 * The uniform terminal response exists so that a caller guessing tokens cannot
 * learn which of unknown/expired/revoked they hit. A guesser presents a
 * *different* token every time, so they never fill the per-link bucket — it is
 * keyed on the token. They meet the per-address bucket instead, and that one
 * still produces the uniform terminal page, unchanged. Filling the per-link
 * bucket means holding one real token and using it twenty times in a minute,
 * which tells the holder nothing they did not already have.
 */
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";

import { BUSY_HEADING, BUSY_NOTE, TRY_AGAIN } from "./presentation";
import { MIN_TOUCH_TARGET, Shell } from "./rsvp-shell";

export function LinkBusy({ token }: { token: string }) {
  return (
    <Shell>
      <PageHeader title={BUSY_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>{BUSY_NOTE}</Typography>
      {/* A plain link back to the same page: the next minute's allowance is fresh. */}
      <Button
        href={`/rsvp/${encodeURIComponent(token)}`}
        variant="contained"
        sx={{ minHeight: MIN_TOUCH_TARGET, mt: 3, alignSelf: "flex-start" }}
      >
        {TRY_AGAIN}
      </Button>
    </Shell>
  );
}
