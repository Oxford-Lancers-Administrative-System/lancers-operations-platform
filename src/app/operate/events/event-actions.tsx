"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  abandonEventDraftAction,
  approveEventAction,
  assertEventOutcomeAction,
  correctEventOutcomeAction,
} from "./actions";
import { EMPTY_TRANSITION_STATE } from "./form-state";

/**
 * The one status change an operator can make from the event detail.
 *
 * There were three. "Submit for approval" and "Withdraw submission" both went
 * on 12 August 2026: they modelled a proposer asking a gatekeeper, and this
 * club has no such relationship — only calendar operators create events at all.
 * A saved event is a draft, and approval takes it from there.
 *
 * Each is a real `form` posting to a server action, not a link and not a
 * fetch. That matters beyond style: the action re-resolves the operator from
 * the verified session and re-checks the event's current status inside the
 * transaction, so a button rendered a minute ago against a draft that has since
 * been submitted produces a refusal rather than a second transition.
 *
 * A refusal is shown where the operator was working, next to the button they
 * pressed, and the event is re-read on the next render — nothing here caches a
 * status and nothing decides from one.
 */

/**
 * `draft → withdrawn` — the candidate the owner abandons.
 *
 * Deliberately a different word from "Withdraw submission" above, and a
 * different outcome: this one ends the event. The reason field is not a
 * courtesy — `events_negative_decisions_are_explained` refuses a withdrawal
 * that does not say why, so the form asks for it before the database has to.
 *
 * The reason is behind a disclosure rather than sitting open on the page: an
 * always-visible text box beside a destructive action is the shape people
 * click through by habit.
 */
export function AbandonDraftForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    abandonEventDraftAction,
    EMPTY_TRANSITION_STATE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="text" color="error" onClick={() => setOpen(true)} fullWidth>
        Abandon draft
      </Button>
    );
  }

  return (
    <Box component="form" action={formAction} data-testid="abandon-form">
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={2}>
        <TextField
          label="Why is this draft being abandoned?"
          name="reason"
          multiline
          minRows={2}
          fullWidth
          autoFocus
        />
        {state.error ? (
          <Alert severity="error" data-testid="abandon-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" color="error" disabled={pending}>
            {pending ? "Abandoning…" : "Abandon draft"}
          </Button>
          <Button variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
            Keep the draft
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * The approve button, and only the button.
 *
 * A client component because it needs `useActionState` for the pending state and
 * the refusal, and nothing else on the confirmation screen does — the audience,
 * the count and the deadline are all server-rendered from stored rows. Keeping
 * the client boundary this small is what stops the confirmation screen holding a
 * private copy of the audience that could disagree with the database.
 *
 * It posts the event id and nothing else. The audience was saved before this
 * screen rendered, so there is no list to send, and therefore no list a browser
 * could alter between confirming and approving.
 */
export function ApproveEventForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(approveEventAction, EMPTY_TRANSITION_STATE);

  return (
    <Box component="form" action={formAction} data-testid="approve-form">
      <Stack spacing={2}>
        <input type="hidden" name="eventId" value={eventId} />
        {state.error ? (
          <Alert severity="error" data-testid="approval-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {pending ? "Approving…" : "Approve event"}
          </Button>
          <Button
            variant="outlined"
            href={`/operate/events/${eventId}?step=audience`}
            disabled={pending}
            sx={{ minHeight: 44 }}
          >
            Back to audience
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * UX-70's two buttons — **Mark occurred** and **Mark not held**.
 *
 * One form with two submit buttons rather than two forms, so that a single
 * refusal renders once and under both. Each button carries the outcome as its
 * own `value`, which is how a form posts *which* button was pressed without any
 * client state deciding it.
 *
 * The labels are the approved ones. `slice-ux.md` § 6 fixes the club's
 * vocabulary for this decision, and these two are the whole of it.
 */
export function OccurrenceDecisionForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    assertEventOutcomeAction,
    EMPTY_TRANSITION_STATE,
  );

  return (
    <Box component="form" action={formAction} data-testid="occurrence-form">
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={2}>
        {state.error ? (
          <Alert severity="error" data-testid="occurrence-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button
            type="submit"
            name="outcome"
            value="occurred"
            variant="contained"
            disabled={pending}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            {pending ? "Recording…" : "Mark occurred"}
          </Button>
          <Button
            type="submit"
            name="outcome"
            value="not_held"
            variant="outlined"
            disabled={pending}
            fullWidth
            sx={{ minHeight: 44 }}
          >
            Mark not held
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * The way back from an assertion somebody got wrong.
 *
 * Behind a disclosure, and asking for a reason, for the same reason abandoning
 * a draft is: this rewrites the club's record of whether an evening happened,
 * and an always-open control beside it is the shape people press by habit.
 *
 * `slice-ux.md` § 9 requires a completed state to offer "any permitted
 * correction". Without one, an operator who pressed the wrong button on the
 * wrong event in the list is stuck with it — and the alternative they would
 * reach for is worse, because there is no other way to move an event's status.
 */
export function CorrectOccurrenceForm({
  eventId,
  currentStatus,
}: {
  eventId: string;
  currentStatus: "occurred" | "not_held";
}) {
  const [state, formAction, pending] = useActionState(
    correctEventOutcomeAction,
    EMPTY_TRANSITION_STATE,
  );
  const [open, setOpen] = useState(false);

  const target = currentStatus === "occurred" ? "not held" : "occurred";

  if (!open) {
    return (
      <Button variant="text" onClick={() => setOpen(true)} data-testid="correct-occurrence-open">
        {`Correct this to ${target}`}
      </Button>
    );
  }

  return (
    <Box component="form" action={formAction} data-testid="correct-occurrence-form">
      <input type="hidden" name="eventId" value={eventId} />
      <Stack spacing={2}>
        <TextField
          label={`Why is this being corrected to ${target}?`}
          name="reason"
          multiline
          minRows={2}
          fullWidth
          autoFocus
        />
        {state.error ? (
          <Alert severity="error" data-testid="correct-occurrence-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {pending ? "Correcting…" : `Correct to ${target}`}
          </Button>
          <Button variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
            Leave it as it is
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
