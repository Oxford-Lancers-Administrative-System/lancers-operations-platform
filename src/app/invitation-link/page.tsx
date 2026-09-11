import type { Metadata } from "next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Notice } from "@/components/notice";
import AuthShell from "../auth-shell";
import { INVALID_INVITATION_LINK_MESSAGE } from "@/lib/auth/invitation";

/**
 * `/invitation-link` — LAN-311. Where `/auth/invitation` sends a browser whose
 * token did not exchange.
 *
 * It asks nothing and reads nothing: no session, no query string, no database.
 * Every way an invitation link can fail — expired, already used, the wrong link
 * type, a mangled token, no token at all — arrives here and reads one sentence,
 * so the screen tells an unauthenticated visitor nothing about any account.
 * That is the property `/auth/recovery` established and this keeps.
 *
 * What it does *not* do is send them to `/forgot-password`. That is the whole
 * point of the screen existing. An invited operator has no password to reset,
 * so the recovery journey's "Request a new link" is a loop with no exit — the
 * one Clint reported as "REQUESTING LINK GIVES SAME ERROR". The remedy that
 * works is held by the club: an administrator reissues the invitation from the
 * operator's record, which `ResendButton` already does.
 *
 * The sign-in link is offered second and claims nothing. Somebody who turns out
 * to have an account already — the case LAN-309 decision 12 records — needs that
 * door and no other, and offering it discloses nothing, because it is on every
 * public page of this application anyway.
 */
export const metadata: Metadata = {
  title: "Invitation link — Lancers Operations",
  robots: { index: false, follow: false },
};

export default function InvitationLinkPage() {
  return (
    <AuthShell heading="This invitation link cannot be used">
      <Stack spacing={3}>
        <Notice severity="warning" testId="invitation-link-unusable">
          {INVALID_INVITATION_LINK_MESSAGE}
        </Notice>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button href="/login" variant="contained" sx={{ minHeight: 44 }}>
            Go to sign in
          </Button>
        </Stack>
      </Stack>
    </AuthShell>
  );
}
