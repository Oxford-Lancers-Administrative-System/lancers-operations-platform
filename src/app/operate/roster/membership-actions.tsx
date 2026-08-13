"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { OnboardingItem } from "@/lib/services/membership";
import {
  activateMembershipAction,
  reactivateMembershipAction,
  resolveOnboardingItemAction,
  setMembershipInactiveAction,
} from "./actions";
import { EMPTY_MEMBERSHIP_ACTION_STATE } from "./action-state";

/**
 * The membership record's transitions — UX-21's primary action and UX-22.
 *
 * Every one of these is a real `form` posting to a server action, not a link
 * and not a fetch. That matters beyond style: the action re-resolves the
 * operator from the verified session and the service re-reads the membership's
 * current status inside the transaction under a row lock, so a button rendered
 * a minute ago against a membership somebody else has since activated produces
 * a refusal rather than a second transition.
 *
 * A refusal is shown where the operator was working, beside the control they
 * used. Nothing here caches a status, and nothing decides from one.
 *
 * These controls are rendered only for an operator who holds the activation
 * capability — but that is a courtesy, never the boundary. The boundary is
 * `requireCapability("membership_activation")` inside each action, and it holds
 * for a request that never rendered this component at all.
 */

/**
 * UX-21's "Activate membership", and UX-22 when required items are outstanding.
 *
 * With nothing outstanding the button activates directly: the model's trigger
 * is met and there is nothing to ask about. With required items outstanding it
 * opens UX-22, which names them, takes the reason and says what the new status
 * will be — because the frozen model permits activation "required item set met
 * **or consciously waived**", and the acceptance criterion requires that
 * proceeding is possible *and* recorded.
 *
 * The dialog is a convenience for the operator, not the rule. Submitting
 * without a reason while items are outstanding is refused by the service, so a
 * request that bypassed this component is refused identically.
 */
