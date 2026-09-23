import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
  CLUB_LINK_NEEDS_AN_AUDIENCE_RULE,
  CLUB_LINK_UNCONFIGURED_MESSAGE,
  CLUB_LINK_UNCONFIGURED_RULE,
} from "@/lib/services/club-link";

import { CopyLinkButton } from "../../../participation/copy-link";
import {
  CLOSE,
  CLUB_LINK_EXPIRY_LABEL,
  ISSUE_LINK,
  SHARE_CONSEQUENCE,
  SHARE_HEADLINE,
} from "../../../participation/presentation";
import { issueClubLinkAction } from "./club-link-actions";
import { ShareMessageButton } from "./share-message-button";

/** **Event info link** — W7-04 (renamed by LAN-417). Link, one sentence, **Copy link** — no more (Brian rejected extra copy repeatedly). Issuing writes nothing until pressed. */
const REFUSAL_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  [CLUB_LINK_UNCONFIGURED_RULE]: CLUB_LINK_UNCONFIGURED_MESSAGE,
  [CLUB_LINK_NEEDS_AN_AUDIENCE_RULE]: CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE,
});

const REFUSED = "The link could not be created. Try again.";

export function SharePanel({
  eventId,
  url,
  message,
  blockedReason,
  errorRule,
  closeHref,
}: {
  eventId: string;
  /** The live link, or `null` when none has been issued yet. */
  url: string | null;
  /**
   * The six lines an operator pastes into a group chat — LAN-410. Rendered on
   * the server from the same read the button used to make, so the counts still
   * match the event page's own headline. `null` where there is no link yet,
   * which is the same branch that hides the button.
   */
  message: string | null;
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
            {/* LAN-354: a label, so the operator posting this into a group chat knows how long it lasts. */}
            <Typography variant="caption" color="text.secondary" data-testid="club-link-expiry">
              {CLUB_LINK_EXPIRY_LABEL}
            </Typography>
            {/* LAN-410: the six lines are on the page, in the box idiom the
                link above already uses. Stewart's Safari refused a clipboard
                write that followed an awaited server action; the text being
                here is both what makes the copy synchronous and what makes the
                message reachable by hand in any browser. */}
            {message === null ? null : (
              <Box
                component="pre"
                data-testid="share-message-text"
                sx={{
                  display: "block",
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {message}
              </Box>
            )}
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <CopyLinkButton url={url} />
              {/* LAN-384: the same link, wrapped in the six lines an operator
                  would otherwise retype into the group chat. */}
              {message === null ? null : <ShareMessageButton message={message} />}
            </Stack>
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
