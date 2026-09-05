"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { nudgeSelectedAction } from "./actions";

export interface QueueRowView {
  readonly personId: string;
  readonly membershipId: string | null;
  readonly displayName: string;
  readonly statusLabel: string | null;
  readonly statusColour: "default" | "info" | "success" | "warning";
  readonly clubRoleSummary: string | null;
  readonly missingFieldLabels: readonly string[];
  readonly correctHref: string;
  readonly personHref: string;
  /** `null` for a row this package's chase does not apply to (not onboarding). */
  readonly lastContactLabel: string | null;
  readonly nextLabel: string | null;
  readonly nextNeedsAHuman: boolean;
  readonly nudgeable: boolean;
}

/**
 * The missing-data queue's board — LAN-218, `W8-01`..`W8-03`.
 *
 * A client component because selection is genuinely interactive state no
 * server render can hold: which rows are checked, and the one "Nudge N
 * people" bar above the table that only appears once something is selected.
 * Everything else about a row — its name, status, missing facts, last
 * contact and next automated contact — is server-computed and handed in as
 * plain data; this component draws it and manages the checkbox state and the
 * nudge action alone.
 */
export default function QueueBoard({
  rows,
  nameHeader,
  missingHeader,
}: {
  rows: readonly QueueRowView[];
  /** The shipped sortable "Name" header cell, server-rendered — `TableSortLabel` needs no client hook of its own, only a place in this table's own header row. */
  nameHeader: ReactNode;
  missingHeader: ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ notice: string | null; error: string | null } | null>(
    null,
  );

  const nudgeableRows = rows.filter((row) => row.membershipId && row.nudgeable);
  const selectedIds = Array.from(selected);

  function toggle(membershipId: string) {
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(membershipId)) next.delete(membershipId);
      else next.add(membershipId);
      return next;
    });
  }

  function toggleAll() {
    setResult(null);
    setSelected((prev) =>
      prev.size === nudgeableRows.length
        ? new Set()
        : new Set(nudgeableRows.map((row) => row.membershipId as string)),
    );
  }

  function nudge(membershipIds: readonly string[]) {
    setResult(null);
    startTransition(() => {
      void (async () => {
        const outcome = await nudgeSelectedAction(membershipIds);
        setResult(outcome);
        if (!outcome.error) setSelected(new Set());
      })();
    });
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        {selectedIds.length > 0 ? (
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => nudge(selectedIds)}
            sx={{ minHeight: 44 }}
            data-testid="nudge-selected"
          >
            {selectedIds.length === 1 ? "Nudge 1 person" : `Nudge ${selectedIds.length} people`}
          </Button>
        ) : null}
      </Stack>

      {result?.notice ? (
        <Alert severity="success" data-testid="nudge-notice">
          {result.notice}
        </Alert>
      ) : null}
      {result?.error ? (
        <Alert severity="warning" data-testid="nudge-error">
          {result.error}
        </Alert>
      ) : null}

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ display: { xs: "none", md: "block" } }}
      >
        <Table size="small" aria-label="Missing data">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={nudgeableRows.length > 0 && selected.size === nudgeableRows.length}
                  indeterminate={selected.size > 0 && selected.size < nudgeableRows.length}
                  disabled={nudgeableRows.length === 0}
                  onChange={toggleAll}
                  slotProps={{ input: { "aria-label": "Select every nudgeable person" } }}
                />
              </TableCell>
              {nameHeader}
              <TableCell>Status</TableCell>
              <TableCell>To the club</TableCell>
              {missingHeader}
              <TableCell>Last contact</TableCell>
              <TableCell>Next</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow hover key={row.personId} data-testid="missing-row">
                <TableCell padding="checkbox">
                  {row.membershipId && row.nudgeable ? (
                    <Checkbox
                      size="small"
                      checked={selected.has(row.membershipId)}
                      onChange={() => toggle(row.membershipId as string)}
                      slotProps={{ input: { "aria-label": `Select ${row.displayName}` } }}
                    />
                  ) : null}
                </TableCell>
                <TableCell>
                  <Button
                    href={row.personHref}
                    sx={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      p: 0,
                      textTransform: "none",
                      fontWeight: 600,
                    }}
                  >
                    {row.displayName}
                  </Button>
                </TableCell>
                <TableCell>
                  {row.statusLabel === null ? (
                    <Typography color="text.secondary">—</Typography>
                  ) : (
                    <Chip size="small" label={row.statusLabel} color={row.statusColour} />
                  )}
                </TableCell>
                <TableCell>
                  {row.clubRoleSummary ?? <Typography color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell>
                  <GapsCell labels={row.missingFieldLabels} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{row.lastContactLabel ?? "—"}</Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    color={row.nextNeedsAHuman ? "warning.main" : undefined}
                    sx={row.nextNeedsAHuman ? { fontWeight: 600 } : undefined}
                  >
                    {row.nextLabel ?? "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      size="small"
                      href={row.correctHref}
                      sx={{ minHeight: 36 }}
                    >
                      Correct
                    </Button>
                    {row.membershipId && row.nudgeable ? (
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={pending}
                        onClick={() => nudge([row.membershipId as string])}
                        sx={{ minHeight: 36 }}
                      >
                        Nudge
                      </Button>
                    ) : null}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
        {rows.map((row) => (
          <Card variant="outlined" data-testid="missing-card" key={row.personId} sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {row.membershipId && row.nudgeable ? (
                  <Checkbox
                    size="small"
                    checked={selected.has(row.membershipId)}
                    onChange={() => toggle(row.membershipId as string)}
                    slotProps={{ input: { "aria-label": `Select ${row.displayName}` } }}
                  />
                ) : null}
                <Button
                  href={row.personHref}
                  sx={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    p: 0,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  {row.displayName}
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {row.clubRoleSummary ?? "—"}
              </Typography>
              <GapsCell labels={row.missingFieldLabels} />
              <Typography variant="body2">Last contact: {row.lastContactLabel ?? "—"}</Typography>
              <Typography
                variant="body2"
                color={row.nextNeedsAHuman ? "warning.main" : undefined}
                sx={row.nextNeedsAHuman ? { fontWeight: 600 } : undefined}
              >
                Next: {row.nextLabel ?? "—"}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  href={row.correctHref}
                  sx={{ minHeight: 44 }}
                >
                  Correct
                </Button>
                {row.membershipId && row.nudgeable ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={pending}
                    onClick={() => nudge([row.membershipId as string])}
                    sx={{ minHeight: 44 }}
                  >
                    Nudge
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function GapsCell({ labels }: { labels: readonly string[] }) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      {labels.map((label) => (
        <Chip key={label} size="small" variant="outlined" color="warning" label={label} />
      ))}
    </Stack>
  );
}