export function ActivateMembershipForm({
  membershipId,
  displayName,
  outstanding,
}: {
  membershipId: string;
  displayName: string;
  outstanding: readonly OnboardingItem[];
}) {
  const [state, formAction, pending] = useActionState(
    activateMembershipAction,
    EMPTY_MEMBERSHIP_ACTION_STATE,
  );
  const [open, setOpen] = useState(false);
  const hasOutstanding = outstanding.length > 0;

  const countPhrase =
    outstanding.length === 1
      ? "one required item outstanding"
      : `${outstanding.length} required items outstanding`;

  /**
   * The `form` lives INSIDE the dialog, not around it.
   *
   * MUI renders a `Dialog` through a **portal** onto `document.body`, so a
   * submit button inside the dialog is not inside a form that wraps the dialog
   * in the JSX — it is somewhere else entirely in the DOM. Pressing it did
   * nothing at all, and the override reason never reached the action either.
   * That was found by pressing the real button against the real database, and
   * no render test caught it: in jsdom the portal still contains the markup, so
   * every assertion about labels and fields passed while the screen did
   * nothing.
   *
   * So there are two independent forms below, one per branch, and neither
   * crosses the portal boundary.
   */
  if (!hasOutstanding) {
    return (
      <Box component="form" action={formAction} data-testid="activate-form">
        <input type="hidden" name="membershipId" value={membershipId} />
        <Stack spacing={1}>
          <Button
            type="submit"
            variant="contained"
            disabled={pending}
            sx={{ minHeight: 44 }}
            fullWidth
          >
            {pending ? "Activating…" : "Activate membership"}
          </Button>
          {state.error ? (
            <Alert severity="error" data-testid="activate-error">
              {state.error}
            </Alert>
          ) : null}
        </Stack>
      </Box>
    );
  }

  return (
    <>
      <Button
        variant="contained"
        onClick={() => setOpen(true)}
        disabled={pending}
        sx={{ minHeight: 44 }}
        fullWidth
      >
        Activate membership
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="activation-override-title"
      >
        <DialogTitle id="activation-override-title">
          Activate with outstanding onboarding
        </DialogTitle>
        {/* The form starts here, inside the portal, and encloses the actions. */}
        <Box component="form" action={formAction} data-testid="activate-form">
          <input type="hidden" name="membershipId" value={membershipId} />
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography data-testid="override-summary">
                {`${displayName} has ${countPhrase}.`}
              </Typography>
              <Alert severity="info">
                Only Exec/GM can perform this transition. The reason and actor are written to the
                audit trail.
              </Alert>

              <Box>
                <Typography variant="overline" color="text.secondary" component="h3">
                  {outstanding.length === 1 ? "Outstanding item" : "Outstanding items"}
                </Typography>
                <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 3 }}>
                  {outstanding.map((item) => (
                    <Typography component="li" key={item.id} variant="body2">
                      {item.label}
                    </Typography>
                  ))}
                </Stack>
              </Box>

              <TextField
                label="Override reason"
                name="overrideReason"
                multiline
                minRows={2}
                fullWidth
                required
                autoFocus
                helperText="Why the club is proceeding before these items are settled."
              />

              <Typography variant="body2" color="text.secondary">
                New status: <strong>Active</strong>
              </Typography>

              {state.error ? (
                <Alert severity="error" data-testid="activate-error">
                  {state.error}
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
              {pending ? "Activating…" : "Confirm activation"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}

/**
 * `active → inactive` — register D1's normal case, and the reason it needs.
 *
 * Behind a disclosure rather than sitting open on the record: an always-visible
 * text box beside a status change is the shape people click through by habit.
 * The reason is not a courtesy — it becomes `inactivity_label` and the status
 * event's own `reason`, which is what makes "he was out from November" a
 * question the history can answer.
 */
export function DeactivateMembershipForm({ membershipId }: { membershipId: string }) {
  const [state, formAction, pending] = useActionState(
    setMembershipInactiveAction,
    EMPTY_MEMBERSHIP_ACTION_STATE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outlined" onClick={() => setOpen(true)} sx={{ minHeight: 44 }} fullWidth>
        Mark inactive
      </Button>
    );
  }

  return (
    <Box component="form" action={formAction} data-testid="deactivate-form">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Stack spacing={2}>
        <TextField
          label="Why is this membership going inactive?"
          name="reason"
          multiline
          minRows={2}
          fullWidth
          required
          autoFocus
        />
        {state.error ? (
          <Alert severity="error" data-testid="deactivate-error">
            {state.error}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {pending ? "Saving…" : "Mark inactive"}
          </Button>
          <Button
            variant="outlined"
            onClick={() => setOpen(false)}
            disabled={pending}
            sx={{ minHeight: 44 }}
          >
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** `inactive → active`. The reason is optional — coming back needs no excuse. */
export function ReactivateMembershipForm({ membershipId }: { membershipId: string }) {
  const [state, formAction, pending] = useActionState(
    reactivateMembershipAction,
    EMPTY_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <Box component="form" action={formAction} data-testid="reactivate-form">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Stack spacing={1}>
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ minHeight: 44 }}
          fullWidth
        >
          {pending ? "Saving…" : "Mark active again"}
        </Button>
        {state.error ? (
          <Alert severity="error" data-testid="reactivate-error">
            {state.error}
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * The three resolutions an operator may record against one onboarding item.
 *
 * `pending` and `invited` are absent on purpose: they are states the process
 * moves *through*, not decisions made on this screen. The service checks the
 * submitted status against the same three, so a crafted request naming
 * `invited` is refused rather than written.
 *
 * A waiver's reason is required by the schema
 * (`onboarding_items_waiver_is_justified`) and asked for here before the
 * database has to refuse it. The field appears only when Waived is chosen, so
 * the common case — marking something complete — stays one control and one
 * press.
 */
export function OnboardingItemForm({
  membershipId,
  item,
}: {
  membershipId: string;
  item: OnboardingItem;
}) {
  const [state, formAction, pending] = useActionState(
    resolveOnboardingItemAction,
    EMPTY_MEMBERSHIP_ACTION_STATE,
  );
  const [resolution, setResolution] = useState("");

  return (
    <Box component="form" action={formAction} data-testid="onboarding-item-form">
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="itemId" value={item.id} />
      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "stretch" }}>
          <TextField
            select
            size="small"
            name="status"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            label={`Resolve ${item.label}`}
            sx={{ minWidth: 200, flexGrow: 1 }}
          >
            <MenuItem value="">Choose…</MenuItem>
            <MenuItem value="complete">Complete</MenuItem>
            <MenuItem value="waived">Waived</MenuItem>
            <MenuItem value="not_applicable">Not applicable</MenuItem>
          </TextField>
          <Button
            type="submit"
            variant="outlined"
            disabled={pending || resolution === ""}
            sx={{ minHeight: 44 }}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </Stack>

        {resolution === "waived" ? (
          <TextField
            label="Why is this waived?"
            name="reason"
            size="small"
            multiline
            minRows={2}
            fullWidth
            required
          />
        ) : null}

        {state.error ? (
          <Alert severity="error" data-testid="onboarding-item-error">
            {state.error}
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
