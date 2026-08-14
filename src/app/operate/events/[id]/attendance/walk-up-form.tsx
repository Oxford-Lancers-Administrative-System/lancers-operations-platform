"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ATTENDANCE_PRESENCES, type WalkUpCandidate } from "@/lib/services/attendance-vocabulary";
import { recordWalkUpAction } from "./actions";
import { EMPTY_WALK_UP_STATE } from "./action-state";
import {
  PRESENCE_LABELS,
  WALK_UP_CONTACT_LABEL,
  WALK_UP_DEFERRED_WORKFLOW,
  WALK_UP_DETAIL,
  WALK_UP_HEADLINE,
  WALK_UP_MATCH_HELP,
  WALK_UP_MATCH_LABEL,
  WALK_UP_MATCH_NONE,
  WALK_UP_NAME_LABEL,
  WALK_UP_PRESENCE_LABEL,
  WALK_UP_RECONCILIATION_NOTE,
  WALK_UP_SUBMIT,
} from "./presentation";

/**
 * UX-73 — the whole of what the club asks a walk-up for. LAN-80.
 *
 * Four fields, three of which are optional, because Brian's 12 August 2026
 * decision fixes the shape: capture the minimum identity needed to tell this
 * person apart, record the attendance now, flag it for later reconciliation,
 * and do not launch the recruitment or onboarding workflow on the field. A form
 * that asked for a date of birth, an emergency contact and a subscription
 * status would be the thing that decision exists to prevent — and the person is
 * standing on a pitch in October waiting to be told where to go.
 *
 * **Possible roster match** is the one field that is not about identity. It is
 * there so that a player who simply never got an invitation is recorded against
 * their own membership rather than as a second person with the same name, which
 * is a merge somebody would have to do by hand later. Choosing one creates no
 * invitation: they genuinely were not asked, and pretending otherwise would
 * falsify the mismatch the Monday report is supposed to surface.
 *
 * The reconciliation note is not decoration. The approved criterion is that the
 * record "cannot be mistaken for a completed membership", so the screen says so
 * before the operator commits, and the row it creates carries the flag
 * afterwards.
 */
export function WalkUpForm({
  eventId,
  candidates,
}: {
  eventId: string;
  candidates: WalkUpCandidate[];
}) {
  const [state, formAction, pending] = useActionState(recordWalkUpAction, EMPTY_WALK_UP_STATE);
  const values = state.values;

  return (
    <Box component="form" action={formAction} data-testid="walk-up-form" sx={{ maxWidth: 560 }}>
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {WALK_UP_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {WALK_UP_DETAIL}
          </Typography>
        </Box>

        <Alert severity="warning" data-testid="walk-up-reconciliation-note">
          <Typography variant="body2">{WALK_UP_RECONCILIATION_NOTE}</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {WALK_UP_DEFERRED_WORKFLOW}
          </Typography>
        </Alert>

        {state.error ? (
          <Alert severity="error" data-testid="walk-up-error">
            {state.error}
          </Alert>
        ) : null}

        <TextField
          label={WALK_UP_NAME_LABEL}
          name="name"
          defaultValue={values?.name ?? ""}
          required
          fullWidth
          autoFocus
          helperText="Whatever they gave you. A first name on its own is enough."
        />

        <TextField
          label={WALK_UP_CONTACT_LABEL}
          name="contact"
          defaultValue={values?.contact ?? ""}
          fullWidth
          helperText="Optional. Stored exactly as it was given."
        />

        <TextField
          label={WALK_UP_PRESENCE_LABEL}
          name="presence"
          select
          defaultValue={values?.presence || "present"}
          fullWidth
        >
          {ATTENDANCE_PRESENCES.map((presence) => (
            <MenuItem key={presence} value={presence}>
              {PRESENCE_LABELS[presence]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label={WALK_UP_MATCH_LABEL}
          name="membershipId"
          select
          defaultValue={values?.membershipId ?? ""}
          fullWidth
          helperText={WALK_UP_MATCH_HELP}
        >
          <MenuItem value="">{WALK_UP_MATCH_NONE}</MenuItem>
          {candidates.map((candidate) => (
            <MenuItem key={candidate.membershipId} value={candidate.membershipId}>
              {candidate.displayName}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {pending ? "Adding…" : WALK_UP_SUBMIT}
          </Button>
          <Button
            variant="outlined"
            href={`/operate/events/${eventId}/attendance`}
            disabled={pending}
            sx={{ minHeight: 44 }}
          >
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
