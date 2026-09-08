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
 * Adding a walk-on — Brian, 14 August 2026.
 *
 * ## The same four fields as adding a player, in the same order
 *
 * First name, last name, phone, email. That is not a coincidence and it is not
 * a coincidence that they are the same four `/operate/roster/new` asks for:
 * "it should be almost identical to adding a player… to grab as much as they
 * can". Two screens that add a person to the club should not feel like two
 * different products, and the operator holding the phone should not have to
 * work out which one they are on.
 *
 * The first version of this screen asked for one **Name** field, one combined
 * **Email or phone** field, and a **Possible roster match** dropdown. Brian's
 * verdict on the built screen was blunt and correct on every count: the name
 * field does not align with how the club stores a name, one field cannot hold
 * two different contact details, and the roster match was clutter — "they know
 * who's on their roster, there are only 40 people".
 *
 * ## What is required, and why it is stricter than intake
 *
 * First name, last name and phone. The returner intake requires only a first
 * name, because the club's own files are full of records that never had more —
 * and that is right for somebody already known. A walk-on is the opposite case:
 * nobody knew them ten minutes ago, and the entire point of writing them down
 * is that somebody follows them up. A walk-on with no surname and no number is
 * a row nobody can act on.
 *
 * ## What it creates
 *
 * A person, their contact points, a **recruitment prospect**, granted
 * `walk_up_read_back` consent for the season, and the recruitment cycle's
 * declared jobs — see `recordWalkUpAttendance`. Not a season membership: they
 * are not on the team, which is what made them a walk-up. ("Walk-on" above is
 * this screen's own history; Brian locked *walk-up* as the word on
 * 2026-08-31, and every label on the form now uses it.)
 *
 * ## The one message this now sends — LAN-205, 2026-09-01
 *
 * Saving is also the touchline's whole consent act: the phone number just
 * typed is read back aloud, and pressing save is what turns that read-back
 * into a granted, season-scoped consent and one WhatsApp send — the signed,
 * prefilled link to the sign-up form, never a second template. `WALK_UP_SEND_NOTE`
 * says so on the form, because a save with a real-world consequence this
 * direct should not be silent about having one.
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

          <Field
            label={WALK_UP_PHONE_LABEL}
            name="phone"
            type="tel"
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
