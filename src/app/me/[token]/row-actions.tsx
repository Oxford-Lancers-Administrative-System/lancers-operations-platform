/**
 * The per-row action controls — inline Yes/No, the change buttons, the open
 * link — and the one function that picks among them per row. Split from
 * `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

import { needsFollowUp, type PlayerHomeInvitation } from "@/lib/services/player-home";

import { changeToYes, submitNo } from "./actions";
import {
  ADD_REASON,
  ANSWER_NO,
  ANSWER_QUESTIONS,
  ANSWER_YES,
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  EDIT_REASON,
} from "./presentation";

/**
 * Inline, one-tap Yes/No — the approved row control (`W2.html:956`
 * `mini-actions`), not a navigation button. A player's own No stands from
 * this click with the honest default: `defaultOk` tells `submitNo` there is
 * no text field on this row to demand a reason from — Q-22, REQ-no-reason-given.
 */
export function MiniYesNo({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Stack direction="row" spacing={1}>
      <Box component="form" action={changeToYes} sx={{ flex: 1 }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invitationId" value={invitationId} />
        <Button type="submit" variant="contained" color="primary" fullWidth sx={{ minHeight: 40 }}>
          {ANSWER_YES}
        </Button>
      </Box>
      <Box component="form" action={submitNo} sx={{ flex: 1 }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="defaultOk" value="1" />
        <Button type="submit" variant="outlined" color="inherit" fullWidth sx={{ minHeight: 40 }}>
          {ANSWER_NO}
        </Button>
      </Box>
    </Stack>
  );
}

function ChangeToNoButton({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Box component="form" action={submitNo} sx={{ flex: 1, minWidth: 0 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="defaultOk" value="1" />
      <Button type="submit" variant="outlined" color="inherit" fullWidth sx={{ minHeight: 40 }}>
        {CHANGE_TO_NO}
      </Button>
    </Box>
  );
}

function ChangeToYesButton({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Box component="form" action={changeToYes} sx={{ flex: 1, minWidth: 0 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {/*
        Owner correction round 6 (OWNER-LAN172-19), reversing round 5's own
        OWNER-LAN172-16 finding for this button: Brian's "one interaction"
        model treats a change of answer exactly like a first answer — it
        records immediately and opens *that* answer's own follow-up, never
        closing the panel by itself. Sending `close=1` here is what let this
        button record a Yes and then hide the very questions it had just made
        outstanding again, with no visible way back to them but the row's own
        separate "Answer questions" button. Only Save (the reason form, the
        questions form) ever closes the panel now.
      */}
      <Button type="submit" variant="contained" color="primary" fullWidth sx={{ minHeight: 40 }}>
        {CHANGE_TO_YES}
      </Button>
    </Box>
  );
}

function OpenLink({
  token,
  invitationId,
  label,
  emphasis,
}: {
  token: string;
  invitationId: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <Button
      href={`/me/${encodeURIComponent(token)}?open=${encodeURIComponent(invitationId)}`}
      variant={emphasis ? "contained" : "outlined"}
      color={emphasis ? "primary" : "inherit"}
      fullWidth
      sx={{ minHeight: 40, flex: 1, minWidth: 0 }}
    >
      {label}
    </Button>
  );
}

/** Two direct actions per row (standards rule — never a bare navigation button doing the work of two taps). */
export function RowActions({ token, entry }: { token: string; entry: PlayerHomeInvitation }) {
  if (entry.standingAnswer === null) {
    return <MiniYesNo token={token} invitationId={entry.invitationId} />;
  }
  if (needsFollowUp(entry)) {
    if (entry.standingAnswer === "no" && entry.reasonIsDefault) {
      return (
        <Stack direction="row" spacing={1}>
          <ChangeToYesButton token={token} invitationId={entry.invitationId} />
          <OpenLink token={token} invitationId={entry.invitationId} label={ADD_REASON} />
        </Stack>
      );
    }
    return (
      <Stack direction="row" spacing={1}>
        <OpenLink
          token={token}
          invitationId={entry.invitationId}
          label={ANSWER_QUESTIONS}
          emphasis
        />
        <ChangeToNoButton token={token} invitationId={entry.invitationId} />
      </Stack>
    );
  }
  if (entry.standingAnswer === "yes") {
    return <ChangeToNoButton token={token} invitationId={entry.invitationId} />;
  }
  return (
    <Stack direction="row" spacing={1}>
      <ChangeToYesButton token={token} invitationId={entry.invitationId} />
      <OpenLink token={token} invitationId={entry.invitationId} label={EDIT_REASON} />
    </Stack>
  );
}
