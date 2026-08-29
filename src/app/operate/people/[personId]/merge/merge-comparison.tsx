"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { PersonMergePreview } from "@/lib/services/person-merge";
import { submitMerge } from "./actions";
import { INITIAL_MERGE_STATE } from "./merge-state";

const MIN_TOUCH_TARGET = 44;

const NOT_RECORDED = (
  <Typography component="span" color="text.disabled" sx={{ fontStyle: "italic" }}>
    not recorded
  </Typography>
);

/**
 * W4-02 … W4-08 — the comparison, field by field, and the confirmation that
 * moves nothing until the operator has answered every one of them. `Q-5`
 * (Brian, 2026-08-29) in full: two refusals, a required reason, what will
 * move shown before it moves, no undo.
 */
export default function MergeComparison({
  survivorRouteId,
  preview,
}: {
  /** The person id this route was opened on — the default survivor. */
  survivorRouteId: string;
  preview: PersonMergePreview;
}) {
  const [state, formAction, pending] = useActionState(submitMerge, INITIAL_MERGE_STATE);
  const { survivor, loser, refusal } = preview;

  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 960 }}>
      <input type="hidden" name="survivorPersonId" value={survivor.personId} />
      <input type="hidden" name="loserPersonId" value={loser.personId} />

      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Box>
            <Typography variant="body2" color="text.secondary">
              <Button
                href={`/operate/people/${survivorRouteId}`}
                sx={{ p: 0, minHeight: 0, textTransform: "none" }}
              >
                ← {survivor.displayName}
              </Button>
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
              Merge two records
            </Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              href={`/operate/people/${survivorRouteId}`}
              sx={{ minHeight: MIN_TOUCH_TARGET, textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pending || Boolean(refusal)}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
            >
              Merge
            </Button>
          </Stack>
        </Stack>

        {state.formError ? <Alert severity="warning">{state.formError}</Alert> : null}

        {refusal ? (
          <Stack spacing={2}>
            <Alert severity="warning" data-testid="merge-refusal">
              {refusal.message}
            </Alert>
            <Stack direction="row" spacing={2}>
              {refusal.rule === "person_merge_active_operator_seat" ? (
                <Button variant="contained" href="/operate/admin/operators">
                  Open operator administration
                </Button>
              ) : null}
              {refusal.rule === "person_merge_membership_overlap" ? (
                <Button variant="contained" href="/operate/roster">
                  Open the roster
                </Button>
              ) : null}
            </Stack>
          </Stack>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Which record survives
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <SurvivorCard label={survivor.displayName} isSurvivor />
                <SurvivorCard
                  label={loser.displayName}
                  swapHref={`/operate/people/${loser.personId}/merge?with=${survivor.personId}`}
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                What each record says
              </Typography>
              <Stack spacing={2}>
                {preview.fields.map((field) => (
                  <CompareRow
                    key={field.field}
                    name={`field_${field.field}`}
                    label={field.label}
                    differs={field.differs}
                    survivorValue={field.survivorValue}
                    loserValue={field.loserValue}
                  />
                ))}
                {preview.contacts.map((contact) => (
                  <CompareRow
                    key={contact.kind}
                    name={`contact_${contact.kind}`}
                    label={contact.label}
                    differs={contact.differs}
                    survivorValue={contact.survivor?.rawValue ?? null}
                    loserValue={contact.loser?.rawValue ?? null}
                  />
                ))}
                <CompareRow
                  name="field_aliases"
                  label="Aliases"
                  differs
                  survivorValue={preview.aliases.survivorAliases.join(" · ") || null}
                  loserValue={preview.aliases.loserAliases.join(" · ") || null}
                  readOnly
                />
              </Stack>
              {preview.aliases.survivorAliases.length > 0 ||
              preview.aliases.loserAliases.length > 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Aliases from both records are kept on the survivor as dedupe evidence.
                </Alert>
              ) : null}
            </Paper>

            {preview.prospectCombinations.length > 0 ? (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Two prospect records for {preview.prospectCombinations[0].seasonLabel}
                </Typography>
                <Alert severity="info">
                  Combined onto the survivor: earliest first contact, furthest-along status. One
                  prospect record per person per season.
                </Alert>
              </Paper>
            ) : null}

            {preview.willMove.length > 0 ? (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                  What will move onto {survivor.displayName}
                </Typography>
                <Stack spacing={1}>
                  {preview.willMove.map((line) => (
                    <Typography key={line.label} variant="body2">
                      {line.count} {line.label}
                      {line.count === 1 ? "" : "s"}
                    </Typography>
                  ))}
                </Stack>
              </Paper>
            ) : null}

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Why
              </Typography>
              <TextField
                name="reason"
                label="Reason"
                required
                fullWidth
                error={Boolean(state.reasonError)}
                helperText={
                  state.reasonError ??
                  "There is no undo. The losing row is kept, dated, and points at the survivor."
                }
              />
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  );
}

function SurvivorCard({
  label,
  isSurvivor,
  swapHref,
}: {
  label: string;
  isSurvivor?: boolean;
  swapHref?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        flex: 1,
        borderColor: isSurvivor ? "primary.main" : undefined,
        borderWidth: isSurvivor ? 2 : 1,
      }}
    >
      <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
      {isSurvivor ? (
        <Typography variant="overline" color="primary">
          Survivor
        </Typography>
      ) : (
        <Button href={swapHref} sx={{ p: 0, minHeight: 0, textTransform: "none" }}>
          Make this the survivor
        </Button>
      )}
    </Paper>
  );
}

function CompareRow({
  name,
  label,
  differs,
  survivorValue,
  loserValue,
  readOnly,
}: {
  name: string;
  label: string;
  differs: boolean;
  survivorValue: string | null;
  loserValue: string | null;
  readOnly?: boolean;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "flex-start" } }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ width: { sm: 190 }, flexShrink: 0, alignItems: "center" }}
      >
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {differs ? <Chip size="small" color="warning" variant="outlined" label="differs" /> : null}
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: "100%" }}>
        <ValueBox
          name={readOnly ? undefined : name}
          value="survivor"
          text={survivorValue ?? NOT_RECORDED}
          defaultSelected
        />
        <ValueBox
          name={readOnly ? undefined : name}
          value="loser"
          text={loserValue ?? NOT_RECORDED}
        />
      </Stack>
    </Stack>
  );
}

function ValueBox({
  name,
  value,
  text,
  defaultSelected,
}: {
  name?: string;
  value: "survivor" | "loser";
  text: React.ReactNode;
  defaultSelected?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      component="label"
      sx={{
        p: 1.5,
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: name ? "pointer" : "default",
      }}
    >
      {name ? (
        <Radio
          name={name}
          value={value}
          defaultChecked={defaultSelected}
          size="small"
          sx={{ p: 0 }}
        />
      ) : null}
      <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {text}
      </Typography>
    </Paper>
  );
}
