"use client";

import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { formatWhen } from "../../roster/presentation";
import { sendRecruitmentQuestionnaireAction } from "./actions";
import type { RecruitmentQuestionnaireTrack } from "@/lib/services/recruitment-prospect";

const TRACK_LABEL: Record<RecruitmentQuestionnaireTrack, string> = {
  personal: "PERSONAL QUESTIONNAIRE",
  recruitment: "RECRUITMENT QUESTIONNAIRE",
};

const REASON_LABEL: Readonly<Record<string, string>> = Object.freeze({
  not_consented: "Messaging consent has not been granted for this season.",
  not_eligible: "The club will not message a recruit at this status.",
  already_complete: "Already answered.",
});

/**
 * `W2`'s SEND / RESEND button — one per questionnaire.
 *
 * `W2-04` (Brian, 2026-08-31 — "the pop-up... should be the answer at the
 * moment of action") is why this button is never natively `disabled`: a
 * disabled HTML button fires no `onClick` at all, so a control that cannot
 * be pressed cannot open a dialog either — correction round 1's
 * F-LAN204-005. The button always opens the dialog; the dialog is what
 * refuses, in words, and it refuses at the moment of action whether the
 * service layer would have refused anyway (an unconsented or ineligible
 * recruit) or the operator confirms a real send.
 */
export default function SendQuestionnaireButton({
  prospectId,
  track,
  displayName,
  lastSentAt,
  canSend,
  disabledReason,
}: {
  prospectId: string;
  track: RecruitmentQuestionnaireTrack;
  displayName: string;
  lastSentAt: string | null;
  canSend: boolean;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    error: string | null;
    created: readonly string[];
    reason: string | null;
  } | null>(null);

  function confirm() {
    startTransition(async () => {
      const outcome = await sendRecruitmentQuestionnaireAction({ prospectId, track });
      setResult(outcome);
    });
  }

  return (
    <>
      <Button
        variant="contained"
        size="small"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        sx={{ minHeight: 44 }}
        data-testid={`recruitment-send-${track}`}
      >
        {lastSentAt ? `RESEND ${TRACK_LABEL[track]}` : `SEND ${TRACK_LABEL[track]}`}
      </Button>

      <Dialog open={open} onClose={() => (pending ? undefined : setOpen(false))}>
        <DialogTitle>{TRACK_LABEL[track]}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {lastSentAt
              ? `Last sent to ${displayName} on ${formatWhen(new Date(lastSentAt))}.`
              : `Not yet sent to ${displayName}.`}
          </DialogContentText>
          {!canSend && disabledReason ? (
            <Alert
              severity="warning"
              sx={{ mt: 2 }}
              data-testid={`recruitment-send-${track}-refused`}
            >
              {disabledReason}
            </Alert>
          ) : null}
          {result?.error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {result.error}
            </Alert>
          ) : null}
          {result && !result.error && result.created.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }} data-testid={`recruitment-send-${track}-no-op`}>
              {result.reason ? REASON_LABEL[result.reason] : "Nothing new was sent."}
            </Alert>
          ) : null}
          {result && !result.error && result.created.length > 0 ? (
            <Alert severity="success" sx={{ mt: 2 }} data-testid={`recruitment-send-${track}-ok`}>
              Queued.
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={pending}
            onClick={confirm}
            sx={{ minHeight: 44 }}
            data-testid={`recruitment-send-${track}-confirm`}
          >
            {lastSentAt ? "Resend" : "Send"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
