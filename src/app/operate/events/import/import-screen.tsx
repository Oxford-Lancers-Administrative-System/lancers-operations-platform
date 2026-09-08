"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import { ActionBar } from "@/components/action-bar";
import { OutcomeSlotProvider, useOutcomeSlot } from "@/components/outcome-slot";
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
import type { ImportPlan, PlannedRow } from "@/lib/services/event-csv";
import { importEventsAction } from "./actions";
import { EMPTY_IMPORT_STATE } from "./import-state";
import {
  applyLabel,
  cellText,
  changeSummary,
  COLUMN_HEADINGS,
  describeApplied,
  describeProposal,
  OUTCOME_LABELS,
  previousText,
  SHOWN_COLUMNS,
} from "./presentation";

/**
 * Bulk import — screens `W3-01`, `W3-02`, `W3-03` and `W3-05` of the approved
 * mockup. LAN-155.
 *
 * One component, because they are one screen in four states: a season with
 * nothing in it, a season with events, the proposal, and what happened. The
 * operator never navigates between them, and a proposal that survived a
 * navigation would be a proposal computed against a season they have since left.
 *
 * ## Nothing here decides anything
 *
 * Every rule this screen appears to apply — what a blank cell means, which rows
 * are refused, what an update changes — was decided in
 * `@/lib/services/event-csv` and arrives already decided. This component chooses
 * colours and column order. That is deliberate: `AGENTS.md` puts business rules
 * in the service layer, and a refusal reason written here would be a second,
 * quieter copy of a club rule.
 *
 * ## The export lives here, not on the Events page
 *
 * Brian, 2026-08-21: "If you Mass Export the season … that detail should be in
 * that screen." Importing is a way of creating events, so it sits under **Create
 * event**; exporting is not a way of creating anything, so it lives beside the
 * file it produces. One button whose label follows the state — *Download the
 * template* on an empty season, *Download the current season's events* once
 * there are any — rather than two buttons one of which is always wrong.
 */

export interface ImportScreenProps {
  seasonLabel: string;
  total: number;
  drafts: number;
  approved: number;
  cancelled: number;
  /** The static, versioned conversion prompt. */
  prompt: string;
  promptVersion: number;
  /** Where the download button points. */
  exportHref: string;
}

export default function ImportScreen(props: ImportScreenProps) {
  return (
    <OutcomeSlotProvider>
      <ImportContent {...props} />
    </OutcomeSlotProvider>
  );
}

function ImportContent(props: ImportScreenProps) {
  const slot = useOutcomeSlot("import");
  const [state, formAction, pending] = useActionState(importEventsAction, EMPTY_IMPORT_STATE);
  const plan = state.plan;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={plan === null ? "Bulk import" : `Import — ${plan.fileName ?? "your file"}`}
        subtitle={
          <span data-testid="import-subheading">
            {plan === null
              ? `Season ${props.seasonLabel}`
              : describeProposal(props.seasonLabel, plan.rowCount)}
          </span>
        }
        back={{ href: "/operate/events", label: "Back to events" }}
      />

      {!slot.showing || pending || state.error === null ? null : (
        <Notice severity="warning" testId="import-error">
          <strong>Nothing was changed.</strong> {state.error}
        </Notice>
      )}

      {!slot.showing || pending || state.applied === null ? null : (
        <Notice severity="success" testId="import-applied">
          {describeApplied(state.applied)}
        </Notice>
      )}

      {plan === null ? (
        <StartHere
          {...props}
          formAction={(data) => {
            slot.claim();
            formAction(data);
          }}
          pending={pending}
        />
      ) : (
        <Confirmation
          plan={plan}
          state={state}
          formAction={(data) => {
            slot.claim();
            formAction(data);
          }}
          pending={pending}
        />
      )}

      <Boundaries />
    </Stack>
  );
}

/**
 * Screen `W3-05`'s last block — the three things an import can never do, stated
 * where an operator will read them rather than in a document they will not.
 *
 * It is on the screen in every state, not only after a refusal. The blast radius
 * of a bulk file is the thing a Secretary with a spreadsheet needs to know
 * *before* they choose one, and a boundary that only appears once something has
 * gone wrong is a boundary explained too late.
 */
