"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { Section } from "@/components/section";
import { Notice } from "@/components/notice";
import { Field } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { cancellationSilenceNeedsConfirmation } from "@/lib/services/event-amendment-rules";
import { cancelEventAction } from "../change-actions";
import { EMPTY_CANCEL_STATE } from "../change-state";
import {
  CANCEL_IRREVERSIBLE,
  CANCEL_KEEP_LABEL,
  CANCEL_REASON_HELP,
  CANCEL_REASON_LABEL,
  CANCEL_SILENCE_HEADLINE,
  CANCEL_TELL_EVERYONE_LABEL,
  cancelConfirmLabel,
  cancelHeadline,
  cancelSilenceConsequence,
  everyoneWillBeTold,
  expectingToBeThere,
  nobodyWillBeTold,
  cancelNotifyDefaultDetail,
  SILENCE_CANCEL_PROCEED_LABEL,
  SILENCE_TELL_THEM_LABEL,
} from "../change-presentation";

/**
 * W6 — the most consequential single click in the mission.
 *
 * It is irreversible, it messages the whole audience by default, and one person
 * can do it alone at seven in the morning while looking at a waterlogged pitch.
 * That is deliberate — a flooded pitch does not wait for a quorum — so the
 * confirmation carries the weight instead, and the weight is carried by leading
 * with the number of people expecting to be there rather than with the event's
 * name.
 *
 * ## The tick, and the screen behind it
 *
 * The default follows the event's date, not the operator's habit: on for a
 * future event, off for a past one, because the silent path exists for tidying
 * up a session weeks gone that was never held. Turning it off on a **future**
 * event opens the confirmation, which names the people affected — the same rule
 * `W5` uses, for the same reason.
 *
 * `silenceConfirmed` is a hidden field rather than a decision this component
 * keeps to itself, because the service checks it too: a browser can post
 * straight to the action, and the acceptance evidence is about what cannot be
 * done rather than about what the screen offers.
 */
export default function CancelForm({
  eventId,
  typeLabel,
  invited,
  saidYes,
  venue,
  isFuture,
}: {
  eventId: string;
  typeLabel: string;
  invited: number;
  saidYes: number;
  venue: string | null;
  isFuture: boolean;
}) {
  const [state, formAction, pending] = useActionState(cancelEventAction, EMPTY_CANCEL_STATE);

  // D58 and D31 together, applied where the operator first sees it.
  const [notify, setNotify] = useState(isFuture);
  const [silenceConfirmed, setSilenceConfirmed] = useState(false);
  const [asking, setAsking] = useState(false);

  function moveTheTick(next: boolean) {
    if (!next && cancellationSilenceNeedsConfirmation({ isFuture })) {
      setNotify(false);
      setAsking(true);
      return;
    }
    setNotify(next);
    setSilenceConfirmed(false);
  }

  return (
    <Box component="form" action={formAction} data-testid="cancel-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        type="hidden"
        name="silenceConfirmed"
        value={silenceConfirmed ? "true" : "false"}
        data-testid="cancel-silence-confirmed"
      />

      <Stack spacing={3}>
        {state.error ? (
          <Notice severity="error" testId="cancel-error">
            {state.error}
          </Notice>
        ) : null}

        <Section title={cancelHeadline(typeLabel)} testId="cancel-headline">
          <Stack spacing={3}>
            <Typography variant="h5" component="p" sx={{ fontWeight: 700 }} data-testid="expecting">
              {expectingToBeThere(saidYes)}
            </Typography>

            <Typography variant="body2" color="text.secondary" data-testid="who-is-told">
              {notify ? everyoneWillBeTold(invited) : nobodyWillBeTold(invited)}
            </Typography>

            <Field
              name="reason"
              label={CANCEL_REASON_LABEL}
              defaultValue={state.reason}
              helperText={CANCEL_REASON_HELP}
              multiline
              minRows={2}
              required
              data-testid="cancel-reason"
            />

            <Box>
              <Box data-testid="cancel-notify-tick">
                <FormControlLabel
                  control={
                    <Switch
                      name="notify"
                      checked={notify}
                      onChange={(event) => moveTheTick(event.target.checked)}
                    />
                  }
                  label={CANCEL_TELL_EVERYONE_LABEL}
                />
              </Box>
              {/*
                Only where moving the tick will stop and ask. A past event has
                nothing to warn about, so it says nothing rather than
                explaining why the tick starts where it does.
              */}
              {cancelNotifyDefaultDetail(isFuture) ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid="cancel-notify-default"
                >
                  {cancelNotifyDefaultDetail(isFuture)}
                </Typography>
              ) : null}
            </Box>

            <Notice severity="warning" testId="cancel-irreversible">
              {CANCEL_IRREVERSIBLE}
            </Notice>

            <ActionBar
              primary={
                <Button
                  type="submit"
                  variant="contained"
                  color="error"
                  disabled={pending || asking}
                  sx={{ minHeight: 44 }}
                  data-testid="confirm-cancel"
                >
                  {pending ? "Cancelling…" : cancelConfirmLabel(typeLabel)}
                </Button>
              }
              secondary={
                <Button
                  variant="outlined"
                  href={`/operate/events/${eventId}`}
                  disabled={pending}
                  sx={{ minHeight: 44 }}
                  data-testid="keep-event"
                >
                  {CANCEL_KEEP_LABEL}
                </Button>
              }
              note={asking ? "Confirm whether to tell the audience before cancelling." : undefined}
            />
          </Stack>
        </Section>

        {asking ? (
          <Section title={CANCEL_SILENCE_HEADLINE} testId="cancel-silence-step">
            <Stack spacing={2}>
              <Notice severity="warning" testId="cancel-silence-consequence">
                {cancelSilenceConsequence(saidYes, venue)}
              </Notice>
              <ActionBar
                primary={
                  <Button
                    type="button"
                    variant="contained"
                    onClick={() => {
                      setNotify(true);
                      setSilenceConfirmed(false);
                      setAsking(false);
                    }}
                    sx={{ minHeight: 44 }}
                    data-testid="cancel-silence-notify-instead"
                  >
                    {SILENCE_TELL_THEM_LABEL}
                  </Button>
                }
                secondary={
                  <Button
                    type="button"
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      setSilenceConfirmed(true);
                      setAsking(false);
                    }}
                    sx={{ minHeight: 44 }}
                    data-testid="cancel-silence-accept"
                  >
                    {SILENCE_CANCEL_PROCEED_LABEL}
                  </Button>
                }
              />
            </Stack>
          </Section>
        ) : null}
      </Stack>
    </Box>
  );
}
