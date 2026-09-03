"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type {
  RosterImportApplied,
  RosterImportPlan,
  RosterPlannedRow,
} from "@/lib/services/roster-csv";
import { importRosterAction } from "./actions";
import { EMPTY_IMPORT_STATE } from "./import-state";
import {
  applyLabel,
  cellText,
  changeSummary,
  COLUMN_HEADINGS,
  describeApplied,
  describeProposal,
  describeTotals,
  describeUnanswered,
  OUTCOME_LABELS,
  outcomeColour,
  SHOWN_COLUMNS,
} from "./presentation";

/**
 * Bulk import — screens `W1-01`…`W1-04` of the approved mockup. LAN-215,
 * `WP-arrival-doors`.
 *
 * One component in three states, on `../../events/import/import-screen.tsx`'s
 * own precedent (`OD7-import-like-events`): a season with nothing new to
 * bring in, the proposal — which grows one section the event import has no
 * need of, the possible duplicates — and what happened. Nothing here decides
 * anything: every outcome, reason and candidate arrives already decided from
 * `@/lib/services/roster-import`; this component chooses colours and column
 * order.
 */

export interface ImportScreenProps {
  seasonLabel: string;
  onRoster: number;
  onboarding: number;
  exportHref: string;
}

export default function ImportScreen(props: ImportScreenProps) {
  const [state, formAction, pending] = useActionState(importRosterAction, EMPTY_IMPORT_STATE);
  const plan = state.plan;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6" component="h1">
          {plan === null ? "Bulk import players" : `Import — ${plan.fileName ?? "your file"}`}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="import-subheading">
          {plan === null
            ? `Season ${props.seasonLabel}`
            : describeProposal(props.seasonLabel, plan.rowCount)}
        </Typography>
      </Box>

      {state.error === null ? null : (
        <Alert severity="warning" data-testid="import-error">
          <strong>Nothing was changed.</strong> {state.error}
        </Alert>
      )}

      {state.applied === null ? null : (
        <Alert severity="success" data-testid="import-applied">
          {describeApplied(state.applied)}
        </Alert>
      )}

      {plan === null ? (
        <StartHere {...props} formAction={formAction} pending={pending} />
      ) : state.applied === null ? (
        <Confirmation plan={plan} state={state} formAction={formAction} pending={pending} />
      ) : (
        <Applied plan={plan} applied={state.applied} />
      )}

      <Boundaries />
    </Stack>
  );
}

/** `W1-01`/`W1-02`'s last block — what an import can never do. */
function Boundaries() {
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="import-boundaries">
      <Typography variant="overline" color="text.secondary" component="p">
        What this import can never do
      </Typography>
      <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
        <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
          <strong>Delete anybody.</strong> A player on the roster and absent from the file is left
          exactly as they were.
        </Typography>
        <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
          <strong>Overwrite a confirmed fact.</strong> A difference between the file and the record
          becomes something the player confirms on their form.
        </Typography>
        <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
          <strong>Send anything.</strong> It queues the welcome. Nothing is ever sent by hand.
        </Typography>
        <Typography component="li" variant="body2">
          <strong>Create a season.</strong> It writes into the season the roster is already in.
        </Typography>
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// W1-02 — choosing a file, and the season it will write into
// ---------------------------------------------------------------------------

function StartHere(
  props: ImportScreenProps & { formAction: (formData: FormData) => void; pending: boolean },
) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
        {`This season's roster has ${props.onRoster} player${props.onRoster === 1 ? "" : "s"}`}
      </Typography>

      <Stack
        direction="row"
        spacing={3}
        sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1.5 }}
        data-testid="season-counts"
      >
        <Count value={props.onRoster} label="On the roster now" />
        <Count value={props.onboarding} label="In onboarding" />
        <Count
          value={0}
          label={`The season this writes into: ${props.seasonLabel}`}
          suppressValue
        />
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        The import inherits the season the roster is already in. It never asks which one, and it
        never creates one.
      </Typography>

      <Box component="ol" sx={{ pl: 2.5, mt: 1.5, mb: 0 }}>
        {[
          "Download the template. Six columns; three of them required.",
          "Fill it from the club's own spreadsheet. First name, last name and mobile on every row.",
          "Import it here. You will see exactly who is about to be added, and who might already be on record.",
          "Answer any possible duplicates, then confirm. Nothing is written until you do.",
        ].map((step) => (
          <Typography component="li" variant="body2" key={step} sx={{ mb: 0.5 }}>
            {step}
          </Typography>
        ))}
      </Box>

      <Box
        component="form"
        action={props.formAction}
        sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2, alignItems: "center" }}
      >
        <input type="hidden" name="intent" value="propose" />
        <Button variant="contained" size="small" component="label" disabled={props.pending}>
          {props.pending ? "Reading the file…" : "Choose the squad file"}
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            hidden
            data-testid="import-file"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </Button>
        <Button variant="outlined" size="small" href={props.exportHref} data-testid="export-link">
          Download the template
        </Button>
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" component="p">
          The six columns
        </Typography>
        <Box
          component="pre"
          data-testid="import-columns"
          sx={{
            m: 0,
            mt: 0.5,
            p: 1.5,
            maxHeight: 220,
            overflow: "auto",
            bgcolor: "action.hover",
            borderRadius: 1,
            fontSize: "0.75rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {"first_name,last_name,mobile,personal_email,college,matriculation_year\n\n" +
            "first_name, last_name and mobile are required on every row.\n" +
            "personal_email, college and matriculation_year are optional — leave them empty " +
            "and the player fills them in themselves when they open their welcome link.\n\n" +
            "There is deliberately no column for date of birth or emergency contact. Both are " +
            "asked of every player at onboarding, and neither belongs in a spreadsheet."}
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary" component="p">
        A player already on this season&rsquo;s roster is left alone · leave somebody out and
        nothing happens to them
      </Typography>
    </Paper>
  );
}

