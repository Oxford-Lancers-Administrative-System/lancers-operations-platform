"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { COPY_SHARE_MESSAGE, COPY_SHARE_MESSAGE_DONE } from "../../../participation/share-message";

/**
 * **Copy share message** — LAN-384, corrected by LAN-409's sibling LAN-410.
 *
 * Stewart, "Ops Event and share", 2026-09-21: "Error when seeing what the
 * share message was", on Safari. The button used to await a server action for
 * the six lines and only then call `navigator.clipboard.writeText`. Safari
 * refuses a clipboard write once the click's user activation has lapsed, which
 * an awaited round trip guarantees; four scripted runs through the real login
 * returned the six lines every time and failed on the write with
 * `NotAllowedError`.
 *
 * So the text arrives as a prop, rendered on the server beside the link, and
 * the handler writes it synchronously — exactly what `CopyLinkButton` does
 * with a URL that is already on the page. The failure caption stays for a
 * browser that refuses anyway; the message itself is visible on the panel, so
 * an operator can always select it by hand.
 */
export function ShareMessageButton({ message }: { message: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        data-testid="copy-share-message"
        onClick={() => {
          // Synchronous: nothing is awaited before `writeText`, so the click's
          // own user activation is still live when the clipboard is asked.
          void navigator.clipboard
            ?.writeText(message)
            .then(() => setState("copied"))
            .catch(() => setState("failed"));
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
