"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { Section } from "@/components/section";

/**
 * The Preview disclosure — LAN-508, W1-01 and W1-04 (correction round 1). The
 * brief exactly as the player receives it: the 900px PNG the server draws for
 * WhatsApp, scaled to the column. Never a second rendering in the browser —
 * the image comes from the same function that draws the one that is sent.
 *
 * `src` is a fixed image (the event page: the brief as last sent); `body` is
 * the box being typed in (the form), drawn by the preview route a moment
 * after typing stops.
 */
export function BriefPreview({
  body,
  src,
  testId,
}: {
  body?: string;
  src?: string;
  testId?: string;
}) {
  return (
    <Section title="Preview" collapsible defaultOpen headingLevel={3} testId={testId}>
      <Box
        sx={{
          border: 1,
          borderColor: "rgba(0, 0, 0, 0.23)",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "#ffffff",
        }}
      >
        {src !== undefined ? <BriefImage src={src} /> : <TypedBriefImage body={body ?? ""} />}
      </Box>
    </Section>
  );
}

function BriefImage({ src }: { src: string | null }) {
  if (src === null) return null;
  return (
    // A generated PNG of a fixed width, scaled to the column: next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Event message preview"
      style={{ display: "block", width: "100%", height: "auto" }}
      data-testid="brief-preview-image"
    />
  );
}

/** How long typing has to pause before the preview is redrawn. */
const REDRAW_AFTER_MS = 400;

function TypedBriefImage({ body }: { body: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (body.trim() === "") return;
    const controller = new AbortController();
    let made: string | null = null;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/event-messages/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        made = URL.createObjectURL(await response.blob());
        setSrc(made);
      } catch {
        // Aborted by the next keystroke, or offline: the last image stays.
      }
    }, REDRAW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (made !== null) {
        const stale = made;
        // Revoked once the next image has replaced it on screen.
        setTimeout(() => URL.revokeObjectURL(stale), 5_000);
      }
    };
  }, [body]);

  return <BriefImage src={body.trim() === "" ? null : src} />;
}
