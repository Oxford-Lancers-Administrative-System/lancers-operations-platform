"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";
import { ActionBar } from "@/components/action-bar";
import { TableFrame } from "@/components/sortable-header";
import { RowCard as KitRowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { Fact, FactGrid } from "@/components/fact";
import { ImportDuplicateQuestion } from "@/components/import-duplicate-question";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  OPT_IN_HEADER,
  RECRUIT_IMPORT_COLUMNS,
  type RecruitImportApplied,
  type RecruitImportPlan,
  type RecruitPlannedRow,
} from "@/lib/services/recruit-csv";
import { importRecruitsAction } from "./actions";
import { EMPTY_RECRUIT_IMPORT_STATE } from "./import-state";
import {
  applyLabel,
  cellText,
  cellValue,
  changeSummary,
  COLUMN_HEADINGS,
  describeApplied,
  describeProposal,
  describeTotals,
  describeUnanswered,
  OUTCOME_LABELS,
  SHOWN_COLUMNS,
  standingLabel,
} from "./presentation";

/**
 * Import recruits — LAN-487. The roster import's screen
 * (`../../roster/import/import-screen.tsx`, LAN-215) in its three states —
 * choosing a file, the proposal with its possible duplicates, and what
 * happened — with recruit nouns. Every outcome, reason and candidate arrives
 * already decided from `@/lib/services/recruit-import`.
 */

export interface RecruitImportScreenProps {
  seasonLabel: string;
  recruits: number;
  templateHref: string;
}

