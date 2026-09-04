"use client";

import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

import { resolvePersonFactDisputeAction } from "./dispute-actions";

/**
 * The disputed-fact resolve control — `WP-operator-record` (LAN-217), `W7`.
 * Two buttons, not a drawn dialog: keep the club's value, or take the
 * player's. Neither asks a reason (`W7`'s own delegated decision — free text
 * is four-role only either way, and `resolvePersonFactDisputeIn`'s optional
 * `note` stays unused by this UI, the same restraint `W6`'s own resolve
 * control keeps).
 */
export default function DisputeResolution({
  personId,
  disputeId,
}: {
  personId: string;
  disputeId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(resolution: "keep_club" | "take_player") {
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await resolvePersonFactDisputeAction({ personId, disputeId, resolution });
        if (result.error) setError(result.error);
      })();
    });
  }

  return (
    <Stack spacing={0.5} sx={{ mt: 0.75 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={pending}
          onClick={() => resolve("keep_club")}
          sx={{ minHeight: 44, textTransform: "none" }}
          data-testid="dispute-keep-club"
        >
          Keep the club&rsquo;s value
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={pending}
          onClick={() => resolve("take_player")}
          sx={{ minHeight: 44, textTransform: "none" }}
          data-testid="dispute-take-player"
        >
          Take the player&rsquo;s answer
        </Button>
      </Stack>
      {error ? (
        <Alert severity="error" data-testid="dispute-error">
          {error}
        </Alert>
      ) : null}
    </Stack>
  );
}
