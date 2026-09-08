import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
  CLUB_LINK_NEEDS_AN_AUDIENCE_RULE,
  CLUB_LINK_UNCONFIGURED_MESSAGE,
  CLUB_LINK_UNCONFIGURED_RULE,
} from "@/lib/services/club-link";

import { CopyLinkButton } from "../../../participation/copy-link";
import {
  CLOSE,
  ISSUE_LINK,
  SHARE_CONSEQUENCE,
  SHARE_HEADLINE,
} from "../../../participation/presentation";
import { issueClubLinkAction } from "./club-link-actions";

/**
 * **Share this event** — W7-04.
 *
 * ## What is on it, and what is not
 *
 * The link, one sentence saying what a holder of it can and cannot do, and
 * **Copy link**. The approved mockup also carried a second paragraph — "It is a
 * private link, not a secret one — a squad list is not a secret from the squad"
 * — which is D81's reasoning rather than the control's consequence, and Brian
 * has rejected copy of that shape on this mission five times. The deviation is
 * recorded in the pull request.
 *
 * There is no **Revoke** and no expiry. Q2 is a nonblocking unknown the owner
 * chose to settle by testing; the link ships without revocation and adding it
 * later is additive.
 *
 * ## Why opening it may not have created anything
 *
 * Rendering a page must not write. When no link has been issued the panel
 * offers one button that issues it; until it is pressed, `club_link_tokens`
 * holds no row for this event.
 *
 * ## Refusals are content
 *
 * An unconfigured deployment and a draft event both render a sentence in this
 * panel rather than an error page — `docs/ux/standards.md` rule 6 — and the
 * button that would fail is not offered. The action refuses again on its own
 * behalf regardless: hiding a control is a courtesy, never the boundary.
 */
const REFUSAL_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  [CLUB_LINK_UNCONFIGURED_RULE]: CLUB_LINK_UNCONFIGURED_MESSAGE,
  [CLUB_LINK_NEEDS_AN_AUDIENCE_RULE]: CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
});

const REFUSED = "The link could not be created. Try again.";

export function SharePanel({
  eventId,
  url,
  blockedReason,
  errorRule,
  closeHref,
}: {
  eventId: string;
  /** The live link, or `null` when none has been issued yet. */
  url: string | null;
  /** Why the button is not offered at all, or `null`. */
  blockedReason: string | null;
  /** `shareError` from the query string, or `null`. */
  errorRule: string | null;
  closeHref: string;
}) {
  const error = errorRule === null ? null : (REFUSAL_MESSAGES[errorRule] ?? REFUSED);

  return (
    <Section title={SHARE_HEADLINE} description={SHARE_CONSEQUENCE} testId="share-panel">
      <Stack spacing={1.5}>
        {error ? (
          <Notice variant="refusal" testId="share-error">
            {error}
          </Notice>
        ) : null}

        {blockedReason ? (
          <Notice variant="refusal" testId="share-blocked">
            {blockedReason}
          </Notice>
        ) : url === null ? (
          <form action={issueClubLinkAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <Button type="submit" variant="contained" size="small" data-testid="issue-club-link">
              {ISSUE_LINK}
            </Button>
          </form>
        ) : (
          <>
            <Box
              component="code"
              data-testid="club-link-url"
              sx={{
                display: "block",
                p: 1.5,
                borderRadius: 1,
                bgcolor: "action.hover",
                overflowWrap: "anywhere",
                fontSize: "0.875rem",
              }}
            >
              {url}
            </Box>
            <Box>
              <CopyLinkButton url={url} />
            </Box>
          </>
        )}

        <Box>
          <Button size="small" href={closeHref} data-testid="share-close">
            {CLOSE}
          </Button>
        </Box>
      </Stack>
    </Section>
  );
}
