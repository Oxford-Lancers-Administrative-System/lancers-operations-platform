"use client";

import { useState, useTransition, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { Notice } from "@/components/notice";
import { EMPTY_OUTCOME, Outcome, type OutcomeState } from "@/components/outcome-slot";
import { Section } from "@/components/section";
import {
  grantLevel,
  levelsFor,
  subjectKey,
  type GrantSubject,
  type OperatorGrants,
} from "@/lib/auth/grants";
import { templateColourFor } from "@/lib/services/event-template-input";
import {
  ACCESS_GROUP_LABELS,
  ACCESS_RECRUITING_LINES,
  ACCESS_ROSTER_LINES,
  ACCESS_SWITCH_LINES,
  accessGroupSummary,
  accessLevelLabel,
} from "../../presentation";
import {
  copyAccessAction,
  grantEverythingAction,
  planCopyAccessAction,
  planGrantEverythingAction,
  setAccessGrantAction,
  type AccessActionResult,
  type AccessLineInput,
} from "./access-actions";

/**
 * The seat page's Access section — LAN-430, W1 (W1-03, W1-04, W1-05, W1-07,
 * W1-08). Four groups — Roster, Recruiting, Event templates, Adding people —
 * one line each, every line the recorder's exclusive `ToggleButtonGroup`.
 * A press saves at once; the one Notice reads the outcome back. A fixed seat
 * prints its values with no control. At 375 each group folds, its summary
 * standing for its lines.
 */

interface AccessTemplateLine {
  readonly id: string;
  readonly name: string;
  readonly colourKey: string;
}

interface Line {
  readonly subject: GrantSubject;
  readonly wire: AccessLineInput;
  readonly label: ReactNode;
  readonly testId: string;
}

interface Group {
  readonly key: keyof typeof ACCESS_GROUP_LABELS;
  readonly lines: readonly Line[];
}

function wireOf(subject: GrantSubject): AccessLineInput {
  return subject.kind === "template"
    ? { kind: "template", key: subject.templateId }
    : { kind: subject.kind, key: subject.key };
}

function TemplateLabel({ template }: { template: AccessTemplateLine }) {
  const swatch = templateColourFor(template.colourKey);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: "inline-block",
          flexShrink: 0,
          width: 14,
          height: 14,
          borderRadius: 0.5,
          bgcolor: swatch.tint,
          border: 2,
          borderColor: swatch.accent,
        }}
      />
      <span>{template.name}</span>
    </Stack>
  );
}

function groupsFor(templates: readonly AccessTemplateLine[]): readonly Group[] {
  const line = (subject: GrantSubject, label: ReactNode, key: string): Line => ({
    subject,
    wire: wireOf(subject),
    label,
    testId: `access-line-${key}`,
  });
  return [
    {
      key: "roster",
      lines: ACCESS_ROSTER_LINES.map((entry) =>
        line({ kind: "roster", key: entry.key }, entry.label, entry.key),
      ),
    },
    {
      key: "recruiting",
      lines: ACCESS_RECRUITING_LINES.map((entry) =>
        line({ kind: "recruiting", key: entry.key }, entry.label, entry.key),
      ),
    },
    {
      key: "template",
      lines: templates.map((template) =>
        line(
          { kind: "template", templateId: template.id },
          <TemplateLabel template={template} />,
          `template-${template.id}`,
        ),
      ),
    },
    {
      key: "switch",
      lines: ACCESS_SWITCH_LINES.map((entry) =>
        line({ kind: "switch", key: entry.key }, entry.label, entry.key),
      ),
    },
  ];
}

