"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Notice } from "@/components/notice";
import { chaseSelectedAction, type ChaseActionResult } from "./actions";
import FollowUpsCards from "./follow-ups-cards";
import FollowUpsTable from "./follow-ups-table";
import type { FollowUpsFilters, QueueRow } from "./queue-filters";
import type { QueueSelection } from "./row-links";
import {
  andMore,
  chaseButtonLabel,
  chaseProblemNotice,
  chaseRefusalLine,
  chaseSentNotice,
  REFUSALS_NAMED,
} from "./presentation";

/**
 * The queue's board — LAN-329 and LAN-322, on `/operate/people/missing`'s own
 * `queue-board.tsx` shape rather than a second one.
 *
 * A client component for the one reason that queue's is: which rows are
 * ticked, and the "Chase N people" bar that appears once something is, are
 * interactive state no server render can hold. Everything a row says is still
 * server-computed and handed in as plain data; this draws it, holds the
 * selection, and calls the one action.
 */
export default function FollowUpsBoard({
  filters,
  rows,
  mayChase,
  mayOpenPerson,
}: {
  filters: FollowUpsFilters;
  rows: readonly QueueRow[];
  mayChase: boolean;
  mayOpenPerson: boolean;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ChaseActionResult | null>(null);

  const chaseableIds = rows.filter((row) => row.chaseable).map((row) => row.invitationId);
  const selectedIds = chaseableIds.filter((id) => selected.has(id));

  function toggle(invitationId: string) {
    setResult(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(invitationId)) next.delete(invitationId);
      else next.add(invitationId);
      return next;
    });
  }

  function toggleAll() {
    setResult(null);
    setSelected((previous) =>
      previous.size === chaseableIds.length ? new Set() : new Set(chaseableIds),
    );
  }

  function chase(invitationIds: readonly string[]) {
    setResult(null);
    startTransition(() => {
      void (async () => {
        const outcome = await chaseSelectedAction(invitationIds);
        setResult(outcome);
        if (outcome.accepted > 0) setSelected(new Set());
      })();
    });
  }

  const selection: QueueSelection = {
    selected,
    pending,
    mayChase,
    mayOpenPerson,
    toggle,
    toggleAll,
    chase,
  };

  const nameOf = (invitationId: string) =>
    rows.find((row) => row.invitationId === invitationId)?.personName ?? null;

  const namesFor = (ids: readonly string[]) => {
    const named = ids.map(nameOf).filter((name) => name !== null);
    const shown = named.slice(0, REFUSALS_NAMED);
    return named.length > shown.length
      ? `${shown.join(", ")} ${andMore(named.length - shown.length)}`
      : shown.join(", ");
  };

  /**
   * The refused, one line each, capped at the same `REFUSALS_NAMED` the names
   * alone were capped at. The cap's own reasoning is unchanged and now matters
   * more: a select-all that refuses everybody would otherwise put a reason
   * sentence beside every one of hundreds of names.
   */
  const refusalLines = (result?.refusals ?? []).flatMap((refusal) => {
    const name = nameOf(refusal.invitationId);
    return name === null
      ? []
      : [{ invitationId: refusal.invitationId, line: chaseRefusalLine(name, refusal.reason) }];
  });
  const shownRefusals = refusalLines.slice(0, REFUSALS_NAMED);

  return (
    <Stack spacing={2}>
      {mayChase && selectedIds.length > 0 ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => chase(selectedIds)}
            sx={{ minHeight: 44 }}
            data-testid="chase-selected"
          >
            {chaseButtonLabel(selectedIds.length)}
          </Button>
        </Stack>
      ) : null}

      {result?.error ? (
        <Notice severity="warning" testId="chase-error">
          {result.error}
        </Notice>
      ) : null}
      {result && result.accepted > 0 ? (
        <Notice severity="success" testId="chase-notice">
          {chaseSentNotice(result.accepted)}
        </Notice>
      ) : null}
      {result && result.refusals.length > 0 ? (
        <Notice severity="warning" testId="chase-refused">
          {chaseProblemNotice(result.refusals.length)}
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {shownRefusals.map((refusal) => (
              <li key={refusal.invitationId}>{refusal.line}</li>
            ))}
            {refusalLines.length > shownRefusals.length ? (
              <li>{andMore(refusalLines.length - shownRefusals.length)}</li>
            ) : null}
          </Box>
        </Notice>
      ) : null}
      {result && result.notOutstandingInvitationIds.length > 0 ? (
        <Notice severity="warning" testId="chase-answered">
          {`Already answered or stood down: ${namesFor(result.notOutstandingInvitationIds)}`}
        </Notice>
      ) : null}

      <FollowUpsTable filters={filters} rows={rows} selection={selection} />
      <FollowUpsCards rows={rows} selection={selection} />
    </Stack>
  );
}
