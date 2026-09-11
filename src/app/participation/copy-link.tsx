"use client";

import { useState } from "react";
import Button from "@mui/material/Button";

import { COPY_LINK, COPY_LINK_DONE } from "./presentation";

/**
 * **Copy link**, and nothing else — W7, Brian: "there is no send-to-WhatsApp,
 * because the club cannot message groups." The URL is also rendered beside
 * this button as selectable text, so it's reachable without the clipboard API.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
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