function Count({
  value,
  label,
  suppressValue,
}: {
  value: number;
  label: string;
  suppressValue?: boolean;
}) {
  return (
    <Box>
      {suppressValue ? null : (
        <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// W1-03 — the proposal, and the duplicates underneath it
// ---------------------------------------------------------------------------

function Confirmation({
  plan,
  state,
  formAction,
  pending,
}: {
  plan: RosterImportPlan;
  state: {
    csvText: string | null;
    fileName: string | null;
    duplicateAnswers: Readonly<Record<string, string>>;
  };
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const duplicateRows = plan.rows.filter((row) => row.duplicate !== null);
  const duplicateAnswersJson = JSON.stringify(state.duplicateAnswers);

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
          {describeTotals(plan.totals).map(([value, label]) => (
            <Count key={label} value={value} label={label} />
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ display: { xs: "block", md: "none" }, p: 1.5 }} data-testid="import-cards">
          <Stack spacing={1.5}>
            {plan.rows.map((row) => (
              <RowCard key={row.line} row={row} />
            ))}
          </Stack>
        </Box>

        <Box
          sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}
          data-testid="import-table"
        >
          <Table size="small" sx={{ minWidth: 1200 }}>
            <TableHead>
              <TableRow>
                <TableCell>Outcome</TableCell>
                <TableCell>Player</TableCell>
                {SHOWN_COLUMNS.map((column) => (
                  <TableCell key={column}>{COLUMN_HEADINGS[column]}</TableCell>
                ))}
                <TableCell sx={{ minWidth: 260 }}>What happens</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plan.rows.map((row) => (
                <TableRow key={row.line} data-testid={`import-row-${row.line}`}>
                  <TableCell>
                    <Chip
                      size="small"
                      label={OUTCOME_LABELS[row.outcome]}
                      color={outcomeColour(row.outcome)}
                      variant={row.outcome === "unchanged" ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                  {SHOWN_COLUMNS.map((column) => (
                    <TableCell key={column}>{cellText(row.cells[column])}</TableCell>
                  ))}
                  <TableCell
                    sx={{
                      minWidth: 260,
                      color: row.outcome === "refused" ? "error.main" : undefined,
                    }}
                  >
                    {changeSummary(row)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      {duplicateRows.length === 0 ? null : (
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="import-duplicates">
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            {`Possible duplicates — ${describeUnanswered(plan.unansweredLines)}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Answer each row and confirm again — the rest of the import is not held up by it.
          </Typography>
          <Stack spacing={2}>
            {duplicateRows.map((row) => (
              <DuplicateRow
                key={row.line}
                row={row}
                formAction={formAction}
                pending={pending}
                csvText={state.csvText ?? ""}
                fileName={state.fileName ?? ""}
                duplicateAnswersJson={duplicateAnswersJson}
              />
            ))}
          </Stack>
        </Paper>
      )}

      <Box
        component="form"
        action={formAction}
        sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}
      >
        <input type="hidden" name="csvText" value={state.csvText ?? ""} />
        <input type="hidden" name="digest" value={plan.digest} />
        <input type="hidden" name="fileName" value={state.fileName ?? ""} />
        <input type="hidden" name="duplicateAnswersJson" value={duplicateAnswersJson} />
        <Button type="submit" name="intent" value="cancel" disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          name="intent"
          value="apply"
          variant="contained"
          disabled={pending || plan.applicableCount === 0}
          data-testid="apply-import"
        >
          {pending ? "Applying…" : applyLabel(plan.applicableCount)}
        </Button>
      </Box>
    </>
  );
}

function DuplicateRow({
  row,
  formAction,
  pending,
  csvText,
  fileName,
  duplicateAnswersJson,
}: {
  row: RosterPlannedRow;
  formAction: (formData: FormData) => void;
  pending: boolean;
  csvText: string;
  fileName: string;
  duplicateAnswersJson: string;
}) {
  const candidates = row.duplicate?.candidates ?? [];

  return (
    <Box
      component="form"
      action={formAction}
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "flex-start",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.75,
      }}
      data-testid={`duplicate-${row.line}`}
    >
      <input type="hidden" name="intent" value="propose" />
      <input type="hidden" name="csvText" value={csvText} />
      <input type="hidden" name="fileName" value={fileName} />
      <input type="hidden" name="duplicateAnswersJson" value={duplicateAnswersJson} />
      <input type="hidden" name="answerLine" value={row.line} />

      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary" component="p">
          {`In the file, line ${row.line}`}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {[row.cells.mobile, row.cells.personal_email, row.cells.college]
            .filter((value) => value !== "")
            .join(" · ")}
        </Typography>
      </Box>

      <Stack spacing={1.5} sx={{ flex: "2 1 400px", minWidth: 0 }}>
        {candidates.map((candidate) => (
          <Box
            key={candidate.personId}
            sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" component="p">
                Already on record
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {candidate.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[candidate.phone, candidate.email].filter((value) => value !== null).join(" · ")}
              </Typography>
              <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
                {`Matched on: ${candidate.matchedOn.join(", ")}`}
              </Typography>
            </Box>
            <Button
              type="submit"
              name="answerValue"
              value={candidate.personId}
              variant="contained"
              size="small"
              disabled={pending}
              data-testid={`same-person-${row.line}-${candidate.personId}`}
            >
              Same person
            </Button>
          </Box>
        ))}
        <Box>
          <Button
            type="submit"
            name="answerValue"
            value="different"
            variant="outlined"
            size="small"
            disabled={pending}
            data-testid={`different-person-${row.line}`}
          >
            Different person
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * The same row at 375px — the row's own summary rather than a table's worth
 * of columns, on `../../events/import/import-screen.tsx`'s identical `RowCard`.
 */
function RowCard({ row }: { row: RosterPlannedRow }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid={`import-card-${row.line}`}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Chip
          size="small"
          label={OUTCOME_LABELS[row.outcome]}
          color={outcomeColour(row.outcome)}
          variant={row.outcome === "unchanged" ? "filled" : "outlined"}
        />
      </Stack>

      <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>
        {row.name}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {[
          cellText(row.cells.mobile),
          cellText(row.cells.personal_email),
          cellText(row.cells.college),
        ].join(" · ")}
      </Typography>

      <Typography
        variant="body2"
        color={row.outcome === "refused" ? "error.main" : "text.secondary"}
        sx={{ mt: 1 }}
      >
        {changeSummary(row)}
      </Typography>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// W1-04 — what happened, after confirming
// ---------------------------------------------------------------------------

function Applied({ plan, applied }: { plan: RosterImportPlan; applied: RosterImportApplied }) {
  const arrived = plan.rows.filter(
    (row) => row.outcome === "new" || row.outcome === "carried_forward",
  );
  const refused = plan.rows.filter((row) => row.outcome === "refused");
  const arrivedTotal = applied.created + applied.carriedForward;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
          <Count value={applied.created} label="New" />
          <Count value={applied.carriedForward} label="Carried forward" />
          <Count value={applied.unchanged} label="Unchanged" />
          <Count value={applied.refused} label="Refused" />
          <Count value={applied.welcomesQueued} label="Welcomes queued" />
          <Count value={arrivedTotal} label="Checklists generated" />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }} data-testid="applied-arrived">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          Who arrived
        </Typography>
        {arrived.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nobody new arrived from this file.
          </Typography>
        ) : (
          <Stack divider={<Divider />} spacing={1}>
            {arrived.map((row) => (
              <Stack
                key={row.line}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 200 }}>
                  {row.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.outcome === "new"
                    ? "new · onboarding · welcome queued"
                    : "carried forward · onboarding · welcome queued"}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }} data-testid="applied-refused">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          What was refused, and why
        </Typography>
        {refused.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Every row applied.
          </Typography>
        ) : (
          <Stack divider={<Divider />} spacing={1}>
            {refused.map((row) => (
              <Stack
                key={row.line}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ py: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 200 }}>
                  {`Line ${row.line} — ${row.name}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.reasons.join(" ")}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>

      <Box>
        <Button variant="outlined" href="/operate/roster">
          Back to the roster
        </Button>
      </Box>
    </Stack>
  );
}
