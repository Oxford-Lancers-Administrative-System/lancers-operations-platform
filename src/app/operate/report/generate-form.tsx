"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { generateReportAction } from "./actions";
import { EMPTY_GENERATE_STATE } from "./action-state";
import { GENERATE_REPORT } from "./presentation";

/**
 * **Generate report** — UX-80's primary action, and the only write on this
 * route.
 *
 * `pending` disables it, which § 9 asks for ("duplicate actions disabled") and
 * which matters more here than on most screens: a double press is two
 * generations, and two generations are two immutable versions. The database
 * would keep both honestly — v2 superseding v1, each with its own timestamp —
 * so nothing would be corrupted, but the operator would have filed a version
 * they did not mean to and could never delete.
 *
 * A refusal is shown beside the button rather than replacing the preview: the
 * numbers the operator was reading are still the numbers, and the reason
 * generation failed is a separate fact about the attempt.
 */
export function GenerateForm({ reportOn }: { reportOn: string }) {
  const [state, formAction, pending] = useActionState(generateReportAction, EMPTY_GENERATE_STATE);

  return (
    <Box component="form" action={formAction} data-testid="generate-report-form">
      <input type="hidden" name="reportOn" value={reportOn} />
      <Stack spacing={1.5}>
        {state.error ? (
          <Alert severity="warning" data-testid="generate-error">
            {state.error}
          </Alert>
        ) : null}
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ minHeight: 44 }}
          data-testid="generate-report"
        >
          {pending ? "Generating…" : GENERATE_REPORT}
        </Button>
      </Stack>
    </Box>
  );
}
