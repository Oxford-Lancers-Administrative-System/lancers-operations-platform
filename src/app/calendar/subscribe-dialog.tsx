"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { PUBLIC_CALENDAR_FEED_PATH } from "./routes";

/**
 * `Add to your calendar` — `W2`, the whole workflow. LAN-158. Two screens
 * only, Brian cut the other three: `W2-01` (opening) and `W2-02` (once a
 * destination is chosen), one `Dialog` switched on `chosen`. `window.open`
 * hands off to the reader's own calendar app and immediately shows Done —
 * this control's job ends there, and nothing here reads back whether the
 * subscription completed. Not a notification channel. Both this dialog's URL
 * and `feed.ics/route.ts` start from `PUBLIC_CALENDAR_FEED_PATH`.
 */

const PROVIDERS = [
  { id: "google", label: "Google Calendar" },
  { id: "apple", label: "Apple Calendar" },
  { id: "outlook", label: "Outlook" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

/** Where each destination is sent. Apple gets `webcal:` (registered handler); Google/Outlook get the HTTPS address unchanged via their add-by-URL endpoint. */
function destinationUrl(provider: ProviderId, origin: string): string {
  const httpsUrl = `${origin}${PUBLIC_CALENDAR_FEED_PATH}`;
  switch (provider) {
    case "apple":
      return httpsUrl.replace(/^https?:/, "webcal:");
    case "google":
      return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`;
    case "outlook":
      return `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(
        httpsUrl,
      )}&name=${encodeURIComponent("Oxford Lancers")}`;
  }
}

function labelFor(provider: ProviderId): string {
  return PROVIDERS.find((candidate) => candidate.id === provider)!.label;
}

export default function SubscribeToCalendarButton({
  variant = "outlined",
}: {
  /** `contained` beside a page's primary action (operator headers); `outlined` elsewhere. */
  variant?: "outlined" | "contained";
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ProviderId | null>(null);
  const [copied, setCopied] = useState(false);

  // Bare path during SSR (`window` doesn't exist); shown only once the dialog is open and running client-side, so no hydration mismatch.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const feedUrl = `${origin}${PUBLIC_CALENDAR_FEED_PATH}`;

  const close = () => {
    setOpen(false);
    setChosen(null);
    setCopied(false);
  };

  const choose = (provider: ProviderId) => {
    window.open(destinationUrl(provider, window.location.origin), "_blank", "noopener,noreferrer");
    setChosen(provider);
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size="small"
        onClick={() => setOpen(true)}
        sx={{ minHeight: 44 }}
        data-testid="subscribe-open"
      >
        Add to your calendar
      </Button>

      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="xs"
        aria-labelledby="subscribe-dialog-title"
        data-testid="subscribe-dialog"
      >
        <DialogTitle id="subscribe-dialog-title" sx={{ pr: 6 }}>
          {chosen === null ? "Add to your calendar" : "Done"}
        </DialogTitle>
        <IconButton
          aria-label="Close dialog"
          onClick={close}
          sx={{ position: "absolute", right: 8, top: 8, color: "text.secondary" }}
        >
          <Typography component="span" aria-hidden sx={{ fontSize: 20, lineHeight: 1 }}>
            ×
          </Typography>
        </IconButton>

        <DialogContent>
          {chosen === null ? (
            <Stack spacing={1.5} data-testid="subscribe-pick">
              <Typography variant="body2" color="text.secondary">
                Every club event for the open season, kept up to date. You add next season&rsquo;s
                calendar when it opens.
              </Typography>

              <Stack spacing={1}>
                {PROVIDERS.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outlined"
                    onClick={() => choose(provider.id)}
                    sx={{ justifyContent: "space-between", minHeight: 44 }}
                    data-testid={`subscribe-provider-${provider.id}`}
                  >
                    {provider.label}
                    <Typography component="span" aria-hidden color="text.secondary">
                      →
                    </Typography>
                  </Button>
                ))}
              </Stack>

              <Typography
                variant="overline"
                color="text.secondary"
                component="p"
                sx={{ mt: 1, mb: 0 }}
              >
                Or copy the address
              </Typography>
              <Box
                sx={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  bgcolor: "grey.100",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.25,
                  wordBreak: "break-all",
                }}
                data-testid="subscribe-url"
              >
                {feedUrl}
              </Box>
              <Button
                variant="text"
                size="small"
                onClick={copyAddress}
                sx={{ alignSelf: "flex-start", minHeight: 36 }}
                data-testid="subscribe-copy"
              >
                {copied ? "Copied" : "Copy address"}
              </Button>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your calendar app decides how often it checks for changes. A cancellation is also
                messaged to you directly — do not rely on your calendar app to hear about it first.
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ textAlign: "center" }} data-testid="subscribe-done">
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  bgcolor: "success.light",
                  color: "success.dark",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  mx: "auto",
                }}
                aria-hidden
              >
                ✓
              </Box>
              <Typography variant="body2" color="text.secondary">
                {`${labelFor(chosen)} has opened. Confirm there and the season's events will appear — your calendar keeps itself up to date after that.`}
              </Typography>
              <Button variant="contained" onClick={close} sx={{ minHeight: 44 }}>
                Close
              </Button>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
