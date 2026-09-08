import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  CLOSE,
  CLUB_CONTACT_EMAIL,
  CONTACT_THE_CLUB,
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "./presentation";

/**
 * UX-63, UX-64 and UX-65 — one response for every unusable link. LAN-79.
 *
 * ## Why these three screens are one file
 *
 * Brian's owner decision of 12 August 2026 requires that an unknown link, an
 * expired one, a revoked one and a link to an event that has already started be
 * *publicly indistinguishable*: identical copy, presentation, actions, `404 Not
 * Found` status, response body, headers and timing class.
 *
 * The safest way to make three things identical is to have only one of them.
 * `page.tsx` calls `notFound()` for every one of those states, Next renders
 * this file at `404`, and there is consequently no code path on which they
 * could diverge — not through a stray conditional, not through a prop, and not
 * through a later edit that only remembers two of the three. The states stay
 * distinct where the decision says they should: in the resolver, in secure
 * logs, in tests and in operational diagnostics.
 *
 * ## What is deliberately absent
 *
 * No event, no date, no player, no invitation, no expiry time, no token
 * history, and no hint about which of the four situations applies. The privacy
 * note says as much out loud, so that a player who is simply late is not left
 * thinking the page is broken.
 *
 * ## What this file must not gain
 *
 * A prop, a search parameter, a variant, or any branch at all. Every one of
 * those is a way for the four states to become three responses, and the whole
 * point of routing them here is that they cannot.
 */
export default function RsvpLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={TERMINAL_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {TERMINAL_BODY}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
        {TERMINAL_PRIVACY_NOTE}
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
        {/*
              Contact the club — only when there is somewhere for it to go.

              The first version shipped a `mailto:` to an address invented here,
              behind an environment variable declared nowhere, falling back to a
              reserved `.example` domain that can never receive mail. It looked
              like an action and was one of the two the owner decision approves,
              and it did nothing: a player would tap it, their mail client would
              open, and the message would go nowhere.
              `NEXT_PUBLIC_*` is also inlined at build time, so it could not
              have been set on a running revision anyway.

              Brian deferred the club's contact address on 14 August 2026. Until
              it exists, this renders no button rather than a broken one — the
              body copy already tells the holder to request a new link from the
              club, so nothing is lost but the affordance. Supplying the address
              is a one-value change; it is named in the pull request's Production
              handoff as the owner action it is.
            */}
        {CLUB_CONTACT_EMAIL ? (
          <Button
            href={`mailto:${CLUB_CONTACT_EMAIL}`}
            variant="contained"
            sx={{ minHeight: 48, flex: 1 }}
          >
            {CONTACT_THE_CLUB}
          </Button>
        ) : null}
        {/*
              Close goes nowhere on purpose.

              It used to link to `/`, which is the scaffold landing page and
              carries a **Sign in** button — putting a stranger holding a dead
              link one tap from an operator sign-in prompt, which is exactly
              what this ticket says the page must not do. There is no other
              destination in the application that a player has any business
              reaching, and `window.close()` does nothing for a tab the script
              did not open, so a button that appeared to close and then did not
              would be worse. It acknowledges the end of the journey and stays
              put.
            */}
        <Button component="span" variant="text" sx={{ minHeight: 48, flex: 1 }}>
          {CLOSE}
        </Button>
      </Stack>
    </PublicShell>
  );
}
