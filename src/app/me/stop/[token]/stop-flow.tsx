"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { StopOutcome } from "./actions";

/**
 * The opt-out surface — LAN-202, item 6. "Two taps, no login, no questions,
 * and no attempt to talk them out of it." One confirmation, and nothing else:
 * `link` -> `confirm` -> `done`.
 */
export default function StopFlow({
  seasonLabel,
  withdraw,
}: {
  seasonLabel: string;
  withdraw: () => Promise<StopOutcome>;
}) {
  const [step, setStep] = useState<"link" | "confirm" | "done">("link");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const outcome = await withdraw();
    setBusy(false);
    if (outcome.ok) setStep("done");
    else setError(outcome.message ?? "That could not be saved. Try again.");
  }

  if (step === "done") {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={3}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            Stopped
          </Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
            {`We will not message you about ${seasonLabel} again. If you change your mind, anybody at the club can point you back at the sign-up page.`}
          </Typography>
        </Stack>
      </Paper>
    );
  }

  if (step === "confirm") {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={3}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            Are you sure?
          </Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
            This is the only confirmation. Pressing it stops everything — invitations, reminders,
            the lot — and there is nothing that will ask you again this season.
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={handleConfirm}
              sx={{ minHeight: 48, flex: 1 }}
            >
              Yes, stop them
            </Button>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => setStep("link")}
              sx={{ minHeight: 48, flex: 1 }}
            >
              Go back
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
      <Stack spacing={3}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
          Stop messages from the Oxford Lancers?
        </Typography>
        <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
          {`We will stop messaging you about ${seasonLabel} straight away. You stay welcome at any session, and nobody will ask you why.`}
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => setStep("confirm")} sx={{ minHeight: 48 }}>
            Stop messaging me
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
