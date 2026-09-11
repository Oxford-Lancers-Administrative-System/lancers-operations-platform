"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import Stack from "@mui/material/Stack";
import { useOutcomeSlot } from "@/components/outcome-slot";
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
  // F-206-01: an outstanding request already has a queued job — never reported as "Already answered.".
  outstanding: "Queued — awaiting dispatch.",
});

/**
 * `W2`'s SEND / RESEND button — one per questionnaire. `W2-04` (Brian,
 * 2026-08-31): never natively `disabled` for unconsented/ineligible — the
 * dialog refuses in words instead. Exception: `declined` (`blockedByDecline`)
 * already has its own top-of-record banner, so is disabled here (walk W-1).
 * Decision history: missions/intake/M-RECRUITMENT
 */
export default function SendQuestionnaireButton({
  prospectId,
  track,
  displayName,
  lastSentAt,
  canSend,
  disabledReason,
  blockedByDecline = false,
}: {
  prospectId: string;
  track: RecruitmentQuestionnaireTrack;
  displayName: string;
  lastSentAt: string | null;
  canSend: boolean;
  disabledReason: string | null;
  blockedByDecline?: boolean;
}) {
  const slot = useOutcomeSlot(`send-${track}`);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    error: string | null;
    created: readonly string[];
    reason: string | null;
    delivery?: "accepted" | "refused" | "skipped";
  } | null>(null);

  function confirm() {
    slot.claim();
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
        disabled={blockedByDecline}
        title={blockedByDecline && disabledReason ? disabledReason : undefined}
        onClick={() => {
          slot.claim();
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
          <Stack spacing={2}>
            <DialogContentText>
              {lastSentAt
                ? `Last sent to ${displayName} on ${formatWhen(new Date(lastSentAt))}.`
                : `Not yet sent to ${displayName}.`}
            </DialogContentText>
            {!canSend && disabledReason ? (
              <Notice variant="refusal" testId={`recruitment-send-${track}-refused`}>
                {disabledReason}
              </Notice>
            ) : null}
            {slot.showing && result?.error ? (
              <Notice severity="error">{result.error}</Notice>
            ) : null}
            {slot.showing && result && !result.error && result.delivery ? (
              <Notice
                severity={result.delivery === "accepted" ? "success" : "warning"}
                testId={`recruitment-send-${track}-delivery`}
              >
                {result.delivery === "accepted"
                  ? "Sent."
                  : result.delivery === "refused"
                    ? "Not sent — delivery could not be completed."
                    : "Not sent — delivery is already in progress or this questionnaire is no longer eligible."}
              </Notice>
            ) : null}
            {slot.showing &&
            result &&
            !result.error &&
            !result.delivery &&
            result.created.length === 0 ? (
              <Notice severity="info" testId={`recruitment-send-${track}-no-op`}>
                {result.reason ? REASON_LABEL[result.reason] : "Nothing new was sent."}
              </Notice>
            ) : null}
            {slot.showing &&
            result &&
            !result.error &&
            !result.delivery &&
            result.created.length > 0 ? (
              <Notice severity="success" testId={`recruitment-send-${track}-ok`}>
                Queued.
              </Notice>
            ) : null}
          </Stack>
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