function LineRow({
  line,
  level,
  fixed,
  busy,
  onPress,
}: {
  line: Line;
  level: string;
  fixed: boolean;
  busy: boolean;
  onPress: (level: string) => void;
}) {
  const levels = levelsFor(line.subject);
  const labelId = `${line.testId}-label`;
  return (
    <Stack
      direction={{ xs: fixed ? "row" : "column", sm: "row" }}
      spacing={{ xs: 0.75, sm: 2 }}
      sx={{
        alignItems: { xs: fixed ? "center" : "stretch", sm: "center" },
        justifyContent: "space-between",
        py: 0.75,
        borderBottom: 1,
        borderColor: "divider",
      }}
      data-testid={line.testId}
      data-level={level}
    >
      <Typography variant="body2" component="div" id={labelId}>
        {line.label}
      </Typography>
      {fixed ? (
        <Typography variant="body2" sx={{ fontWeight: 700 }} data-testid={`${line.testId}-value`}>
          {accessLevelLabel(line.subject, level)}
        </Typography>
      ) : (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={level}
          disabled={busy}
          onChange={(_event, next: string | null) => {
            if (next !== null && next !== level) onPress(next);
          }}
          aria-labelledby={labelId}
          sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
        >
          {levels.map((option) => (
            <ToggleButton
              key={option}
              value={option}
              data-testid={`${line.testId}-${option}`}
              sx={{ minWidth: 64, minHeight: 36, flex: { xs: 1, sm: "none" } }}
            >
              {accessLevelLabel(line.subject, option)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    </Stack>
  );
}

function GroupBlock({
  group,
  folds,
  summary,
  children,
}: {
  group: Group;
  folds: boolean;
  summary: string;
  children: ReactNode;
}) {
  const heading = ACCESS_GROUP_LABELS[group.key];
  if (!folds) {
    return (
      <Box data-testid={`access-group-${group.key}`}>
        <Typography
          variant="overline"
          component="h3"
          color="text.secondary"
          sx={{ display: "block", fontWeight: 700 }}
        >
          {heading}
        </Typography>
        {children}
      </Box>
    );
  }
  // At 375 the group folds the way the record's sections do: the heading and
  // its summary are the disclosure, the lines are inside it.
  return (
    <Paper
      component="details"
      variant="outlined"
      data-testid={`access-group-${group.key}`}
      sx={{
        px: 1.5,
        "& > summary": { cursor: "pointer", listStyle: "none" },
        "& > summary::-webkit-details-marker": { display: "none" },
        "&[open] > summary [data-disclosure-indicator]": {
          transform: "translateY(3px) rotate(225deg)",
        },
      }}
    >
      <Box component="summary">
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between", minHeight: 48 }}
        >
          <Typography
            variant="overline"
            component="h3"
            color="text.secondary"
            sx={{ fontWeight: 700 }}
          >
            {heading}
          </Typography>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Typography variant="body2" data-testid={`access-group-${group.key}-summary`}>
              {summary}
            </Typography>
            <Box
              component="span"
              aria-hidden="true"
              data-disclosure-indicator
              sx={{
                width: 10,
                height: 10,
                mt: -0.5,
                borderRight: "2px solid",
                borderBottom: "2px solid",
                borderColor: "primary.main",
                transform: "rotate(45deg)",
              }}
            />
          </Stack>
        </Stack>
      </Box>
      <Box sx={{ pb: 1 }}>{children}</Box>
    </Paper>
  );
}

type Confirming =
  | { readonly kind: "copy"; readonly sourceId: string; readonly lines: readonly string[] | null }
  | { readonly kind: "everything"; readonly lines: readonly string[] | null };

function ChangeList({
  heading,
  lines,
  testId,
}: {
  heading: string;
  lines: readonly string[] | null;
  testId: string;
}) {
  if (lines === null) return null;
  return (
    <Box data-testid={testId}>
      <Typography
        variant="overline"
        component="h3"
        color="text.secondary"
        sx={{ display: "block", fontWeight: 700 }}
      >
        {`${heading} · ${lines.length} ${lines.length === 1 ? "change" : "changes"}`}
      </Typography>
      {lines.length > 0 ? (
        <Box
          component="ul"
          sx={{
            m: 0,
            py: 1,
            pl: 3,
            maxHeight: 240,
            overflowY: "auto",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          {lines.map((line) => (
            <Typography key={line} component="li" variant="body2" sx={{ listStyle: "none" }}>
              {line}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export default function AccessSection({
  roleId,
  seatLabel,
  fixed,
  grants: initialGrants,
  templates,
  sources,
}: {
  roleId: string;
  seatLabel: string;
  /** President, General Manager or IT Officer: every value printed, no control. */
  fixed: boolean;
  grants: OperatorGrants;
  /** Every event template, alphabetical. */
  templates: readonly AccessTemplateLine[];
  /** The seats access may be copied from: every seat but this one. */
  sources: readonly { id: string; label: string }[];
}) {
  const theme = useTheme();
  const folds = useMediaQuery(theme.breakpoints.down("sm"));
  const [grants, setGrants] = useState<OperatorGrants>(initialGrants);
  /** A pressed line's value while its save is in flight. */
  const [pressed, setPressed] = useState<{ key: string; level: string } | null>(null);
  const [outcome, setOutcome] = useState<OutcomeState>(EMPTY_OUTCOME);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = groupsFor(templates);
  const levelOf = (subject: GrantSubject): string =>
    pressed && pressed.key === subjectKey(subject) ? pressed.level : grantLevel(grants, subject);

  const settle = (result: AccessActionResult): boolean => {
    if (result.ok) {
      setGrants(result.grants);
      setOutcome(result.notice ? { ...EMPTY_OUTCOME, notice: result.notice } : EMPTY_OUTCOME);
      return true;
    }
    setOutcome({ ...EMPTY_OUTCOME, error: result.error });
    return false;
  };

  const press = (line: Line, level: string) => {
    setPressed({ key: subjectKey(line.subject), level });
    setOutcome(EMPTY_OUTCOME);
    startTransition(async () => {
      // A failure puts the control back on the stored value: `pressed` clears either way.
      settle(await setAccessGrantAction(roleId, line.wire, level));
      setPressed(null);
    });
  };

  const openCopy = () => {
    setDialogError(null);
    setConfirming({ kind: "copy", sourceId: "", lines: null });
  };

  const chooseSource = (sourceId: string) => {
    setConfirming({ kind: "copy", sourceId, lines: null });
    setDialogError(null);
    startTransition(async () => {
      const plan = await planCopyAccessAction(roleId, sourceId);
      if (plan.ok) setConfirming({ kind: "copy", sourceId, lines: plan.lines });
      else setDialogError(plan.error);
    });
  };

  const openEverything = () => {
    setDialogError(null);
    setConfirming({ kind: "everything", lines: null });
    startTransition(async () => {
      const plan = await planGrantEverythingAction(roleId);
      if (plan.ok) setConfirming({ kind: "everything", lines: plan.lines });
      else setDialogError(plan.error);
    });
  };

  const confirm = () => {
    if (confirming === null) return;
    const current = confirming;
    startTransition(async () => {
      const result =
        current.kind === "copy"
          ? await copyAccessAction(roleId, current.sourceId)
          : await grantEverythingAction(roleId);
      if (result.ok) {
        settle(result);
        setConfirming(null);
      } else {
        setDialogError(result.error);
      }
    });
  };

  const canConfirm =
    confirming !== null &&
    confirming.lines !== null &&
    confirming.lines.length > 0 &&
    (confirming.kind === "everything" || confirming.sourceId !== "");

  return (
    <Section title="Access" testId="access">
      <Stack spacing={2}>
        {fixed ? null : (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button
              variant="outlined"
              onClick={openCopy}
              disabled={pending}
              data-testid="access-copy"
              sx={{ minHeight: 36 }}
            >
              Copy access from another seat
            </Button>
            <Button
              variant="outlined"
              onClick={openEverything}
              disabled={pending}
              data-testid="access-grant-everything"
              sx={{ minHeight: 36 }}
            >
              Grant everything
            </Button>
          </Stack>
        )}

        <Outcome state={outcome} />

        {groups.map((group) => {
          const lines = group.lines.map((line) => ({ line, level: levelOf(line.subject) }));
          return (
            <GroupBlock
              key={group.key}
              group={group}
              folds={folds}
              summary={accessGroupSummary(
                lines.map(({ line, level }) => ({ subject: line.subject, level })),
              )}
            >
              {lines.map(({ line, level }) => (
                <LineRow
                  key={line.testId}
                  line={line}
                  level={level}
                  fixed={fixed}
                  busy={pending}
                  onPress={(next) => press(line, next)}
                />
              ))}
            </GroupBlock>
          );
        })}
      </Stack>

      <Dialog
        open={confirming !== null}
        onClose={pending ? undefined : () => setConfirming(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="access-dialog-title"
        data-testid={
          confirming?.kind === "copy" ? "access-copy-dialog" : "access-everything-dialog"
        }
      >
        <DialogTitle id="access-dialog-title">
          {confirming?.kind === "copy" ? "Copy access from another seat" : "Grant everything"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {dialogError ? (
              <Notice severity="error" testId="access-dialog-error">
                {dialogError}
              </Notice>
            ) : null}
            {confirming?.kind === "copy" ? (
              <TextField
                select
                label="From"
                value={confirming.sourceId}
                onChange={(event) => chooseSource(event.target.value)}
                disabled={pending}
                slotProps={{ htmlInput: { "data-testid": "access-copy-source" } }}
              >
                {sources.map((source) => (
                  <MenuItem key={source.id} value={source.id}>
                    {source.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <ChangeList
              heading={seatLabel}
              lines={confirming?.lines ?? null}
              testId="access-dialog-changes"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirming(null)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={confirm}
            disabled={pending || !canConfirm}
            data-testid="access-dialog-confirm"
          >
            {confirming?.kind === "copy" ? "Copy access" : "Grant everything"}
          </Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}
