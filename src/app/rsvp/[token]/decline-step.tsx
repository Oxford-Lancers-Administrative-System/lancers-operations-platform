/**
 * UX-61 — declining, with the reason the domain requires. Split from
 * `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/field";

import type { SignedRsvpPage } from "@/lib/services/rsvp";

import { submitNotAttending } from "./actions";
import { REASON_REQUIRED_ERROR } from "./params";
import {
  BACK,
  DECLINE_HEADING,
  DECLINE_PROMPT,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  SAVE_NOT_ATTENDING,
  eventSummary,
} from "./presentation";
import { MIN_TOUCH_TARGET, Shell } from "./rsvp-shell";

export function DecliningStep({
  page,
  token,
  error,
}: {
  page: SignedRsvpPage;
  token: string;
  error: string | null;
}) {
  const missingReason = error === REASON_REQUIRED_ERROR;

  return (
    <Shell>
      <PageHeader title={DECLINE_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
        {eventSummary(page.eventName, page.scheduledOn, page.startsAt)}
      </Typography>

      <Notice severity={missingReason ? "error" : "info"}>{DECLINE_PROMPT}</Notice>

      <Box component="form" action={submitNotAttending} sx={{ mt: 3 }}>
        <input type="hidden" name="token" value={token} />
        <Stack spacing={2.5}>
          {/*
            `required` is the "refused in the form before the request is made"
            half of the acceptance criterion, and it is deliberately the
            browser's own validation rather than a script: it works with
            JavaScript disabled, which a React handler would not. The server
            checks the same string again in `recordSignedLinkResponse`, and the
            database's own constraint checks it a third time.
          */}
          <Field
            name="reason"
            label={REASON_LABEL}
            placeholder={REASON_PLACEHOLDER}
            required
            error={missingReason}
            helperText={missingReason ? DECLINE_PROMPT : undefined}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {/*
            One reason, and no second box. The wireframe paired this with an
            optional "Additional detail"; Brian removed it on 14 August 2026 —
            the player leaves a reason, and nothing downstream reads the two
            apart.
          */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button type="submit" variant="contained" sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}>
              {SAVE_NOT_ATTENDING}
            </Button>
            <Button
              href={`/rsvp/${encodeURIComponent(token)}`}
              variant="text"
              sx={{ minHeight: MIN_TOUCH_TARGET, flex: 1 }}
            >
              {BACK}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Shell>
  );
}
