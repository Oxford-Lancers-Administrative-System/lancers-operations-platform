"use client";

import { useState, useTransition } from "react";
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

  const namesFor = (ids: readonly string[]) => {
    const named = rows.filter((row) => ids.includes(row.invitationId)).map((row) => row.personName);
    const shown = named.slice(0, REFUSALS_NAMED);
    return named.length > shown.length
      ? `${shown.join(", ")} ${andMore(named.length - shown.length)}`
      : shown.join(", ");
  };

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
      {result && result.refusedInvitationIds.length > 0 ? (
        <Notice severity="warning" testId="chase-refused">
          {`${chaseProblemNotice(result.refusedInvitationIds.length)} ${namesFor(
            result.refusedInvitationIds,
          )}`}
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
