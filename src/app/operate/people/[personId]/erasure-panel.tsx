"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { ROLE_LABELS } from "@/lib/auth/capabilities";
import type { ErasureState } from "@/lib/services/person-erasure";

import {
  confirmErasureAction,
  exportPersonAction,
  withdrawErasureConfirmationAction,
} from "./erasure-actions";

/**
 * Anonymising a person, and exporting what is held about them — LAN-361.
 *
 * At the bottom of the person record, and offered to the core four alone. The
 * dialog states what the act is and that it cannot be undone, shows who has
 * confirmed and who is still needed, and does nothing at all until two people
 * have confirmed. The request date is typed, not assumed: the club has one
 * month from the day the person asked, not from the day an operator got round
 * to it.
 */

const HEADING = "Data protection";
const ERASE_LABEL = "Anonymise this person";
const EXPORT_LABEL = "Export everything held about this person";
const DIALOG_TITLE = "Anonymise this person";
const IRREVERSIBLE =
  "This anonymises the person. Their name, contact details and date of birth are removed and " +
  "cannot be recovered. Attendance, RSVPs and agreements stay, pointing at a record with no " +
  "name on it. It cannot be undone.";
const REQUEST_DATE_LABEL = "Date they asked";
const CONFIRM_LABEL = "Confirm";
const WITHDRAW_LABEL = "Withdraw my confirmation";
const CLOSE_LABEL = "Close";

export function ErasurePanel({
  personId,
  displayName,
  state,
}: {
  personId: string;
  displayName: string;
  state: ErasureState;
}) {
  const [open, setOpen] = useState(false);
  const [requestedOn, setRequestedOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    setPending(true);
    startTransition(() => {
      void (async () => {
        try {
          const result = await action();
          if (result.error) setError(result.error);
          else setOpen(false);
        } finally {
          setPending(false);
        }
      })();
    });
  }

  function download(json: string) {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `person-${personId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const confirmedByViewer = !state.viewerMayConfirm && state.signOffs.length > 0;

  return (
    <Section title={HEADING} testId="data-protection">
      <Stack spacing={1.5} sx={{ py: 1 }}>
        <Box>
          <Button
            variant="outlined"
            size="small"
            data-testid="export-person"
            onClick={() =>
              run(async () => {
                const result = await exportPersonAction({ personId });
                if (result.json) download(result.json);
                return { error: result.error };
              })
            }
          >
            {EXPORT_LABEL}
          </Button>
        </Box>

        {state.eligibility.alreadyErased ? (
          <Notice severity="info" testId="already-erased">
            This record has already been anonymised.
          </Notice>
        ) : state.eligibility.eligible ? (
          <Box>
            <Button
              variant="outlined"
              color="error"
              size="small"
              data-testid="open-erasure-dialog"
              onClick={() => setOpen(true)}
            >
              {ERASE_LABEL}
            </Button>
          </Box>
        ) : (
          <Notice severity="warning" testId="erasure-blocked">
            <Stack spacing={0.5}>
              {state.eligibility.blockers.map((blocker) => (
                <span key={blocker.rule}>{blocker.reason}</span>
              ))}
            </Stack>
          </Notice>
        )}

        {state.signOffs.length > 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid="erasure-signoffs">
            Confirmed by{" "}
            {state.signOffs.map((entry) => `${entry.signedByName} (${entry.roleLabel})`).join(", ")}
            .{" "}
            {state.stillNeeded.length > 0
              ? `Still needed: ${state.stillNeeded.map((code) => ROLE_LABELS[code] ?? code).join(" or ")}.`
              : ""}
          </Typography>
        ) : null}
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle data-testid="erasure-dialog-title">{DIALOG_TITLE}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">{displayName}</Typography>
            <Notice severity="warning" testId="erasure-irreversible">
              {IRREVERSIBLE}
            </Notice>
            <Typography variant="body2" data-testid="erasure-who">
              {state.signOffs.length === 0
                ? "Confirmed by nobody yet."
                : `Confirmed by ${state.signOffs
                    .map((entry) => `${entry.signedByName} (${entry.roleLabel})`)
                    .join(", ")}.`}
              {state.stillNeeded.length > 0
                ? ` Still needed: ${state.stillNeeded.map((code) => ROLE_LABELS[code] ?? code).join(" or ")}.`
                : ""}
            </Typography>
            <TextField
              type="date"
              size="small"
              label={REQUEST_DATE_LABEL}
              value={requestedOn}
              onChange={(event) => setRequestedOn(event.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { "data-testid": "erasure-request-date" },
              }}
            />
            {error ? (
              <Notice variant="refusal" testId="erasure-error">
                {error}
              </Notice>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} data-testid="erasure-close">
            {CLOSE_LABEL}
          </Button>
          {confirmedByViewer ? (
            <Button
              color="inherit"
              data-testid="erasure-withdraw"
              disabled={pending}
              onClick={() => run(() => withdrawErasureConfirmationAction({ personId }))}
            >
              {WITHDRAW_LABEL}
            </Button>
          ) : null}
          <Button
            variant="contained"
            color="error"
            data-testid="erasure-confirm"
            disabled={pending || !state.viewerMayConfirm || requestedOn === ""}
            onClick={() => run(() => confirmErasureAction({ personId, requestedOn }))}
          >
            {CONFIRM_LABEL}
          </Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}
