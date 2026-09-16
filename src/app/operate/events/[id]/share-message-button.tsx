"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { COPY_SHARE_MESSAGE, COPY_SHARE_MESSAGE_DONE } from "../../../participation/share-message";
import { shareMessageAction } from "./club-link-actions";

/**
 * **Copy share message** — LAN-384. One button: it asks the server for the
 * four lines and puts them on the clipboard. No preview card, no send-to-
 * anything; the club cannot message groups, and this is the operator pasting
 * text into one themselves.
 */
export function ShareMessageButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        data-testid="copy-share-message"
        onClick={() => {
          void (async () => {
            const result = await shareMessageAction({ eventId });
            if (result.text === null) {
              setState("failed");
              return;
            }
            try {
              await navigator.clipboard.writeText(result.text);
              setState("copied");
            } catch {
              setState("failed");
            }
          })();
        }}
      >
        {state === "copied" ? COPY_SHARE_MESSAGE_DONE : COPY_SHARE_MESSAGE}
      </Button>
      {state === "failed" ? (
        <Typography variant="caption" color="error" data-testid="share-message-failed">
          The message could not be copied. Try again.
        </Typography>
      ) : null}
    </>
  );
}
