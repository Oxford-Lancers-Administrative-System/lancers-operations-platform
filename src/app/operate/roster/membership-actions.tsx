"use client";

import { useActionState, useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import type { MembershipStatus, OnboardingItem } from "@/lib/services/membership";
import { resolveOnboardingItemAction, setMembershipStatusAction } from "./actions";
import { EMPTY_MEMBERSHIP_ACTION_STATE } from "./action-state";
import { MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { labelFor } from "../labels";

/**
 * The membership record's one status control — LAN-186's owner walkthrough,
 * replacing UX-21's "Activate membership", UX-22's override dialog and the
 * record's own "Mark inactive" / "Mark active again" pair.
 *
 * `Q-12`, verbatim: "We can flip to whatever status we want to go in." There is
 * no transition table any more, so this is a plain select over every status —
 * exactly the shape every other season fact on the roster board already
 * takes. Nothing confirms, nothing asks a reason, and there is nothing left to
 * disclose behind a dialog: picking a value commits it.
 *
 * This is the **shipped** control Brian named at the walkthrough: "That means
 * on the player page and the people page, too, both of them that drop that
 * mark inactive." One component, imported wherever a membership's status
 * needs changing, so a future surface never grows its own bespoke version of
 * this decision.
 *
 * Rendered only for an operator who holds `person_record_authority` — but that
 * is a courtesy, never the boundary. The boundary is
 * `requireCapability("person_record_authority")` inside `setMembershipStatusAction`,
 * and it holds for a request that never rendered this component at all.
 */
export function MembershipStatusControl({
  membershipId,
  status,
  label = "Status",
}: {
  membershipId: string;
  status: MembershipStatus;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Stack spacing={1}>
      <Field
        select
        label={label}
        value={status}
        disabled={pending}
        data-testid="membership-status-control"
        onChange={(event) => {
          const next = event.target.value as MembershipStatus;
          if (next === status) return;
          setError(null);
          startTransition(() => {
            void (async () => {
              const result = await setMembershipStatusAction({ membershipId, status: next });
              if (result.error) setError(result.error);
            })();
          });
        }}
      >
        {(Object.keys(MEMBERSHIP_STATUS_LABELS) as MembershipStatus[]).map((value) => (
          <MenuItem key={value} value={value}>
            {labelFor(MEMBERSHIP_STATUS_LABELS, value)}
          </MenuItem>
        ))}
      </Field>
      {error ? (
        <Notice severity="error" testId="status-error">
          {error}
        </Notice>
      ) : null}
    </Stack>
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
          <Field
            select
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
          </Field>
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
          <Field label="Why is this waived?" name="reason" multiline minRows={2} required />
        ) : null}

        {state.error ? (
          <Notice severity="error" testId="onboarding-item-error">
            {state.error}
          </Notice>
        ) : null}
      </Stack>
    </Box>
  );
}
