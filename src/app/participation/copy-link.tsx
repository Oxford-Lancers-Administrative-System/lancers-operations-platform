"use client";

import { useState } from "react";
import Button from "@mui/material/Button";

import { COPY_LINK, COPY_LINK_DONE } from "./presentation";

/**
 * **Copy link**, and nothing else.
 *
 * W7 is explicit: "Copy the link, and nothing else — there is no
 * send-to-WhatsApp, because the club cannot message groups" (Brian,
 * 2026-08-21).
 *
 * The URL is rendered beside this button as selectable text, so the link is
 * reachable even where the clipboard API is not — a refused permission, an
 * insecure origin, an older browser. The button is a convenience over a value
 * already on the screen, never the only way to get it.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="contained"
      size="small"
      data-testid="copy-club-link"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(url)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? COPY_LINK_DONE : COPY_LINK}
    </Button>
  );
}