function Boundaries() {
  return (
    <Box data-testid="import-boundaries">
      <Section title="What an import can never do">
        <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            <strong>Delete anything.</strong> Events are upsert only. An event missing from the file
            is left exactly as it was.
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
            <strong>Change an approved event.</strong> Those rows are refused by name; amend the
            event on its own page.
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Approve, cancel, or send.</strong> An import produces drafts, and nothing leaves
            the building.
          </Typography>
        </Box>
      </Section>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// W3-01 and W3-02 — where a season starts, and where it carries on
// ---------------------------------------------------------------------------

function StartHere(
  props: ImportScreenProps & { formAction: (formData: FormData) => void; pending: boolean },
) {
  const empty = props.total === 0;

  return (
    <Section
      title={
        empty
          ? "No events in this season yet"
          : `This season has ${props.total} event${props.total === 1 ? "" : "s"}`
      }
    >
      {empty ? null : (
        <>
          <MetricRow testId="season-counts">
            <Metric value={props.drafts} label="Drafts — an import can change these" />
            <Metric value={props.approved} label="Approved — edit these one at a time" />
            <Metric value={props.cancelled} label="Cancelled" />
          </MetricRow>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Start from what is already here rather than from an empty file: the export carries each
            event’s identifier, which is how the system knows you are changing an event rather than
            adding a second one.
          </Typography>
        </>
      )}

      <HowItWorks
        first={
          empty
            ? "Download the template. It is an empty spreadsheet with the right column headings."
            : "Download the current season’s events. That file is your starting point — edit the rows you want to change."
        }
      />

      <Box
        component="form"
        action={props.formAction}
        sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2, alignItems: "center" }}
      >
        <input type="hidden" name="intent" value="propose" />
        <Button variant="contained" size="small" component="label" disabled={props.pending}>
          {props.pending ? "Reading the file…" : "Import CSV"}
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
          {empty ? "Download the template" : "Download the current season’s events"}
        </Button>
        <CopyPromptButton prompt={props.prompt} />
      </Box>

      <PromptBlock prompt={props.prompt} version={props.promptVersion} />

      {empty ? null : (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary" component="p">
            Keep the id to change an event · clear the id to add one · leave a row out and nothing
            happens to it
          </Typography>
        </>
      )}
    </Section>
  );
}

