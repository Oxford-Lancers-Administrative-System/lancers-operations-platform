"use client";

import { useState, useTransition } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { Field, SelectField } from "@/components/field";
import { Notice } from "@/components/notice";

import {
  CONSENT_WITHDRAWAL_REASONS,
  type ConsentWithdrawalReason,
} from "@/lib/services/recruitment-vocabulary";

import { recordConsentAction, stopMessagesAction } from "./actions";

/**
 * **Stop messages** and **Record consent** — LAN-371.
 *
 * A recruit who wants out and cannot make it happen may complain to WhatsApp,
 * which risks the club's sending account. Meta classified a text-based "press
 * X to stop" as marketing, so the mechanism is an operator action. The reason
 * is required, because a withdrawal an operator performed on somebody's behalf
 * with no reason is a decision nobody can review later; the audit row records
 * the operator and the reason and never the recruit's contact details.
 *
 * Withdrawal cancels every queued message for this person this season, rather
 * than leaving them to be refused one at a time at send time.
 */
export const STOP_MESSAGES = "Stop messages";
export const RECORD_CONSENT = "Record consent";
const REASON_LABEL = "Why";
const NOTE_LABEL = "In your own words";
const GRANT_NOTE_LABEL = "How consent was given";

export default function ConsentControl({
  prospectId,
  displayName,
  granted,
}: {
  prospectId: string;
  displayName: string;
  /** Whether this person's consent stands granted for the current season. */
  granted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState<ConsentWithdrawalReason>("asked_in_person");
  const [note, setNote] = useState("");

  const label = granted ? STOP_MESSAGES : RECORD_CONSENT;

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    setNote("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const outcome = granted
        ? await stopMessagesAction({ prospectId, listedReason: listed, note })
        : await recordConsentAction({ prospectId, note });
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setOpen(false);
      setNote("");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        size="small"
        onClick={() => setOpen(true)}
        data-testid="consent-control-open"
        sx={{ minHeight: 44 }}
      >
        {label}
      </Button>

      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>{`${label} for ${displayName}`}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error ? (
              <Notice severity="error" testId="consent-control-error">
                {error}
              </Notice>
            ) : null}

            {granted ? (
              <>
                <SelectField
                  name="listedReason"
                  label={REASON_LABEL}
                  value={listed}
                  onChange={(event) => setListed(event.target.value as ConsentWithdrawalReason)}
                  disabled={pending}
                  options={Object.entries(CONSENT_WITHDRAWAL_REASONS).map(([value, text]) => ({
                    value,
                    label: text,
                  }))}
                />
                <Field
                  name="note"
                  label={NOTE_LABEL}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={pending}
                  multiline
                  minRows={2}
                  required={listed === "other"}
                />
              </>
            ) : (
              <Field
                name="note"
                label={GRANT_NOTE_LABEL}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={pending}
                multiline
                minRows={2}
                required
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submit}
            disabled={pending}
            data-testid="consent-control-submit"
          >
            {label}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
