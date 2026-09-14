"use client";

import { useState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Surface } from "@/components/surface";
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
      <Surface>
        <Stack spacing={3}>
          <PageHeader title="Stopped" />
          <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
            {`We will not message you about ${seasonLabel} again. If you change your mind, anybody at the club can point you back at the sign-up page.`}
          </Typography>
        </Stack>
      </Surface>
    );
  }

  if (step === "confirm") {
    return (
      <Surface>
        <Stack spacing={3}>
          <PageHeader title="Are you sure?" />
          <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
            This is the only confirmation. Pressing it stops everything — invitations, reminders,
            the lot — and there is nothing that will ask you again this season.
          </Typography>
          {error ? <Notice severity="error">{error}</Notice> : null}
          <ActionBar
            primary={
              <Button variant="contained" disabled={busy} onClick={handleConfirm}>
                Yes, stop them
              </Button>
            }
            cancel={
              <Button variant="outlined" disabled={busy} onClick={() => setStep("link")}>
                Go back
              </Button>
            }
          />
        </Stack>
      </Surface>
    );
  }

  return (
    <Surface>
      <Stack spacing={3}>
        <PageHeader title="Stop messages from the Oxford Lancers?" />
        <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
          {`We will stop messaging you about ${seasonLabel} straight away. You stay welcome at any session, and nobody will ask you why.`}
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => setStep("confirm")} sx={{ minHeight: 48 }}>
            Stop messaging me
          </Button>
        </Box>
      </Stack>
    </Surface>
  );
}