function HowItWorks({ first }: { first: string }) {
  return (
    <Box component="ol" sx={{ listStyleType: "decimal", pl: 2.5, mt: 1.5, mb: 0 }}>
      {[
        first,
        "Copy the prompt. Paste it into ChatGPT, Claude or whatever you use, along with the term card, and it will hand you back a file in the right shape.",
        "Check the file. It is a spreadsheet — open it and read it like one.",
        "Import it here. You will see exactly what is about to change, and nothing happens until you say so.",
      ].map((step) => (
        <Typography component="li" variant="body2" key={step} sx={{ mb: 0.5 }}>
          {step}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * The prompt is copied, not retyped, so the button is the feature.
 *
 * `navigator.clipboard` is unavailable over plain HTTP and in a browser that has
 * refused the permission, and the recovery is not a retry — it is the text
 * itself, which is on screen underneath. So the failure says to select it rather
 * than pretending the copy worked.
 */
function CopyPromptButton({ prompt }: { prompt: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const slot = useOutcomeSlot("copy-prompt");

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        data-testid="copy-prompt"
        onClick={() => {
          slot.claim();
          setSaid(null);
          void navigator.clipboard
            ?.writeText(prompt)
            .then(() => setSaid("Copied."))
            .catch(() => setSaid("Copying is not available here — select the text below instead."));
          if (!navigator.clipboard) {
            setSaid("Copying is not available here — select the text below instead.");
          }
        }}
      >
        Copy the prompt
      </Button>
      {!slot.showing || said === null ? null : (
        <Typography variant="body2" color="text.secondary" role="status">
          {said}
        </Typography>
      )}
    </>
  );
}

function PromptBlock({ prompt, version }: { prompt: string; version: number }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary" component="p">
        Conversion prompt, version {version}
      </Typography>
      <Box
        component="pre"
        data-testid="import-prompt"
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
        {prompt}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// W3-03 — what will change, before anything changes
// ---------------------------------------------------------------------------

function Confirmation({
  plan,
  state,
  formAction,
  pending,
}: {
  plan: ImportPlan;
  state: { csvText: string | null; fileName: string | null };
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <>
      <MetricRow columns={4}>
        <Metric value={plan.totals.new} label="New" />
        <Metric value={plan.totals.updated} label="Updated" />
        <Metric value={plan.totals.unchanged} label="Unchanged" />
        <Metric value={plan.totals.refused} label="Refused" />
      </MetricRow>

      <RowCardList testId="import-cards">
        {plan.rows.map((row) => (
          <ImportRowCard key={row.line} row={row} />
        ))}
      </RowCardList>

      <DesktopOnly>
        <TableFrame testId="import-table">
          <Table size="small" sx={{ minWidth: 1460 }}>
            <TableHead>
              <TableRow>
                <TableCell>Outcome</TableCell>
                <TableCell>{COLUMN_HEADINGS.name}</TableCell>
                {SHOWN_COLUMNS.map((column) => (
                  <TableCell key={column}>{COLUMN_HEADINGS[column]}</TableCell>
                ))}
                <TableCell>Status</TableCell>
                <TableCell sx={{ minWidth: 230 }}>What changes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plan.rows.map((row) => (
                <TableRow key={row.line} data-testid={`import-row-${row.line}`}>
                  <TableCell>{OUTCOME_LABELS[row.outcome]}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                  {SHOWN_COLUMNS.map((column) => {
                    const cell = row.cells[column];
                    const previous = previousText(cell);
                    return (
                      <TableCell
                        key={column}
                        sx={previous === null ? undefined : { bgcolor: "action.hover" }}
                      >
                        {cellText(cell)}
                        {previous === null ? null : (
                          <Typography
                            variant="caption"
                            component="span"
                            color="text.secondary"
                            sx={{ display: "block", textDecoration: "line-through" }}
                          >
                            {previous}
                          </Typography>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell>{row.status}</TableCell>
                  <TableCell
                    sx={{
                      minWidth: 230,
                      color: row.outcome === "refused" ? "error.main" : undefined,
                    }}
                  >
                    {changeSummary(row)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </DesktopOnly>

      <Box component="form" action={formAction}>
        <input type="hidden" name="csvText" value={state.csvText ?? ""} />
        <input type="hidden" name="digest" value={plan.digest} />
        <input type="hidden" name="fileName" value={state.fileName ?? ""} />
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
        />
      </Box>
    </>
  );
}

/**
 * The same row at 375px.
 *
 * A thirteen-column table does not become a phone screen by scrolling, so the
 * narrow presentation states the row and then only the fields that changed —
 * which is the same information the highlighted cells carry, arranged for a
 * reader holding the phone in one hand.
 */
function ImportRowCard({ row }: { row: PlannedRow }) {
  return (
    <RowCard
      testId={`import-card-${row.line}`}
      title={row.name}
      trailing={row.status}
      sublines={[
        OUTCOME_LABELS[row.outcome],
        [cellText(row.cells.type), cellText(row.cells.date), cellText(row.cells.venue)].join(" · "),
        changeSummary(row),
        ...row.changes.map((change) => (
          <Box key={change.column}>
            <Typography variant="caption" component="span">
              {change.column}
            </Typography>
            <Typography variant="body2" component="p">
              {change.to === "" ? "Not recorded" : change.to}
              <Typography
                variant="caption"
                component="span"
                sx={{ display: "block", textDecoration: "line-through" }}
              >
                {change.from === "" ? "(empty)" : change.from}
              </Typography>
            </Typography>
          </Box>
        )),
      ]}
    />
  );
}