export default function RecruitImportScreen(props: RecruitImportScreenProps) {
  const [state, formAction, pending] = useActionState(
    importRecruitsAction,
    EMPTY_RECRUIT_IMPORT_STATE,
  );
  const plan = state.plan;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={plan === null ? "Import recruits" : `Import — ${plan.fileName ?? "your file"}`}
        back={{ href: "/operate/recruitment", label: "Back to recruitment" }}
        subtitle={
          <Typography component="span" variant="body2" data-testid="import-subheading">
            {plan === null
              ? `Season ${props.seasonLabel}`
              : describeProposal(props.seasonLabel, plan.rowCount)}
          </Typography>
        }
      />

      {state.error === null ? null : (
        <Notice severity="warning" testId="import-error">
          <strong>Nothing was changed.</strong> {state.error}
        </Notice>
      )}

      {state.applied === null ? null : (
        <Notice severity="success" testId="import-applied">
          {describeApplied(state.applied)}
        </Notice>
      )}

      {plan === null ? (
        <StartHere {...props} formAction={formAction} pending={pending} />
      ) : state.applied === null ? (
        <Confirmation plan={plan} state={state} formAction={formAction} pending={pending} />
      ) : (
        <Applied plan={plan} applied={state.applied} />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Choosing a file, and the season it will write into
// ---------------------------------------------------------------------------

function StartHere(
  props: RecruitImportScreenProps & { formAction: (formData: FormData) => void; pending: boolean },
) {
  return (
    <Section title={`This season has ${props.recruits} recruit${props.recruits === 1 ? "" : "s"}`}>
      <MetricRow testId="season-counts">
        <Metric value={props.recruits} label="Recruits now" />
        <Metric value={props.seasonLabel} label="The season this writes into" />
      </MetricRow>

      <Box component="ol" sx={{ listStyleType: "decimal", pl: 2.5, mt: 1.5, mb: 0 }}>
        {[
          "Download template",
          "Fill it in · first name, last name and mobile on every row",
          "Import it · see who is about to be added, and who might already be on record",
          "Answer any possible duplicates, then confirm · nothing is written until you do",
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
          {props.pending ? "Reading the file…" : "Upload recruit file"}
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            hidden
            data-testid="import-file"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </Button>
        <Button variant="outlined" size="small" href={props.templateHref} data-testid="export-link">
          Download the template
        </Button>
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" component="p">
          The columns
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
          {RECRUIT_IMPORT_COLUMNS.join(",") +
            "\n\nRequired: first_name, last_name, mobile\n" +
            OPT_IN_HEADER.replace(/^opt_in /, "opt_in: ")}
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary" component="p">
        A recruit already on this season&rsquo;s list is left alone · the import only adds
      </Typography>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The proposal, and the duplicates underneath it
// ---------------------------------------------------------------------------

function Confirmation({
  plan,
  state,
  formAction,
  pending,
}: {
  plan: RecruitImportPlan;
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
      <MetricRow columns={3} testId="import-totals">
        {describeTotals(plan).map(([value, label]) => (
          <Metric key={label} value={value} label={label} />
        ))}
      </MetricRow>

      <>
        <RowCardList testId="import-cards">
          {plan.rows.map((row) => (
            <RowCard key={row.line} row={row} />
          ))}
        </RowCardList>
        <DesktopOnly>
          <TableFrame testId="import-table">
            <Table size="small" sx={{ minWidth: 1200 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Outcome</TableCell>
                  <TableCell>Recruit</TableCell>
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
                      <Typography variant="body2">{OUTCOME_LABELS[row.outcome]}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                    {SHOWN_COLUMNS.map((column) => (
                      <TableCell key={column}>{cellText(cellValue(row, column))}</TableCell>
                    ))}
                    <TableCell
                      sx={{
                        minWidth: 260,
                        color: row.outcome === "refused" ? "error.main" : undefined,
                      }}
                    >
                      {row.outcome === "refused" ? `Line ${row.line}: ` : ""}
                      {changeSummary(row)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </DesktopOnly>
      </>

      {duplicateRows.length === 0 ? null : (
        <Box data-testid="import-duplicates">
          <Section title={`Possible duplicates — ${describeUnanswered(plan.unansweredLines)}`}>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {duplicateRows.map((row) => (
                <ImportDuplicateQuestion
                  key={row.line}
                  line={row.line}
                  name={row.name}
                  detail={[row.cells.mobile, row.cells.college_email, row.cells.personal_email]
                    .filter((value) => value !== "")
                    .join(" · ")}
                  candidates={(row.duplicate?.candidates ?? []).map((candidate) => ({
                    ...candidate,
                    standing: standingLabel(candidate),
                  }))}
                  formAction={formAction}
                  pending={pending}
                  csvText={state.csvText ?? ""}
                  fileName={state.fileName ?? ""}
                  duplicateAnswersJson={duplicateAnswersJson}
                />
              ))}
            </Stack>
          </Section>
        </Box>
      )}

      <Box component="form" action={formAction} sx={{ width: "100%" }}>
        <input type="hidden" name="csvText" value={state.csvText ?? ""} />
        <input type="hidden" name="digest" value={plan.digest} />
        <input type="hidden" name="fileName" value={state.fileName ?? ""} />
        <input type="hidden" name="duplicateAnswersJson" value={duplicateAnswersJson} />
        <ActionBar
          primary={
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
          }
          cancel={
            <Button type="submit" name="intent" value="cancel" disabled={pending}>
              Cancel
            </Button>
          }
          note={plan.applicableCount === 0 ? "There are no changes to apply." : undefined}
        />
      </Box>
    </>
  );
}

/** The same row at 375px — the roster import's `RowCard`. */
function RowCard({ row }: { row: RecruitPlannedRow }) {
  return (
    <KitRowCard
      title={row.name}
      testId={`import-card-${row.line}`}
      sublines={[
        `${OUTCOME_LABELS[row.outcome]} · line ${row.line}`,
        <FactGrid key="facts" columns={2}>
          {SHOWN_COLUMNS.map((column) => (
            <Fact
              key={column}
              label={COLUMN_HEADINGS[column] ?? column}
              value={cellValue(row, column) || null}
            />
          ))}
        </FactGrid>,
        <Typography
          key="change"
          variant="body2"
          color={row.outcome === "refused" ? "error.main" : "text.secondary"}
        >
          {changeSummary(row)}
        </Typography>,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// What happened, after confirming
// ---------------------------------------------------------------------------

function Applied({ plan, applied }: { plan: RecruitImportPlan; applied: RecruitImportApplied }) {
  const arrived = plan.rows.filter((row) => row.outcome === "new" || row.outcome === "existing");
  const refused = plan.rows.filter((row) => row.outcome === "refused");

  return (
    <Stack spacing={2}>
      <MetricRow columns={3} testId="applied-totals">
        <Metric value={applied.created} label="New" />
        <Metric value={applied.existing} label="Known to the club" />
        <Metric value={applied.alreadyRecruits} label="Already a recruit" />
        <Metric value={applied.refused} label="Refused" />
        <Metric value={applied.welcomesQueued} label="Welcomes queued" />
        <Metric value={applied.addedToAudiences} label="Added to event audiences" />
      </MetricRow>

      <Box data-testid="applied-arrived">
        <Section title="Who arrived">
          {arrived.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              None
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
                    {row.outcome === "new" ? "new · recruit" : "known to the club · recruit"}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Section>
      </Box>

      <Box data-testid="applied-refused">
        <Section title="What was refused, and why">
          {refused.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              None
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
        </Section>
      </Box>

      <Box>
        <Button variant="outlined" href="/operate/recruitment">
          Back to recruitment
        </Button>
      </Box>
    </Stack>
  );
}
