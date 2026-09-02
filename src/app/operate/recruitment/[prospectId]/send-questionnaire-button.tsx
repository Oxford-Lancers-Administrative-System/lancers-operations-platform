"use client";

import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { RecruitmentQuestionnaireTrack } from "@/lib/services/recruitment-prospect";
import { sendRecruitmentQuestionnaireAction } from "./actions";

const TRACK_LABEL: Record<RecruitmentQuestionnaireTrack, string> = {
  personal: "PERSONAL QUESTIONNAIRE",
  recruitment: "RECRUITMENT QUESTIONNAIRE",
};

/**
 * `W2`'s SEND / RESEND button — one per questionnaire. The dialog names when
 * it was last sent (`lastSentAt`) rather than assuming, because the point is
 * not bothering someone twice.
 */
export default function SendQuestionnaireButton({
  prospectId,
  track,
  displayName,
  lastSentAt,
  disabled,
  disabledReason,
}: {
  prospectId: string;
  track: RecruitmentQuestionnaireTrack;
  displayName: string;
  lastSentAt: string | null;
  disabled: boolean;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error: string | null; created: readonly string[] } | null>(
    null,
  );

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
        disabled={disabled}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        sx={{ minHeight: 44 }}
        data-testid={`recruitment-send-${track}`}
      >
        {lastSentAt ? `RESEND ${TRACK_LABEL[track]}` : `SEND ${TRACK_LABEL[track]}`}
      </Button>
      {disabled && disabledReason ? (
        <Typography variant="caption" color="text.secondary" component="p">
          {disabledReason}
        </Typography>
      ) : null}

      <Dialog open={open} onClose={() => (pending ? undefined : setOpen(false))}>
        <DialogTitle>{TRACK_LABEL[track]}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {lastSentAt
              ? `Last sent to ${displayName} on ${new Date(lastSentAt).toLocaleDateString()}.`
              : `Not yet sent to ${displayName}.`}
          </DialogContentText>
          {result?.error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {result.error}
            </Alert>
          ) : null}
          {result && !result.error && result.created.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }} data-testid={`recruitment-send-${track}-no-op`}>
              Nothing new was sent.
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
