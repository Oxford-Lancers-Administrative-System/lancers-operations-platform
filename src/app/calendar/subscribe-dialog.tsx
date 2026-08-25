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
 * `Add to your calendar` — `W2`, the whole workflow. LAN-158.
 *
 * ## Two screens, and Brian cut the other three
 *
 * The first mockup carried five; Brian's instruction was explicit — "you're
 * overcomplicating this … These extra screens aren't really necessary" — and
 * the approved packet has exactly two: `W2-01`, this dialog's opening state,
 * and `W2-02`, what it becomes once a destination is chosen. Both are this one
 * `Dialog`, switched on `chosen`. There is no third state to add here: not a
 * loading screen, not a confirmation-of-confirmation, not a settings panel.
 * Copying the address gives inline feedback on the *same* first screen rather
 * than a screen of its own, because the workflow names it as an alternative to
 * picking a destination, not a third step.
 *
 * ## What pressing a destination actually does
 *
 * "Their own calendar app opens and asks them to confirm. That confirmation
 * belongs to that app, not to this one" — the workflow is explicit that this
 * control's job ends at getting the reader's own app to open. `window.open`
 * hands off to it (a `webcal:` URL for Apple, an HTTPS add-by-URL endpoint for
 * Google and Outlook) and the dialog immediately shows Done; nothing here
 * waits for or reads back whether the subscription was actually completed,
 * because there is no way to know that from this page and pretending otherwise
 * would be dishonest about what just happened.
 *
 * ## Not a notification channel
 *
 * This control does not claim one either. "Confirm there and the season's
 * events will appear" is the whole promise; refresh timing is the provider's
 * from that point on (`calendar-feed.ts`'s own header), and nothing on this
 * dialog says "you'll be notified."
 *
 * ## One feed address, everywhere
 *
 * The URL this dialog builds and the route that answers it
 * (`src/app/calendar/feed.ics/route.ts`) both start from
 * `PUBLIC_CALENDAR_FEED_PATH` — the one place either is written down.
 */

const PROVIDERS = [
  { id: "google", label: "Google Calendar" },
  { id: "apple", label: "Apple Calendar" },
  { id: "outlook", label: "Outlook" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

/**
 * Where each destination is sent, built from the page's own origin.
 *
 * Apple gets `webcal:`, which its Calendar app (macOS and iOS) registers
 * itself as the handler for and opens directly into the Subscribe sheet.
 * Google and Outlook both offer an HTTPS "add a calendar by URL" endpoint that
 * takes the feed's own HTTPS address as a parameter — neither understands
 * `webcal:`, so they get the address unchanged.
 */
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

  // Server-rendered as the bare path — `window` does not exist during SSR —
  // and only ever shown once the dialog is open, by which point this is
  // running on the client and reads the real origin. `Dialog` does not mount
  // its content while `open` is false, so the bare-path value never reaches
  // the page's own markup for a mismatch to be found in.
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
