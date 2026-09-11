"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Surface } from "@/components/surface";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import Typography from "@mui/material/Typography";
import { recordWalkUpAction } from "./actions";
import { EMPTY_WALK_UP_STATE } from "./action-state";
import {
  WALK_UP_ALWAYS_PRESENT,
  WALK_UP_EMAIL_LABEL,
  WALK_UP_FAMILY_NAME_LABEL,
  WALK_UP_GIVEN_NAME_LABEL,
  WALK_UP_HEADLINE,
  WALK_UP_PHONE_LABEL,
  WALK_UP_RECONCILIATION_NOTE,
  WALK_UP_SEND_NOTE,
  WALK_UP_SUBMIT,
} from "./presentation";

/**
 * Adding a walk-on — Brian, 14 August 2026. Same four fields as adding a
 * player, in the same order. First name, last name and phone required
 * (stricter than intake — nobody here is already known). Creates a person,
 * contact points, a recruitment prospect, `walk_up_read_back` consent, and
 * the recruitment cycle's jobs (LAN-205) — never a season membership.
 */
export function WalkUpForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(recordWalkUpAction, EMPTY_WALK_UP_STATE);
  const values = state.values;

  return (
    <Box component="form" action={formAction} data-testid="walk-up-form" sx={{ maxWidth: 560 }}>
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={3}>
        <PageHeader
          title={WALK_UP_HEADLINE}
          back={{ href: `/operate/events/${eventId}/attendance`, label: "Back to attendance" }}
        />
        <Surface>
          <Typography
            variant="body2"
            color="text.secondary"
            data-testid="walk-up-reconciliation-note"
          >
            {WALK_UP_RECONCILIATION_NOTE}
          </Typography>

          <Notice severity="info" testId="walk-up-send-note">
            {WALK_UP_SEND_NOTE}
          </Notice>

          {state.error ? (
            <Notice severity="error" testId="walk-up-error">
              {state.error}
            </Notice>
          ) : null}

          <Field
            label={WALK_UP_GIVEN_NAME_LABEL}
            name="givenName"
            defaultValue={values?.givenName ?? ""}
            required
            autoFocus
          />

          <Field
            label={WALK_UP_FAMILY_NAME_LABEL}
            name="familyName"
            defaultValue={values?.familyName ?? ""}
            required
          />

          {/* LAN-211: the one surface a coach reaches with one shot — a mistyped country code loses the contact for good. */}
          <PhoneField
            name="phone"
            label={WALK_UP_PHONE_LABEL}
            defaultValue={values?.phone ?? ""}
            required
          />

          <Field
            label={WALK_UP_EMAIL_LABEL}
            name="email"
            type="email"
            defaultValue={values?.email ?? ""}
            helperText="Optional."
          />

          <Typography variant="body2" color="text.secondary" data-testid="walk-up-presence-note">
            {WALK_UP_ALWAYS_PRESENT}
          </Typography>

          <ActionBar
            primary={
              <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
                {pending ? "Adding…" : WALK_UP_SUBMIT}
              </Button>
            }
            cancel={
              <Button
                variant="outlined"
                href={`/operate/events/${eventId}/attendance`}
                disabled={pending}
                sx={{ minHeight: 44 }}
              >
                Cancel
              </Button>
            }
          />
        </Surface>
      </Stack>
    </Box>
  );
}
